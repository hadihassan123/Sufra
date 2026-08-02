/* global console, process */
import fs from 'fs';

console.log('🔍 Running Sufra DOM & Script Integrity Check...\n');
let hasErrors = false;

// ----------------------------------------------------
// 1. MANUAL CHECK LIST (Opt-in)
// Add specific critical IDs you want to guarantee exist.
// Leave empty [] if you only want the automated check.
// ----------------------------------------------------
const requiredElements = {
  'index.html': [
    'mainNav',
    'vendorDashboardLink',
    'vendorNavLink',
    'vendorLoginNavLink',
    'vendorLogoutNavLink',
    'adminLogoutNavLink',
    'heroVendorLink',
    'clockText',
    'steamSvg',
    'dialSvg',
    'dialStatus',
    'dialSub',
    'browse',
    'searchInput',
    'filterBar',
    'listingGrid',
    'mapView',
    'how',
    'pickups',
    'lookupPhone',
    'lookupBtn',
    'liveIndicator',
    'pickupList',
    'reserveOverlay',
    'reserveModal',
    'reserveItemName',
    'reserveItemMeta',
    'reserveForm',
    'custName',
    'custPhone',
    'reserveQtyEditor',
    'reserveQtyDown',
    'reserveQtyValue',
    'reserveQtyUp',
    'reserveQtyHint',
    'confirmOverlay',
    'confirmModal',
    'confirmQr',
    'confirmCode',
    'copyPickupCodeBtn',
    'confirmWindow'

  ],
  'vendor-dashboard.html': [
    'vendor-pickup-code-input',
    'verify-code-btn',
    'qr-reader',
    'new-listing-form',
    'listings-table'
  ],
  'admin.html': [
    'pending-vendors-table',
    'verified-vendors-table'
  ],
  'vendor-login.html': [
    'login-email',
    'login-password',
    'login-btn'
  ],
  'vendor-forgot-password.html': [
    'reset-email',
    'send-reset-btn'
  ],
  'vendor-reset-password.html': [
    'new-password',
    'update-password-btn'
  ]
};


// ----------------------------------------------------
// 2. AUTOMATED HTML SCANNER
// ----------------------------------------------------
const htmlFiles = fs.readdirSync('.').filter(file => file.endsWith('.html'));

htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');

  // A. AUTOMATED: Check for duplicate IDs
  const idRegex = /id=["']([^"']+)["']/g;
  const foundIds = [];
  let match;

  while ((match = idRegex.exec(content)) !== null) {
    foundIds.push(match[1]);
  }

  const duplicates = foundIds.filter((id, index) => foundIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    console.error(`❌ DOM ERROR in ${file}: Duplicate IDs found -> [${[...new Set(duplicates)].join(', ')}]`);
    hasErrors = true;
  }

  // B. AUTOMATED: Check for broken <script src="..."> files
  const scriptRegex = /src=["'](js\/[^"']+)["']/g;
  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptPath = match[1];
    if (!fs.existsSync(scriptPath)) {
      console.error(`❌ SCRIPT ERROR in ${file}: Missing script file "${scriptPath}"`);
      hasErrors = true;
    }
  }

  // C. MANUAL: Verify required elements defined in map above
  if (requiredElements[file] && requiredElements[file].length > 0) {
    requiredElements[file].forEach(id => {
      if (!content.includes(`id="${id}"`)) {
        console.error(`❌ DOM ERROR in ${file}: Missing manually required ID "#${id}"`);
        hasErrors = true;
      }
    });
  }
});

if (!hasErrors) {
  console.log(`✅ Passed! Checked ${htmlFiles.length} HTML files for broken scripts, duplicate IDs, and manual rules.\n`);
} else {
  process.exit(1);
}