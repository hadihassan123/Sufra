(async () => {
  const session = await Store.getSession();
  if(!session){ window.location.href = 'vendor-login.html'; return; }

  // ---- Doha time dial ----
  // Moved to js/doha-clock.js (2026-07-30) — it's page-agnostic and had no
  // real reason to be tangled up with vendor-session-gated code. Load
  // js/doha-clock.js as a separate <script> tag on any page that wants it.

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Fetch the vendor profile and admin status in parallel — isAdmin()
  // only needs the session's user id, not the profile, so there's no
  // reason to wait for one before starting the other. This cuts a full
  // network round-trip off the time before the dashboard becomes usable.
  let [vendorProfile, isAdminUser] = await Promise.all([
    Store.getVendorProfile(session.user.id),
    Store.isAdmin(session.user.id)
  ]);
  DashboardState.vendor = vendorProfile;

  // A profile can be momentarily unavailable right after a fresh signup
  // (especially with instant sign-in / no email confirmation) since the
  // dashboard loads immediately after signUp() resolves. Retry briefly
  // before treating it as a real "no profile" case.
  for(let attempt = 0; !DashboardState.vendor && attempt < 3; attempt++){
    await sleep(700);
    DashboardState.vendor = await Store.getVendorProfile(session.user.id);
  }
  if(!DashboardState.vendor){
    // Signed in but no vendor profile row after retrying — genuinely missing.
    alert('Your account is signed in but has no business profile yet. Please contact support.');
    await Store.signOutVendor();
    window.location.href = 'vendor-login.html';
    return;
  }
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.style.display = 'inline-flex';

  // Admin status lives in its own admins table, separate from vendors —
  // a vendor can also be an admin, checked via is_admin() above rather
  // than any column on the vendors row itself.
  if(isAdminUser){
    const adminLink = document.getElementById('adminPortalLink');
    if(adminLink) adminLink.style.display = 'inline-block';
  }

  // money()/timeFmt() moved to js/utils.js as Fmt.money()/Fmt.time() —
  // was previously duplicated identically in js/customer.js.

  DashboardState.currentVendor = DashboardState.vendor; // refreshed after logo/document uploads so status reflects latest values
  

  // ---- business location: map + reverse geocoding + one save action ----
  // Moved to js/vendor-location.js (2026-07-30), the first piece split
  // out of this file now that DashboardState makes cross-file state
  // explicit. Runs via DashboardState.onReady() below, not directly here.

  // Trigger every DashboardState.onReady() callback registered by
  // separately-loaded feature files, now that DashboardState.vendor is
  // confirmed populated. Must happen after the vendor-not-found check
  // above (never call this with a null vendor).
  await DashboardState.runReady();
  // Initialize documents module here - after vendor profile is loaded
  Documents.init();

  try{
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await Store.signOutVendor();
      window.location.href = 'index.html';
    });
  }catch(err){
    console.error('[logout button] failed to wire up:', err);
  }

  // ---- store logo ----
  // Moved to js/vendor/logo.js (2026-07-30), same pattern as
  // js/vendor/documents.js — no other file references this section.
  Logo.init();

  // ---- item photo preview + clear ----
  // Moved to js/vendor/listings.js (2026-07-30) along with the listings
  // table, edit-form, and post-form — they all share cachedListings /
  // editingListingId / editingListingImageUrl, so kept together.

  // ---- nav ----
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

  // ---- listings table / edit / post form ----
  // Moved to js/vendor/listings.js (2026-07-30).
  Listings.init();

  // ---- verify pickup + reservations table ----
  // Moved to js/vendor/pickup.js (2026-07-30), same {init, render}
  // pattern as documents.js/logo.js. showView('reservations') below
  // now calls Pickup.render() instead of the old local function.
  Pickup.init();

  try{
    await Overview.render();
  }catch(err){
    console.error('[overview] failed to render:', err);
  }
})();