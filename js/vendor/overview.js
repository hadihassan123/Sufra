(function () {

    async function render() {

        const [listings, reservations] = await Promise.all([
            Store.getListingsByVendor(DashboardState.vendor.id),
            Store.getReservationsByVendor(DashboardState.vendor.id)
        ]);
        
        const now = new Date();

        const activeListings = listings.filter(
            l => new Date(l.pickup_end) >= now
        );

        const expiredListings = listings.filter(l =>
            new Date(l.pickup_end) < now &&
            l.quantity_left > 0
        );

        const soldOutListings = listings.filter(l =>
            l.quantity_left <= 0
        );

        document.getElementById('statActive').textContent =
            activeListings.length;

        document.getElementById('statSoldOut').textContent =
            soldOutListings.length;

        document.getElementById('statExpired').textContent =
            expiredListings.length;

        document.getElementById('statReserved').textContent =
            reservations.filter(r => r.status === 'reserved').length;

        document.getElementById('statCollected').textContent =
            reservations.filter(r => r.status === 'collected').length;

    }

    window.Overview = {
        render
    };

})();