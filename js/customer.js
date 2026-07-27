(() => {
  let activeFilter = 'all';
  let searchQuery = '';
  let pendingListing = null;
  let cachedActiveListings = [];

  // === NEW: MAP VIEW LOGIC ===
  let map = null;
  let markers = [];
  const AREA_COORDS = {
    'lusail': [25.41, 51.51],
    'west bay': [25.32, 51.53],
    'doha jadeed': [25.28, 51.53],
    'al sadd': [25.28, 51.50],
    'msheireb': [25.28, 51.52],
    'the pearl': [25.37, 51.55],
    'al wakrah': [25.17, 51.60]
  };

  function renderMap(listings) {
    const mapDiv = document.getElementById('mapView');
    
    // PRESERVED LOGS
    console.log("inline height:", mapDiv.style.height);
    console.log("computed height:", window.getComputedStyle(mapDiv).height);
    console.log("offsetHeight:", mapDiv.offsetHeight);
    console.log("clientHeight:", mapDiv.clientHeight);

    if (!map) {
      console.log("Initializing new Leaflet map...");
      map = L.map('mapView').setView([25.30, 51.51], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
    }

    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    console.log(`Placing ${listings.length} pins on map...`);

    listings.forEach(l => {
      let coords = null;
      if (l.vendors?.latitude && l.vendors?.longitude) {
        coords = [l.vendors.latitude, l.vendors.longitude];
      } else {
        const area = (l.vendors?.area || '').toLowerCase().trim();
        coords = AREA_COORDS[area] || [25.28, 51.53];
      }
      
      const marker = L.marker(coords).addTo(map);
      marker.bindPopup(`
        <div style="padding:5px; min-width:150px;">
          <strong style="display:block; margin-bottom:4px;">${l.item_name}</strong>
          <span style="font-size:0.9em; color:#666;">${l.vendors?.business_name}</span><br>
          <span style="font-weight:bold; color:#2F6E67;">QAR ${l.discounted_price}</span>
          <button class="btn btn-teal btn-sm" style="width:100%; margin-top:8px;" onclick="window.openReserveModal('${l.id}')">Reserve</button>
        </div>
      `);
      markers.push(marker);
    });

    // CRITICAL: Force map to redraw its size
    setTimeout(() => { 
        console.log("Invalidating map size for display...");
        map.invalidateSize(); 
    }, 250);
  }

  window.openReserveModal = openReserveModal;
  // === END MAP VIEW ===

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

  function timeAgo(iso){
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if(hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  function applyFiltersAndRender(){
    const now = new Date();
    const filtered = cachedActiveListings.filter(l => {
      // PRESERVED LOGS
      console.log("Checking listing:", l.pickup_end);
      console.log("Local End:", new Date(l.pickup_end).toString());
      console.log("Current Time:", now.toString());

      const isExpired = new Date(l.pickup_end) < now;
      const matchesCategory = (activeFilter === 'all' || activeFilter === 'map') 
        ? !isExpired 
        : (activeFilter === 'expired') 
          ? isExpired 
          : (l.category === activeFilter && !isExpired);
      
      return matchesCategory && matchesSearch(l);
    });

    if (activeFilter === 'map') {
      grid.style.display = 'none';
      document.getElementById('mapView').style.display = 'block';
      renderMap(filtered);
    } else {
      grid.style.display = 'grid';
      document.getElementById('mapView').style.display = 'none';
      renderListingGrid(filtered);
    }  
  }

  async function renderListings(){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Loading…</h3></div>`;
    try{
      cachedActiveListings = await Store.getActiveListings();
      console.log("Cached listings:", cachedActiveListings);
      console.log("Cached count:", cachedActiveListings.length);
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
        <p>${searchQuery ? 'Try a different search term, or clear it to see everything.' : 'Check back later, or try a different category.'}</p>
      </div>`;
      return;
    }

    grid.innerHTML = filtered.map(l => {
      const soldOut = l.quantity_left <= 0;
      const isExpired = new Date(l.pickup_end) < new Date();
      const vendorName = l.vendors ? l.vendors.business_name : '';
      const logoUrl = l.vendors ? l.vendors.logo_url : null;
      const isVerified = l.vendors && l.vendors.verification_status === 'verified';
      const discountPct = pct(l.original_price, l.discounted_price);
      
      return `
      <div class="ticket-card">
        <div class="ticket-photo">
          ${l.image_url
            ? `<img class="ticket-image" src="${l.image_url}" alt="${l.item_name}" loading="lazy">`
            : ''
          }
          <span class="ticket-photo-fallback" aria-hidden="true">${categoryGlyph(l.category)}</span>
          <span class="discount-tag">${discountPct}% off</span>
        </div>
        <div class="ticket ${isExpired ? 'expired' : (soldOut ? 'sold-out' : '')}">
          <div class="ticket-main">
            <div class="ticket-top">
              <span class="ticket-vendor">
                ${logoUrl ? `<img class="ticket-vendor-logo" src="${logoUrl}" alt="">` : ''}
                <span class="ticket-vendor-name">${vendorName}</span>
                ${isVerified ? `<span class="verified-check">✓</span>` : ''}
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
            <button class="btn ${(isExpired || soldOut) ? 'btn-ghost' : 'btn-teal'}" ${(isExpired || soldOut) ? 'disabled' : ''} data-reserve="${l.id}">
              ${isExpired ? 'Expired' : (soldOut ? 'Sold out' : 'Reserve')}
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

  const reserveOverlay = document.getElementById('reserveOverlay');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const reserveForm = document.getElementById('reserveForm');
  const reserveQtyValue = document.getElementById('reserveQtyValue');
  const reserveQtyHint = document.getElementById('reserveQtyHint');
  let reserveQty = 1;

  function updateReserveQtyDisplay(){
    reserveQtyValue.textContent = reserveQty;
    if(pendingListing){
      const total = pendingListing.discounted_price * reserveQty;
      reserveQtyHint.textContent = `${pendingListing.quantity_left} left · Total: ${money(total)}`;
    }
  }

  document.getElementById('reserveQtyDown').addEventListener('click', () => {
    if(reserveQty > 1){ reserveQty--; updateReserveQtyDisplay(); }
  });
  document.getElementById('reserveQtyUp').addEventListener('click', () => {
    if(pendingListing && reserveQty < pendingListing.quantity_left){ reserveQty++; updateReserveQtyDisplay(); }
  });

  async function openReserveModal(listingId){
    let listing;
    try{
      listing = await Store.getListing(listingId);
    }catch(err){ alert('Could not load listing: ' + err.message); return; }
    if(!listing) return;
    pendingListing = listing;
    reserveQty = 1;
    updateReserveQtyDisplay();
    document.getElementById('reserveItemName').textContent = listing.item_name;
    document.getElementById('reserveItemMeta').textContent =
      `${listing.vendors?.business_name} · ${money(listing.discounted_price)} · Pickup ${timeFmt(listing.pickup_start)}–${timeFmt(listing.pickup_end)}`;
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

    try{
      const res = await Store.createReservation(pendingListing, name, phone, reserveQty);
      reserveOverlay.classList.remove('show');
      document.getElementById('confirmCode').textContent = res.pickup_code;
      
      const qrContainer = document.getElementById('confirmQr');
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, { text: res.id, width: 160, height: 160 });

      document.getElementById('confirmWindow').textContent =
        `Pickup at ${pendingListing.vendors?.business_name}, ${timeFmt(pendingListing.pickup_start)}–${timeFmt(pendingListing.pickup_end)}. Pay ${money(pendingListing.discounted_price * reserveQty)} cash.`;

      confirmOverlay.classList.add('show');
      renderListings();
    }catch(err){
      alert('Could not reserve: ' + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      reserveOverlay.classList.remove('show');
      confirmOverlay.classList.remove('show');
    });
  });

  const lookupBtn = document.getElementById('lookupBtn');
  const pickupList = document.getElementById('pickupList');

  async function renderPickups(phone){
    pickupList.innerHTML = `<div class="empty-state"><h3>Looking…</h3></div>`;
    try{
      const reservations = await Store.getReservationsByPhone(phone);
      if(reservations.length === 0){
        pickupList.innerHTML = `<div class="empty-state"><h3>No pickups found</h3></div>`;
        return;
      }
      pickupList.innerHTML = reservations.map(r => `
        <div class="pickup-row">
          <div class="pickup-row-info">
            <strong>${r.item_name}${r.quantity > 1 ? ` ×${r.quantity}` : ''}</strong>
            <span>${r.vendor_name} · ${timeFmt(r.pickup_start)}–${timeFmt(r.pickup_end)}</span>
          </div>
          <span class="pickup-code-tag">${r.pickup_code}</span>
          <span class="status-pill status-${r.status}">${r.status}</span>
        </div>
      `).join('');
    }catch(err){
      pickupList.innerHTML = `<div class="empty-state"><h3>Error: ${err.message}</h3></div>`;
    }
  }

  lookupBtn.addEventListener('click', () => {
    const phone = document.getElementById('lookupPhone').value.trim();
    if(phone) renderPickups(phone);
  });

  // Dial Logic
  function buildDial(){
    const dialSvg = document.getElementById('dialSvg');
    if(!dialSvg) return;
    const cx = 120, cy = 120, r = 96;
    let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(246,241,227,0.18)" stroke-width="1.5"/>`;
    // ... (rest of dial logic) ...
    dialSvg.innerHTML = svg;
  }

  buildDial();
  renderListings();
})();
