/* Sufra data layer — backed by Supabase (Postgres + Auth).
   Requires js/supabase-client.js loaded first (defines `sb`). */


const Store = (() => {
  // Shared surplus windows — used by the homepage time dial (customer.js)
  // and to auto-fill the vendor's pickup start time (vendor.js).
  const SURPLUS_WINDOWS = [
    { startHour: 10, endHour: 12, label: 'Morning surplus' },
    { startHour: 15, endHour: 16.5, label: 'Lunch-service surplus' },
    { startHour: 22, endHour: 24, label: 'Closing-time surplus' }
  ];

  function pickupCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let out = '';
    for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }

  // ---- auth / vendor identity ----
  async function signUpVendor({ email, password, businessName, category, area, address, latitude, longitude }){
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: {
        data: { business_name: businessName, category, area, address, latitude, longitude }
      }
    });
    if(error) throw error;
    return { needsConfirmation: !data.session };
  }

  async function signInVendor({ email, password }){
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data;
  }

  async function signOutVendor(){
    await sb.auth.signOut();
  }

  async function requestPasswordReset(email){
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/vendor-reset-password.html'
    });
    if(error) throw error;
  }

  async function updatePassword(newPassword){
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if(error) throw error;
  }

  async function getSession(){
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getVendorProfile(userId){
    const { data, error } = await sb.from('vendors').select('*').eq('id', userId).maybeSingle();
    if(error) throw error;
    return data;
  }

  // Saves address + coordinates together, always as one write — a vendor's
  // pin and its address text should never be able to drift out of sync.
  async function updateVendorPin(vendorId, { address, latitude, longitude }){
    const { error } = await sb
      .from('vendors')
      .update({ address, latitude, longitude })
      .eq('id', vendorId);
    if(error) throw error;
  }

  // ---- vendor verification documents ----
  const DOC_COLUMNS = {
    cr: 'cr_document_path',
    moph: 'moph_document_path',
    municipality: 'municipality_document_path'
  };

  async function uploadVendorDocument(vendorId, docType, file){
    const column = DOC_COLUMNS[docType];
    if(!column) throw new Error('Unknown document type: ' + docType);

    const ext = file.name.split('.').pop();
    const path = `${vendorId}/${docType}-${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from('vendor-documents')
      .upload(path, file, { upsert: false });
    if(uploadError) throw uploadError;

    const { error: updateError } = await sb
      .from('vendors')
      .update({ [column]: path, documents_submitted_at: new Date().toISOString() })
      .eq('id', vendorId);
    if(updateError) throw updateError;

    return path;
  }

  async function getVendorDocumentUrl(path){
    const { data, error } = await sb.storage
      .from('vendor-documents')
      .createSignedUrl(path, 300); // 5 minutes
    if(error) throw error;
    return data.signedUrl;
  }

  // ---- vendor logo ----
  async function uploadVendorLogo(vendorId, file){
    const ext = file.name.split('.').pop();
    const path = `${vendorId}/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from('listing-images')
      .upload(path, file, { upsert: false });
    if(uploadError) throw uploadError;

    const { data } = sb.storage.from('listing-images').getPublicUrl(path);

    const { error: updateError } = await sb
      .from('vendors')
      .update({ logo_url: data.publicUrl })
      .eq('id', vendorId);
    if(updateError) throw updateError;

    return data.publicUrl;
  }

  async function removeVendorLogo(vendorId){
    const { error } = await sb.from('vendors').update({ logo_url: null }).eq('id', vendorId);
    if(error) throw error;
  }

  // ---- listings ----
  async function uploadListingImage(vendorId, file){
    const ext = file.name.split('.').pop();
    const path = `${vendorId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await sb.storage
      .from('listing-images')
      .upload(path, file);
    if(error) throw error;

    const { data } = sb.storage.from('listing-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function getActiveListings(lat = 25.2854, lng = 51.5310, radius = 500000) {
    const { data, error } = await sb.rpc('nearby_listings', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radius
    });

    if (error) {
      console.error('Error fetching via RPC:', error);
      throw error;
    }

    // Map RPC return fields to match what your existing cards and map expect
    return (data || []).map(item => ({
      id: item.listing_id,
      vendor_id: item.vendor_id,
      item_name: item.title,
      description: item.description,
      discounted_price: item.price,
      original_price: item.original_price,
      quantity_left: item.quantity_left,
      quantity_available: item.quantity_available,
      quantity_total: item.quantity_available, // or map if total is tracked separately
      pickup_start: item.pickup_start,
      pickup_end: item.pickup_end,
      status: item.status,
      category: item.category || 'Restaurant', // Ensure category fallback exists if needed
      created_at: item.created_at,
      vendors: {
        id: item.vendor_id,
        business_name: item.vendor_name,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        verification_status: item.verification_status
      }
    }));
  }

  // Real server-side radius search via nearby_listings_v2 (ST_DWithin on
  // vendors.location_geog, indexed) — replaces getActiveListings's RPC,
  // which filtered `status = 'active'` in SQL and dropped sold-out/expired
  // listings before they ever reached the customer page, and never
  // returned image_url or category at all.
  async function getListings(lat = 25.2854, lng = 51.5310, radius = 500000){
    const { data, error } = await sb.rpc('nearby_listings_v2', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radius
    });
    if (error) throw error;

    return (data || []).map(item => ({
      id: item.id,
      vendor_id: item.vendor_id,
      item_name: item.item_name,
      description: item.description,
      discounted_price: item.discounted_price,
      original_price: item.original_price,
      quantity_left: item.quantity_left,
      quantity_available: item.quantity_total,
      quantity_total: item.quantity_total,
      pickup_start: item.pickup_start,
      pickup_end: item.pickup_end,
      status: item.status,
      category: item.category,
      created_at: item.created_at,
      image_url: item.image_url,
      vendors: {
        id: item.vendor_id,
        business_name: item.vendor_name,
        latitude: item.vendor_lat,
        longitude: item.vendor_lng,
        address: item.vendor_address,
        logo_url: item.vendor_logo_url,
        verification_status: 'verified' // nearby_listings_v2 only ever returns verified vendors
      }
    }));
  }

  async function getListing(id){
    const { data, error } = await sb
      .from('listings').select('*, vendors(business_name, logo_url, verification_status,latitude,longitude,address)').eq('id', id).maybeSingle();
    if(error) throw error;
    return data;
  }

  async function getListingsByVendor(vendorId){
    console.log("Querying listings for vendorId:", vendorId); // <--- Add this
    const { data, error } = await sb
      .from('listings').select('*')
      .eq('vendor_id', vendorId).neq('status', 'removed')
      .order('created_at', { ascending: false });

      if(error) console.error("Supabase Error:", error); // <--- Check for errors
      console.log("Raw query result data:", data); // <--- See what comes back
    if(error) throw error;
    return data;
  }

  async function createListing(payload){
    const { data, error } = await sb.from('listings').insert(payload).select().single();
    if(error) throw error;
    return data;
  }
  async function updateListing(id, payload){

      const { data, error } = await sb
          .from('listings')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

      if(error) throw error;
      return data;

  }

  async function updateListingQty(id, newQty){
    const status = newQty <= 0 ? 'sold_out' : 'active';

    const { error } = await sb
      .from('listings')
      .update({
        quantity_left: newQty,
        status
      })
      .eq('id', id);

    if(error) throw error;

  }

  async function removeListing(id){
    const { error } = await sb.from('listings').update({ status: 'removed' }).eq('id', id);
    if(error) throw error;

  }

    // ---- reservations ----
  async function createReservation(listing, customerName, customerPhone, quantity){
    const qty = Math.max(1, Number(quantity) || 1);
    const { data, error } = await sb.rpc('create_reservation_safe', {
      p_listing_id: listing.id,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_quantity: qty
    });
    if(error) throw error;
    if(!data.success){
      if(data.reason === 'restricted'){
        const until = new Date(data.restricted_until).toLocaleString();
        throw new Error(`This phone number is temporarily restricted from making reservations until ${until}.`);
      }
      throw new Error('Could not create reservation.');
    }
    return data.reservation;
  }

  async function getReservationsByPhone(phone){
    const { data, error } = await sb
      .from('reservations').select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data;
  }

  async function findReservationByCode(code){
    const { data, error } = await sb
      .rpc('get_reservation_with_flag', {
        p_pickup_code: code.toUpperCase()
      });

    if(error) throw error;
    return data;
  }
  async function getReservation(id){
    const { data, error } = await sb
        .from('reservations')
        .select('*')
         .eq('id', id)
         .maybeSingle();

    if(error) throw error;

    return data;
  }

  async function markNoShow(reservationId) {
    const { error } = await sb.rpc('mark_no_show', {
      p_reservation_id: reservationId
    });

    if (error) throw error;
  }

  async function markCollected(id){
    const { error } = await sb.rpc('mark_collected', {
      p_reservation_id: id
    });

    if(error) throw error;
  }
  async function markNoShow(reservationId) {
    const { error } = await sb.rpc('mark_no_show', {
      p_reservation_id: reservationId
    });

    if (error) throw error;
  }

  async function getReservationsByVendor(vendorId){
    const { data, error } = await sb
      .from('reservations').select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data;
  }

  // ---- admin ----
  async function getAllVendors(){
    const { data, error } = await sb.from('vendors').select('*').order('created_at', { ascending: false });
    if(error) throw error;
    return data;
  }

  async function approveVendor(vendorId, passcode){
    const { data, error } = await sb.rpc('approve_vendor', { target_id: vendorId, given_passcode: passcode });
    if(error) throw error;
    return data;
  }

  async function revokeVendor(vendorId, passcode){
    const { data, error } = await sb.rpc('revoke_vendor', { target_id: vendorId, given_passcode: passcode });
    if(error) throw error;
    return data;
  }

  async function verifyAdminPasscode(passcode){
    const { data, error } = await sb.rpc('verify_admin_passcode', { given_passcode: passcode });
    if(error) throw error;
    return data;
  }

  async function isAdmin(userId){
    const { data, error } = await sb.rpc('is_admin', { check_id: userId });
    if(error) throw error;
    return data;
  }

  return {
    SURPLUS_WINDOWS,
    signUpVendor, signInVendor, signOutVendor, requestPasswordReset, updatePassword, getSession, getVendorProfile,updateVendorPin,
    uploadVendorDocument, getVendorDocumentUrl, uploadListingImage, uploadVendorLogo, removeVendorLogo,
    getActiveListings, getListings, getListing, getListingsByVendor, createListing,updateListing, updateListingQty, removeListing,
    createReservation, getReservationsByPhone, findReservationByCode,getReservation, markCollected,markNoShow, getReservationsByVendor,
    getAllVendors, approveVendor, revokeVendor, verifyAdminPasscode, isAdmin
  };
})();