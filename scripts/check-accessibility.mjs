#!/usr/bin/env node
/* global console, process */
// Real, automated accessibility audit - axe-core (the same engine axe
// DevTools uses), run against every page via a real headless Chromium
// through Playwright. This is NOT a lint-style guess at accessibility
// from reading markup; it's the actual tool the Phase 3 review asked
// for, run against the actual rendered, built output.
//
// Why this runs in CI rather than being checked once by hand: a
// browser-based check like this can't run in the sandbox this was
// written in at all (no network path to download a real browser
// binary there) - which is itself the reason to make this a permanent,
// repeatable CI job instead of a one-off manual pass. Every future
// change gets checked automatically, not just today's snapshot.
//
// Currently REPORT-ONLY (does not fail the build) - see main() at the
// bottom. This is deliberate for the first run: nobody has seen real
// results yet, so failing CI immediately on whatever the first scan
// finds would block all other work on unrelated changes. Once the
// initial findings are triaged and fixed (or explicitly accepted),
// switch VIOLATIONS_ARE_FATAL to true so this becomes a real gate like
// the RLS tests and lint checks - tracked as a known follow-up, not
// forgotten.

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';

const VIOLATIONS_ARE_FATAL = false;

// Matches vite.config.mjs's rollupOptions.input exactly - if a page is
// ever added there, add it here too, or it silently never gets audited.
const PAGES = [
  '/index.html',
  '/admin.html',
  '/vendor-dashboard.html',
  '/vendor-signup.html',
  '/vendor-login.html',
  '/vendor-forgot-password.html',
  '/vendor-reset-password.html',
  '/privacy.html',
  '/404.html',
];

async function main() {
  const server = await preview({ preview: { port: 4173, strictPort: true } });
  const baseUrl = `http://localhost:4173`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let totalViolations = 0;
  const report = [];

  for (const path of PAGES) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page }).analyze();

    if (results.violations.length === 0) {
      console.log(`✅ ${path} - no violations`);
      continue;
    }

    totalViolations += results.violations.length;
    console.log(`\n❌ ${path} - ${results.violations.length} violation type(s):`);
    for (const v of results.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
      console.log(`    ${v.helpUrl}`);
      console.log(`    Affects ${v.nodes.length} element(s), e.g.: ${v.nodes[0]?.target?.join(' ')}`);
    }
    report.push({ path, violations: results.violations });
  }

  await browser.close();
  await new Promise((resolveClose) => server.httpServer.close(resolveClose));

  console.log(`\n${'='.repeat(60)}`);
  if (totalViolations === 0) {
    console.log('✅ No accessibility violations found across all pages.');
  } else {
    console.log(`Found ${totalViolations} violation type(s) across ${report.length} page(s).`);
    if (VIOLATIONS_ARE_FATAL) {
      process.exit(1);
    } else {
      console.log('(Report-only for now - see VIOLATIONS_ARE_FATAL in this script.)');
    }
  }
}

main().catch((err) => {
  console.error('Accessibility audit crashed:', err);
  process.exit(1);
});
