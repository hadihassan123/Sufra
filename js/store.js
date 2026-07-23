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
  async function signUpVendor({ email, password, businessName, category, area }){
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: {
        data: { business_name: businessName, category, area }
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

  async function updateVendorLocation(vendorId, latitude, longitude){
  const { error } = await sb
    .from('vendors')
    .update({ latitude, longitude })
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

  async function getActiveListings(){
    const { data, error } = await sb
      .from('listings')
      .select('*, vendors(business_name,logo_url, verification_status,latitude, longitude)')
      .in('status', ['active', 'sold_out'])
      .order('pickup_start', { ascending: true });

    if(error) throw error;
    return data;
  }

  async function getListing(id){
    const { data, error } = await sb
      .from('listings').select('*, vendors(business_name, logo_url, verification_status,latitude,longitude)').eq('id', id).maybeSingle();
    if(error) throw error;
    return data;
  }

  async function getListingsByVendor(vendorId){
    const { data, error } = await sb
      .from('listings').select('*')
      .eq('vendor_id', vendorId).eq('status', 'active')
      .order('created_at', { ascending: false });
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
    const { data, error } = await sb.from('reservations').insert({
      listing_id: listing.id,
      vendor_id: listing.vendor_id,
      vendor_name: listing.vendors ? listing.vendors.business_name : '',
      item_name: listing.item_name,
      price: listing.discounted_price * qty,
      quantity: qty,
      customer_name: customerName,
      customer_phone: customerPhone,
      pickup_code: pickupCode(),
      pickup_start: listing.pickup_start,
      pickup_end: listing.pickup_end
    }).select().single();
    if(error) throw error;
    return data;
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
      .from('reservations').select('*')
      .eq('pickup_code', code.toUpperCase()).maybeSingle();
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

  async function markCollected(id){
    const { error } = await sb.from('reservations').update({ status: 'collected' }).eq('id', id);
    if(error) throw error;
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

  return {
    SURPLUS_WINDOWS,
    signUpVendor, signInVendor, signOutVendor, requestPasswordReset, updatePassword, getSession, getVendorProfile,updateVendorLocation,
    uploadVendorDocument, getVendorDocumentUrl, uploadListingImage, uploadVendorLogo, removeVendorLogo,
    getActiveListings, getListing, getListingsByVendor, createListing,updateListing, updateListingQty, removeListing,
    createReservation, getReservationsByPhone, findReservationByCode,getReservation, markCollected, getReservationsByVendor,
    getAllVendors, approveVendor, revokeVendor
  };
})();