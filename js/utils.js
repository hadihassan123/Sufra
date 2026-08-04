// Shared, stateless formatting helpers used across the customer and
// vendor pages. Previously money()/timeFmt() were copy-pasted
// identically into both js/vendor.js and js/customer.js — this is now
// the single source of truth.
//
// Pure functions only — no DOM access, no Supabase calls, no shared
// mutable state. Safe to load anywhere, in any order, on any page.

const Fmt = {
  money(n){
    return 'QAR ' + Number(n).toFixed(0);
  },

  pct(oldPrice, newPrice){
    return Math.round((1 - newPrice / oldPrice) * 100);
  },

  time(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  categoryGlyph(category){
    const glyphs = { Bakery: '🥖', 'Café': '☕', Restaurant: '🍽️', Patisserie: '🍰', Grocery: '🧺', Hotel: '🏨' };
    return glyphs[category] || '🍴';
  }
};

// js/utils.js
window.ListingState = {
  isSoldOut(l) {
    return (l.quantity_left !== undefined ? l.quantity_left : l.quantity_available) <= 0;
  },
  isExpired(l) {
    return new Date(l.pickup_end) < new Date();
  },
  isActive(l) {
    return !this.isSoldOut(l) && !this.isExpired(l) && l.status === 'active';
  }
};