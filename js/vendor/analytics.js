// js/vendor/analytics.js
import { Store } from '../store.js';
import { DashboardState } from '../dashboard-state.js';
import { ListingState } from '../utils.js';
export const Analytics = (() => {
  let lastListings = [];
  let lastReservations = [];

  async function init() {
    await render();
  }

  // Analytics.init() is never actually invoked in this app — only
  // .render() is, from navigation.js when the tab is shown. These two
  // just wire up static DOM elements (the pills, the export button),
  // so they run once at script-load time rather than waiting on a
  // lifecycle hook nothing calls.
  initPeriodPills();
  initExportButton();

  async function render() {
    try {
      const vendorId = DashboardState.vendor ? DashboardState.vendor.id : null;
      if (!vendorId) return;

      const [listings, reservations] = await Promise.all([
        Store.getListingsByVendor(vendorId),
        Store.getReservationsByVendor(vendorId)
      ]);
      lastListings = listings;
      lastReservations = reservations;

      computeAndRenderToday(listings, reservations);
      computeAndRender7Days(listings, reservations);
      computeAndRender30Days(listings, reservations);
      computeAndRenderAllTime(listings, reservations);
      computeAndRenderInsights(listings, reservations);
    } catch (err) {
      console.error('[analytics] failed to render stats:', err);
    }
  }

  // ---- helpers ----

  function dateStr(d) { return d.toISOString().split('T')[0]; }

  function revenueOf(reservations) {
    return reservations.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  }

  // Renders a delta line comparing current vs previous period.
  // Deliberately doesn't fabricate a percentage when the previous
  // period was 0 (e.g. a brand-new vendor's first day) — "+∞%" or a
  // made-up number is worse than just saying "first day of data".
  function renderDelta(elId, current, previous, opts = {}) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (previous === 0) {
      el.textContent = current > 0 ? 'No data for prior period yet' : '';
      el.className = 'metric-delta';
      return;
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct >= 0 ? '▲' : '▼';
    const label = opts.label || 'vs prior period';
    el.textContent = `${arrow} ${pct >= 0 ? '+' : ''}${pct}% ${label}`;
    el.className = 'metric-delta ' + (pct >= 0 ? 'up' : 'down');
  }

  // ---- period sections ----

  function computeAndRenderToday(listings, reservations) {
    const today = new Date();
    const todayStr = dateStr(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateStr(yesterday);

    const todayListings = listings.filter(l => l.created_at && l.created_at.startsWith(todayStr));
    const todayReservations = reservations.filter(r => r.created_at && r.created_at.startsWith(todayStr));
    const yesterdayListings = listings.filter(l => l.created_at && l.created_at.startsWith(yesterdayStr));
    const yesterdayReservations = reservations.filter(r => r.created_at && r.created_at.startsWith(yesterdayStr));

    const revenue = revenueOf(todayReservations);
    const yesterdayRevenue = revenueOf(yesterdayReservations);
    const collectedToday = todayReservations.filter(r => r.status === 'collected').length;
    const collectedYesterday = yesterdayReservations.filter(r => r.status === 'collected').length;
    const soldOutCount = todayListings.filter(l => ListingState.isSoldOut(l)).length;
    const soldOutYesterday = yesterdayListings.filter(l => ListingState.isSoldOut(l)).length;
    const expiredCount = todayListings.filter(l => ListingState.isExpired(l)).length;
    const expiredYesterday = yesterdayListings.filter(l => ListingState.isExpired(l)).length;

    document.getElementById('stat-today-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-today-meals').textContent = collectedToday;
    document.getElementById('stat-today-listings').textContent = todayListings.length;
    document.getElementById('stat-today-soldout').textContent = soldOutCount;
    document.getElementById('stat-today-expired').textContent = expiredCount;

    renderDelta('stat-today-revenue-delta', revenue, yesterdayRevenue, { label: 'vs yesterday' });
    renderDelta('stat-today-meals-delta', collectedToday, collectedYesterday, { label: 'vs yesterday' });
    renderDelta('stat-today-listings-delta', todayListings.length, yesterdayListings.length, { label: 'vs yesterday' });
    renderDelta('stat-today-soldout-delta', soldOutCount, soldOutYesterday, { label: 'vs yesterday' });
    renderDelta('stat-today-expired-delta', expiredCount, expiredYesterday, { label: 'vs yesterday' });
  }

  function computeAndRender7Days(listings, reservations) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentRes = reservations.filter(r => new Date(r.created_at) >= sevenDaysAgo);
    const priorRes = reservations.filter(r => {
      const d = new Date(r.created_at);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    });

    const revenue = revenueOf(recentRes);
    const priorRevenue = revenueOf(priorRes);
    const collected = recentRes.filter(r => r.status === 'collected').length;

    const avgDiscount = computeAvgDiscount(listings);

    document.getElementById('stat-7d-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-7d-reservations').textContent = recentRes.length;
    document.getElementById('stat-7d-collected').textContent = collected;
    const sellThroughPct = recentRes.length > 0 ? Math.round((collected / recentRes.length) * 100) : 0;
    document.getElementById('stat-7d-sellthrough').textContent = `${sellThroughPct}%`;
    const bar = document.getElementById('stat-7d-sellthrough-bar');
    if (bar) bar.style.width = `${sellThroughPct}%`;
    document.getElementById('stat-7d-discount').textContent = `${avgDiscount}%`;

    renderDelta('stat-7d-revenue-delta', revenue, priorRevenue, { label: 'vs prior 7 days' });
  }

  function computeAndRender30Days(listings, reservations) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const monthRes = reservations.filter(r => new Date(r.created_at) >= thirtyDaysAgo);
    const priorMonthRes = reservations.filter(r => {
      const d = new Date(r.created_at);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });

    const revenue = revenueOf(monthRes);
    const priorRevenue = revenueOf(priorMonthRes);
    const collected = monthRes.filter(r => r.status === 'collected').length;

    document.getElementById('stat-30d-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-30d-reservations').textContent = monthRes.length;
    document.getElementById('stat-30d-collected').textContent = collected;
    renderDelta('stat-30d-revenue-delta', revenue, priorRevenue, { label: 'vs prior 30 days' });

    // Relative trend bars: each metric's bar is sized against the
    // largest of the three, so they're comparable to each other at a
    // glance rather than each maxing out independently.
    const maxVal = Math.max(revenue, monthRes.length, collected, 1);
    setBarWidth('trend-30d-revenue-bar', revenue, maxVal);
    setBarWidth('trend-30d-reservations-bar', monthRes.length, maxVal);
    setBarWidth('trend-30d-collected-bar', collected, maxVal);
  }

  function computeAndRenderAllTime(listings, reservations) {
    const revenue = revenueOf(reservations);
    const collected = reservations.filter(r => r.status === 'collected').length;
    const soldOutNow = listings.filter(l => ListingState.isSoldOut(l)).length;
    const expiredNow = listings.filter(l => ListingState.isExpired(l)).length;

    document.getElementById('stat-all-revenue').textContent = `QAR ${revenue.toLocaleString()}`;
    document.getElementById('stat-all-reservations').textContent = reservations.length;
    document.getElementById('stat-all-collected').textContent = collected;
    document.getElementById('stat-all-soldout').textContent = soldOutNow;
    document.getElementById('stat-all-expired').textContent = expiredNow;
  }

  function setBarWidth(elId, value, maxVal) {
    const el = document.getElementById(elId);
    if (!el) return;
    const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
    el.style.width = `${pct}%`;
  }

  function computeAvgDiscount(listings) {
    let totalDiscountPercent = 0;
    let discountCount = 0;
    listings.forEach(l => {
      if (l.original_price && l.discounted_price && l.original_price > 0) {
        const disc = ((l.original_price - l.discounted_price) / l.original_price) * 100;
        totalDiscountPercent += disc;
        discountCount++;
      }
    });
    return discountCount > 0 ? Math.round(totalDiscountPercent / discountCount) : 0;
  }

  // ---- insights ----

  function computeAndRenderInsights(listings, reservations) {
    const categoryCounts = {};
    listings.forEach(l => {
      const cat = l.category || 'General';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const catEntries = Object.entries(categoryCounts);
    const topCategoryEntry = catEntries.length > 0
      ? catEntries.reduce((a, b) => a[1] > b[1] ? a : b)
      : null;

    const itemCounts = {};
    reservations.forEach(r => {
      const name = r.item_name || 'Item';
      itemCounts[name] = (itemCounts[name] || 0) + (r.quantity || 1);
    });
    const itemEntries = Object.entries(itemCounts);
    const topItemEntry = itemEntries.length > 0
      ? itemEntries.reduce((a, b) => a[1] > b[1] ? a : b)
      : null;

    // Real peak pickup hour, computed from each reservation's
    // pickup_start (denormalized onto the reservations table itself) —
    // this used to be hardcoded to a fixed "7:00 PM" regardless of
    // actual data.
    const hourCounts = {};
    reservations.forEach(r => {
      if (!r.pickup_start) return;
      const hour = new Date(r.pickup_start).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const hourEntries = Object.entries(hourCounts);
    let peakWindowLabel = '-';
    if (hourEntries.length > 0) {
      const [peakHourStr] = hourEntries.reduce((a, b) => a[1] > b[1] ? a : b);
      const peakHour = Number(peakHourStr);
      const displayHour = peakHour % 12 === 0 ? 12 : peakHour % 12;
      const suffix = peakHour < 12 ? 'AM' : 'PM';
      peakWindowLabel = `${displayHour}:00 ${suffix}`;
    }

    const collected = reservations.filter(r => r.status === 'collected').length;
    const sellThroughPct = reservations.length > 0 ? Math.round((collected / reservations.length) * 100) : 0;

    document.getElementById('insight-top-category').textContent = topCategoryEntry ? topCategoryEntry[0] : '-';
    document.getElementById('insight-top-category-sub').textContent = topCategoryEntry ? `${topCategoryEntry[1]} listing${topCategoryEntry[1] === 1 ? '' : 's'}` : '';
    document.getElementById('insight-top-item').textContent = topItemEntry ? topItemEntry[0] : '-';
    document.getElementById('insight-top-item-sub').textContent = topItemEntry ? `${topItemEntry[1]} reservation${topItemEntry[1] === 1 ? '' : 's'}` : '';
    document.getElementById('insight-top-window').textContent = peakWindowLabel;
    document.getElementById('insight-avg-sellthrough').textContent = `${sellThroughPct}%`;
    const insightBar = document.getElementById('insight-avg-sellthrough-bar');
    if (insightBar) insightBar.style.width = `${sellThroughPct}%`;
  }

  // ---- period pills ----

  function initPeriodPills() {
    const pills = document.querySelectorAll('.period-pills .pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const period = pill.dataset.period;
        document.querySelectorAll('[data-period-section]').forEach(section => {
          section.hidden = section.dataset.periodSection !== period;
        });
      });
    });
  }

  // ---- export ----

  // Reservations/listings only ever hold their current snapshot state
  // (no historical event log), so "sold out" / "expired" per past day
  // means "of the items whose pickup window fell on that day, how many
  // are (as of right now) sold out / expired" — not a strict record of
  // which day each one actually flipped state.
  function buildDailyBreakdown(listings, reservations, days = 30) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = [];

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = dateStr(day);

      const dayReservations = reservations.filter(r => r.created_at && r.created_at.startsWith(dayStr));
      const dayListings = listings.filter(l => l.pickup_start && l.pickup_start.startsWith(dayStr));

      rows.push({
        date: dayStr,
        revenue: revenueOf(dayReservations),
        reserved: dayReservations.filter(r => r.status === 'reserved').length,
        collected: dayReservations.filter(r => r.status === 'collected').length,
        expired: dayListings.filter(l => ListingState.isExpired(l)).length,
        soldOut: dayListings.filter(l => ListingState.isSoldOut(l)).length
      });
    }
    return rows;
  }

  function toCsv(rows) {
    const header = ['Date', 'Revenue', 'Reserved', 'Collected', 'Expired', 'Sold Out'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      lines.push([r.date, r.revenue, r.reserved, r.collected, r.expired, r.soldOut].join(','));
    });
    return lines.join('\n');
  }

  function initExportButton() {
    const btn = document.getElementById('exportAnalyticsBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const rows = buildDailyBreakdown(lastListings, lastReservations, 30);
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sufra-analytics-${dateStr(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  return { init, render };
})();
window.Analytics = Analytics;