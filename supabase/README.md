# supabase/

## What happened here (2026-08-26)

`schema.sql` was rewritten from scratch by directly introspecting the
live database (`pg_catalog`, `information_schema`, `pg_policies`) rather
than trusting what was previously committed. The old file described a
database that hadn't existed for weeks — it predated 22 migrations that
were applied straight through the Supabase SQL Editor, never captured
as files here. `admin_setup.sql` was deleted outright: it described a
passcode-based admin system (`admin_settings` table,
`verify_admin_passcode()`, `approve_vendor(target_id, given_passcode)`)
that has been fully replaced live by session-based `is_admin()` checks
— keeping the old file around would have actively misled the next
person who read it.

`schema.sql`'s own header has the full list of live migration names
that still have no corresponding file in `supabase/migrations/`, plus
one small live inconsistency found during the pull (a duplicate RLS
policy on `reservations`) that wasn't silently fixed — see that header
for details.

## Why this happened

Changes were made in two places — the Supabase CLI/migrations
workflow, and the SQL Editor directly — and only one of them leaves a
trail in git. Every SQL Editor change is real and live immediately, but
invisible to anyone reading this repo until someone manually goes and
pulls it, which is what today's edit was.

## How to not repeat this

Prefer the Supabase CLI for anything that changes schema:

```bash
supabase link --project-ref yplswfpbcssfmgeejcpy
supabase migration new <description>
# edit the generated file in supabase/migrations/
supabase db push
```

If a change does get made directly in the SQL Editor (sometimes
unavoidable — quick fix, mobile, etc.), pull it back into a migration
file as soon as possible afterward:

```bash
supabase db pull
```

Either way, the schema in this repo should always be something you
could hand to `supabase db reset` on a fresh project and get the real
app back, not just the pieces someone remembered to write down.
