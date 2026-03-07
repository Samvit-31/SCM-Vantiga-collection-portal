# Repository Structure Map

## Top-Level Layout
- `.planning/`
- Planning artifacts directory. This task writes architecture outputs to `.planning/codebase/`.
- `build/`
- Vite build output directory (configured via `vite.config.mjs`). Generated artifact, not source.
- `public/`
- Static web assets served directly by Vite.
- `src/`
- Primary application source tree (all runtime app logic).
- `supabase/`
- Supabase local project config (`supabase/config.toml`).
- `index.html`
- Main Vite HTML entry.
- `receipt-preview.html`
- Alternate HTML entry for standalone receipt preview mode.
- `package.json`
- Dependency and script manifest (`start`, `build`, `serve`, `start:receipt-preview`).
- `tailwind.config.js`, `postcss.config.js`, `vite.config.mjs`
- Build/styling toolchain configuration.
- `.env`
- Environment variables (includes Supabase URL/key inputs for frontend runtime).

## Source Tree (`src/`)

### Root Runtime Files
- `src/index.jsx`
- Main app bootstrap.
- `src/App.jsx`
- Thin app root that renders route graph.
- `src/Routes.jsx`
- Router declarations and route-level shell composition.
- `src/receipt-preview-main.jsx`
- Alternate bootstrap for standalone receipt preview.
- `src/supabaseClient.js`
- Shared Supabase client initialization and env validation.

### Pages
- `src/pages/login/index.jsx`
- Login form, auth call, role mapping, localStorage session persistence.
- `src/pages/sabha-dashboard/index.jsx`
- Sabha portal coordinator (FY selection, tabs, data loading, realtime refresh).
- `src/pages/sabha-dashboard/components/EntriesList.jsx`
- Sabha entry table, detail drawer, treasurer actions, exports.
- `src/pages/sabha-dashboard/components/SummaryView.jsx`
- Sabha KPI/chart summary with compare mode and export.
- `src/pages/sabha-dashboard/components/RemittancesTab.jsx`
- Sabha remittance submission + ledger + export.
- `src/pages/sabha-dashboard/components/TreasurerRemittancesTab.jsx`
- Alternate treasurer remittance flow component (present in tree, not wired by current sabha dashboard root).
- `src/pages/new-entry-form/index.jsx`
- Multi-section form creating families, family_members, and vantiga_entries.
- `src/pages/receipt-preview/index.jsx`
- Printable receipt page backed by selected entry and Supabase refresh.
- `src/pages/scm-office-dashboard/index.jsx`
- SCM-office-only dashboard root + tab switching.
- `src/pages/scm-office-dashboard/components/SummaryTab.jsx`
- Cross-sabha summary view with filters and charts.
- `src/pages/scm-office-dashboard/components/OverviewTab.jsx`
- KPI snapshot + top-performing sabhas.
- `src/pages/scm-office-dashboard/components/SabhaComparisonTab.jsx`
- Sabha metrics comparison table + export.
- `src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`
- Global entry list with filters and member-wise exports.
- `src/pages/scm-office-dashboard/components/OfficeRemittancesTab.jsx`
- SCM remittance verification/rejection + rollup analytics.
- `src/pages/NotFound.jsx`
- 404 UI component (currently not wired in `src/Routes.jsx`).

### Components
- `src/components/ErrorBoundary.jsx`
- App-level error fallback wrapper used by router shell.
- `src/components/ScrollToTop.jsx`
- Route-change scroll reset.
- `src/components/AppIcon.jsx`, `src/components/AppImage.jsx`
- Generic icon/image wrappers.
- `src/components/ui/Button.jsx`
- Reusable button primitive (`forwardRef`).
- `src/components/ui/Input.jsx`
- Reusable input primitive (`forwardRef`).
- `src/components/ui/Select.jsx`
- Reusable select/multi-select-like control.
- `src/components/ui/Checkbox.jsx`
- Reusable checkbox primitive.
- `src/components/ui/CommonHeader.jsx`
- Shared top navigation + logout control.
- `src/components/ui/UserProfileHeader.jsx`
- Additional profile/logout header component.
- `src/components/ui/AuthenticationGuard.jsx`
- Auth guard component based on localStorage state.
- `src/components/ui/RoleBasedRouter.jsx`
- Role guard/redirect wrapper.

### Data and Utilities
- `src/db/entries.js`
- Shared helper for fetching sabha/FY-scoped entries with nested joins.
- `src/utils/remittanceStatus.jsx`
- Shared status badge renderer for remittance statuses.
- `src/utils/cn.js`
- `clsx` + `tailwind-merge` helper.

### Styling
- `src/styles/tailwind.css`
- Theme tokens (CSS variables), Tailwind layers, base typography.
- `src/styles/index.css`
- Global reset-like overrides.

## Operational Structure Notes
- Role and auth checks are distributed across pages/components, not centralized in a single route guard.
- Supabase queries are mostly colocated with feature components, with limited shared repository-layer abstraction.
- Export utilities (CSV/print-PDF) are duplicated per tab component; no common export utility module currently exists.
- `build/` and large local artifacts (PDFs/CSVs) are present at repository root and should be treated as non-source/support files.
