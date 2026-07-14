/* Sufra data layer — localStorage-backed, scoped to this browser/device.
   Keys: sufra_vendors, sufra_listings, sufra_reservations, sufra_session */

const Store = (() => {
  const KEYS = {
    vendors: 'sufra_vendors',
    listings: 'sufra_listings',
    reservations: 'sufra_reservations',
    session: 'sufra_session'
  };

  function read(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function write(key, val){
    localStorage.setItem(key, JSON.stringify(val));
  }
  function uid(prefix){
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  }
  function pickupCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let out = '';
    for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }

  function seedIfEmpty(){
    if(read(KEYS.vendors)) return; // already seeded

    const now = new Date();
    function timeToday(h, m){
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }

    const vendors = [
      { id:'v_zubara', businessName:'Al Zubara Bakery', email:'demo@zubara.qa', password:'demo1234',
        category:'Bakery', area:'Al Sadd', verificationStatus:'verified', createdAt:now.toISOString() },
      { id:'v_corniche', businessName:'Corniche Café', email:'demo@corniche.qa', password:'demo1234',
        category:'Café', area:'West Bay', verificationStatus:'verified', createdAt:now.toISOString() },
      { id:'v_souq', businessName:'Souq Waqif Grill House', email:'demo@souqgrill.qa', password:'demo1234',
        category:'Restaurant', area:'Souq Waqif', verificationStatus:'verified', createdAt:now.toISOString() },
      { id:'v_layali', businessName:'Layali Patisserie', email:'demo@layali.qa', password:'demo1234',
        category:'Patisserie', area:'The Pearl', verificationStatus:'pending', createdAt:now.toISOString() }
    ];

    const listings = [
      { id:'l_1', vendorId:'v_zubara', vendorName:'Al Zubara Bakery', itemName:'Manakeesh Bundle (6pc)',
        description:'Za\'atar, cheese, and lahm bi ajeen manakeesh baked this morning.',
        category:'Bakery', originalPrice:24, discountedPrice:9, quantityTotal:8, quantityLeft:5,
        pickupStart:timeToday(19,0), pickupEnd:timeToday(20,30), paymentMethod:'cash', status:'active' },
      { id:'l_2', vendorId:'v_zubara', vendorName:'Al Zubara Bakery', itemName:'Sourdough Loaf',
        description:'Whole wheat sourdough, baked fresh, one day out from best-by.',
        category:'Bakery', originalPrice:18, discountedPrice:7, quantityTotal:6, quantityLeft:0,
        pickupStart:timeToday(19,0), pickupEnd:timeToday(20,30), paymentMethod:'cash', status:'active' },
      { id:'l_3', vendorId:'v_corniche', vendorName:'Corniche Café', itemName:'Karak & Pastry Box',
        description:'Two karak teas and a mixed box of croissants and cookies from today\'s case.',
        category:'Café', originalPrice:32, discountedPrice:14, quantityTotal:10, quantityLeft:7,
        pickupStart:timeToday(20,0), pickupEnd:timeToday(21,0), paymentMethod:'cash', status:'active' },
      { id:'l_4', vendorId:'v_souq', vendorName:'Souq Waqif Grill House', itemName:'Mixed Grill Platter',
        description:'Chicken and lamb skewers with rice, hummus, and salad — today\'s lunch service surplus.',
        category:'Restaurant', originalPrice:55, discountedPrice:20, quantityTotal:5, quantityLeft:2,
        pickupStart:timeToday(15,30), pickupEnd:timeToday(16,30), paymentMethod:'cash', status:'active' },
      { id:'l_5', vendorId:'v_souq', vendorName:'Souq Waqif Grill House', itemName:'Machboos Rice Box',
        description:'Spiced lamb machboos, made this afternoon, boxed for pickup.',
        category:'Restaurant', originalPrice:38, discountedPrice:15, quantityTotal:6, quantityLeft:6,
        pickupStart:timeToday(20,30), pickupEnd:timeToday(21,30), paymentMethod:'cash', status:'active' },
      { id:'l_6', vendorId:'v_layali', vendorName:'Layali Patisserie', itemName:'Luqaimat Box (12pc)',
        description:'Golden dumplings drizzled with date syrup, made fresh this evening.',
        category:'Patisserie', originalPrice:28, discountedPrice:11, quantityTotal:4, quantityLeft:4,
        pickupStart:timeToday(21,0), pickupEnd:timeToday(22,0), paymentMethod:'cash', status:'active' }
    ];

    write(KEYS.vendors, vendors);
    write(KEYS.listings, listings);
    write(KEYS.reservations, []);
  }

  // ---- vendors ----
  function getVendors(){ return read(KEYS.vendors) || []; }
  function getVendor(id){ return getVendors().find(v => v.id === id) || null; }
  function findVendorByEmail(email){
    return getVendors().find(v => v.email.toLowerCase() === email.toLowerCase()) || null;
  }
  function createVendor(data){
    const vendors = getVendors();
    const vendor = {
      id: uid('v'),
      businessName: data.businessName,
      email: data.email,
      password: data.password,
      category: data.category,
      area: data.area,
      verificationStatus: 'pending',
      createdAt: new Date().toISOString()
    };
    vendors.push(vendor);
    write(KEYS.vendors, vendors);
    return vendor;
  }

  // ---- session ----
  function setSession(vendorId){ write(KEYS.session, { vendorId }); }
  function getSession(){ return read(KEYS.session); }
  function clearSession(){ localStorage.removeItem(KEYS.session); }

  // ---- listings ----
  function getListings(){ return read(KEYS.listings) || []; }
  function getListing(id){ return getListings().find(l => l.id === id) || null; }
  function getListingsByVendor(vendorId){ return getListings().filter(l => l.vendorId === vendorId); }
  function getActiveListings(){
    const vendors = getVendors();
    return getListings().filter(l => {
      const v = vendors.find(v => v.id === l.vendorId);
      return l.status === 'active' && v && v.verificationStatus === 'verified';
    });
  }
  function createListing(data){
    const listings = getListings();
    const listing = {
      id: uid('l'),
      vendorId: data.vendorId,
      vendorName: data.vendorName,
      itemName: data.itemName,
      description: data.description,
      category: data.category,
      originalPrice: Number(data.originalPrice),
      discountedPrice: Number(data.discountedPrice),
      quantityTotal: Number(data.quantity),
      quantityLeft: Number(data.quantity),
      pickupStart: data.pickupStart,
      pickupEnd: data.pickupEnd,
      paymentMethod: 'cash',
      status: 'active'
    };
    listings.push(listing);
    write(KEYS.listings, listings);
    return listing;
  }
  function updateListingQty(id, delta){
    const listings = getListings();
    const listing = listings.find(l => l.id === id);
    if(!listing) return null;
    listing.quantityLeft = Math.max(0, Math.min(listing.quantityTotal, listing.quantityLeft + delta));
    write(KEYS.listings, listings);
    return listing;
  }
  function decrementListingStock(id, amount){
    const listings = getListings();
    const listing = listings.find(l => l.id === id);
    if(!listing || listing.quantityLeft < amount) return null;
    listing.quantityLeft -= amount;
    write(KEYS.listings, listings);
    return listing;
  }
  function removeListing(id){
    write(KEYS.listings, getListings().filter(l => l.id !== id));
  }

  // ---- reservations ----
  function getReservations(){ return read(KEYS.reservations) || []; }
  function getReservationsByVendor(vendorId){
    const listingIds = getListingsByVendor(vendorId).map(l => l.id);
    return getReservations().filter(r => listingIds.includes(r.listingId));
  }
  function createReservation(listing, customerName, customerPhone){
    const reservations = getReservations();
    const reservation = {
      id: uid('r'),
      listingId: listing.id,
      vendorName: listing.vendorName,
      itemName: listing.itemName,
      price: listing.discountedPrice,
      customerName,
      customerPhone,
      pickupCode: pickupCode(),
      pickupStart: listing.pickupStart,
      pickupEnd: listing.pickupEnd,
      status: 'reserved',
      createdAt: new Date().toISOString()
    };
    reservations.push(reservation);
    write(KEYS.reservations, reservations);
    return reservation;
  }
  function getReservationsByPhone(phone){
    return getReservations()
      .filter(r => r.customerPhone === phone)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  function findReservationByCode(code){
    return getReservations().find(r => r.pickupCode.toUpperCase() === code.toUpperCase()) || null;
  }
  function markCollected(id){
    const reservations = getReservations();
    const r = reservations.find(r => r.id === id);
    if(!r) return null;
    r.status = 'collected';
    write(KEYS.reservations, reservations);
    return r;
  }

  return {
    seedIfEmpty,
    getVendors, getVendor, findVendorByEmail, createVendor,
    setSession, getSession, clearSession,
    getListings, getListing, getListingsByVendor, getActiveListings,
    createListing, updateListingQty, decrementListingStock, removeListing,
    getReservations, getReservationsByVendor, createReservation,
    getReservationsByPhone, findReservationByCode, markCollected
  };
})();

Store.seedIfEmpty();
