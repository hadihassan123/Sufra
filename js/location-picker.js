// Shared Leaflet location picker: map + reverse geocoding + GPS button.
// Used by vendor-signup.html and vendor.js (dashboard location card).
// Requires Leaflet (script + CSS) to already be loaded on the page.
//
// Both callers previously had their own near-identical copy of this logic
// (map init, drag/click-to-pin, geolocate button, Nominatim reverse geocode).
// This is the single source of truth going forward — if the geocoding
// behavior ever needs tuning again (as it did on 2026-07-29), it only
// needs to change here.

export const LocationPicker = (() => {

  // Leaflet was previously loaded via a blocking <script> tag in <head> on
  // every page that might show a map, delaying initial render even when
  // the map isn't needed yet (e.g. before scrolling to it, or on pages
  // where signup fails before the map is touched). Loading it on-demand,
  // right when init() is actually called, means pages no longer pay that
  // cost upfront. Cached so multiple init() calls only load it once.
  //
  // integrity/crossorigin added alongside the Vite migration - this was
  // the one CDN load in the whole app the earlier SRI pass (Phase 1 #10)
  // missed, because it only scanned static <script src> tags in HTML,
  // never a runtime-constructed one like this. vendor-dashboard.html and
  // vendor-signup.html have no static Leaflet tag at all - they load it
  // exclusively through here, so this was a real, silent gap: the one
  // external script on those two pages running with zero integrity check.
  // Same hashes as index.html's static tag (leafletjs.com/download.html,
  // version 1.9.4, matching the pin already in use).
  let leafletLoadPromise = null;
  function loadLeaflet(){
    if(window.L) return Promise.resolve();
    if(leafletLoadPromise) return leafletLoadPromise;
    leafletLoadPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load the map library.'));
      document.head.appendChild(script);
    });
    return leafletLoadPromise;
  }

  async function reverseGeocode(lat, lng){
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if(!res.ok) throw new Error('Reverse geocoding failed');
    const data = await res.json();
    if(!data.display_name) throw new Error('No address found');
    // Prefer a short, human-friendly address built from structured
    // components over Nominatim's full display_name, which can be a long
    // administrative chain (or, for sparsely-mapped points, just "Doha, Qatar").
    const a = data.address || {};
    const parts = [
      a.building, a.house_number, a.road, a.neighbourhood || a.suburb, a.city || a.town
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : data.display_name;
  }

  /**
   * Initializes a map + GPS button + address autofill in one place.
   *
   * @param {Object} opts
   * @param {string} opts.mapContainerId - id of the empty <div> to render the map into
   * @param {HTMLInputElement} opts.addressInput - text input to autofill on pin change
   * @param {HTMLElement} [opts.statusEl] - optional status message element
   * @param {HTMLElement} [opts.gpsButton] - optional "use my current location" button
   * @param {number|null} [opts.initialLat] - existing latitude to start the pin at
   * @param {number|null} [opts.initialLng] - existing longitude to start the pin at
   * @param {(lat:number, lng:number) => void} [opts.onPinChange] - called whenever the pin moves
   *
   * @returns {{ getPin: () => {lat:number|null, lng:number|null}, getMap: () => object|null }}
   *   getMap() returns null if the map failed to initialize — callers should
   *   treat that as "manual address entry only" rather than an error.
   */
  async function init(opts){
    const { mapContainerId, addressInput, statusEl, gpsButton, onPinChange } = opts;
    let pendingLat = opts.initialLat ?? null;
    let pendingLng = opts.initialLng ?? null;
    let map = null;
    let marker = null;

    async function setPin(lat, lng, skipMove){
      pendingLat = lat;
      pendingLng = lng;
      if(!skipMove && map) map.panTo([lat, lng]);
      if(statusEl) statusEl.textContent = 'Looking up the address…';
      try{
        addressInput.value = await reverseGeocode(lat, lng);
        if(statusEl) statusEl.textContent = 'Pin updated — edit the address if needed, then save.';
      }catch(err){
        if(statusEl) statusEl.textContent = 'Pin updated — enter the address manually, then save.';
      }
      if(onPinChange) onPinChange(lat, lng);
    }

    try{
      await loadLeaflet();
      const startCoords = [pendingLat ?? 25.2854, pendingLng ?? 51.5310]; // Doha center as default
      map = L.map(mapContainerId).setView(startCoords, pendingLat ? 16 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      marker = L.marker(startCoords, { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setPin(pos.lat, pos.lng, false);
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setPin(e.latlng.lat, e.latlng.lng, false);
      });
    }catch(err){
      console.error('Location map failed to initialize — falling back to manual address entry.', err);
      if(statusEl) statusEl.textContent = 'Map unavailable right now — enter your address manually below.';
      if(gpsButton) gpsButton.style.display = 'none';
      return {
        getMap: () => null,
        getPin: () => ({ lat: pendingLat, lng: pendingLng })
      };
    }

    if(gpsButton){
      gpsButton.addEventListener('click', () => {
        if(!navigator.geolocation){
          alert("Your browser doesn't support location access.");
          return;
        }
        if(!map){
          alert('Map is unavailable right now — please enter your address manually.');
          return;
        }
        gpsButton.disabled = true;
        const original = gpsButton.textContent;
        gpsButton.textContent = 'Getting location…';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 16);
            marker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
            setPin(pos.coords.latitude, pos.coords.longitude, false);
            gpsButton.disabled = false;
            gpsButton.textContent = original;
          },
          (err) => {
            alert('Could not get your location: ' + err.message);
            gpsButton.disabled = false;
            gpsButton.textContent = original;
          }
        );
      });
    }

    return {
      getMap: () => map,
      getPin: () => ({ lat: pendingLat, lng: pendingLng })
    };
  }

  return { init, reverseGeocode };
})();