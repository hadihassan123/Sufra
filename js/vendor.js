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
  // ---- sidebar identity ----
  try{
    document.getElementById('sideVendorName').textContent = DashboardState.vendor.business_name;
    const statusEl = document.getElementById('sideVendorStatus');
    statusEl.textContent = DashboardState.vendor.verification_status === 'verified' ? 'Verified vendor' : 'Pending verification';

    if(DashboardState.vendor.verification_status !== 'verified'){
      document.getElementById('verifyBadgeNotice').innerHTML = `
        <div class="form-msg show" style="background:rgba(232,163,61,0.12); color:#C97F1E; border:1px solid rgba(232,163,61,0.3);">
          <strong>Your account is pending verification.</strong> Listings you post won't appear on the public site until an admin confirms your Commercial Registration and food license.
        </div>`;
    }
  }catch(err){
    console.error('[sidebar identity] failed to render:', err);
  }

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
  const listingImageInput = document.getElementById('listingImage');
  const listingImagePreviewRow = document.getElementById('listingImagePreviewRow');
  const listingImageFilename = document.getElementById('listingImageFilename');
  try{
    listingImageInput.addEventListener('change', () => {
      const file = listingImageInput.files[0];
      if(file){
        listingImageFilename.textContent = file.name;
        listingImagePreviewRow.style.display = 'flex';
      } else {
        listingImagePreviewRow.style.display = 'none';
      }
    });

    document.getElementById('clearListingImageBtn').addEventListener('click', () => {
      listingImageInput.value = '';
      listingImagePreviewRow.style.display = 'none';
    });
  }catch(err){
    console.error('[item photo preview] failed to wire up:', err);
  }

  // ---- nav ----
  const navButtons = document.querySelectorAll('.dash-nav button');
  function showView(name){
    document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if(name === 'listings') renderListingsTable();
    if(name === 'overview') Overview.render();
    if(name === 'reservations') renderReservationsTable();
    if(name === 'documents') Documents.render();
    if(name === 'post'){
      const pickupStartInput = document.getElementById('pickupStart');
      if(!pickupStartInput.value){
        pickupStartInput.value = computeDefaultPickupStart();
      }
    }
  }
  try{
    navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
  }catch(err){
    console.error('[nav wiring] failed to wire up:', err);
  }

  // ---- auto-fill pickup start ----
  // If a surplus window is live right now, default to the current time.
  // Otherwise default to the start of the next upcoming window today
  // (e.g. posting at 1pm defaults to 3pm; posting at 5pm — between the
  // lunch and closing windows — defaults to 7pm; posting at 8pm, which
  // is inside the closing window, defaults to the current time, 8pm).
  function computeDefaultPickupStart(){
    const now = new Date();
    const hourNow = now.getHours() + now.getMinutes() / 60;
    const windows = Store.SURPLUS_WINDOWS;

    const liveWindow = windows.find(w => hourNow >= w.startHour && hourNow < w.endHour);
    if(liveWindow){
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    const next = windows.find(w => w.startHour > hourNow) || windows[0];
    const h = Math.floor(next.startHour);
    const m = Math.round((next.startHour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
 
  // ---- listings table ----
  async function renderListingsTable(){
    const body = document.getElementById('listingsTableBody');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    DashboardState.cachedListings = await Store.getListingsByVendor(DashboardState.vendor.id);
    if(DashboardState.cachedListings.length === 0){
      body.innerHTML = `<tr><td colspan="5">No listings yet — post your first item.</td></tr>`;
      return;
    }
    body.innerHTML = DashboardState.cachedListings.map(l => `
      <tr>
        <td data-label="Item"><strong>${l.item_name}</strong></td>
        <td data-label="Price">${Fmt.money(l.discounted_price)} <span style="opacity:.5; text-decoration:line-through;">${Fmt.money(l.original_price)}</span></td>
        <td data-label="Stock">
          <div class="qty-editor">
            <button data-qty-down="${l.id}">−</button>
            <span>${l.quantity_left}</span>
            <button data-qty-up="${l.id}">+</button>
          </div>
        </td>
        <td data-label="Pickup">${Fmt.time(l.pickup_start)}–${Fmt.time(l.pickup_end)}</td>
        <td data-label=""><button class="icon-btn" data-edit="${l.id}">Edit</button></td>
        <td data-label=""><button class="icon-btn" data-remove="${l.id}">Remove</button></td>
      </tr>
    `).join('');
  }

  try{
    document.getElementById('listingsTableBody').addEventListener('click', async (e) => {
      const up = e.target.closest('[data-qty-up]');
      const down = e.target.closest('[data-qty-down]');
      const rm = e.target.closest('[data-remove]');
      const edit = e.target.closest('[data-edit]');
      if(edit){
          const listing =
              DashboardState.cachedListings.find(
                  x => x.id === edit.dataset.edit
              );
          if(!listing) return;
          loadListingIntoForm(listing);
          return;
      } 
      if(up){
        const l = DashboardState.cachedListings.find(x => x.id === up.dataset.qtyUp);
        if(l && l.quantity_left < l.quantity_total){
          await Store.updateListingQty(l.id, l.quantity_left + 1);
          renderListingsTable();
        }
      }
      if(down){
        const l = DashboardState.cachedListings.find(x => x.id === down.dataset.qtyDown);
        if(l && l.quantity_left > 0){
          await Store.updateListingQty(l.id, l.quantity_left - 1);
          renderListingsTable();
        }
      }
      if(rm){
        if(confirm('Remove this listing?')){
          await Store.removeListing(rm.dataset.remove);
          renderListingsTable();
        }
      }
    });
  }catch(err){
    console.error('[listings table] failed to wire up:', err);
  }

  // ---- edit an existing listing ----
  // Called from the listings table's "Edit" button. Was previously
  // referenced but never defined — clicking Edit did nothing.
  function loadListingIntoForm(listing){
    try{
      DashboardState.editingListingId = listing.id;
      DashboardState.editingListingImageUrl = listing.image_url || null;

      document.getElementById('itemName').value = listing.item_name || '';
      document.getElementById('description').value = listing.description || '';
      document.getElementById('postCategory').value = listing.category || '';
      document.getElementById('originalPrice').value = listing.original_price;
      document.getElementById('discountedPrice').value = listing.discounted_price;
      document.getElementById('quantity').value = listing.quantity_total;

      const start = new Date(listing.pickup_start);
      const end = new Date(listing.pickup_end);
      const toHHMM = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      document.getElementById('pickupStart').value = toHHMM(start);
      document.getElementById('pickupEnd').value = toHHMM(end);

      // File inputs can't be pre-filled by script — leave it empty and
      // tell the vendor the existing photo stays unless they pick a new one.
      document.getElementById('listingImage').value = '';
      listingImagePreviewRow.style.display = listing.image_url ? 'flex' : 'none';
      if(listing.image_url) listingImageFilename.textContent = 'Current photo (choose a new file to replace it)';

      document.getElementById('postListingBtn').textContent = 'Update listing';
      showView('post');
    }catch(err){
      console.error('[edit listing] failed to load listing into form:', err);
      alert('Could not load this listing for editing.');
    }
  }

  // ---- post form ----
  document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const originalPrice = Number(document.getElementById('originalPrice').value);
    const discountedPrice = Number(document.getElementById('discountedPrice').value);

    if (discountedPrice >= originalPrice) {
      alert('Discounted price must be lower than the original price.');
      return;
    }

    const pStart = document.getElementById('pickupStart').value;
    const pEnd = document.getElementById('pickupEnd').value;

    const today = new Date();

    function toDate(hhmm,base) {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(today);
      d.setHours(h, m, 0, 0);
      return d;
    }
    const startDate = toDate(pStart, today);
    let endDate = toDate(pEnd, today);
    if(endDate <= startDate){
      endDate.setDate(endDate.getDate() + 1); // pickup window crosses midnight
    }

    const quantity = Number(document.getElementById('quantity').value);
    const imageFile = document.getElementById('listingImage').files[0];

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {

      let imageUrl = null;

      let finalImage = imageFile;
      if (imageFile){
        try {
          const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1200, useWebWorker: true };
          finalImage = await imageCompression(imageFile, options);
          console.log(`Optimized: ${(imageFile.size/1024).toFixed(1)}KB -> ${(finalImage.size/1024).toFixed(1)}KB`);
        } catch (err) {
          console.error("Compression failed, using original", err);
          finalImage = imageFile;
        }
      }

      if (imageFile) {
        imageUrl = await Store.uploadListingImage(DashboardState.vendor.id, imageFile);
      }

      console.log("========== NEW LISTING ==========");
      console.log("Pickup Start:", startDate.toLocaleString('en-US', { timeZone: 'Asia/Qatar' }));
      console.log("Pickup End:  ", endDate.toLocaleString('en-US', { timeZone: 'Asia/Qatar' }));
      console.log("today:", today);
      console.log("pStart:", pStart);
      console.log("pEnd:", pEnd);
      console.log("pickup_start:", startDate.toISOString());
      console.log("pickup_end:", endDate.toISOString());
      console.log("===============================");

      const payload = {
          vendor_id: DashboardState.vendor.id,
          item_name: document.getElementById('itemName').value.trim(),
          description: document.getElementById('description').value.trim(),
          category: document.getElementById('postCategory').value,
          original_price: originalPrice,
          discounted_price: discountedPrice,
          quantity_total: quantity,
          quantity_left: DashboardState.editingListingId ? DashboardState.cachedListings.find(x => x.id === DashboardState.editingListingId).quantity_left : quantity,
          pickup_start: startDate.toISOString(),
          pickup_end: endDate.toISOString(),
          payment_method: 'cash',
          image_url: imageUrl || (DashboardState.editingListingId ? DashboardState.editingListingImageUrl : null),
          status: 'active'
      };

      if (DashboardState.editingListingId) {
          await Store.updateListing(DashboardState.editingListingId, payload);
      } else {
          await Store.createListing(payload);
      }
      DashboardState.editingListingId = null;
      DashboardState.editingListingImageUrl = null;

      document.getElementById('postListingBtn').textContent ='Post listing';
     
      submitBtn.disabled = false;

      const msg = document.getElementById('postMsg');
      msg.textContent = DashboardState.vendor.verification_status === 'verified'
        ? "Listing posted — it's live on the site now."
        : "Listing saved. It will go live once your account is verified.";

      msg.className = 'form-msg success show';

      e.target.reset();
      document.getElementById('listingImage').value = '';
      listingImagePreviewRow.style.display = 'none';

      setTimeout(() => showView('listings'), 900);

    } catch (err) {
      alert('Could not post listing: ' + err.message);
      submitBtn.disabled = false;
    }
  });

  // ---- verify pickup ----
  const verifyInput = document.getElementById('verifyCodeInput');
  const verifyResult = document.getElementById('verifyResult');
  const scanQrBtn = document.getElementById('scanQrBtn');
  const qrScannerOverlay = document.getElementById('qrScannerOverlay');
  const closeQrScanner = document.getElementById('closeQrScanner');

  let qrScanner = null;

  try{
    document.getElementById('verifyBtn').addEventListener('click', async () => {

        const code = verifyInput.value.trim();
        if(!code) return;

        let reservation;

        try{
            reservation = await Store.findReservationByCode(code);
        }catch(err){
            verifyResult.innerHTML =
                `<div class="form-msg error show">
                    Lookup failed: ${err.message}
                </div>`;
            return;
        }

        showReservation(reservation);

    });
  }catch(err){
    console.error('[verify button] failed to wire up:', err);
  }

  async function showReservation(reservation){
      if(!reservation){
          verifyResult.innerHTML =
              `<div class="form-msg error show">
                  No reservation found.
              </div>`;
          return;
      }
      if(reservation.vendor_id !== DashboardState.vendor.id){
          verifyResult.innerHTML =
              `<div class="form-msg error show">
                  That reservation belongs to a different vendor.
              </div>`;
          return;
      }
      if(reservation.status === 'collected'){
          verifyResult.innerHTML =
              `<div class="form-msg success show"
                  style="background:rgba(47,110,103,0.1); color:#204C47;">
                  Already marked collected for
                  <strong>${reservation.customer_name}</strong>
                  — ${reservation.item_name}.
              </div>`;
          return;
      }
      verifyResult.innerHTML = `
        <div class="form-msg success show">
          <strong>${reservation.customer_name}</strong>
          — ${reservation.item_name}${reservation.quantity > 1 ? ` ×${reservation.quantity}` : ''}
          · ${Fmt.money(reservation.price)} cash due

          <div style="margin-top:12px;">
              <button
                  class="btn btn-teal btn-sm"
                  id="markCollectedBtn">
                  Mark as collected
              </button>
          </div>
        </div>
      `;

      document.getElementById('markCollectedBtn').addEventListener('click', async () => {

          await Store.markCollected(reservation.id);

          verifyInput.value = '';

          verifyResult.innerHTML =
              `<div class="form-msg success show">
                  Marked collected.
              </div>`;

          renderOverview();

      });

  }
  
  try{
    verifyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') document.getElementById('verifyBtn').click(); });
    scanQrBtn.addEventListener('click', startQrScanner);
  }catch(err){
    console.error('[verify input / QR scan button] failed to wire up:', err);
  }

  async function startQrScanner(){

        qrScannerOverlay.classList.add('show');

          try {

            const devices = await Html5Qrcode.getCameras();
            

            qrScanner = new Html5Qrcode("qr-reader");

            await qrScanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: 250
                },
                onQrSuccess
            );

        } catch(err) {
            console.error(err);
            alert(err.message);
        }
    }
    async function onQrSuccess(decodedText){

      if(qrScanner){
          await qrScanner.stop();
      }

      qrScannerOverlay.classList.remove("show");

      let reservation;

      try{
          reservation = await Store.getReservation(decodedText.trim());
      }catch(err){
          alert(err.message);
          return;
      }

      showReservation(reservation);

  }

  // ---- reservations table ----
  async function renderReservationsTable(){
    const body = document.getElementById('reservationsTableBody');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    const reservations = await Store.getReservationsByVendor(DashboardState.vendor.id);
    if(reservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
      return;
    }
    body.innerHTML = reservations.map(r => `
      <tr>
        <td data-label="Code"><span class="pickup-code-tag">${r.pickup_code}</span></td>
        <td data-label="Item">${r.item_name}${r.quantity > 1 ? ` ×${r.quantity}` : ''}</td>
        <td data-label="Customer">${r.customer_name}<br><span style="opacity:.55; font-size:.8em;">${r.customer_phone}</span></td>
        <td data-label="Pickup">${Fmt.time(r.pickup_start)}–${Fmt.time(r.pickup_end)}</td>
        <td data-label="Status"><span class="status-pill status-${r.status}">${r.status}</span></td>
      </tr>
    `).join('');
  }

  

  try{
    Overview.render();
  }catch(err){
    console.error('[overview] failed to render:', err);
  }
})();