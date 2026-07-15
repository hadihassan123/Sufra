/* Sufra data layer — backed by Supabase (Postgres + Auth).
   Requires js/supabase-client.js loaded first (defines `sb`). */

const Store = (() => {
  function pickupCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let out = '';
    for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }

  // ---- auth / vendor identity ----
  async function signUpVendor({ email, password, businessName, category, area }){
    const { data, error } = await sb.auth.signUp({ email, password });
    if(error) throw error;
    if(!data.session){
      // Email confirmation is likely still enabled on this project.
      return { needsConfirmation: true };
    }
    await ensureVendorProfile(data.user.id, { businessName, category, area });
    return { needsConfirmation: false };
  }

  async function ensureVendorProfile(userId, { businessName, category, area }){
    const { error } = await sb.from('vendors').insert({
      id: userId, business_name: businessName, category, area
    });
    if(error && error.code !== '23505') throw error; // 23505 = already exists, ignore
  }

  async function signInVendor({ email, password }){
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data;
  }

  async function signOutVendor(){
    await sb.auth.signOut();
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

  // ---- listings ----
  async function getActiveListings(){
    const { data, error } = await sb
      .from('listings')
      .select('*, vendors(business_name)')
      .eq('status', 'active')
      .order('pickup_start', { ascending: true });
    if(error) throw error;
    return data;
  }

  async function getListing(id){
    const { data, error } = await sb
      .from('listings').select('*, vendors(business_name)').eq('id', id).maybeSingle();
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

  async function updateListingQty(id, newQty){
    const { error } = await sb.from('listings').update({ quantity_left: newQty }).eq('id', id);
    if(error) throw error;
  }

  async function removeListing(id){
    const { error } = await sb.from('listings').update({ status: 'removed' }).eq('id', id);
    if(error) throw error;
  }

  // ---- reservations ----
  async function createReservation(listing, customerName, customerPhone){
    const { data, error } = await sb.from('reservations').insert({
      listing_id: listing.id,
      vendor_id: listing.vendor_id,
      vendor_name: listing.vendors ? listing.vendors.business_name : '',
      item_name: listing.item_name,
      price: listing.discounted_price,
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
    return data; // false if passcode was wrong
  }

  async function revokeVendor(vendorId, passcode){
    const { data, error } = await sb.rpc('revoke_vendor', { target_id: vendorId, given_passcode: passcode });
    if(error) throw error;
    return data;
  }

  return {
    signUpVendor, ensureVendorProfile, signInVendor, signOutVendor, getSession, getVendorProfile,
    getActiveListings, getListing, getListingsByVendor, createListing, updateListingQty, removeListing,
    createReservation, getReservationsByPhone, findReservationByCode, markCollected, getReservationsByVendor,
    getAllVendors, approveVendor, revokeVendor
  };
})();
