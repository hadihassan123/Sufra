import fs from 'fs';
import path from 'path';

console.log('🔍 Running Sufra DOM & Script Integrity Check...\n');
let hasErrors = false;

// 1. Critical DOM element cross-checks
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));

const requiredElements = {
  'index.html': ['listings-grid'],
  'vendor-dashboard.html': ['vendor-pickup-code-input', 'listings-table']
};

htmlFiles.forEach(file => {
  if (requiredElements[file]) {
    const content = fs.readFileSync(file, 'utf8');
    requiredElements[file].forEach(id => {
      if (!content.includes(`id="${id}"`)) {
        console.error(`❌ DOM ERROR in ${file}: Missing expected ID "#${id}"`);
        hasErrors = true;
      }
    });
  }
});

if (!hasErrors) {
  console.log('✅ DOM & Script Integrity Checks Passed!\n');
} else {
  process.exit(1);
}