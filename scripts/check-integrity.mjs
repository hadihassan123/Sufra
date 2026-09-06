/* global console, process */
import fs from 'fs';
import path from 'path';

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

  // B. AUTOMATED: Check for broken script references — classic
  // <script src="js/..."> (no leading slash, pre-Vite pages, none
  // remain as of the ES-modules migration but kept for safety) and
  // <script type="module" src="/js/..."> (leading slash, how every
  // page loads its JS now).
  const scriptRegex = /src=["']\/?(js\/[^"']+)["']/g;
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
  // local JS file it loads, FOLLOWED TRANSITIVELY through real ES
  // module `import` statements (an entry file like
  // js/entries/vendor-dashboard.js mostly just imports other files -
  // the actual getElementById calls live several files deep) —
  // targets an id that actually exists: either in this page's static
  // HTML, or dynamically injected by some reachable JS file via an
  // innerHTML template string (this codebase does that a lot - modals,
  // table rows, filter banners).
  // A genuine mismatch means .addEventListener (or similar) gets called
  // on null and throws, silently killing every line after it in that
  // script — exactly what happened with index.html's
  // #adminLogoutNavLink on 2026-08-27: this check didn't exist yet, the
  // hook passed, and the bug shipped anyway. This transitive-import
  // version replaced a version that only checked a script's own file,
  // which went silently blind the moment every page switched to
  // <script type="module" src="/js/entries/*.js"> - those entry files
  // mostly just import everything else, so checking them alone would
  // check almost nothing.
  // Limitation: only catches getElementById with a plain string-literal
  // argument (the overwhelming majority of real usage) — a dynamically
  // built id (`getElementById(varName)`) can't be checked statically
  // and is silently skipped, not flagged. Also: an id only used
  // dynamically (assigned via `element.id = 'x'` rather than written as
  // a literal `id="x"` anywhere) won't be seen either — grep for the
  // exact getElementById argument if this ever flags something that
  // looks legitimately dynamic and you're not sure why.
  const pageIds = new Set(foundIds);

  // ids a JS file creates itself, via id="..." inside its own innerHTML
  // template strings — these are legitimately safe to getElementById
  // for, as long as the render happens first, which isn't something
  // this static check can verify — it only checks the id exists
  // *somewhere* in the reachable JS, not the ordering.
  const idsRenderedByJs = (source) => {
    const ids = new Set();
    let m;
    const localIdAttrRegex = /id=["']([^"']+)["']/g;
    while ((m = localIdAttrRegex.exec(source)) !== null) ids.add(m[1]);
    return ids;
  };

  // Follows import ... from '...' and bare import '...' statements
  // (both relative to the importing file's own directory) to collect
  // every JS file transitively reachable from a starting file, each
  // read exactly once even if imported from multiple places (matching
  // how a real module graph only evaluates a module once).
  const collectReachableSources = (startPath) => {
    const visited = new Set();
    const sources = [];
    const queue = [startPath];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current) || !fs.existsSync(current)) continue;
      visited.add(current);
      const source = fs.readFileSync(current, 'utf8');
      sources.push(source);
      const importRegex = /^import\s+(?:[^'"]*?\s+from\s+)?["'](\.[^"']+)["']/gm;
      let im;
      while ((im = importRegex.exec(source)) !== null) {
        const resolved = path.normalize(path.join(path.dirname(current), im[1]));
        queue.push(resolved);
      }
    }
    return sources;
  };

  const checkSource = (source, label, extraIds) => {
    let m;
    const localRegex = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
    while ((m = localRegex.exec(source)) !== null) {
      if (!pageIds.has(m[1]) && !extraIds.has(m[1])) {
        console.error(`❌ DOM ERROR in ${file}: ${label} calls getElementById('${m[1]}'), but no element with that id exists in ${file} (static, dynamically rendered, or from a reachable import)`);
        hasErrors = true;
      }
    }
  };

  // Inline <script> blocks (skip ones with a src= attribute) — none
  // remain as of the ES-modules migration (all moved into
  // js/entries/*.js), kept for safety in case one's ever added back.
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let inlineMatch;
  while ((inlineMatch = inlineScriptRegex.exec(content)) !== null) {
    checkSource(inlineMatch[1], 'an inline <script> block', idsRenderedByJs(inlineMatch[1]));
  }

  // Local JS files this page loads, plus everything they import,
  // transitively — checked together as one combined pool of ids and
  // getElementById calls, since a page's real getElementById-safety
  // depends on the union of everything it actually loads, not any one
  // file in isolation.
  const scriptPaths = new Set();
  let scriptMatch;
  const scriptPathRegex = /src=["']\/?(js\/[^"']+)["']/g;
  while ((scriptMatch = scriptPathRegex.exec(content)) !== null) {
    if (fs.existsSync(scriptMatch[1])) scriptPaths.add(scriptMatch[1]);
  }
  scriptPaths.forEach(entryPath => {
    const allSources = collectReachableSources(entryPath);
    const combinedSource = allSources.join('\n');
    const combinedRenderedIds = idsRenderedByJs(combinedSource);
    checkSource(combinedSource, `${entryPath} (including everything it imports)`, combinedRenderedIds);
  });

  // E. AUTOMATED: Check for inline event-handler attributes
  // (onclick="...", onload="...", etc.) anywhere this page's HTML
  // could produce them - both in the static markup itself, and in any
  // JS template-literal HTML this page's reachable script graph
  // renders via innerHTML/insertAdjacentHTML/etc.
  //
  // Added 2026-09-06 after exactly this shipped as a live regression:
  // "Drop unsafe-inline from script-src" was audited against static
  // HTML files only, and missed an onclick="..." attribute embedded in
  // a JS template literal in customer.js, rendered into Leaflet map
  // popups at runtime - invisible to a plain grep of *.html. Once
  // script-src has no unsafe-inline, ANY inline event handler anywhere
  // - static or dynamically rendered - silently fails at runtime with
  // no build error and no console warning a casual glance would catch;
  // this check exists so a mistake like that fails CI instead of
  // shipping.
  //
  // Scans the same known HTML event-attribute names used to audit the
  // CSP change itself (not a loose `on[a-z]*=` pattern - that
  // false-positives on ordinary words like "content=" and "section=",
  // both of which contain "on" immediately before "="). If a
  // legitimate event attribute name isn't in this list, add it here.
  const eventAttrNames = 'click|load|error|change|submit|input|focus|blur|mouseover|mouseout|mouseenter|mouseleave|keydown|keyup|keypress|dblclick|contextmenu|drag|dragstart|dragend|drop|touchstart|touchend|touchmove|scroll|resize|toggle';
  const inlineHandlerRegex = new RegExp(`\\bon(?:${eventAttrNames})\\s*=\\s*["']`, 'g');

  const checkForInlineHandlers = (source, label) => {
    if (inlineHandlerRegex.test(source)) {
      console.error(`❌ CSP ERROR in ${file}: ${label} contains an inline event-handler attribute (onclick=, onload=, etc.) - this will silently fail at runtime now that script-src has no 'unsafe-inline'. Convert it to a real addEventListener call.`);
      hasErrors = true;
    }
    inlineHandlerRegex.lastIndex = 0; // reset for next .test() call, since the regex has the 'g' flag
  };

  checkForInlineHandlers(content, 'this page\'s static HTML');
  scriptPaths.forEach(entryPath => {
    const allSources = collectReachableSources(entryPath);
    checkForInlineHandlers(allSources.join('\n'), `${entryPath} (including everything it imports)`);
  });
});

if (!hasErrors) {
  console.log(`✅ Passed! Checked ${htmlFiles.length} HTML files for broken scripts, duplicate IDs, and manual rules.\n`);
} else {
  process.exit(1);
}