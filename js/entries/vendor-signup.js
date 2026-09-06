// Entry point for vendor-signup.html (Vite build).
import { Store } from '../store.js';
import { LocationPicker } from '../location-picker.js';

const form = document.getElementById('signupForm');
const msg = document.getElementById('formMsg');
const submitBtn = document.getElementById('submitBtn');
const addressInput = document.getElementById('address');
const latInput = document.getElementById('vendorLatitude');
const lngInput = document.getElementById('vendorLongitude');
const locationStatus = document.getElementById('signupLocationStatus');
const useLocationBtn = document.getElementById('signupUseLocationBtn');

// Register the form submit handler FIRST, unconditionally — account
// creation must never depend on the map working. If Leaflet fails to
// load or the map throws for any reason, signup still has to work.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;

  const businessName = document.getElementById('businessName').value.trim();
  const category = document.getElementById('category').value;
  const area = document.getElementById('area').value.trim();
  const address = addressInput.value.trim();
  const latitude = latInput.value ? parseFloat(latInput.value) : null;
  const longitude = lngInput.value ? parseFloat(lngInput.value) : null;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try{
    const result = await Store.signUpVendor({ email, password, businessName, category, area, address, latitude, longitude });
    if(result.needsConfirmation){
      msg.textContent = 'Check your email to confirm your account, then log in.';
      msg.className = 'form-msg success show';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Check your email';
    } else {
      window.location.href = 'vendor-dashboard.html';
    }
  }catch(err){
    msg.textContent = err.message || 'Something went wrong. Please try again.';
    msg.className = 'form-msg error show';
    submitBtn.disabled = false;
  }
});

// ---- Map: click or drag to set the pin, reverse geocode to fill the address ----
// Everything below is a progressive enhancement. If it fails, the address
// field above still works as a plain manual text input and signup is fine.
// Actual map/geocoding logic lives in js/location-picker.js, shared with
// the vendor dashboard's location card.
LocationPicker.init({
  mapContainerId: 'signupMapView',
  addressInput,
  statusEl: locationStatus,
  gpsButton: useLocationBtn,
  onPinChange: (lat, lng) => {
    latInput.value = lat;
    lngInput.value = lng;
  }
});
