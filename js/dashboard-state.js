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
// Plain object, not an ES module — matches the rest of the project's
// classic-script pattern (no build step, plain <script> tags). Load
// this before vendor.js.

const DashboardState = {
  vendor: null,               // signed-in vendor's profile row (from Store.getVendorProfile)
  currentVendor: null,        // refreshed copy after logo/document uploads, so status badges reflect latest values
  cachedListings: [],         // last-rendered listings — the post form reads this when editing (e.g. to look up quantity_left)
  editingListingId: null,     // set when "Edit" is clicked on a listing; read by the post form's submit handler
  editingListingImageUrl: null // preserves the existing photo when editing without picking a new one
};