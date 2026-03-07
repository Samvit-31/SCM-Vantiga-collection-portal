# TESTING

## Current Testing Posture
- Automated tests are **not currently wired** in this repository.
- No test files detected under `src/` (no `*.test.*` / `*.spec.*`).
- No test runner config files detected (`jest*`, `vitest*`, `playwright*`, `cypress*`).
- `package.json` has no `test` script (`/package.json`).

## Existing Test-Related Dependencies
`/package.json` includes:
- `@testing-library/jest-dom`
- `@testing-library/react`
- `@testing-library/user-event`

These dependencies indicate intent to use React Testing Library, but they are currently unused without runner/setup scripts.

## What Is Being Relied On Today
- Manual QA via local dev server (`npm start`) and production build (`npm run build`) from `/package.json`.
- Runtime fail-fast on missing env vars for Supabase setup (`/src/supabaseClient.js`).
- In-app error fallback through error boundary (`/src/components/ErrorBoundary.jsx`).

## High-Risk Areas With No Automated Coverage
- Authentication and redirect logic:
  - `/src/pages/login/index.jsx`
  - `/src/components/ui/AuthenticationGuard.jsx`
  - `/src/components/ui/RoleBasedRouter.jsx`
- Data mapping and aggregation logic:
  - `/src/db/entries.js`
  - `/src/pages/sabha-dashboard/components/EntriesList.jsx`
  - `/src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`
- Export/formatting functions (CSV/PDF generation paths) embedded in large UI components:
  - `/src/pages/sabha-dashboard/components/EntriesList.jsx`
  - `/src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`

## Practical Baseline Test Plan (When Enabling Tests)
1. Add scripts in `/package.json`:
   - `test`: unit/component suite
   - `test:watch`: local TDD loop
   - `test:coverage`: CI-friendly coverage run
2. Start with pure-function unit tests for stable ROI:
   - `/src/db/entries.js` (`getPrimaryMember`, `getTotalAmount`)
   - CSV escaping helpers extracted from component files.
3. Add component tests for critical auth/routing behavior:
   - `/src/pages/login/index.jsx`
   - `/src/components/ui/AuthenticationGuard.jsx`
   - `/src/components/ui/RoleBasedRouter.jsx`
4. Add integration tests for entry workflows:
   - load/filter/export behaviors in dashboard tabs.
   - Supabase calls mocked at boundary (`/src/supabaseClient.js` consumer modules).

## Suggested First Test Cases
- `getTotalAmount` returns `0` for missing/empty members and sums numeric/string amounts correctly (`/src/db/entries.js`).
- `AuthenticationGuard` redirects to `/login` when `isAuthenticated` is missing and preserves `redirectPath` (`/src/components/ui/AuthenticationGuard.jsx`).
- `RoleBasedRouter` redirects unauthorized roles to role default route (`/src/components/ui/RoleBasedRouter.jsx`).
- Login form validation catches empty fields, invalid email, and short password (`/src/pages/login/index.jsx`).

## CI and Quality Gate Status
- No `.github/workflows/` CI pipeline found.
- No automated test, lint, or formatting gate currently blocks regressions.

## Manual Regression Checklist (Current Reality)
Until automated tests exist, validate at least:
- Login success/failure flows and role-based landing page.
- Sabha and SCM dashboard data loading for selected FY.
- Entry filtering and status transitions.
- CSV/PDF export output for non-empty and empty datasets.
- Missing env var behavior on app start (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
