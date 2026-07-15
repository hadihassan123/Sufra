# Sufra — Doha's End-of-Day Food Marketplace

Sufra connects Doha restaurants, bakeries, and cafés with customers looking
for their end-of-day surplus at a real discount — guaranteed items, not
surprise bags. Customers reserve online and pick up in a set window; payment
is cash, collected directly by the vendor at pickup.

## Stack
Plain HTML/CSS/JS, no frameworks or build step. Data lives in Supabase
(Postgres + Auth) — see `/supabase/schema.sql` and
`/supabase/admin_setup.sql` for the full schema, Row Level Security
policies, and the server-side admin approval functions.

## Structure
- `index.html` — customer-facing browse, reserve, and pickup tracker
- `vendor-signup.html` / `vendor-login.html` / `vendor-dashboard.html` — vendor accounts (Supabase Auth), listings, pickup verification
- `admin.html` — approve pending vendor accounts; passcode is checked inside the database, never stored in this repo
- `js/supabase-client.js` — Supabase project URL and anon key (safe to be public — access is controlled by RLS, not by hiding this key)
- `js/store.js` — data layer, talks to Supabase

## Run locally
```
cd sufra
python3 -m http.server 8000
```
Open `http://localhost:8000`.

## Supabase setup (one-time)
1. Create a project at supabase.com
2. Run `/supabase/schema.sql` in the SQL Editor
3. Run `/supabase/admin_setup.sql`, replacing the placeholder with your real admin passcode before running the final `insert`
4. In Authentication → Providers → Email, consider disabling "Confirm email" during early testing so vendor signup logs straight in — re-enable it before real launch and add a post-confirmation profile-completion step
5. Copy your Project URL and anon public key into `js/supabase-client.js`

## Deployment (Render)
Static site — no build command needed.
- **Build Command:** (leave blank)
- **Publish Directory:** repo root (wherever `index.html` lives)

## Roadmap
- Vendor verification checks (Commercial Registration, MOPH food license, Municipality trade license) — approval flow exists, checks are manual
- SkipCash integration for online payment (alongside cash-at-pickup)
- Handle email-confirmation-required signups gracefully (currently assumes it's disabled)
