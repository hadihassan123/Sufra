(() => {
  let activeFilter = 'all';
  let searchQuery = '';
  let pendingListing = null;
  let cachedActiveListings = [];

  const grid = document.getElementById('listingGrid');
  const filterBar = document.getElementById('filterBar');
  const searchInput = document.getElementById('searchInput');

  function money(n){ return 'QAR ' + Number(n).toFixed(0); }
  function pct(oldP, newP){ return Math.round((1 - newP/oldP) * 100); }
  function timeFmt(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }
  function categoryGlyph(category){
    const glyphs = { Bakery: '🥖', 'Café': '☕', Restaurant: '🍽️', Patisserie: '🍰', Grocery: '🧺', Hotel: '🏨' };
    return glyphs[category] || '🍴';
  }

  function matchesSearch(l){
    if(!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const vendorName = l.vendors ? l.vendors.business_name : '';
    return (
      l.item_name.toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      vendorName.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
    );
  }

  // Renders from the already-fetched cache — used for category clicks and
  // search typing, so neither hits the database on every keystroke/click.
  function applyFiltersAndRender(){
    const filtered = cachedActiveListings.filter(l =>
      (activeFilter === 'all' ? true : l.category === activeFilter) && matchesSearch(l)
    );
    renderListingGrid(filtered);
  }

  // Actually fetches from Supabase — used for the initial load and after a
  // real reservation, since stock counts change server-side then.
  async function renderListings(){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Loading…</h3></div>`;
    try{
      cachedActiveListings = await Store.getListings();
    }catch(err){
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Couldn't load listings</h3><p>${err.message}</p></div>`;
      return;
    }
    applyFiltersAndRender();
  }

  function renderListingGrid(filtered){
    if(filtered.length === 0){
      const noun = searchQuery ? 'matches' : 'listings';
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <h3>No ${noun} right now</h3>
        <p>${searchQuery ? 'Try a different search term, or clear it to see everything.' : 'Check back later, or try a different category — vendors post new surplus throughout the day.'}</p>
      </div>`;
      return;
    }

    grid.innerHTML = filtered.map(l => {
      const soldOut = l.status === 'sold_out' || l.quantity_left <= 0;
      const vendorName = l.vendors ? l.vendors.business_name : '';
      const logoUrl = l.vendors ? l.vendors.logo_url : null;
      const isVerified = l.vendors && l.vendors.verification_status === 'verified';
      const discountPct = pct(l.original_price, l.discounted_price);
      return `
      <div class="ticket-card">
        <div class="ticket-photo">
          ${l.image_url
            ? `<img class="ticket-image" src="${l.image_url}" alt="${l.item_name}" loading="lazy" onerror="this.parentElement.classList.add('no-photo'); this.remove();">`
            : ''
          }
          <span class="ticket-photo-fallback" aria-hidden="true">${categoryGlyph(l.category)}</span>
          <span class="discount-tag">${discountPct}% off</span>
        </div>
        <div class="ticket ${soldOut ? 'sold-out' : ''}">
          <div class="ticket-main">
            <div class="ticket-top">
              <span class="ticket-vendor">
                ${logoUrl ? `<img class="ticket-vendor-logo" src="${logoUrl}" alt="">` : ''}
                <span class="ticket-vendor-name">${vendorName}</span>
                ${isVerified ? `<span class="verified-check" title="Verified vendor">✓</span>` : ''}
              </span>
            </div>
            <h3 class="ticket-item">${l.item_name}</h3>
            <p class="ticket-desc">${l.description || ''}</p>
            <div class="ticket-prices">
              <span class="price-old">${money(l.original_price)}</span>
              <span class="price-new">${money(l.discounted_price)}</span>
            </div>
            <div class="ticket-meta">
              <span>📍 <strong>${l.category}</strong></span>
              <span>🕐 Pickup <strong>${timeFmt(l.pickup_start)}–${timeFmt(l.pickup_end)}</strong></span>
            </div>
          </div>
          <div class="ticket-stub">
            <span class="stub-label">Left</span>
            <span class="stub-qty">${l.quantity_left}</span>
            <span class="stub-qty-label">of ${l.quantity_total}</span>
            <button class="btn ${soldOut ? 'btn-ghost' : 'btn-teal'}" ${soldOut ? 'disabled' : ''} data-reserve="${l.id}">
              ${soldOut ? 'Sold out' : 'Reserve'}
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if(!btn) return;
    filterBar.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFiltersAndRender();
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    applyFiltersAndRender();
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reserve]');
    if(!btn) return;
    openReserveModal(btn.dataset.reserve);
  });

  // ---- reserve modal ----
  const reserveOverlay = document.getElementById('reserveOverlay');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const reserveForm = document.getElementById('reserveForm');

  async function openReserveModal(listingId){
    let listing;
    try{
      listing = await Store.getListing(listingId);
    }catch(err){ alert('Could not load that listing: ' + err.message); return; }
    if(!listing) return;
    pendingListing = listing;
    const vendorName = listing.vendors ? listing.vendors.business_name : '';
    document.getElementById('reserveItemName').textContent = listing.item_name;
    document.getElementById('reserveItemMeta').textContent =
      `${vendorName} · ${money(listing.discounted_price)} · Pickup ${timeFmt(listing.pickup_start)}–${timeFmt(listing.pickup_end)}`;
    reserveForm.reset();
    reserveOverlay.classList.add('show');
  }

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!pendingListing) return;
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const submitBtn = reserveForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    let reservation;
    try{
      reservation = await Store.createReservation(pendingListing, name, phone);
    }catch(err){
      alert(err.message && err.message.includes('sold out') ? 'Sorry, this item just sold out.' : ('Could not reserve: ' + err.message));
      submitBtn.disabled = false;
      reserveOverlay.classList.remove('show');
      renderListings();
      return;
    }
    submitBtn.disabled = false;

    reserveOverlay.classList.remove('show');
    document.getElementById('confirmCode').textContent = reservation.pickup_code;
    const vendorName = pendingListing.vendors ? pendingListing.vendors.business_name : '';
    document.getElementById('confirmWindow').textContent =
      `Pickup at ${vendorName}, ${timeFmt(pendingListing.pickup_start)}–${timeFmt(pendingListing.pickup_end)}. Bring this code and pay ${money(pendingListing.discounted_price)} cash.`;
    confirmOverlay.classList.add('show');

    renderListings();
  });

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      reserveOverlay.classList.remove('show');
      confirmOverlay.classList.remove('show');
    });
  });
  [reserveOverlay, confirmOverlay].forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if(e.target === overlay) overlay.classList.remove('show');
    });
  });

  // ---- pickup lookup ----
  const lookupBtn = document.getElementById('lookupBtn');
  const pickupList = document.getElementById('pickupList');

  async function renderPickups(phone){
    pickupList.innerHTML = `<div class="empty-state"><h3>Looking…</h3></div>`;
    let reservations;
    try{
      reservations = await Store.getReservationsByPhone(phone);
    }catch(err){
      pickupList.innerHTML = `<div class="empty-state"><h3>Couldn't look this up</h3><p>${err.message}</p></div>`;
      return;
    }
    if(reservations.length === 0){
      pickupList.innerHTML = `<div class="empty-state"><h3>No pickups found</h3><p>Reservations you make will show up here when you look up the same phone number.</p></div>`;
      return;
    }
    pickupList.innerHTML = reservations.map(r => `
      <div class="pickup-row">
        <div class="pickup-row-info">
          <strong>${r.item_name}</strong>
          <span>${r.vendor_name} · ${timeFmt(r.pickup_start)}–${timeFmt(r.pickup_end)}</span>
        </div>
        <span class="pickup-code-tag">${r.pickup_code}</span>
        <span class="status-pill status-${r.status}">${r.status}</span>
      </div>
    `).join('');
  }

  lookupBtn.addEventListener('click', () => {
    const phone = document.getElementById('lookupPhone').value.trim();
    if(!phone) return;
    renderPickups(phone);
  });
  document.getElementById('lookupPhone').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') lookupBtn.click();
  });

  // ---- time-of-day dial ----
  const dialSvg = document.getElementById('dialSvg');
  const clockText = document.getElementById('clockText');
  const dialStatus = document.getElementById('dialStatus');
  const dialSub = document.getElementById('dialSub');

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
    secLine.setAttribute('x1', cx);
    secLine.setAttribute('y1', cy);
    secLine.setAttribute('x2', secTip.x);
    secLine.setAttribute('y2', secTip.y);
    secLine.setAttribute('stroke', '#ec4e33');
    secLine.setAttribute('stroke-width', '1.5');
    secLine.setAttribute('stroke-linecap', 'round');
    dialSvg.appendChild(secLine);

    clockText.textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

    const hourNow = now.getHours() + now.getMinutes()/60;
    const inWindow = SURPLUS_WINDOWS.find(w => hourNow >= w.startHour && hourNow < w.endHour);
    if(inWindow){
      dialStatus.firstChild.textContent = inWindow.label + ' is live';
      dialSub.textContent = 'Vendors are posting now';
    } else {
      const next = SURPLUS_WINDOWS.find(w => w.startHour > hourNow) || SURPLUS_WINDOWS[0];
      const nextH = Math.floor(next.startHour);
      const nextM = Math.round((next.startHour % 1) * 60);
      const label = new Date().setHours(nextH, nextM, 0, 0);
      dialStatus.firstChild.textContent = 'Next surplus window at ' + new Date(label).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
      dialSub.textContent = 'Browse today\'s listings below';
    }
  }

  // ---- vendor nav state ----
  // Waits for the auth event rather than a one-off getSession() call — on a
  // fresh full page load (this site reloads the whole page on every
  // navigation, it's not a single-page app), getSession() can occasionally
  // be called before the client has finished reading/validating the stored
  // session, which is why the login link wasn't reliably hiding.
  function waitForSession(){
    return new Promise((resolve) => {
      const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
        subscription.unsubscribe();
        resolve(session);
      });
    });
  }

  (async () => {
    const session = await waitForSession();
    if(session){
      const link = document.getElementById('vendorNavLink');
      link.href = 'vendor-dashboard.html';
      link.textContent = 'Vendor dashboard';

      const loginLink = document.getElementById('vendorLoginNavLink');
      if(loginLink) loginLink.style.display = 'none';

      const heroLink = document.getElementById('heroVendorLink');
      if(heroLink) heroLink.style.display = 'none';
    }
  })();

  buildDial();
  updateHands();
  setInterval(updateHands, 1000);

  renderListings();
})();