# Twesk account sync

The static app stays on GitHub Pages. Supabase Auth supplies passwordless email
sign-in, and Postgres keeps one private JSON adventure per account.

## Deployment

1. Create a Supabase project. Apply `migrations/202610100001_private_sync.sql`.
2. Set the Auth Site URL and allowed Redirect URL to
   `https://cardamomo-app.github.io/Twesk/` (including the trailing slash).
3. Put the project URL and **publishable** API key in `sync-config.js`.
   Those values are public by design. Never use a secret/service-role key.
4. Build with `npm run build:pages`, run `npm test`, and deploy `_site`.

The deployed project is `mzahcxkesrusdpwmfnuz`, region `eu-west-1`. The migration
and public browser configuration have been applied. Auth URL configuration was
completed by the project owner on 2026-10-10.

Supabase's default email sender only sends to project team addresses, with tight
rate limits. This is sufficient for the owner's personal use. Before inviting
other users, configure custom SMTP under Authentication → Emails. See
https://supabase.com/docs/guides/auth/auth-smtp .

Twesk uses sign-in links only. This Free project uses Supabase’s default SMTP service, which locks template customization for projects created after
2026-06-03. Adding email codes would first require custom SMTP or a paid
Supabase plan, followed by templates containing `{{ .Token }}` and restoring
the in-app code form. See
https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier .
Keep expiration/rate limits in place.

## Data and conflict handling

- `twesk_saves.user_id` references Auth; RLS permits each account to read only its
  own row. Anonymous clients cannot read or write saves.
- `twesk_save(payload, expected_version)` is the sole write path. Its definer
  privileges are intentional: clients have no direct INSERT/UPDATE grants. It
  derives the owner from `auth.uid()`, accepts no other user's ID, pins the search
  path, checks basic payload size/version, and serializes writes per account.
  The security advisor's authenticated-definer warning is expected for this RPC:
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Cloud versions are separate from the existing local revision counter.
  The browser compares SHA-256 fingerprints of canonically ordered save objects.
  Device theme, sound, motion, backup reminders, and local revision are excluded.
  Timezone, tasks, habits, Vault, avatar, equipment, history and rewards are shared.
- Every successful local save schedules sync. Visible clients check every 20
  seconds and on focus/reconnect. Edits and combat finish before remote progress
  is applied. Offline changes stay in the browser without needing a session
  refresh to keep playing.
- Divergent initial or offline saves require an explicit choice. No merging or
  reward duplication. The displaced adventure becomes the existing recovery copy
  in Settings; both copies can also be downloaded before choosing. Only one
  recovery copy is retained, so export important older copies first.
- Account switching requires a choice before reusing another account's local
  adventure. Signing out keeps progress on the device. Use personal browser
  profiles for private journals; local device storage is not encrypted.
- Sessions use a separate `twesk.auth.v1` key. Save exports never include credentials.
  Sync bookkeeping lives under `twesk.sync.v1` and contains only account IDs,
  hashes and cloud versions.
- The standalone HTML remains a local/offline edition; use the online app for
  accounts and import a backup to move an existing standalone adventure.

## Verification

`tests/sync.test.js` exercises both-device edits, server races, edits during
upload, retry after lost acknowledgement, account switching, invalid remote
payloads, protected writes, and quota failures. Live SQL checks verified RLS,
anonymous denial, direct-write denial and compare-and-swap versions inside a
rolled-back transaction, leaving no test accounts or adventures behind.
