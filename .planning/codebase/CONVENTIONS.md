# CONVENTIONS

## Scope
This document captures **observed** coding conventions in this repository (not aspirational style rules).

## Stack-Level Conventions
- Runtime: React 18 + Vite (`/package.json`, `/vite.config.mjs`).
- Language: JavaScript/JSX only in `src/` (no TypeScript source files).
- Module style: ES modules (`import`/`export`) across app code (`/src/**/*.jsx`, `/src/**/*.js`).
- Path aliasing: `baseUrl: "./src"` allows absolute-style imports like `components/...` (`/jsconfig.json`, `/src/Routes.jsx`).

## File and Folder Conventions
- Pages are folder-based with `index.jsx` entry points:
  - `/src/pages/login/index.jsx`
  - `/src/pages/sabha-dashboard/index.jsx`
  - `/src/pages/scm-office-dashboard/index.jsx`
- Shared UI primitives live in `/src/components/ui/` (for example `/src/components/ui/Button.jsx`, `/src/components/ui/Input.jsx`, `/src/components/ui/Select.jsx`).
- Shared business/data helpers live in utility modules (`/src/db/entries.js`, `/src/utils/remittanceStatus.jsx`, `/src/utils/cn.js`).

## React and Component Conventions
- Function components are the default pattern (`/src/pages/login/index.jsx`, `/src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`).
- `React.forwardRef` is used for reusable form/UI primitives (`/src/components/ui/Button.jsx`, `/src/components/ui/Input.jsx`, `/src/components/ui/Select.jsx`).
- Class component usage exists for error boundaries only (`/src/components/ErrorBoundary.jsx`).
- Defensive optional chaining (`?.`) is used heavily for async/remote data safety across UI rendering (`/src/pages/sabha-dashboard/components/EntriesList.jsx`).

## State and Data Conventions
- Local state: React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) are primary state pattern.
- Persistence/auth gating: `localStorage` keys are treated as app contract:
  - `isAuthenticated`, `userProfile`, `redirectPath`, `sabha_id`, `rememberedEmail`, `rememberMe`
  - Seen in `/src/components/ui/AuthenticationGuard.jsx`, `/src/pages/login/index.jsx`.
- Backend access: direct Supabase client usage from UI and data modules (`/src/supabaseClient.js`, `/src/db/entries.js`, `/src/pages/**/components/*.jsx`).

## Routing Conventions
- Central route table in `/src/Routes.jsx`.
- Fallback route redirects unknown paths to `/login`.
- Role-aware and auth-aware wrappers exist as reusable components:
  - `/src/components/ui/AuthenticationGuard.jsx`
  - `/src/components/ui/RoleBasedRouter.jsx`

## Styling Conventions
- Tailwind-first styling with semantic color tokens wired to CSS variables:
  - token source: `/src/styles/tailwind.css`
  - theme mapping: `/tailwind.config.js`
- `cn()` helper (`clsx` + `tailwind-merge`) is used for conditional class composition (`/src/utils/cn.js`).
- Some inline style HTML templates for print/export workflows are embedded in component logic (`/src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`, `/src/pages/sabha-dashboard/components/EntriesList.jsx`).

## Naming Conventions
- Component files and component identifiers use PascalCase (for example `AllEntriesTab.jsx`, `ErrorBoundary.jsx`).
- Hooks/helpers use camelCase (`loadEntries`, `fetchUserProfile`, `formatCurrency`).
- Route segment names are kebab-case (`/scm-office-dashboard`, `/new-entry-form`) in `/src/Routes.jsx`.

## Error Handling Conventions
- Async handlers typically use `try/catch/finally` with loading/error state (`/src/pages/login/index.jsx`, `/src/pages/scm-office-dashboard/components/AllEntriesTab.jsx`).
- Console logging is used directly for diagnostics (`console.error(...)`) in page/components and data modules.
- Missing required env vars fail fast at startup in `/src/supabaseClient.js`.

## Tooling/Quality Guardrails (Current State)
- No repository ESLint config file (`.eslintrc*` / `eslint.config.*`) found.
- `eslintConfig` exists in `package.json`, but there is no `lint` script in `/package.json`.
- No formatter config (`.prettierrc*`) found.
- No pre-commit hooks config found.

## Practical Implications
- Team should treat existing conventions as "best effort" rather than "enforced" because lint/format/test checks are not wired into scripts/CI.
- Highest-value existing patterns to preserve in edits:
  - Safe remote-data access via optional chaining.
  - Tailwind token usage (`bg-background`, `text-foreground`, semantic variants) over hardcoded colors.
  - Shared helpers (`/src/db/entries.js`, `/src/utils/cn.js`) over duplicated inline logic.
