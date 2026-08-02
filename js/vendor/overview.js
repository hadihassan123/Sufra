(function () {

    let currentFilter = 'today';
    let rawListings = [];
    let rawReservations = [];

    function isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    function isWithinRange(dateStr, filter) {
        if (filter === 'all') return true;
        const itemDate = new Date(dateStr);
        const now = new Date();

        if (filter === 'today') return isSameDay(itemDate, now);
        if (filter === 'week') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            return itemDate >= sevenDaysAgo && itemDate <= now;
        }
        if (filter === 'month') {
            return itemDate.getFullYear() === now.getFullYear() &&
                   itemDate.getMonth() === now.getMonth();
        }
        return true;
    }

    async function render() {
        const [listings, reservations] = await Promise.all([
            Store.getListingsByVendor(DashboardState.vendor.id),
            Store.getReservationsByVendor(DashboardState.vendor.id)
        ]);
        
        rawListings = listings || [];
        rawReservations = reservations || [];

        ensureFilterControls();
        updateDashboard();
    }

    function ensureFilterControls() {
        const container = document.getElementById('statActive')?.parentElement?.parentElement;
        if (!container || document.getElementById('analyticsFilterGroup')) return;

        const filterWrapper = document.createElement('div');
        filterWrapper.id = 'analyticsFilterGroup';
        filterWrapper.style.cssText = 'display: flex; gap: 8px; margin-bottom: 20px;';

        ['today', 'week', 'month', 'all'].forEach(id => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-btn ${id === currentFilter ? 'active' : ''}`;
            btn.textContent = id === 'all' ? 'All Time' : id.charAt(0).toUpperCase() + id.slice(1);
            btn.onclick = () => {
                currentFilter = id;
                document.querySelectorAll('#analyticsFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateDashboard();
            };
            filterWrapper.appendChild(btn);
        });

        container.parentNode.insertBefore(filterWrapper, container);
    }

    function updateDashboard() {
        const now = new Date();

        const filteredListings = rawListings.filter(l => isWithinRange(l.created_at, currentFilter));
        const filteredReservations = rawReservations.filter(r => isWithinRange(r.created_at, currentFilter));

        // Phase 1 definitions
        const activeListings = filteredListings.filter(l => new Date(l.pickup_end) >= now && l.quantity_left > 0);
        const expiredListings = filteredListings.filter(l => new Date(l.pickup_end) < now && l.quantity_left > 0);
        const soldOutListings = filteredListings.filter(l => l.quantity_left <= 0);

        const reservedItems = filteredReservations.filter(r => r.status === 'reserved');
        const collectedItems = filteredReservations.filter(r => r.status === 'collected');

        if (document.getElementById('statActive')) document.getElementById('statActive').textContent = activeListings.length;
        if (document.getElementById('statSoldOut')) document.getElementById('statSoldOut').textContent = soldOutListings.length;
        if (document.getElementById('statExpired')) document.getElementById('statExpired').textContent = expiredListings.length;
        if (document.getElementById('statReserved')) document.getElementById('statReserved').textContent = reservedItems.length;
        if (document.getElementById('statCollected')) document.getElementById('statCollected').textContent = collectedItems.length;

        // Phase 2 calculations
        const totalRevenue = collectedItems.reduce((sum, r) => sum + (Number(r.price) * (r.quantity || 1)), 0);
        const totalReservationsCount = filteredReservations.length;
        const collectionRate = totalReservationsCount > 0 ? Math.round((collectedItems.length / totalReservationsCount) * 100) : 0;
        const unsoldFoodItems = expiredListings.reduce((sum, l) => sum + l.quantity_left, 0);

        const listingMap = new Map(rawListings.map(l => [l.id, l]));
        const moneySaved = collectedItems.reduce((sum, r) => {
            const original = listingMap.get(r.listing_id);
            return original ? sum + ((original.original_price - original.discounted_price) * (r.quantity || 1)) : sum;
        }, 0);

        renderDerivedMetricsRow({
            revenue: totalRevenue,
            reservations: totalReservationsCount,
            collectionRate: collectionRate,
            unsoldItems: unsoldFoodItems,
            moneySaved: moneySaved,
            collectedItems: collectedItems
        });
    }

    function renderDerivedMetricsRow(metrics) {
        let row = document.getElementById('derivedMetricsRow');
        if (!row) {
            row = document.createElement('div');
            row.id = 'derivedMetricsRow';
            row.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 20px;';
            const primaryCardContainer = document.getElementById('statActive')?.parentElement?.parentElement;
            if (primaryCardContainer) primaryCardContainer.parentNode.insertBefore(row, primaryCardContainer.nextSibling);
        }

        row.innerHTML = `
            <div id="metricCardRevenue" style="cursor:pointer; border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
                <small style="color:#64748b; font-size:12px;">Revenue (${currentFilter})</small>
                <h3 style="margin:4px 0 0; font-size:18px;">${Fmt.money(metrics.revenue)}</h3>
            </div>
            <div style="border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
                <small style="color:#64748b; font-size:12px;">Reservations</small>
                <h3 style="margin:4px 0 0; font-size:18px;">${metrics.reservations}</h3>
            </div>
            <div style="border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
                <small style="color:#64748b; font-size:12px;">Collection Rate</small>
                <h3 style="margin:4px 0 0; font-size:18px;">${metrics.collectionRate}%</h3>
            </div>
            <div style="border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
                <small style="color:#64748b; font-size:12px;">Unsold Food</small>
                <h3 style="margin:4px 0 0; font-size:18px;">${metrics.unsoldItems} items</h3>
            </div>
            <div style="border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
                <small style="color:#64748b; font-size:12px;">Money Saved</small>
                <h3 style="margin:4px 0 0; font-size:18px;">${Fmt.money(metrics.moneySaved)}</h3>
            </div>
        `;

        document.getElementById('metricCardRevenue').onclick = () => {
            showRevenueBreakdownModal(metrics.collectedItems, metrics.revenue);
        };
    }

    function showRevenueBreakdownModal(collectedItems, totalRevenue) {
        let modal = document.getElementById('revenueModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'revenueModal';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;';
            document.body.appendChild(modal);
        }

        const itemsListHtml = collectedItems.length === 0
            ? `<p style="color:#64748b; text-align:center; padding: 12px 0;">No collected orders found for this period.</p>`
            : collectedItems.map(item => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9;">
                    <span><strong style="margin-right:8px;">${Fmt.time(item.created_at)}</strong> ${item.item_name} ${item.quantity > 1 ? `(x${item.quantity})` : ''}</span>
                    <span>${Fmt.money(Number(item.price) * (item.quantity || 1))}</span>
                </div>
            `).join('');

        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; width:100%; max-width:440px; padding:20px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="margin:0;">Revenue Breakdown (${currentFilter})</h3>
                    <button id="closeRevenueModal" style="border:none; background:none; font-size:20px; cursor:pointer;">&times;</button>
                </div>
                <div style="max-height:300px; overflow-y:auto; margin-bottom:16px;">
                    ${itemsListHtml}
                </div>
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px; border-top:2px solid #e2e8f0; padding-top:12px;">
                    <span>TOTAL</span>
                    <span>${Fmt.money(totalRevenue)}</span>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
        document.getElementById('closeRevenueModal').onclick = () => { modal.style.display = 'none'; };
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }

})();