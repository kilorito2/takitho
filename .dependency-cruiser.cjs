/** Architecture rules from CONSTRAINTS.md §3 and SPEC §0. */
const CORE = '^src/lib/(money|phone|orderStatus|hours|pricing)\.ts$'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'The shared core (ADR-0004) may only import its own siblings: no React, Supabase, DOM libs or app code.',
      severity: 'error',
      from: { path: CORE },
      to: { pathNot: CORE },
    },
    // Feature layers (SPEC §0): catalog ← cart ← {menu, home, checkout, orders}; staff (auth, guards) ← {kitchen, admin}.
    {
      name: 'catalog-is-the-bottom-layer',
      comment: 'The catalogue (menu data, helpers, cards) depends on no other feature.',
      severity: 'error',
      from: { path: '^src/features/catalog/' },
      to: { path: '^src/features/', pathNot: '^src/features/catalog/' },
    },
    {
      name: 'staff-is-a-base-layer',
      comment: 'Staff auth and route guards are shared by kitchen and admin and depend on no other feature.',
      severity: 'error',
      from: { path: '^src/features/staff/' },
      to: { path: '^src/features/', pathNot: '^src/features/staff/' },
    },
    {
      name: 'cart-only-needs-catalog',
      severity: 'error',
      from: { path: '^src/features/cart/' },
      to: { path: '^src/features/', pathNot: '^src/features/(cart|catalog)/' },
    },
    {
      name: 'page-features-are-not-imported',
      comment: 'menu/home/checkout/orders/kitchen/admin are leaves: only app/router imports them.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/(menu|home|checkout|orders|kitchen|admin|kit|errors)/',
        pathNot: '^src/features/$1/',
      },
    },
    {
      name: 'kitchen-only-needs-catalog-and-staff',
      severity: 'error',
      from: { path: '^src/features/kitchen/' },
      to: { path: '^src/features/', pathNot: '^src/features/(kitchen|catalog|staff)/' },
    },
    {
      name: 'admin-only-needs-catalog-and-staff',
      severity: 'error',
      from: { path: '^src/features/admin/' },
      to: { path: '^src/features/', pathNot: '^src/features/(admin|catalog|staff)/' },
    },
    {
      name: 'customer-bundle-stays-light',
      comment:
        'The full supabase-js client (Auth, Storage, Functions) is for staff screens only; customers use lib/supabase.ts.',
      severity: 'error',
      from: {
        path: '^src/(components|app/(App|UpdateBanner|pwa)|features/(catalog|cart|menu|home|checkout|orders|errors|kit)/)',
      },
      to: { path: '^src/lib/supabaseStaff\.ts$' },
    },
    {
      name: 'ui-does-not-import-features',
      comment: 'The design system must stay feature-agnostic.',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'lib-does-not-import-ui',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/(features|app|components)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'prod-code-does-not-import-tests',
      severity: 'error',
      from: { path: '^src/', pathNot: '\.test\.(ts|tsx)$|^src/test/' },
      to: { path: '\.test\.(ts|tsx)$|^src/test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
