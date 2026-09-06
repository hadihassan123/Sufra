// Entry point for vendor-dashboard.html (Vite build). Real import
// order below replaces what the old chain of 15 individual
// <script src="js/..."> tags enforced purely through tag placement.
//
// store.js, location-picker.js, and dashboard-state.js don't need
// their own import here — vendor.js and vendor-location.js already
// import exactly what they need from those directly. Only the
// side-effect-only files nothing else imports (vendor-location.js,
// doha-clock.js) plus the actual bootstrap (vendor.js) need listing.
import '../vendor-location.js';
import '../doha-clock.js';
import '../vendor.js';
