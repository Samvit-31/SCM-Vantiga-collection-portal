# CONCERNS

## Scope
This document maps practical risks observed in the current repository state, focused on security, correctness, operational resilience, and delivery velocity.

## High Risk Concerns

### 1) Client-only auth and role gating can be bypassed
- Evidence:
  - `src/components/ui/AuthenticationGuard.jsx`
  - `src/components/ui/RoleBasedRouter.jsx`
  - `src/pages/login/index.jsx`
  - `src/Routes.jsx`
- Details:
  - Auth state is trusted from `localStorage` (`isAuthenticated`, `userProfile`) instead of authoritative session checks on route entry.
  - Route table in `src/Routes.jsx` exposes dashboard routes directly and does not apply `AuthenticationGuard` or `RoleBasedRouter` wrappers at the route level.
- Impact:
  - A user can manipulate browser storage and navigate UI as another role unless backend RLS fully prevents all sensitive reads/writes.
- Practical mitigation:
  - Enforce route protection centrally in `src/Routes.jsx`.
  - Use `supabase.auth.getSession()` or `onAuthStateChange` as source of truth, then derive role from server mapping.

### 2) Database privileges in dump are dangerously broad
- Evidence:
  - `supabase_local_dump.sql` (`GRANT ALL` to `anon` and `authenticated` on core tables/functions)
- Details:
  - Dump includes broad grants on `families`, `family_members`, `profiles`, `sabhas`, `user_sabha_roles`, `vantiga_entries` and function `block_entry_edits`.
  - No visible RLS policy declarations in the dump.
- Impact:
  - If these permissions reflect deployed state, unauthorized users can read/modify sensitive data across sabhas.
- Practical mitigation:
  - Move to least privilege grants.
  - Enable and verify RLS policies for all business tables.
  - Add migration-based permission tests in CI.

### 3) Committed `.env` contains API key placeholders and anon key material
- Evidence:
  - `.env`
- Details:
  - File is committed with Supabase anon key and multiple third-party key variables.
  - `VITE_*` values are client-exposed by design, but keeping a committed `.env` encourages unsafe secret handling patterns.
- Impact:
  - Higher chance of real credential leakage and misconfiguration across environments.
- Practical mitigation:
  - Remove tracked `.env`, keep `.env.example` only.
  - Rotate any previously used real keys.
  - Add pre-commit checks for secrets and env hygiene.

### 4) `.gitignore` has unresolved merge conflict markers
- Evidence:
  - `.gitignore`
- Details:
  - Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) remain in file.
- Impact:
  - Ignore rules are unreliable; sensitive or noisy files may be accidentally committed.
- Practical mitigation:
  - Resolve conflict and normalize ignore rules.
  - Add CI lint step to fail on conflict markers.

### 5) Multi-step entry submission is non-transactional (partial write risk)
- Evidence:
  - `src/pages/new-entry-form/index.jsx`
- Details:
  - Submit flow performs sequential inserts: `families` -> `family_members` -> `vantiga_entries`.
  - Code comments already acknowledge partial data risk when step 2 or 3 fails.
- Impact:
  - Orphaned `families` or `family_members`, inconsistent business records, manual cleanup overhead.
- Practical mitigation:
  - Replace with one RPC/stored procedure transaction.
  - Return structured failure reasons and idempotency key support.

## Medium Risk Concerns

### 6) Receipt number generation is race-prone
- Evidence:
  - `src/pages/new-entry-form/index.jsx` (`generateReceiptNumberForCashEntry`)
  - `src/pages/sabha-dashboard/components/EntriesList.jsx` (`generateReceiptNumber`)
- Details:
  - Receipt numbers are generated client-side from current count/list length.
  - Concurrent submissions or parallel acknowledgements can generate duplicate receipt numbers.
- Impact:
  - Duplicate receipts and reconciliation errors.
- Practical mitigation:
  - Generate receipt number server-side with unique constraint and retry logic.

### 7) Hard-coded financial years and current FY create rollover failure
- Evidence:
  - `src/pages/new-entry-form/index.jsx` (`const CURRENT_FY = '2025-26'`)
  - `src/pages/sabha-dashboard/index.jsx` (fixed FY options)
  - `src/pages/scm-office-dashboard/index.jsx` (fixed FY options)
- Details:
  - FY values are hard-coded in multiple screens.
- Impact:
  - New fiscal year operations fail or require urgent manual code patch/redeploy.
- Practical mitigation:
  - Centralize FY derivation and configurable fiscal calendar.
  - Source selectable FYs from DB/config.

### 8) Large monolithic UI components increase regression risk
- Evidence:
  - `src/pages/sabha-dashboard/components/EntriesList.jsx` (very large, mixed data + UI + export + modal logic)
  - `src/pages/new-entry-form/index.jsx` (large, mixed validation + data access + UI)
- Details:
  - Single files own many responsibilities with dense state and side effects.
- Impact:
  - Higher chance of bugs during changes; harder onboarding and code review.
- Practical mitigation:
  - Extract domain hooks/services (query, mutation, export, duplicate detection).
  - Split presentational and stateful containers.

### 9) Realtime subscriptions can cause repeated heavy refetching
- Evidence:
  - `src/pages/sabha-dashboard/index.jsx`
  - `src/pages/sabha-dashboard/components/EntriesList.jsx`
  - `src/pages/scm-office-dashboard/components/*` (multiple channel listeners)
- Details:
  - Many listeners trigger full refetch on each relevant event.
  - No debounce/coalescing strategy is visible.
- Impact:
  - Spiky API load and UI latency under write-heavy periods.
- Practical mitigation:
  - Coalesce events, do incremental updates where possible, and instrument query volume.

### 10) Build exposes source maps in production by default
- Evidence:
  - `package.json` (`"build": "vite build --sourcemap"`)
- Details:
  - Sourcemaps are always generated in build script.
- Impact:
  - Easier reverse engineering of frontend logic and internal implementation details.
- Practical mitigation:
  - Restrict sourcemaps to non-production or private error-monitoring uploads.

## Low Risk But Important Concerns

### 11) Test strategy is not implemented in repo
- Evidence:
  - `package.json` contains testing libraries but no test scripts.
  - No `*.test.*` or `*.spec.*` files under `src/`.
- Details:
  - Critical paths (login, role routing, insert/ack/reject flows, duplicate detection) are untested.
- Impact:
  - High manual QA dependency and fragile releases.
- Practical mitigation:
  - Add smoke tests for auth/routing and integration tests for core Supabase flows.

### 12) Logging and UX consistency issues in error paths
- Evidence:
  - `src/components/ErrorBoundary.jsx`
  - `src/pages/login/index.jsx`
  - `src/pages/new-entry-form/index.jsx`
- Details:
  - Mixed `alert`, `toast`, and console-only errors; no centralized telemetry pipeline visible.
- Impact:
  - Harder production incident diagnosis and inconsistent user feedback.
- Practical mitigation:
  - Standardize error handling and route exceptions to one telemetry sink.

## Cross-Cutting Theme
The largest systemic risk is trust boundary placement: UI-level checks and client-generated business identifiers are doing work that should be guaranteed by database policies and server-side transaction logic.

## Suggested First Fix Order
1. Resolve access control and DB privilege model (`supabase_local_dump.sql`, route guards).
2. Move entry creation and receipt generation to transactional server-side logic.
3. Remove committed `.env`, fix `.gitignore`, and add guardrails in CI.
4. Add minimal automated tests for auth, role routing, and submission/acknowledgement paths.
