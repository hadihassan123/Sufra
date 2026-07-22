(async () => {
  const session = await Store.getSession();
  if(!session){ window.location.href = 'vendor-login.html'; return; }

  // ---- Doha time dial ----
  (function(){
    const dialSvg = document.getElementById('vendorDialSvg');
    const clockText = document.getElementById('vendorClockText');
    const dialStatus = document.getElementById('vendorDialStatus');
    const dialSub = document.getElementById('vendorDialSub');
    if(!dialSvg) return;

    const SURPLUS_WINDOWS = Store.SURPLUS_WINDOWS;

    function angleForHour(h){ return (h / 12) * 360; }
    function polar(cx, cy, r, angleDeg){
      const a = (angleDeg - 90) * Math.PI / 180;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
    function arcPath(cx, cy, r, startAngle, endAngle){
      const s = polar(cx, cy, r, startAngle);
      const e = polar(cx, cy, r, endAngle);
      const largeArc = (endAngle - startAngle) % 360 > 180 ? 1 : 0;
      return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
    }

    function buildDial(){
      const cx = 120, cy = 120, r = 96;
      let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(246,241,227,0.18)" stroke-width="1.5"/>`;
      for(let i=0;i<12;i++){
        const ang = i * 30;
        const p1 = polar(cx, cy, r, ang);
        const p2 = polar(cx, cy, r - (i%3===0?10:5), ang);
        svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="rgba(246,241,227,0.35)" stroke-width="${i%3===0?2:1}"/>`;
      }
      SURPLUS_WINDOWS.forEach(w => {
        const startH = w.startHour % 12;
        const endH = w.endHour % 12;
        svg += `<path d="${arcPath(cx, cy, r, angleForHour(startH), angleForHour(endH))}"
          fill="none" stroke="#2F6E67" stroke-width="6" stroke-linecap="round" opacity="0.85"/>`;
      });
      svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#E8A33D"/>`;
      dialSvg.setAttribute('viewBox', '0 0 240 240');
      dialSvg.innerHTML = svg;
    }

    function updateHands(){
      const now = new Date();
      const h12 = now.getHours() % 12 + now.getMinutes()/60;
      const m = now.getMinutes() + now.getSeconds()/60;
      const cx = 120, cy = 120;

      const hourTip = polar(cx, cy, 52, angleForHour(h12));
      const minTip = polar(cx, cy, 76, (m/60) * 360);
      const secTip = polar(cx, cy, 84, (now.getSeconds()/60) * 360);

      dialSvg.querySelectorAll('.hand').forEach(el => el.remove());

      const hourLine = document.createElementNS('http://www.w3.org/2000/svg','line');
      hourLine.setAttribute('class','hand');
      hourLine.setAttribute('x1', cx); hourLine.setAttribute('y1', cy);
      hourLine.setAttribute('x2', hourTip.x); hourLine.setAttribute('y2', hourTip.y);
      hourLine.setAttribute('stroke', '#F6F1E3'); hourLine.setAttribute('stroke-width', '4'); hourLine.setAttribute('stroke-linecap','round');
      dialSvg.appendChild(hourLine);

      const minLine = document.createElementNS('http://www.w3.org/2000/svg','line');
      minLine.setAttribute('class','hand');
      minLine.setAttribute('x1', cx); minLine.setAttribute('y1', cy);
      minLine.setAttribute('x2', minTip.x); minLine.setAttribute('y2', minTip.y);
      minLine.setAttribute('stroke', '#E8A33D'); minLine.setAttribute('stroke-width', '2.5'); minLine.setAttribute('stroke-linecap','round');
      dialSvg.appendChild(minLine);

      const secLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      secLine.setAttribute('class', 'hand');
      secLine.setAttribute('x1', cx); secLine.setAttribute('y1', cy);
      secLine.setAttribute('x2', secTip.x); secLine.setAttribute('y2', secTip.y);
      secLine.setAttribute('stroke', '#ec4e33'); secLine.setAttribute('stroke-width', '1.5'); secLine.setAttribute('stroke-linecap', 'round');
      dialSvg.appendChild(secLine);

      clockText.textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

      const hourNow = now.getHours() + now.getMinutes()/60;
      const inWindow = SURPLUS_WINDOWS.find(w => hourNow >= w.startHour && hourNow < w.endHour);
      if(inWindow){
        dialStatus.firstChild.textContent = inWindow.label + ' is live';
        dialSub.textContent = 'Good time to post';
      } else {
        const next = SURPLUS_WINDOWS.find(w => w.startHour > hourNow) || SURPLUS_WINDOWS[0];
        const nextH = Math.floor(next.startHour);
        const nextM = Math.round((next.startHour % 1) * 60);
        const label = new Date().setHours(nextH, nextM, 0, 0);
        dialStatus.firstChild.textContent = 'Next window at ' + new Date(label).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        dialSub.textContent = '';
      }
    }

    buildDial();
    updateHands();
    setInterval(updateHands, 1000);
  })();
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
  let currentVendor = vendor; // refreshed after logo/document uploads so status reflects latest values
  let editingListingId = null;
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

  // ---- store logo ----
  function renderLogo(){
    const preview = document.getElementById('logoPreview');
    const statusText = document.getElementById('logoStatusText');
    const btnText = document.getElementById('logoBtnText');
    const removeBtn = document.getElementById('removeLogoBtn');
    if(currentVendor.logo_url){
      preview.src = currentVendor.logo_url;
      preview.style.display = 'block';
      statusText.textContent = 'Shown next to your business name on listings.';
      btnText.textContent = 'Replace';
      removeBtn.style.display = 'inline-flex';
    } else {
      preview.style.display = 'none';
      statusText.textContent = 'Shown next to your business name on listings. Not uploaded yet.';
      btnText.textContent = 'Upload';
      removeBtn.style.display = 'none';
    }
  }
  renderLogo();

  document.getElementById('removeLogoBtn').addEventListener('click', async () => {
    if(!confirm('Remove your store logo?')) return;
    const removeBtn = document.getElementById('removeLogoBtn');
    removeBtn.disabled = true;
    try{
      await Store.removeVendorLogo(vendor.id);
      currentVendor = await Store.getVendorProfile(vendor.id);
      renderLogo();
    }catch(err){
      alert('Could not remove logo: ' + err.message);
    }
    removeBtn.disabled = false;
  });

  document.getElementById('logoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 2 * 1024 * 1024){
      alert('That file is over 2MB — please upload a smaller image.');
      return;
    }
    const btnText = document.getElementById('logoBtnText');
    const original = btnText.textContent;
    btnText.textContent = 'Uploading…';
    try{
      await Store.uploadVendorLogo(vendor.id, file);
      currentVendor = await Store.getVendorProfile(vendor.id);
      renderLogo();
    }catch(err){
      alert('Logo upload failed: ' + err.message);
      btnText.textContent = original;
    }
  });

  // ---- item photo preview + clear ----
  const listingImageInput = document.getElementById('listingImage');
  const listingImagePreviewRow = document.getElementById('listingImagePreviewRow');
  const listingImageFilename = document.getElementById('listingImageFilename');

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

  // ---- nav ----
  const navButtons = document.querySelectorAll('.dash-nav button');
  function showView(name){
    document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if(name === 'listings') renderListingsTable();
    if(name === 'overview') renderOverview();
    if(name === 'reservations') renderReservationsTable();
    if(name === 'documents') renderDocuments();
    if(name === 'post'){
      const pickupStartInput = document.getElementById('pickupStart');
      if(!pickupStartInput.value){
        pickupStartInput.value = computeDefaultPickupStart();
      }
    }
  }
  navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));

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

  // ---- overview ----
 async function renderOverview() {
    const [listings, reservations] = await Promise.all([
        Store.getListingsByVendor(vendor.id),
        Store.getReservationsByVendor(vendor.id)
    ]);

    console.log("========== NEW LISTING ==========");
    console.log("Current time:", new Date().toString());
    console.log("Current ISO:", new Date().toISOString());
    console.log("today:", today);
    console.log("pStart:", pStart);
    console.log("pEnd:", pEnd);
    console.log("pickup_start:", toISO(pStart));
    console.log("pickup_end:", toISO(pEnd));
    console.log("===============================");
    console.log(listings.map(l => ({
        item: l.item_name,
        pickup_end: l.pickup_end,
        quantity_left: l.quantity_left
    })));

    const now = new Date();

    const activeListings = listings.filter(
        l => new Date(l.pickup_end) >= now
    );

    const expiredListings = listings.filter(
        l => new Date(l.pickup_end) < now
    );
    const soldOutListings = listings.filter(l =>
        new Date(l.pickup_end) >= now &&
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
        <td data-label="Item"><strong>${l.item_name}</strong></td>
        <td data-label="Price">${money(l.discounted_price)} <span style="opacity:.5; text-decoration:line-through;">${money(l.original_price)}</span></td>
        <td data-label="Stock">
          <div class="qty-editor">
            <button data-qty-down="${l.id}">−</button>
            <span>${l.quantity_left}</span>
            <button data-qty-up="${l.id}">+</button>
          </div>
        </td>
        <td data-label="Pickup">${timeFmt(l.pickup_start)}–${timeFmt(l.pickup_end)}</td>
        <td data-label=""><button class="icon-btn" data-edit="${l.id}">Edit</button></td>
        <td data-label=""><button class="icon-btn" data-remove="${l.id}">Remove</button></td>
      </tr>
    `).join('');
  }

  document.getElementById('listingsTableBody').addEventListener('click', async (e) => {
    const up = e.target.closest('[data-qty-up]');
    const down = e.target.closest('[data-qty-down]');
    const rm = e.target.closest('[data-remove]');
    const edit = e.target.closest('[data-edit]');
    if(edit){
        const listing =
            cachedListings.find(
                x => x.id === edit.dataset.edit
            );
        if(!listing) return;
        loadListingIntoForm(listing);
        return;
    } 
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

    if (discountedPrice >= originalPrice) {
      alert('Discounted price must be lower than the original price.');
      return;
    }

    const pStart = document.getElementById('pickupStart').value;
    const pEnd = document.getElementById('pickupEnd').value;

    const today = new Date();

    function toISO(hhmm){ 
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

      if (imageFile) {
        imageUrl = await Store.uploadListingImage(vendor.id, imageFile);
      }

    

      const payload = {
          vendor_id: vendor.id,
          item_name: document.getElementById('itemName').value.trim(),
          description: document.getElementById('description').value.trim(),
          category: document.getElementById('postCategory').value,
          original_price: originalPrice,
          discounted_price: discountedPrice,
          quantity_total: quantity,
          quantity_left: editingListingId ? cachedListings.find(x => x.id === editingListingId).quantity_left : quantity,
          pickup_start: toISO(pStart),
          pickup_end: toISO(pEnd),
          payment_method: 'cash',
          image_url: imageUrl,
          status: 'active'
      };

      if (editingListingId) {
          await Store.updateListing(editingListingId, payload);
      } else {
          await Store.createListing(payload);
      }
      editingListingId = null;

      document.getElementById('postListingBtn').textContent ='Post listing';
     
      submitBtn.disabled = false;

      const msg = document.getElementById('postMsg');
      msg.textContent = vendor.verification_status === 'verified'
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

  async function showReservation(reservation){
      if(!reservation){
          verifyResult.innerHTML =
              `<div class="form-msg error show">
                  No reservation found.
              </div>`;
          return;
      }
      if(reservation.vendor_id !== vendor.id){
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
          · ${money(reservation.price)} cash due

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
  
  verifyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') document.getElementById('verifyBtn').click(); });
  scanQrBtn.addEventListener('click', startQrScanner);

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
    const reservations = await Store.getReservationsByVendor(vendor.id);
    if(reservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
      return;
    }
    body.innerHTML = reservations.map(r => `
      <tr>
        <td data-label="Code"><span class="pickup-code-tag">${r.pickup_code}</span></td>
        <td data-label="Item">${r.item_name}${r.quantity > 1 ? ` ×${r.quantity}` : ''}</td>
        <td data-label="Customer">${r.customer_name}<br><span style="opacity:.55; font-size:.8em;">${r.customer_phone}</span></td>
        <td data-label="Pickup">${timeFmt(r.pickup_start)}–${timeFmt(r.pickup_end)}</td>
        <td data-label="Status"><span class="status-pill status-${r.status}">${r.status}</span></td>
      </tr>
    `).join('');
  }

  // ---- verification documents ----
  const DOC_TYPES = [
    { key: 'cr', label: 'Commercial Registration', column: 'cr_document_path' },
    { key: 'moph', label: 'MOPH Food License', column: 'moph_document_path' },
    { key: 'municipality', label: 'Municipality Trade License', column: 'municipality_document_path' }
  ];

  async function renderDocuments(){
    const list = document.getElementById('documentsList');
    list.innerHTML = DOC_TYPES.map(doc => {
      const path = currentVendor[doc.column];
      const uploaded = !!path;
      return `
        <div class="doc-card" data-doc="${doc.key}">
          <div class="doc-info">
            <h3>${doc.label}</h3>
            <p>${uploaded ? 'Uploaded — pending admin review' : 'Not uploaded yet'}</p>
          </div>
          <div class="doc-actions">
            <span class="doc-status-pill ${uploaded ? 'doc-status-uploaded' : 'doc-status-missing'}">${uploaded ? 'Uploaded' : 'Missing'}</span>
            ${uploaded ? `<button class="btn btn-ghost btn-sm" data-view-doc="${doc.key}">View</button>` : ''}
            <label class="btn btn-teal btn-sm" style="margin:0;">
              ${uploaded ? 'Replace' : 'Upload'}
              <input type="file" accept="application/pdf,image/jpeg,image/png" data-upload-doc="${doc.key}">
            </label>
          </div>
        </div>`;
    }).join('');
  }

  document.getElementById('documentsList').addEventListener('change', async (e) => {
    const input = e.target.closest('[data-upload-doc]');
    if(!input || !input.files[0]) return;
    const docType = input.dataset.uploadDoc;
    const file = input.files[0];

    if(file.size > 10 * 1024 * 1024){
      alert('That file is over 10MB — please upload a smaller file.');
      return;
    }

    const card = input.closest('.doc-card');
    const label = card.querySelector('label.btn');
    const originalText = label.firstChild.textContent;
    label.firstChild.textContent = 'Uploading…';

    try{
      await Store.uploadVendorDocument(vendor.id, docType, file);
      currentVendor = await Store.getVendorProfile(vendor.id);
      renderDocuments();
    }catch(err){
      alert('Upload failed: ' + err.message);
      label.firstChild.textContent = originalText;
    }
  });

  document.getElementById('documentsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-view-doc]');
    if(!btn) return;
    const doc = DOC_TYPES.find(d => d.key === btn.dataset.viewDoc);
    const path = currentVendor[doc.column];
    if(!path) return;
    btn.disabled = true;
    try{
      const url = await Store.getVendorDocumentUrl(path);
      window.open(url, '_blank');
    }catch(err){
      alert('Could not open document: ' + err.message);
    }
    btn.disabled = false;
  });

  renderOverview();
})();