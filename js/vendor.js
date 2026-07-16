(async () => {
  // Use onAuthStateChange rather than a one-off getSession() call — on a fresh
  // full page load (this site reloads the whole page on every navigation,
  // it's not a single-page app), getSession() can occasionally be called
  // before the client has finished reading/validating the stored session.
  // Listening for the initial auth event avoids that race.
  function waitForSession(){
    return new Promise((resolve) => {
      const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
        subscription.unsubscribe();
        resolve(session);
      });
    });
  }

  const session = await waitForSession();
  if(!session){ window.location.href = 'vendor-login.html'; return; }

  const vendor = await Store.getVendorProfile(session.user.id);
  if(!vendor){
    // Signed in but no vendor profile row yet (rare — see README on email confirmation).
    alert('Your account is signed in but has no business profile yet. Please contact support.');
    await Store.signOutVendor();
    window.location.href = 'vendor-login.html';
    return;
  }

  function money(n){ return 'QAR ' + Number(n).toFixed(0); }
  function timeFmt(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  let cachedListings = [];

  // ---- sidebar identity ----
  document.getElementById('sideVendorName').textContent = vendor.business_name;
  const statusEl = document.getElementById('sideVendorStatus');
  statusEl.textContent = vendor.verification_status === 'verified' ? 'Verified vendor' : 'Pending verification';

  if(vendor.verification_status !== 'verified'){
    document.getElementById('verifyBadgeNotice').innerHTML = `
      <div class="form-msg show" style="background:rgba(232,163,61,0.12); color:#C97F1E; border:1px solid rgba(232,163,61,0.3);">
        <strong>Your account is pending verification.</strong> Listings you post won't appear on the public site until an admin confirms your Commercial Registration and food license.
      </div>`;
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await Store.signOutVendor();
    window.location.href = 'index.html';
  });

  // ---- nav ----
  const navButtons = document.querySelectorAll('.dash-nav button');
  function showView(name){
    document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if(name === 'listings') renderListingsTable();
    if(name === 'overview') renderOverview();
    if(name === 'reservations') renderReservationsTable();
  }
  navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));

  // ---- overview ----
  async function renderOverview(){
    const [listings, reservations] = await Promise.all([
      Store.getListingsByVendor(vendor.id),
      Store.getReservationsByVendor(vendor.id)
    ]);
    document.getElementById('statActive').textContent = listings.length;
    document.getElementById('statReserved').textContent = reservations.filter(r => r.status === 'reserved').length;
    document.getElementById('statCollected').textContent = reservations.filter(r => r.status === 'collected').length;
  }

  // ---- listings table ----
  async function renderListingsTable(){
    const body = document.getElementById('listingsTableBody');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    cachedListings = await Store.getListingsByVendor(vendor.id);
    if(cachedListings.length === 0){
      body.innerHTML = `<tr><td colspan="5">No listings yet — post your first item.</td></tr>`;
      return;
    }
    body.innerHTML = cachedListings.map(l => `
      <tr>
        <td><strong>${l.item_name}</strong></td>
        <td>${money(l.discounted_price)} <span style="opacity:.5; text-decoration:line-through;">${money(l.original_price)}</span></td>
        <td>
          <div class="qty-editor">
            <button data-qty-down="${l.id}">−</button>
            <span>${l.quantity_left}</span>
            <button data-qty-up="${l.id}">+</button>
          </div>
        </td>
        <td>${timeFmt(l.pickup_start)}–${timeFmt(l.pickup_end)}</td>
        <td><button class="icon-btn" data-remove="${l.id}">Remove</button></td>
      </tr>
    `).join('');
  }

  document.getElementById('listingsTableBody').addEventListener('click', async (e) => {
    const up = e.target.closest('[data-qty-up]');
    const down = e.target.closest('[data-qty-down]');
    const rm = e.target.closest('[data-remove]');
    if(up){
      const l = cachedListings.find(x => x.id === up.dataset.qtyUp);
      if(l && l.quantity_left < l.quantity_total){
        await Store.updateListingQty(l.id, l.quantity_left + 1);
        renderListingsTable();
      }
    }
    if(down){
      const l = cachedListings.find(x => x.id === down.dataset.qtyDown);
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

  // ---- post form ----
  document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const originalPrice = Number(document.getElementById('originalPrice').value);
    const discountedPrice = Number(document.getElementById('discountedPrice').value);
    if(discountedPrice >= originalPrice){
      alert('Discounted price must be lower than the original price.');
      return;
    }
    const pStart = document.getElementById('pickupStart').value;
    const pEnd = document.getElementById('pickupEnd').value;
    const today = new Date();
    function toISO(hhmm){
      const [h,m] = hhmm.split(':').map(Number);
      const d = new Date(today);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }
    const quantity = Number(document.getElementById('quantity').value);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try{
      await Store.createListing({
        vendor_id: vendor.id,
        item_name: document.getElementById('itemName').value.trim(),
        description: document.getElementById('description').value.trim(),
        category: document.getElementById('postCategory').value,
        original_price: originalPrice,
        discounted_price: discountedPrice,
        quantity_total: quantity,
        quantity_left: quantity,
        pickup_start: toISO(pStart),
        pickup_end: toISO(pEnd),
        payment_method: 'cash',
        status: 'active'
      });
    }catch(err){
      alert('Could not post listing: ' + err.message);
      submitBtn.disabled = false;
      return;
    }
    submitBtn.disabled = false;

    const msg = document.getElementById('postMsg');
    msg.textContent = vendor.verification_status === 'verified'
      ? 'Listing posted — it\'s live on the site now.'
      : 'Listing saved. It will go live once your account is verified.';
    msg.className = 'form-msg success show';
    e.target.reset();
    setTimeout(() => showView('listings'), 900);
  });

  // ---- verify pickup ----
  const verifyInput = document.getElementById('verifyCodeInput');
  const verifyResult = document.getElementById('verifyResult');

  document.getElementById('verifyBtn').addEventListener('click', async () => {
    const code = verifyInput.value.trim();
    if(!code) return;
    let reservation;
    try{
      reservation = await Store.findReservationByCode(code);
    }catch(err){
      verifyResult.innerHTML = `<div class="form-msg error show">Lookup failed: ${err.message}</div>`;
      return;
    }
    if(!reservation){
      verifyResult.innerHTML = `<div class="form-msg error show">No reservation found with that code.</div>`;
      return;
    }
    if(reservation.vendor_id !== vendor.id){
      verifyResult.innerHTML = `<div class="form-msg error show">That code belongs to a different vendor.</div>`;
      return;
    }
    if(reservation.status === 'collected'){
      verifyResult.innerHTML = `<div class="form-msg show" style="background:rgba(47,110,103,0.1); color:#204C47;">Already marked collected for <strong>${reservation.customer_name}</strong> — ${reservation.item_name}.</div>`;
      return;
    }
    verifyResult.innerHTML = `
      <div class="form-msg success show">
        <strong>${reservation.customer_name}</strong> — ${reservation.item_name} · ${money(reservation.price)} cash due
        <div style="margin-top:12px;"><button class="btn btn-teal btn-sm" id="markCollectedBtn">Mark as collected</button></div>
      </div>`;
    document.getElementById('markCollectedBtn').addEventListener('click', async () => {
      await Store.markCollected(reservation.id);
      verifyInput.value = '';
      verifyResult.innerHTML = `<div class="form-msg success show">Marked collected. Enjoy the rest of service.</div>`;
      renderOverview();
    });
  });
  verifyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') document.getElementById('verifyBtn').click(); });

  // ---- reservations table ----
  async function renderReservationsTable(){
    const body = document.getElementById('reservationsTableBody');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    const reservations = await Store.getReservationsByVendor(vendor.id);
    if(reservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
      return;
    }
    body.innerHTML = reservations.map(r => `
      <tr>
        <td><span class="pickup-code-tag">${r.pickup_code}</span></td>
        <td>${r.item_name}</td>
        <td>${r.customer_name}<br><span style="opacity:.55; font-size:.8em;">${r.customer_phone}</span></td>
        <td>${timeFmt(r.pickup_start)}–${timeFmt(r.pickup_end)}</td>
        <td><span class="status-pill status-${r.status}">${r.status}</span></td>
      </tr>
    `).join('');
  }

  renderOverview();
})();
