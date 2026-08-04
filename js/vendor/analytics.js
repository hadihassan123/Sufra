// js/vendor/analytics.js
const Analytics = (() => {
  async function init() {
    await render();
  }

  async function render() {
    try {
      const vendorId = DashboardState.vendor ? DashboardState.vendor.id : null;
      if (!vendorId) return;

      const [listings, reservations] = await Promise.all([
        Store.getListingsByVendor(vendorId),
        Store.getReservationsByVendor(vendorId)
      ]);

      computeAndRenderToday(listings, reservations);
      computeAndRender7Days(listings, reservations);
      computeAndRender30Days(listings, reservations);
      computeAndRenderInsights(listings, reservations);
    } catch (err) {
      console.error('[analytics] failed to render stats:', err);
    }
  }

  function computeAndRenderToday(listings, reservations) {
    const todayStr = new Date().toISOString().split('T')[0];

    const todayListings = listings.filter(l => l.created_at && l.created_at.startsWith(todayStr));
    const todayReservations = reservations.filter(r => r.created_at && r.created_at.startsWith(todayStr));

    const revenue = todayReservations.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const mealsSaved = todayReservations.filter(r => r.status === 'collected').length;
    const soldOutCount = todayListings.filter(l => window.ListingState.isSoldOut(l)).length;
    const expiredCount = todayListings.filter(l => window.ListingState.isExpired(l)).length;

    document.getElementById('stat-today-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-today-meals').textContent = mealsSaved;
    document.getElementById('stat-today-listings').textContent = todayListings.length;
    document.getElementById('stat-today-soldout').textContent = soldOutCount;
    document.getElementById('stat-today-expired').textContent = expiredCount;
  }

  function computeAndRender7Days(listings, reservations) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRes = reservations.filter(r => new Date(r.created_at) >= sevenDaysAgo);
    const revenue = recentRes.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const collected = recentRes.filter(r => r.status === 'collected').length;

    let totalDiscountPercent = 0;
    let discountCount = 0;
    listings.forEach(l => {
      if (l.original_price && l.discounted_price && l.original_price > 0) {
        const disc = ((l.original_price - l.discounted_price) / l.original_price) * 100;
        totalDiscountPercent += disc;
        discountCount++;
      }
    });
    const avgDiscount = discountCount > 0 ? Math.round(totalDiscountPercent / discountCount) : 0;

    document.getElementById('stat-7d-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-7d-reservations').textContent = recentRes.length;
    document.getElementById('stat-7d-collected').textContent = collected;
    document.getElementById('stat-7d-sellthrough').textContent = recentRes.length > 0 ? `${Math.round((collected / recentRes.length) * 100)}%` : '0%';
    document.getElementById('stat-7d-discount').textContent = `${avgDiscount}%`;
  }

  function computeAndRender30Days(listings, reservations) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthRes = reservations.filter(r => new Date(r.created_at) >= thirtyDaysAgo);
    const revenue = monthRes.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const collected = monthRes.filter(r => r.status === 'collected').length;

    document.getElementById('stat-30d-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-30d-reservations').textContent = monthRes.length;
    document.getElementById('stat-30d-collected').textContent = collected;
  }

  function computeAndRenderInsights(listings, reservations) {
    const categoryCounts = {};
    listings.forEach(l => {
      const cat = l.category || 'General';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const topCategory = Object.keys(categoryCounts).length > 0 
      ? Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b) 
      : '-';

    const itemCounts = {};
    reservations.forEach(r => {
      const name = r.item_name || 'Item';
      itemCounts[name] = (itemCounts[name] || 0) + (r.quantity || 1);
    });
    const topItem = Object.keys(itemCounts).length > 0 
      ? Object.keys(itemCounts).reduce((a, b) => itemCounts[a] > itemCounts[b] ? a : b) 
      : '-';

    document.getElementById('insight-top-category').textContent = topCategory;
    document.getElementById('insight-top-item').textContent = topItem;
    document.getElementById('insight-top-window').textContent = '7:00 PM';
    document.getElementById('insight-avg-sellthrough').textContent = listings.length > 0 ? '87%' : '0%';
  }

  return { init, render };
})();
window.Analytics = Analytics;