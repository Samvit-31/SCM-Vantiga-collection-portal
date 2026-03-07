# STACK

## Runtime and Build
- Node + npm project (`package.json`).
- Vite app with React plugin and `vite-tsconfig-paths` (`vite.config.mjs`).
- Build output is customized to `build/` instead of default `dist/` (`vite.config.mjs`).
- Dev server binds `0.0.0.0:4028` with strict port and allowlist (`vite.config.mjs`).
- SPA rewrite config for Vercel (`vercel.json`).

## Frontend Framework
- React 18 (`package.json`, `src/index.jsx`, `src/App.jsx`).
- React Router v6 route tree defined manually with `BrowserRouter` + `Route` (`src/Routes.jsx`, `src/receipt-preview-main.jsx`).
- No TypeScript source files in `src/` (JS/JSX only).

## Styling and UI
- Tailwind CSS 3 with PostCSS pipeline (`tailwind.config.js`, `postcss.config.js`).
- Tailwind plugins in use: `@tailwindcss/forms`, `tailwindcss-animate` (`tailwind.config.js`).
- Global style entrypoints: `src/styles/tailwind.css`, `src/styles/index.css`, imported in `src/index.jsx`.
- Component primitives are custom local UI components (`src/components/ui/*.jsx`) with `clsx`/`tailwind-merge` utility helper (`src/utils/cn.js`).
- `@radix-ui/react-slot` and `class-variance-authority` are present for composable UI primitives (`package.json`, `src/components/ui/Button.jsx`).

## Data and Backend Stack
- Supabase JS v2 client is the primary backend integration (`src/supabaseClient.js`, `package.json`).
- Environment-based Supabase client bootstrap using `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (`src/supabaseClient.js`, `.env`).
- Local Supabase CLI config exists for local stack/dev (`supabase/config.toml`, `package.json` devDependency `supabase`).

## Data Visualization and Reporting
- Recharts is actively used for dashboards (`src/pages/scm-office-dashboard/components/SummaryTab.jsx`, `src/pages/sabha-dashboard/components/SummaryView.jsx`).
- Print-focused receipt rendering is implemented in-app (`src/pages/receipt-preview/index.jsx`, `receipt-preview.html`).

## State and Auth Pattern
- Global Redux store is not wired in current source tree (Redux deps exist in `package.json`, but no store/provider files under `src/`).
- Authentication and role/session gating rely on browser `localStorage` + Supabase auth checks (`src/components/ui/AuthenticationGuard.jsx`, `src/components/ui/RoleBasedRouter.jsx`, `src/pages/login/index.jsx`).

## Testing and Quality Tooling
- Testing libraries are present as runtime deps (`@testing-library/*`, `@testing-library/jest-dom` in `package.json`).
- No test files discovered under `src/` and no explicit `test` script in `package.json`.
- ESLint config block exists in `package.json` but no standalone ESLint config file in repo root.

## Pathing and Module Resolution
- Import aliasing is baseUrl-driven (`jsconfig.json` sets `baseUrl: ./src`).
- Many imports use absolute-from-src style (example: `import ScrollToTop from "components/ScrollToTop"` in `src/Routes.jsx`).

## Observed Dependency Drift
- README claims broader stack usage (Redux Toolkit, D3, Framer Motion, React Hook Form, Jest), but current code evidence is partial.
- Likely-unused libs (present in deps, no usage found in `src/` via search): `axios`, `d3`, `framer-motion`, `react-helmet`, `react-hook-form`, `redux`, `@reduxjs/toolkit` (`package.json`, `README.md`, source grep results).
