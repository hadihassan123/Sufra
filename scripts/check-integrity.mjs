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

  // D. AUTOMATED: Check that every document.getElementById('x') call
  // reachable from this page — inline <script> blocks, plus every
  // js/*.js file it <script src="">'s in — targets an id that actually
  // exists: either in this page's static HTML, or dynamically injected
  // by that same JS file via an innerHTML template string (this
  // codebase does that a lot — modals, table rows, filter banners).
  // A genuine mismatch means .addEventListener (or similar) gets called
  // on null and throws, silently killing every line after it in that
  // script — exactly what happened with index.html's
  // #adminLogoutNavLink on 2026-08-27: this check didn't exist yet, the
  // hook passed, and the bug shipped anyway.
  // Limitation: only catches getElementById with a plain string-literal
  // argument (the overwhelming majority of real usage) — a dynamically
  // built id (`getElementById(varName)`) can't be checked statically
  // and is silently skipped, not flagged. Also: an id only used
  // dynamically (assigned via `element.id = 'x'` rather than written as
  // a literal `id="x"` anywhere) won't be seen either — grep for the
  // exact getElementById argument if this ever flags something that
  // looks legitimately dynamic and you're not sure why.
  const pageIds = new Set(foundIds);

  const checkSource = (source, label, extraIds) => {
    let m;
    const localRegex = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
    while ((m = localRegex.exec(source)) !== null) {
      if (!pageIds.has(m[1]) && !extraIds.has(m[1])) {
        console.error(`❌ DOM ERROR in ${file}: ${label} calls getElementById('${m[1]}'), but no element with that id exists in ${file} (static or dynamically rendered)`);
        hasErrors = true;
      }
    }
  };

  // ids a JS file creates itself, via id="..." inside its own innerHTML
  // template strings — these are legitimately safe to getElementById
  // for, as long as the render happens first, which isn't something
  // this static check can verify — it only checks the id exists
  // *somewhere* in the file, not the ordering.
  const idsRenderedByJs = (source) => {
    const ids = new Set();
    let m;
    const localIdAttrRegex = /id=["']([^"']+)["']/g;
    while ((m = localIdAttrRegex.exec(source)) !== null) ids.add(m[1]);
    return ids;
  };

  // Inline <script> blocks (skip ones with a src= attribute)
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let inlineMatch;
  while ((inlineMatch = inlineScriptRegex.exec(content)) !== null) {
    checkSource(inlineMatch[1], 'an inline <script> block', idsRenderedByJs(inlineMatch[1]));
  }

  // Local js/*.js files this page loads
  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptPath = match[1];
    if (fs.existsSync(scriptPath)) {
      const jsSource = fs.readFileSync(scriptPath, 'utf8');
      checkSource(jsSource, scriptPath, idsRenderedByJs(jsSource));
    }
  }
});

if (!hasErrors) {
  console.log(`✅ Passed! Checked ${htmlFiles.length} HTML files for broken scripts, duplicate IDs, and manual rules.\n`);
} else {
  process.exit(1);
}