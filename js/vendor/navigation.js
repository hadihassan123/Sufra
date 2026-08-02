(function(){

    function init(){
        const navButtons = document.querySelectorAll('.dash-nav button');
        function showView(name){
            document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-' + name).classList.add('active');
            navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
            if(name === 'listings') Listings.render();
            if(name === 'overview') Overview.render();
            if(name === 'reservations') Pickup.render();
            if(name === 'documents') Documents.render();
            if(name === 'post'){
            const pickupStartInput = document.getElementById('pickupStart');
            if(!pickupStartInput.value){
                pickupStartInput.value = Listings.computeDefaultPickupStart();
            }
            }
        }
        // Exposed so js/vendor/listings.js can switch tabs (e.g. jump to the
        // post form after clicking "Edit", or back to the listings tab after
        // a successful post) without vendor.js needing to know about those
        // features by name in return — showView stays the one place that
        // orchestrates every feature, other files just call into it.
        window.Nav = { show: showView };
        try{
            navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
            document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
        }catch(err){
            console.error('[nav wiring] failed to wire up:', err);
        }
        
        

    }

    window.Navigation = {
        init
    };

})();
