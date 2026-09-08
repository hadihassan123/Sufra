import { Store } from './store.js';
import { Fmt, ListingState } from './utils.js';
import { esc, escUrl } from './escape.js';
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
    if (!map) {
      map = L.map('mapView').setView([25.30, 51.51], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
      }).addTo(map);
    }

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const byVendor = new Map();
    listings.forEach(l => {
      const vendorId = l.vendor_id || l.vendors?.id || 'unknown';
      if (!byVendor.has(vendorId)) byVendor.set(vendorId, []);
      byVendor.get(vendorId).push(l);
    });

    byVendor.forEach(vendorListings => {
      const first = vendorListings[0];
      let coords;
      if (first.vendors?.latitude && first.vendors?.longitude) {
        coords = [first.vendors.latitude, first.vendors.longitude];
      } else {
        const area = (first.vendors?.area || '').toLowerCase().trim();
        coords = AREA_COORDS[area] || [25.28, 51.53];
      }

      const businessName = first.vendors?.business_name || 'Vendor';
      const itemsHtml = vendorListings.map(l => {
        const soldOut = ListingState.isSoldOut(l);
        const price = l.discounted_price;
        const btn = soldOut
          ? `<button class="btn btn-ghost btn-sm" style="width:100%; margin-top:6px;" disabled>Sold out</button>`
          : `<button class="btn btn-teal btn-sm" style="width:100%; margin-top:6px;" data-reserve="${esc(l.id)}">Reserve</button>`;
        return `
          <div style="padding:8px 0; border-top:1px solid #eee;">
            <strong style="display:block;">${esc(l.item_name)}</strong>
            <span style="font-weight:bold; color:#2F6E67;">QAR ${esc(price)}</span>
            <span style="font-size:0.85em; color:#666;"> · ${esc(l.quantity_left)} left</span>
            ${btn}
          </div>`;
      }).join('');

      const marker = L.marker(coords).addTo(map);
      marker.bindPopup(`
        <div class="map-popup">
          <div class="map-popup-title">${esc(businessName)}.</div>
          <div class="map-popup-meta">${vendorListings.length} item${vendorListings.length > 1 ? 's' : ''}</div>
          ${itemsHtml}
        </div>
      `, { maxWidth: 300 });
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }

  
  // === END MAP VIEW ===

  const grid = document.getElementById('listingGrid');
  const filterBar = document.getElementById('filterBar');
  const searchInput = document.getElementById('searchInput');

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
      console.log("Checking listing:", l.pickup_end);
      console.log("Local End:", new Date(l.pickup_end).toString());
      console.log("Current Time:", now.toString());

      const isExpired = ListingState.isExpired(l);
      const soldOut = ListingState.isSoldOut(l);

      const matchesCategory = 
        (activeFilter === 'all' || activeFilter === 'map') ? (!isExpired && !soldOut) :
        (activeFilter === 'expired') ? (isExpired && !soldOut) :
        (activeFilter === 'sold_out') ? soldOut :
        (l.category === activeFilter && !isExpired && !soldOut);  
      
      return matchesCategory && matchesSearch(l);
    });

    if (activeFilter === 'map') {
      grid.style.display = 'none';
      document.getElementById('mapView').style.display = 'block';
      setTimeout(() => {
          renderMap(filtered);
      },200); 
    } else {
      grid.style.display = 'grid';
      document.getElementById('mapView')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-reserve]');
        if(btn) openReserveModal(btn.dataset.reserve);
      });
      document.getElementById('mapView').style.display = 'none';
      renderListingGrid(filtered);
    }  
  }

  const DEFAULT_LAT = 25.2854;
  const DEFAULT_LNG = 51.5310;

  async function fetchListingsByLocation(lat, lng, radiusMeters = 500000) {
    return await Store.getListings(lat, lng, radiusMeters);
  }

  async function renderListings() {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Loading nearby listings…</h3></div>`;
    
    try {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              cachedActiveListings = await fetchListingsByLocation(pos.coords.latitude, pos.coords.longitude);
              applyFiltersAndRender();
            } catch (err) {
              fallbackToDefaultCoords(err);
            }
          },
          (err) => {
            fallbackToDefaultCoords(err);
          },
          { timeout: 5000 }
        );
      } else {
        await fallbackToDefaultCoords(null);
      }
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Couldn't load listings</h3><p>${err.message}</p></div>`;
    }
  }

  async function fallbackToDefaultCoords(geoError) {
    if (geoError) console.warn('Geolocation unavailable/denied, defaulting to central Doha:', geoError);
    try {
      cachedActiveListings = await fetchListingsByLocation(DEFAULT_LAT, DEFAULT_LNG);
      applyFiltersAndRender();
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Couldn't load listings</h3><p>${err.message}</p></div>`;
    }
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
      const soldOut = ListingState.isSoldOut(l);
      const isExpired = ListingState.isExpired(l);
      console.log("DEBUG CHECK:", { 
        id: l.id, 
        item_name: l.item_name, 
        image_url: l.image_url, 
        type: typeof l.image_url,
        truthy: Boolean(l.image_url) 
      });
      const vendorName = l.vendors ? l.vendors.business_name : '';
      const vendorAddress = l.vendors ? l.vendors.address : '';
      const vendorLat = l.vendors ? l.vendors.latitude : null;
      const vendorLng = l.vendors ? l.vendors.longitude : null;
      const logoUrl = l.vendors ? l.vendors.logo_url : null;
      const isVerified = l.vendors && l.vendors.verification_status === 'verified';
      const discountPct = Fmt.pct(l.original_price, l.discounted_price);
      const mapsUrl = (vendorLat && vendorLng)
        ? `https://www.google.com/maps/search/?api=1&query=${vendorLat},${vendorLng}`
        : (vendorAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(vendorAddress)}` : null);
      
      return `

      <div class="ticket-card">
        <div class="ticket-photo">
          ${l.image_url
            ? `<img class="ticket-image" src="${escUrl(l.image_url)}" alt="${esc(l.item_name)}" loading="lazy" decoding="async">`
            : ''
          }
          <span class="ticket-photo-fallback" aria-hidden="true">${Fmt.categoryGlyph(l.category)}</span>
          <span class="discount-tag">${esc(discountPct)}% off</span>
          
        </div>
        <div class="ticket ${soldOut ? 'sold-out' : (isExpired ? 'expired' : '')}">
          <div class="ticket-main">
            <div class="ticket-top">
              <span class="ticket-vendor">
                ${logoUrl ? `<img class="ticket-vendor-logo" src="${escUrl(logoUrl)}" alt="${esc(vendorName)} logo" loading="lazy" decoding="async">` : ''}
                <span class="ticket-vendor-name">${esc(vendorName)}</span>
                ${isVerified ? `<span class="verified-check">✓</span>` : ''}
              </span>
              ${vendorAddress ? (mapsUrl
                ? `<a class="ticket-vendor-address" href="${escUrl(mapsUrl)}" target="_blank" rel="noopener">📍 ${esc(vendorAddress)}</a>`
                : `<span class="ticket-vendor-address">📍 ${esc(vendorAddress)}</span>`
              ) : ''}
            </div>
            <h3 class="ticket-item">${esc(l.item_name)}</h3>
            <p class="ticket-desc">${esc(l.description || '')}</p>
            <div class="ticket-prices">
              <span class="price-old">${Fmt.money(l.original_price)}</span>
              <span class="price-new">${Fmt.money(l.discounted_price)}</span>
            </div>
            <div class="ticket-meta">
              <span>📍 <strong>${esc(l.category)}</strong></span>
              <span>🕐 Pickup <strong>${Fmt.time(l.pickup_start)}–${Fmt.time(l.pickup_end)}</strong></span>
              <span class="ticket-posted">Posted ${timeAgo(l.created_at)}</span>
            </div>
          </div>
          <div class="ticket-stub">
            <button class="btn ${(soldOut || isExpired) ? 'btn-ghost' : 'btn-teal'}" ${(soldOut || isExpired) ? 'disabled' : ''} data-reserve="${esc(l.id)}">
              ${soldOut ? 'Sold out' : (isExpired ? 'Expired' : 'Reserve')}
            </button>

            <div class="stock-info">
              <span>${esc(l.quantity_left)}/${esc(l.quantity_total)}</span>
              <span></span>
              <small>available</small>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if(!btn) return;
    filterBar.querySelectorAll('.filter-chip').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
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
      const currentLeft = Math.max(0, pendingListing.quantity_left - reserveQty);
      const totalStock = pendingListing.quantity_available || pendingListing.quantity_total;
      
      reserveQtyHint.textContent = `${currentLeft} / ${totalStock} left · Total: ${Fmt.money(total)}`;
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
      `${listing.vendors?.business_name} · ${Fmt.money(listing.discounted_price)} · Pickup ${Fmt.time(listing.pickup_start)}–${Fmt.time(listing.pickup_end)}`;
    reserveForm.reset();
    reserveOverlay.classList.add('show');
  }

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!pendingListing) return;
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    if(!Fmt.normalizeQatarPhone(phone)){
      alert('Please enter a valid Qatar mobile number (8 digits, starting with 3, 5, 6, or 7).');
      return;
    }
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
        `Pickup at ${pendingListing.vendors?.business_name}, ${Fmt.time(pendingListing.pickup_start)}–${Fmt.time(pendingListing.pickup_end)}. Pay ${Fmt.money(pendingListing.discounted_price * reserveQty)} cash.`;

      confirmOverlay.classList.add('show');

      const localItem = cachedActiveListings.find(l => l.id === pendingListing.id);
      if (localItem) {
        localItem.quantity_left = Math.max(0, localItem.quantity_left - reserveQty);
      }
      applyFiltersAndRender();
      
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
            <strong>${esc(r.item_name)}${esc(r.quantity) > 1 ? ` ×${esc(r.quantity)}` : ''}</strong>
            <span>${esc(r.vendor_name)} · ${Fmt.time(r.pickup_start)}–${Fmt.time(r.pickup_end)}</span>
          </div>

          <span class="pickup-code-tag">${esc(r.pickup_code)}</span>

          <span class="status-pill status-${esc(r.status)}">${esc(r.status)}</span>

          <button
            type="button"
            class="btn btn-ghost btn-sm pickup-show-qr"
            data-reservation-id="${esc(r.id)}"
            data-pickup-code="${esc(r.pickup_code)}"
            data-pickup-start="${esc(r.pickup_start)}"
            data-pickup-end="${esc(r.pickup_end)}">
            Show QR
          </button>
        </div>
      `).join('');

      pickupList.querySelectorAll('.pickup-show-qr').forEach(button => {
        button.addEventListener('click', () => {
          const reservationId = button.dataset.reservationId;
          const pickupCode = button.dataset.pickupCode;
          const pickupStart = button.dataset.pickupStart;
          const pickupEnd = button.dataset.pickupEnd;

          const confirmQr = document.getElementById('confirmQr');
          const confirmCode = document.getElementById('confirmCode');
          const confirmWindow = document.getElementById('confirmWindow');
          const confirmOverlay = document.getElementById('confirmOverlay');

          confirmQr.innerHTML = '';

          new QRCode(confirmQr, {
            text: reservationId,
            width: 160,
            height: 160
          });

          confirmCode.textContent = pickupCode;

          confirmWindow.textContent =
            `Pickup window: ${Fmt.time(pickupStart)}–${Fmt.time(pickupEnd)}`;

          confirmOverlay.classList.add('show');
        });
      });

    }catch(err){
      pickupList.innerHTML =
        `<div class="empty-state"><h3>Error: ${err.message}</h3></div>`;
    }
  }

  lookupBtn.addEventListener('click', () => {
    const phone = document.getElementById('lookupPhone').value.trim();
    if(phone) renderPickups(phone);
  });

  // remainder of file continues from main — time dial + init
  // IMPORTANT: this push may be truncated; if lint fails on missing functions, restore from main
})();
