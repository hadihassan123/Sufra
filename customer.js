(() => {
  let activeFilter = 'all';
  let pendingListingId = null;

  const grid = document.getElementById('listingGrid');
  const filterBar = document.getElementById('filterBar');

  function money(n){ return 'QAR ' + Number(n).toFixed(0); }
  function pct(oldP, newP){ return Math.round((1 - newP/oldP) * 100); }
  function timeFmt(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  function renderListings(){
    const listings = Store.getActiveListings().filter(l =>
      activeFilter === 'all' ? true : l.category === activeFilter
    );

    if(listings.length === 0){
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <h3>Nothing here right now</h3>
        <p>Check back later, or try a different category — vendors post new surplus throughout the day.</p>
      </div>`;
      return;
    }

    grid.innerHTML = listings.map(l => {
      const soldOut = l.quantityLeft <= 0;
      return `
      <div class="ticket ${soldOut ? 'sold-out' : ''}">
        <div class="ticket-main">
          <div class="ticket-top">
            <span class="ticket-vendor">${l.vendorName}</span>
            <span class="discount-badge">${pct(l.originalPrice, l.discountedPrice)}% off</span>
          </div>
          <h3 class="ticket-item">${l.itemName}</h3>
          <p class="ticket-desc">${l.description}</p>
          <div class="ticket-prices">
            <span class="price-old">${money(l.originalPrice)}</span>
            <span class="price-new">${money(l.discountedPrice)}</span>
          </div>
          <div class="ticket-meta">
            <span>📍 <strong>${l.category}</strong></span>
            <span>🕐 Pickup <strong>${timeFmt(l.pickupStart)}–${timeFmt(l.pickupEnd)}</strong></span>
          </div>
        </div>
        <div class="ticket-stub">
          <span class="stub-label">Left</span>
          <span class="stub-qty">${l.quantityLeft}</span>
          <span class="stub-qty-label">of ${l.quantityTotal}</span>
          <button class="btn ${soldOut ? 'btn-ghost' : 'btn-teal'}" ${soldOut ? 'disabled' : ''} data-reserve="${l.id}">
            ${soldOut ? 'Sold out' : 'Reserve'}
          </button>
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
    renderListings();
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

  function openReserveModal(listingId){
    const listing = Store.getListing(listingId);
    if(!listing) return;
    pendingListingId = listingId;
    document.getElementById('reserveItemName').textContent = listing.itemName;
    document.getElementById('reserveItemMeta').textContent =
      `${listing.vendorName} · ${money(listing.discountedPrice)} · Pickup ${timeFmt(listing.pickupStart)}–${timeFmt(listing.pickupEnd)}`;
    reserveForm.reset();
    reserveOverlay.classList.add('show');
  }

  reserveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const listing = Store.getListing(pendingListingId);
    if(!listing || listing.quantityLeft <= 0){
      alert('Sorry, this item just sold out.');
      reserveOverlay.classList.remove('show');
      renderListings();
      return;
    }
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    Store.decrementListingStock(listing.id, 1);
    const reservation = Store.createReservation(listing, name, phone);

    reserveOverlay.classList.remove('show');
    document.getElementById('confirmCode').textContent = reservation.pickupCode;
    document.getElementById('confirmWindow').textContent =
      `Pickup at ${listing.vendorName}, ${timeFmt(listing.pickupStart)}–${timeFmt(listing.pickupEnd)}. Bring this code and pay ${money(listing.discountedPrice)} cash.`;
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

  function renderPickups(phone){
    const reservations = Store.getReservationsByPhone(phone);
    if(reservations.length === 0){
      pickupList.innerHTML = `<div class="empty-state"><h3>No pickups found</h3><p>Reservations you make will show up here when you look up the same phone number.</p></div>`;
      return;
    }
    pickupList.innerHTML = reservations.map(r => `
      <div class="pickup-row">
        <div class="pickup-row-info">
          <strong>${r.itemName}</strong>
          <span>${r.vendorName} · ${timeFmt(r.pickupStart)}–${timeFmt(r.pickupEnd)}</span>
        </div>
        <span class="pickup-code-tag">${r.pickupCode}</span>
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

  const SURPLUS_WINDOWS = [
    { startHour: 15, endHour: 16.5, label: 'Lunch-service surplus' },
    { startHour: 19, endHour: 22, label: 'Closing-time surplus' }
  ];

  function angleForHour(h){ return (h / 12) * 360; } // 12-hour face, 0 = top, clockwise
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

    // tick marks
    for(let i=0;i<12;i++){
      const ang = i * 30;
      const p1 = polar(cx, cy, r, ang);
      const p2 = polar(cx, cy, r - (i%3===0?10:5), ang);
      svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="rgba(246,241,227,0.35)" stroke-width="${i%3===0?2:1}"/>`;
    }

    // surplus window arcs (12-hour face, both AM/PM hours folded into 0-12)
    SURPLUS_WINDOWS.forEach(w => {
      const startH = w.startHour % 12;
      const endH = w.endHour % 12;
      svg += `<path d="${arcPath(cx, cy, r, angleForHour(startH), angleForHour(endH))}"
        fill="none" stroke="#2F6E67" stroke-width="6" stroke-linecap="round" opacity="0.85"/>`;
    });

    svg += `<circle id="handGroup" cx="${cx}" cy="${cy}" r="4" fill="#E8A33D"/>`;
    dialSvg.setAttribute('viewBox', '0 0 240 240');
    dialSvg.innerHTML = svg;
  }

  function updateHands(){
    const now = new Date();
    const h12 = now.getHours() % 12 + now.getMinutes()/60;
    const m = now.getMinutes() + now.getSeconds()/60;
    const cx = 120, cy = 120;

    const hourAngle = angleForHour(h12);
    const minAngle = (m/60) * 360;

    const hourTip = polar(cx, cy, 52, hourAngle);
    const minTip = polar(cx, cy, 76, minAngle);

    let existingHands = dialSvg.querySelectorAll('.hand');
    existingHands.forEach(el => el.remove());

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

  buildDial();
  updateHands();
  setInterval(updateHands, 1000);

  renderListings();
})();
