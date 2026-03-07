# INTEGRATIONS

## Supabase (Primary Backend)

### Client Setup
- Single client initialized in `src/supabaseClient.js` via `createClient` from `@supabase/supabase-js`.
- Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; app throws immediately if missing (`src/supabaseClient.js`).
- Local env file currently points to local Supabase API URL (`.env`), and Supabase local stack is configured in `supabase/config.toml`.

### Auth Integration
- Sign-in: `supabase.auth.signInWithPassword` (`src/pages/login/index.jsx`).
- Password reset: `supabase.auth.resetPasswordForEmail` (`src/pages/login/index.jsx`).
- Session checks: `supabase.auth.getSession` (`src/pages/new-entry-form/index.jsx`).
- Current user checks: `supabase.auth.getUser` in multiple feature pages (`src/pages/sabha-dashboard/index.jsx`, `src/pages/receipt-preview/index.jsx`, `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`).

### Database Tables Referenced by UI
- `user_sabha_roles`: user-role/sabha mapping (`src/pages/login/index.jsx`, `src/pages/new-entry-form/index.jsx`, `src/pages/sabha-dashboard/index.jsx`).
- `sabhas`: sabha metadata (code/name/id) (`src/pages/new-entry-form/index.jsx`, `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`).
- `vantiga_entries`: core entry records used across dashboards and receipt flow (`src/db/entries.js`, multiple dashboard files).
- `families`: payer and opt-in details (`src/pages/new-entry-form/index.jsx`, `src/pages/receipt-preview/index.jsx`).
- `family_members`: member-level donation rows (`src/pages/new-entry-form/index.jsx`, `src/db/entries.js`).
- `sabha_remittances`: remittance submission/review (`src/pages/sabha-dashboard/components/RemittancesTab.jsx`, `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`).
- `profiles`: full-name lookups for display and receipt signatures (`src/pages/sabha-dashboard/index.jsx`, `src/pages/receipt-preview/index.jsx`).

### Realtime Subscriptions
- Postgres change feeds are used to auto-refresh views:
- `vantiga_entries` channels in sabha and SCM dashboards (`src/pages/sabha-dashboard/index.jsx`, `src/pages/sabha-dashboard/components/EntriesList.jsx`, `src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`, `src/pages/scm-office-dashboard/components/OverviewTab.jsx`, `src/pages/scm-office-dashboard/components/SummaryTab.jsx`, `src/pages/scm-office-dashboard/components/SabhaComparisonTab.jsx`).
- `sabha_remittances` channels in treasurer/office remittance tabs (`src/pages/sabha-dashboard/components/RemittancesTab.jsx`, `src/pages/sabha-dashboard/components/TreasurerRemittancesTab.jsx`, `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`).
- Channels are explicitly cleaned up with `supabase.removeChannel(...)` in effect cleanup handlers.

## Browser and Local Integrations
- `localStorage` is heavily used for auth flags and profile/session routing context:
- Keys include `isAuthenticated`, `userProfile`, `sabha_id`, `rememberedEmail`, `rememberMe`, `redirectPath`, `selectedReceiptEntry`.
- Main usage paths: `src/components/ui/AuthenticationGuard.jsx`, `src/components/ui/RoleBasedRouter.jsx`, `src/pages/login/index.jsx`, `src/pages/sabha-dashboard/components/EntriesList.jsx`, `src/pages/receipt-preview/index.jsx`.

## Routing and Hosting Integration
- SPA routing uses React Router in-app (`src/Routes.jsx`).
- Vercel rewrite routes every path to root for client-side routing (`vercel.json`).
- Dedicated receipt preview entrypoint exists (`src/receipt-preview-main.jsx`, `receipt-preview.html`) for isolated print/preview boot.

## External APIs and Services
- No active HTTP integration found beyond Supabase RPC/table APIs.
- `axios` dependency exists but no imports in `src/`.
- Keys for OpenAI/Gemini/Anthropic/Perplexity/Stripe/GA/AdSense exist as placeholders in `.env`, but no consuming code paths were found in `src/`.

## Security and Operational Notes
- Frontend-auth gate currently depends on writable `localStorage` keys in addition to Supabase session checks; this is convenient but should not be treated as a sole security boundary (`src/components/ui/AuthenticationGuard.jsx`).
- `.env` includes service-key placeholders that are unrelated to current runtime behavior; avoid shipping populated secrets in client-visible Vite env files.
- Data writes that span `families`, `family_members`, and `vantiga_entries` are performed in sequential client calls (no server transaction wrapper), so partial-write risk exists on mid-flow failure (`src/pages/new-entry-form/index.jsx`).
