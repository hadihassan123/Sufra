// Business location card — split out of js/vendor.js on 2026-07-30, the
// first piece extracted now that DashboardState makes cross-file
// dependencies explicit instead of implicit closures.
//
// Registered via DashboardState.onReady() rather than running at the top
// level, because DashboardState.vendor is populated ASYNCHRONOUSLY by
// vendor.js — this file's own script tag finishes loading long before
// that async work resolves, so running immediately would very likely
// execute before DashboardState.vendor actually has a value.
//
// Requires: js/dashboard-state.js, js/location-picker.js, js/store.js
// all loaded before this file. Actual map/geocoding logic lives in
// location-picker.js, shared with vendor-signup.html.

import { Store } from './store.js';
import { DashboardState } from './dashboard-state.js';
import { LocationPicker } from './location-picker.js';

DashboardState.onReady(async function(){
  const addressInput = document.getElementById('vendorAddressInput');
  const statusText = document.getElementById('locationStatusText');
  const saveBtn = document.getElementById('saveLocationBtn');
  const useLocationBtn = document.getElementById('useLocationBtn');
  if(!addressInput || !saveBtn) return;

  addressInput.value = DashboardState.vendor.address || '';
  if(DashboardState.vendor.latitude && DashboardState.vendor.longitude){
    statusText.textContent = 'Location saved — customers can find you on the map.';
  }

  // Leaflet now loads on-demand (see location-picker.js), so init() is
  // async and takes a moment. Register the save button FIRST, before
  // awaiting it — saving the address should never depend on a still-
  // loading map library. If clicked before the map's ready, this falls
  // back to whatever coordinates were already saved.
  let picker = null;

  saveBtn.addEventListener('click', async () => {
    const address = addressInput.value.trim();
    if(!address){ alert('Enter an address first.'); return; }
    const pin = picker
      ? picker.getPin()
      : { lat: DashboardState.vendor.latitude ?? null, lng: DashboardState.vendor.longitude ?? null };
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try{
      await Store.updateVendorPin(DashboardState.vendor.id, { address, latitude: pin.lat, longitude: pin.lng });
            DashboardState.setVendor(await Store.getVendorProfile(DashboardState.vendor.id));
            statusText.textContent = 'Location saved — customers can find you on the map.';
    }catch(err){
      alert('Could not save location: ' + err.message);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save location';
  });

  picker = await LocationPicker.init({
    mapContainerId: 'dashboardMapView',
    addressInput,
    statusEl: statusText,
    gpsButton: useLocationBtn,
    initialLat: DashboardState.vendor.latitude ?? null,
    initialLng: DashboardState.vendor.longitude ?? null
  });
});