# Architecture Map

## System Overview
- This repository is a Vite + React single-page application (`package.json`, `vite.config.mjs`) that implements a role-based digital Vantiga collection workflow.
- Runtime is frontend-only; business data and authentication are provided by Supabase (`src/supabaseClient.js`).
- Primary runtime entry is `src/index.jsx` -> `src/App.jsx` -> `src/Routes.jsx`.
- A secondary standalone receipt-preview entry exists at `src/receipt-preview-main.jsx` for `receipt-preview.html` (`npm run start:receipt-preview`).

## Runtime Layers

### 1) App Shell and Navigation
- Router composition is centralized in `src/Routes.jsx` (login, sabha dashboard, SCM office dashboard, new entry, receipt preview).
- Cross-route UX concerns:
- `src/components/ErrorBoundary.jsx`: catches render errors at app-shell level.
- `src/components/ScrollToTop.jsx`: resets scroll on pathname changes.
- `src/components/ui/CommonHeader.jsx`: global top bar + localStorage logout.

### 2) Session and Role Model
- Authentication is done via Supabase password login in `src/pages/login/index.jsx` (`supabase.auth.signInWithPassword`).
- App session gate uses localStorage flags:
- `isAuthenticated`
- `userProfile` (role, sabha context, ids)
- Optional `redirectPath`, `sabha_id`, remember-me keys.
- Role routing rules are duplicated in multiple locations:
- `src/pages/login/index.jsx` (`getDefaultRouteForRole`)
- `src/components/ui/RoleBasedRouter.jsx` (currently not used in `src/Routes.jsx`)
- `src/pages/scm-office-dashboard/index.jsx` and `src/pages/sabha-dashboard/index.jsx` perform in-page role checks.

### 3) Data Access Layer
- Single Supabase client: `src/supabaseClient.js` (requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
- Thin shared query module: `src/db/entries.js` (`fetchEntriesForSabhaFY`, helpers).
- Most data access remains feature-local within page components/tabs.

Tables actively queried/updated from UI:
- `vantiga_entries`
- `families`
- `family_members`
- `user_sabha_roles`
- `profiles`
- `sabhas`
- `sabha_remittances`

### 4) Feature Modules

#### Login and Identity Resolution
- `src/pages/login/index.jsx`
- Signs in users.
- Fetches role mapping from `user_sabha_roles`.
- Persists local session state and redirects based on role.

#### Sabha Dashboard (Pratinidhi / Treasurer)
- Root orchestrator: `src/pages/sabha-dashboard/index.jsx`
- Responsibilities:
- Resolve sabha context (`user_sabha_roles`).
- Fetch FY-scoped entries (`vantiga_entries` + nested `families` + `family_members`).
- Subscribe to realtime changes via Supabase channels.
- Route to tab modules and coordinate export actions via forwarded refs.

Tab modules:
- `src/pages/sabha-dashboard/components/EntriesList.jsx`
- Entry listing/filtering.
- Acknowledge/reject actions (updates `vantiga_entries`).
- Member-wise CSV/PDF export.
- Receipt handoff via localStorage key `selectedReceiptEntry`.
- `src/pages/sabha-dashboard/components/SummaryView.jsx`
- KPI + charts (Recharts) across selected FYs.
- CSV/PDF summary export.
- `src/pages/sabha-dashboard/components/RemittancesTab.jsx`
- Sabha remittance submission (`sabha_remittances`).
- Remittance ledger + KPI calculations (retained amount).

#### New Entry Submission
- `src/pages/new-entry-form/index.jsx`
- Creates family + family_members + entry records in sequence.
- Duplicate warning logic checks likely duplicates over last 14 days.
- Cash entries generate receipt numbers client-side.

#### Receipt Rendering
- `src/pages/receipt-preview/index.jsx`
- Loads selected entry from localStorage; refreshes with DB pull when entry id exists.
- Resolves pratinidhi and treasurer names from `profiles`.
- Print-focused HTML/CSS layout embedded in component.

#### SCM Office Dashboard
- Root orchestrator: `src/pages/scm-office-dashboard/index.jsx`
- Restricted to `scm_office` role.
- Owns FY selector + tab switching.

Tab modules:
- `src/pages/scm-office-dashboard/components/SummaryTab.jsx`
- Cross-sabha summary with multi-sabha and status filters.
- `src/pages/scm-office-dashboard/components/OverviewTab.jsx`
- High-level KPI cards and top sabhas.
- `src/pages/scm-office-dashboard/components/SabhaComparisonTab.jsx`
- Sabha-wise sortable comparison table + export.
- `src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`
- Global entry list with filters and member-wise export.
- `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`
- Remittance verification/rejection workflow (updates `sabha_remittances`).
- Sabha rollup and retained-funds view.

## Cross-Cutting Patterns

### Realtime Update Pattern
- Multiple modules subscribe to Supabase postgres_changes channels and refetch relevant lists:
- `src/pages/sabha-dashboard/index.jsx`
- `src/pages/sabha-dashboard/components/EntriesList.jsx`
- `src/pages/sabha-dashboard/components/RemittancesTab.jsx`
- `src/pages/scm-office-dashboard/components/*.jsx` (all core tabs)

### Export Pattern
- CSV exports are generated via Blob/object URL in-browser.
- PDF exports are implemented as print windows with dynamically injected HTML.
- Parent-child export coordination uses `forwardRef` + `useImperativeHandle` in sabha dashboard tabs.

### Styling System
- Tailwind with CSS variable-driven theme:
- `tailwind.config.js`
- `src/styles/tailwind.css`
- Utility UI components in `src/components/ui/*` (Button/Input/Select/Checkbox).

## Practical Architecture Notes
- Access control is mostly UI-level; routes are not wrapped globally with `AuthenticationGuard` or `RoleBasedRouter` in `src/Routes.jsx`.
- Session state is split between Supabase auth session and localStorage mirrors; most pages trust localStorage first, then backfill from Supabase where needed.
- Database writes in `src/pages/new-entry-form/index.jsx` are multi-step client transactions (family -> members -> entry), so partial-write risk exists if a mid-step fails.
- Domain logic is heavily component-centric; `src/db/entries.js` is the only shared query abstraction currently in active use.
