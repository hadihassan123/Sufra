(function(){

    function init(){
        const navButtons = document.querySelectorAll('.dash-nav button');
        function showView(name, opts = {}){
            document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-' + name).classList.add('active');
            navButtons.forEach(b => {
                const isActive = b.dataset.view === name;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', String(isActive));
            });
            // Regular navigation always shows everything — only the dashboard
            // stat-card drilldown (Overview's initStatCardLinks) wants the
            // filter to survive the Nav.show() call, via preserveFilter.
            if(!opts.preserveFilter){
                if(name === 'listings') DashboardState.listingsFilter = null;
                if(name === 'reservations') DashboardState.reservationsFilter = null;
            }
            if(name === 'listings') Listings.render();
            if(name === 'overview') Overview.render();
            if(name === 'reservations') Pickup.render();
            if(name === 'documents') Documents.render();
            if(name === 'analytics') window.Analytics.render(); 
            if(name === 'post'){
            const pickupStartInput = document.getElementById('pickupStart');
            if(!pickupStartInput.value){
                pickupStartInput.value = Listings.computeDefaultPickupStart();
            }
            }
        }
        // showView stays the one place that orchestrates every feature;
        // other files (e.g. listings.js) just call Nav.show(...).
        // Attach show after it exists so Nav is a single public surface.
        window.Nav.show = showView;
        try{
            navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
            document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
        }catch(err){
            console.error('[nav wiring] failed to wire up:', err);
        }
    }

    // Single public surface: Nav.init() from vendor.js, Nav.show() from feature modules
    // (show is attached during init once the real implementation exists).
    window.Nav = { init };

})();