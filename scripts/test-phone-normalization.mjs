#!/usr/bin/env node
/* global console, process, fetch */
// Compares js/utils.js's normalizeQatarPhone() against the REAL live
// normalize_qatar_phone() Postgres function (via RPC - the same call
// path a real reservation goes through), not a copy of its logic.
//
// Why this exists: create_reservation_safe(), get_reservations_by_phone(),
// and the customer homepage's phone-lookup field all rely on both sides
// agreeing on what counts as the same phone number. If they silently
// drift apart, the failure mode is: a customer's own phone number stops
// matching their own reservation history, or a no-show restriction can
// be evaded by typing the same real number in a slightly different
// format. Neither would show up as an error - it'd just quietly stop
// working for some inputs.
//
// This deliberately calls the LIVE function via RPC rather than
// re-implementing its logic a second time in JS/Node - a hand-copied
// "SQL equivalent" would drift out of sync with the real function
// exactly the way this test exists to catch, just one level removed.
//
// Every test case here was verified against the real live database
// before being committed - not written speculatively.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- extract the real JS implementation from js/utils.js at run time,
// so this test can never silently check a stale copy of the function
// instead of the one actually shipping. ---
const utilsSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'utils.js'),
  'utf8'
);
const match = utilsSource.match(/normalizeQatarPhone\(input\)\{[\s\S]*?\n {2}\}/);
if (!match) {
  console.error('FAIL: could not find normalizeQatarPhone() in js/utils.js - has it moved or been renamed?');
  process.exit(1);
}
const fnBody = match[0]
  .replace('normalizeQatarPhone(input){', '')
  .replace(/\}$/, '');
const normalizeQatarPhone = new Function('input', fnBody);

// --- same URL/anon key already committed in js/supabase-client.js -
// safe to expose by design (see that file's own comment) - read from
// there rather than duplicated here, so there's one source for it. ---
const clientSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'supabase-client.js'),
  'utf8'
);
const SUPABASE_URL = clientSource.match(/SUPABASE_URL = '([^']+)'/)[1];
const SUPABASE_ANON_KEY = clientSource.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];

const TEST_CASES = [
  // valid Qatar mobiles, various real-world formats
  '55512345', '35512345', '65512345', '75512345',
  '+974 5551 2345', '00974 5551 2345', '05551 2345',
  '974-5551-2345', '(974) 5551-2345',
  // invalid - wrong leading digit, too short, ambiguous 974-prefixed length
  '15512345', '5551234', '974555123456', '9745551234',
  // edge cases
  '', null,
];

async function checkOne(input) {
  const jsResult = normalizeQatarPhone(input);

  let sqlResult = null;
  let sqlError = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/normalize_qatar_phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_input: input }),
    });
    const body = await r.json();
    if (!r.ok) {
      sqlError = body.message || JSON.stringify(body);
    } else {
      sqlResult = body;
    }
  } catch (err) {
    sqlError = err.message;
  }

  const jsInvalid = jsResult === null;
  const sqlInvalid = sqlError !== null;
  const agree = jsInvalid && sqlInvalid
    ? true
    : (!jsInvalid && !sqlInvalid && jsResult === sqlResult);

  return { input, jsResult, jsInvalid, sqlResult, sqlError, sqlInvalid, agree };
}

async function main() {
  let failures = 0;

  for (const input of TEST_CASES) {
    const r = await checkOne(input);
    if (!r.agree) {
      failures++;
      console.error(`MISMATCH for input ${JSON.stringify(r.input)}:`);
      console.error(`  JS:  ${r.jsInvalid ? 'invalid (null)' : r.jsResult}`);
      console.error(`  SQL: ${r.sqlInvalid ? `invalid (${r.sqlError})` : r.sqlResult}`);
    } else {
      console.log(`ok - ${JSON.stringify(r.input)} -> ${r.jsInvalid ? 'both invalid' : r.jsResult}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${TEST_CASES.length} phone normalization cases disagree between JS and SQL.`);
    process.exit(1);
  }
  console.log(`\nAll ${TEST_CASES.length} cases agree between js/utils.js and the live normalize_qatar_phone() function.`);
}

main();
