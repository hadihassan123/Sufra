(function () {

  const verifyInput = document.getElementById('verifyCodeInput');
  const verifyResult = document.getElementById('verifyResult');
  const scanQrBtn = document.getElementById('scanQrBtn');
  const qrScannerOverlay = document.getElementById('qrScannerOverlay');
  const closeQrScanner = document.getElementById('closeQrScanner');

  let qrScanner = null;

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
    const flag = reservation.customer_flag || {};
    const pickups = flag.successful_pickups || 0;
    const noShows = flag.no_show_count || 0;
    // The tier itself is decided server-side now, in
    // get_reservation_with_flag — this is presentation only (which
    // emoji/label/color a tier gets), not the rule for what counts as
    // trusted vs. high-risk. That rule previously lived here in JS and
    // had to be fixed twice in one session; now there's exactly one
    // place that decides it.
    const TIER_DISPLAY = {
      new:     { emoji: '⚪', label: 'New customer' },
      trusted: { emoji: '🟢', label: 'Trusted' },
      warning: { emoji: '🟡', label: 'Needs attention' },
      danger:  { emoji: '🔴', label: 'High risk' }
    };
    const tierInfo = TIER_DISPLAY[flag.tier] || TIER_DISPLAY.new;
    const tierClass = flag.tier || 'new';
    const tierHtml = flag.tier === 'new'
      ? `${tierInfo.emoji} <strong>${tierInfo.label}</strong><br>No pickup history yet.`
      : `${tierInfo.emoji} <strong>${tierInfo.label}</strong><br>${pickups} successful pickups • ${noShows} no-shows`;

    let reputationHtml = `<div class="customer-reputation ${tierClass}">${tierHtml}</div>`;
    if (flag.is_currently_restricted) {
      reputationHtml += `
        <div class="customer-reputation danger restriction-notice">
          🚫 <strong>Currently restricted</strong> until ${new Date(flag.reservation_restricted_until).toLocaleDateString()}
        </div>
      `;
    }

    verifyResult.innerHTML = `
      <div class="form-msg success show">
        ${reputationHtml}
        <strong>${reservation.customer_name}</strong>
        — ${reservation.item_name}${reservation.quantity > 1 ? ` ×${reservation.quantity}` : ''}
        · ${Fmt.money(reservation.price)} cash due

        <div style="margin-top:12px;">
            <button
                class="btn btn-teal btn-sm"
                id="markCollectedBtn">
                Mark as collected
            </button>
            <button
              class="btn btn-danger btn-sm"
              id="markNoShowBtn">
              No Show
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
      Overview.render();
    });
    document.getElementById('markNoShowBtn').addEventListener('click', async () => {
        if (!confirm(`Mark ${reservation.customer_name} as a no-show?`)) {
            return;
        }
        try {
            await Store.markNoShow(reservation.id);
            verifyInput.value = '';
            verifyResult.innerHTML = `
                <div class="form-msg error show">
                    ${reservation.customer_name} marked as <strong>No Show</strong>.
                    Customer reputation has been updated.
                </div>
            `;
            Overview.render();
        } catch (err) {
            alert(err.message);
        }
    });
  }

  async function startQrScanner(){
    qrScannerOverlay.classList.add('show');
    try {
      const devices = await Html5Qrcode.getCameras();
      qrScanner = new Html5Qrcode("qr-reader");
      await qrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
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
    console.log(reservation);
    showReservation(reservation);
  }

  function init(){
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

    try{
      verifyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') document.getElementById('verifyBtn').click(); });
      scanQrBtn.addEventListener('click', startQrScanner);
    }catch(err){
      console.error('[verify input / QR scan button] failed to wire up:', err);
    }

    try{
      closeQrScanner.addEventListener('click', async () => {
        if(qrScanner){
          try{ await qrScanner.stop(); }catch(err){ /* already stopped — fine */ }
        }
        qrScannerOverlay.classList.remove('show');
      });
    }catch(err){
      console.error('[close QR scanner button] failed to wire up:', err);
    }
  }

  async function render(){
    const body = document.getElementById('reservationsTableBody');
    const banner = document.getElementById('reservationsFilterBanner');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    const allReservations = await Store.getReservationsByVendor(DashboardState.vendor.id);

    const filter = DashboardState.reservationsFilter;
    if(banner){
      if(filter){
        const labels = { reserved: 'Reserved / awaiting pickup', collected: 'Collected' };
        banner.style.display = 'flex';
        banner.className = 'filter-banner';
        banner.innerHTML = `Showing <span class="status-pill status-${filter}">${labels[filter] || filter}</span> only <button id="clearReservationsFilterBtn">Clear filter</button>`;
        document.getElementById('clearReservationsFilterBtn').addEventListener('click', () => {
          DashboardState.reservationsFilter = null;
          render();
        });
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    }

    const matchesFilter = r => {
      if(!filter) return true;
      if(filter === 'reserved') return r.status === 'reserved';
      if(filter === 'collected') return r.status === 'collected';
      return true;
    };
    const reservations = allReservations.filter(matchesFilter);

    if(allReservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
      return;
    }
    if(reservations.length === 0){
      body.innerHTML = `<tr><td colspan="5">No reservations match this filter.</td></tr>`;
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

  window.Pickup = { init, render };

})();