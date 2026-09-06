// Centralized mutable state for the vendor dashboard, shared across
// feature sections that previously depended on implicit same-file
// closure variables (vendor, cachedListings, editingListingId, etc).
//
// Introduced 2026-07-30. Before this, cross-section dependencies were
// invisible bare identifiers — e.g. `editingListingId`, written by the
// listings-table section and read by the post-form section, with
// nothing marking that connection. That implicit pattern is exactly
// what caused a real bug earlier the same day (a `try{}` block
// accidentally trapped `listingImagePreviewRow` away from a handler
// that still needed it). Routing shared state through one explicit
// object makes every cross-section dependency grep-able
// (`DashboardState.xxx`) and is a prerequisite for ever safely
// splitting vendor.js into multiple files.
//
// Plain exported object - a prerequisite for ever safely splitting
// vendor.js into multiple files, now realized via real ES modules
// rather than shared classic-script global scope.

export const DashboardState = {
  vendor: null,               // signed-in vendor's profile row (from Store.getVendorProfile)
  currentVendor: null,        // refreshed copy after logo/document uploads, so status badges reflect latest values
  cachedListings: [],         // last-rendered listings — the post form reads this when editing (e.g. to look up quantity_left)
  editingListingId: null,     // set when "Edit" is clicked on a listing; read by the post form's submit handler
  editingListingImageUrl: null, // preserves the existing photo when editing without picking a new one

  // Set when a dashboard stat card is clicked (e.g. "Sold out"); read by
  // Listings.render() / Pickup.render() to pre-filter their tables. Null
  // means "show everything", same as before this feature existed.
  listingsFilter: null,       // 'active' | 'sold_out' | 'expired' | null
  reservationsFilter: null,   // 'reserved' | 'collected' | null

  _readyCallbacks: [],
  // vendor.js populates DashboardState.vendor ASYNCHRONOUSLY (inside an
  // await). A separately-loaded feature file can't just run its init
  // code at the top level on page load — that would very likely execute
  // before DashboardState.vendor is actually set, since script tags
  // don't wait on each other's async work. Feature files that need
  // DashboardState.vendor to already be populated should register their
  // init code here instead of running it immediately; vendor.js calls
  // runReady() once, right after the vendor profile has successfully
  // loaded.
  onReady(fn){ this._readyCallbacks.push(fn); },
  async runReady(){
    for(const fn of this._readyCallbacks){
      try{ await fn(); }catch(err){ console.error('[DashboardState.onReady handler] failed:', err); }
    }
  },
  setVendor(profile){
    this.vendor = profile;
    this.currentVendor = profile;
  }
};