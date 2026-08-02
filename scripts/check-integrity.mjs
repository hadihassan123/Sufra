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
  'index.html': [], // e.g. ['listings-grid']
  'vendor-dashboard.html': [] // e.g. ['vendor-pickup-code-input']
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