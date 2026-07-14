(() => {
  const session = Store.getSession();
  if(!session || !Store.getVendor(session.vendorId)){
    window.location.href = 'vendor-login.html';
    return;
  }
  const vendor = Store.getVendor(session.vendorId);

  function money(n){ return 'QAR ' + Number(n).toFixed(0); }
  function timeFmt(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  // ---- sidebar identity ----
  document.getElementById('sideVendorName').textContent = vendor.businessName;
  const statusEl = document.getElementById('sideVendorStatus');
  statusEl.textContent = vendor.verificationStatus === 'verified' ? 'Verified vendor' : 'Pending verification';

  if(vendor.verificationStatus !== 'verified'){
    document.getElementById('verifyBadgeNotice').innerHTML = `
      <div class="form-msg show" style="background:rgba(232,163,61,0.12); color:#C97F1E; border:1px solid rgba(232,163,61,0.3);">
        <strong>Your account is pending verification.</strong> Listings you post won't appear on the public site until an admin confirms your Commercial Registration and food license. This check is manual for now — reach out to the Sufra team to speed it up.
      </div>`;
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    Store.clearSession();
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
  function renderOverview(){
    const listings = Store.getListingsByVendor(vendor.id);
    const reservations = Store.getReservationsByVendor(vendor.id);
    document.getElementById('statActive').textContent = listings.filter(l => l.status === 'active').length;
    document.getElementById('statReserved').textContent = reservations.filter(r => r.status === 'reserved').length;
    document.getElementById('statCollected').textContent = reservations.filter(r => r.status === 'collected').length;
  }

  // ---- listings table ----
  function renderListingsTable(){
    const listings = Store.getListingsByVendor(vendor.id);
    const body = document.getElementById('listingsTableBody');
    if(listings.length === 0){
      body.innerHTML = `<tr><td colspan="5">No listings yet — post your first item.</td></tr>`;
      return;
    }
    body.innerHTML = listings.map(l => `
      <tr>
        <td><strong>${l.itemName}</strong></td>
        <td>${money(l.discountedPrice)} <span style="opacity:.5; text-decoration:line-through;">${money(l.originalPrice)}</span></td>
        <td>
          <div class="qty-editor">
            <button data-qty-down="${l.id}">−</button>
            <span>${l.quantityLeft}</span>
            <button data-qty-up="${l.id}">+</button>
          </div>
        </td>
        <td>${timeFmt(l.pickupStart)}–${timeFmt(l.pickupEnd)}</td>
        <td><button class="icon-btn" data-remove="${l.id}">Remove</button></td>
      </tr>
    `).join('');
  }

  document.getElementById('listingsTableBody').addEventListener('click', (e) => {
    const up = e.target.closest('[data-qty-up]');
    const down = e.target.closest('[data-qty-down]');
    const rm = e.target.closest('[data-remove]');
    if(up){ Store.updateListingQty(up.dataset.qtyUp, 1); renderListingsTable(); }
    if(down){ Store.updateListingQty(down.dataset.qtyDown, -1); renderListingsTable(); }
    if(rm){
      if(confirm('Remove this listing?')){ Store.removeListing(rm.dataset.remove); renderListingsTable(); }
    }
  });

  // ---- post form ----
  document.getElementById('postForm').addEventListener('submit', (e) => {
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

    Store.createListing({
      vendorId: vendor.id,
      vendorName: vendor.businessName,
      itemName: document.getElementById('itemName').value.trim(),
      description: document.getElementById('description').value.trim(),
      category: document.getElementById('postCategory').value,
      originalPrice, discountedPrice,
      quantity: document.getElementById('quantity').value,
      pickupStart: toISO(pStart),
      pickupEnd: toISO(pEnd)
    });

    const msg = document.getElementById('postMsg');
    msg.textContent = vendor.verificationStatus === 'verified'
      ? 'Listing posted — it\'s live on the site now.'
      : 'Listing saved. It will go live once your account is verified.';
    msg.className = 'form-msg success show';
    e.target.reset();
    setTimeout(() => showView('listings'), 900);
  });

  // ---- verify pickup ----
  const verifyInput = document.getElementById('verifyCodeInput');
  const verifyResult = document.getElementById('verifyResult');

  document.getElementById('verifyBtn').addEventListener('click', () => {
    const code = verifyInput.value.trim();
    if(!code) return;
    const reservation = Store.findReservationByCode(code);

    if(!reservation){
      verifyResult.innerHTML = `<div class="form-msg error show">No reservation found with that code.</div>`;
      return;
    }
    const listing = Store.getListing(reservation.listingId);
    if(!listing || listing.vendorId !== vendor.id){
      verifyResult.innerHTML = `<div class="form-msg error show">That code belongs to a different vendor.</div>`;
      return;
    }
    if(reservation.status === 'collected'){
      verifyResult.innerHTML = `<div class="form-msg show" style="background:rgba(47,110,103,0.1); color:#204C47;">Already marked collected for <strong>${reservation.customerName}</strong> — ${reservation.itemName}.</div>`;
      return;
    }
    verifyResult.innerHTML = `
      <div class="form-msg success show">
        <strong>${reservation.customerName}</strong> — ${reservation.itemName} · ${money(reservation.price)} cash due
        <div style="margin-top:12px;"><button class="btn btn-teal btn-sm" id="markCollectedBtn">Mark as collected</button></div>
      </div>`;
    document.getElementById('markCollectedBtn').addEventListener('click', () => {
      Store.markCollected(reservation.id);
      verifyInput.value = '';
      verifyResult.innerHTML = `<div class="form-msg success show">Marked collected. Enjoy the rest of service.</div>`;
      renderOverview();
    });
  });
  verifyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') document.getElementById('verifyBtn').click(); });

  // ---- reservations table ----
  function renderReservationsTable(){
    const reservations = Store.getReservationsByVendor(vendor.id)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const body = document.getElementById('reservationsTableBody');
    if(reservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
      return;
    }
    body.innerHTML = reservations.map(r => `
      <tr>
        <td><span class="pickup-code-tag">${r.pickupCode}</span></td>
        <td>${r.itemName}</td>
        <td>${r.customerName}<br><span style="opacity:.55; font-size:.8em;">${r.customerPhone}</span></td>
        <td>${timeFmt(r.pickupStart)}–${timeFmt(r.pickupEnd)}</td>
        <td><span class="status-pill status-${r.status}">${r.status}</span></td>
      </tr>
    `).join('');
  }

  renderOverview();
})();
