// js/vendor/listing-state.js
const ListingState = (() => {
  function isSoldOut(listing) {
    return Number(listing.quantity_left) <= 0 || listing.status === 'sold_out';
  }

  function isExpired(listing) {
    if (!listing.pickup_end) return false;
    return new Date(listing.pickup_end) < new Date();
  }

  function isActive(listing) {
    return !isSoldOut(listing) && !isExpired(listing) && listing.status === 'active';
  }

  return { isSoldOut, isExpired, isActive };
})();
window.ListingState = ListingState;