/* global ListingState */ 
(function () {

  const listingImageInput = document.getElementById('listingImage');
  const listingImagePreviewRow = document.getElementById('listingImagePreviewRow');
  const listingImageFilename = document.getElementById('listingImageFilename');

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

  async function render(){
    const body = document.getElementById('listingsTableBody');
    const banner = document.getElementById('listingsFilterBanner');
    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    DashboardState.cachedListings = await Store.getListingsByVendor(DashboardState.vendor.id);

    const filter = DashboardState.listingsFilter;
    if(banner){
      if(filter){
        const labels = { active: 'Active', sold_out: 'Sold out', expired: 'Expired' };
        banner.style.display = 'flex';
        banner.className = 'filter-banner';
        banner.innerHTML = `Showing <span class="status-pill status-${filter}">${labels[filter] || filter}</span> only <button id="clearListingsFilterBtn">Clear filter</button>`;
        document.getElementById('clearListingsFilterBtn').addEventListener('click', () => {
          DashboardState.listingsFilter = null;
          render();
        });
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    }

    const rows = filter
      ? DashboardState.cachedListings.filter(l => ListingState.status(l).key === filter)
      : DashboardState.cachedListings;

    if(DashboardState.cachedListings.length === 0){
      body.innerHTML = `<tr><td colspan="5">No listings yet — post your first item.</td></tr>`;
      return;
    }
    if(rows.length === 0){
      body.innerHTML = `<tr><td colspan="5">No listings match this filter.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(l => {
      const status = ListingState.status(l);
      return `
      <tr>
        <td data-label="Item"><strong>${l.item_name}</strong> <span class="status-pill status-${status.key}">${status.label}</span></td>
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
    `;
    }).join('');
  }

  // Called from the listings table's "Edit" button.
  function loadIntoForm(listing){
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
      Nav.show('post');
    }catch(err){
      console.error('[edit listing] failed to load listing into form:', err);
      alert('Could not load this listing for editing.');
    }
  }

  function initPhotoPreview(){
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
  }

  function initListingsTable(){
    try{
      document.getElementById('listingsTableBody').addEventListener('click', async (e) => {
        const up = e.target.closest('[data-qty-up]');
        const down = e.target.closest('[data-qty-down]');
        const rm = e.target.closest('[data-remove]');
        const edit = e.target.closest('[data-edit]');
        if(edit){
          const listing = DashboardState.cachedListings.find(x => x.id === edit.dataset.edit);
          if(!listing) return;
          loadIntoForm(listing);
          return;
        }
        if(up){
          const l = DashboardState.cachedListings.find(x => x.id === up.dataset.qtyUp);
          if(l && l.quantity_left < l.quantity_total){
            await Store.updateListingQty(l.id, l.quantity_left + 1);
            render();
          }
        }
        if(down){
          const l = DashboardState.cachedListings.find(x => x.id === down.dataset.qtyDown);
          if(l && l.quantity_left > 0){
            await Store.updateListingQty(l.id, l.quantity_left - 1);
            render();
          }
        }
        if(rm){
          if(confirm('Remove this listing?')){
            await Store.removeListing(rm.dataset.remove);
            render();
          }
        }
      });
    }catch(err){
      console.error('[listings table] failed to wire up:', err);
    }
  }

  function initPostForm(){
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
          } catch (err) {
            console.error("Compression failed, using original", err);
            finalImage = imageFile;
          }
        }

        if (imageFile) {
          imageUrl = await Store.uploadListingImage(DashboardState.vendor.id, finalImage);
        }

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

        setTimeout(() => Nav.show('listings'), 900);

      } catch (err) {
        alert('Could not post listing: ' + err.message);
        submitBtn.disabled = false;
      }
    });
  }

  function init(){
    initPhotoPreview();
    initListingsTable();
    initPostForm();
  }

  window.Listings = { init, render, loadIntoForm, computeDefaultPickupStart };

})();