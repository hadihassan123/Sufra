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
  },

  // Mirrors normalize_qatar_phone() in Postgres — this copy is for
  // early UX feedback only (avoids a round-trip for an obviously-wrong
  // number, lets the form show an inline error instead of a raw
  // alert()). The database function is the actual enforcement point;
  // this one is not a security boundary and must stay behaviorally in
  // sync with it, not replace it.
  normalizeQatarPhone(input){
    if(!input) return null;
    let digits = String(input).replace(/[^0-9]/g, '');
    if(digits.startsWith('00974')) digits = digits.slice(5);
    else if(digits.startsWith('974') && digits.length === 11) digits = digits.slice(3);
    else if(digits.startsWith('0') && digits.length === 9) digits = digits.slice(1);
    if(digits.length !== 8 || !/^[3567][0-9]{7}$/.test(digits)) return null;
    return '+974' + digits;
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
  },
  // Combines isSoldOut/isExpired into the single {key, label} shape
  // overview.js and listings.js each used to build separately with an
  // identical local statusFor() — sold-out takes priority over expired
  // so a listing that's both still reads "Sold out", not "Expired".
  status(l) {
    if (this.isSoldOut(l)) return { key: 'sold_out', label: 'Sold out' };
    if (this.isExpired(l)) return { key: 'expired', label: 'Expired' };
    return { key: 'active', label: 'Active' };
  }
};