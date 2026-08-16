---
paths:
  - "next.config.ts"
  - "next.config.js"
  - "next.config.mjs"
  - "package.json"
  - "app/**/page.tsx"
  - "src/app/**/page.tsx"
  - "app/**/layout.tsx"
  - "src/app/**/layout.tsx"
---
# Performance: Bundle and Chunks — OneEntry Rules

Rules about bundle size, code-splitting, and chunk auditing for Next.js + OneEntry. Complements `.claude/rules/performance.md` (which covers `dynamic()` for lightboxes/toasts) — this section is specifically about the `next.config` config, `optimizePackageImports`, and analysis tools.

## Install and regularly run `@next/bundle-analyzer`

Without chunk visualization, any "bundle optimizations" are guesswork. Install the analyzer right when initializing the project and run it before each release.

```typescript
// next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  /* … */
};

export default withBundleAnalyzer(nextConfig);
```

```json
// package.json
{
  "scripts": {
    "analyze": "ANALYZE=true next build"
  }
}
```

> ⚠️ **Turbopack (Next 16):** `@next/bundle-analyzer` is a webpack plugin, and under the Turbopack build, the report **is not generated** ("not compatible with Turbopack builds, no report will be generated"). Alternatives: `next experimental-analyze` (interactive treemap) or the classic report via `next build --webpack`. The `next build` table under Turbopack also **does not print First Load JS** — measure sizes manually: gzip chunks `.next/static/chunks/*.js` + `build-manifest.json` (`rootMainFiles` = shared first-load; `app-build-manifest.json` — webpack artifact, not available under Turbopack).

The goal is for first-load JS on the route `/` to be **under 200 KB gzipped**. Each `src/app/[locale]/page.tsx`, `src/app/[locale]/shop/page.tsx`, etc. — should be a separate number in the `next build` report. If anything is higher — open the HTML report of the analyzer and look for the bulkiest modules.

## `optimizePackageImports` — for packages with barrel imports

Many packages export through `index.ts` re-exports: a single `import { Button } from 'lucide-react'` pulls in **the entire** library. Next.js can automatically rewrite such imports to subpath imports — but only if the package is in `optimizePackageImports`.

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',          // icons
      'date-fns',              // date utilities
      '@radix-ui/react-icons',
      'gsap',                  // see performance-gsap.md
      'lodash-es',
      'react-icons',
    ],
  },
};
```

The `oneentry` SDK does not need to be added to the list: starting from v1.0.160, it is provided in ESM with `sideEffects: false`, and heavy dependencies (Zod, `socket.io-client`) are loaded on demand — the bundler tree-shakes it itself (see the SDK section in the client bundle below).

How to check if a package is a candidate: open `node_modules/<pkg>/dist/index.{js,mjs}` and look for `export * from './…'` lines. If there are many — the package is barrel-style, add it.

## ⚠️ Never create barrel `index.ts` in your own code

A file `src/components/index.ts` that re-exports everything breaks tree-shaking even after `optimizePackageImports`: a single `import { ProductCard } from '@/components'` pulls in the entire graph of components into one page chunk.

```typescript
// ❌ INCORRECT — src/components/index.ts
export * from './ProductCard';
export * from './CartPopup';
export * from './FavoritesPopup';
// + 30 more exports

// consumer
import { ProductCard } from '@/components';
// (imports the entire graph — CartPopup, FavoritesPopup, and everything else into the page chunk)

// ✅ CORRECT — direct subpath imports
import ProductCard from '@/components/ProductCard';
import CartPopup from '@/components/popups/CartPopup';
```

The same applies to `src/app/api/index.ts`, `src/lib/index.ts`, `utils/index.ts`. Never create such files — they look neat, but turn every page into a monolithic chunk.

## Threshold for `dynamic()` — 30 KB gzipped or the library is rendered on event

Not every component is worth moving to `dynamic()`. The overhead (a separate HTTP request for the chunk, separate code for hydration) only pays off for heavy modules.

| Candidate | Solution |
| --- | --- |
| Submit Button 1 KB | Static import |
| Form validator `zod` 12 KB | Static import (used on every form) |
| Lightbox `yet-another-react-lightbox` 45 KB + CSS | `dynamic({ ssr: false })` |
| Charts `recharts` 90 KB | `dynamic({ ssr: false })` |
| Rich-text editor `tiptap` 120 KB | `dynamic({ ssr: false })` + sticky mounting |

Specific patterns (sticky-mount, static CSS import inside a lazy module, bypassing Turbopack issues with dynamic `import()` CSS) — see `.claude/rules/performance.md`.

## `productionBrowserSourceMaps: false` — for production builds

Source maps are convenient in dev, but in production, they double the size of `.next/static/chunks`. Hosting with a properly configured CDN will still compress them — but extra build time and space on S3 are unnecessary.

```typescript
// ❌ INCORRECT — source maps are uploaded to public CDN
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
};

// ✅ CORRECT — source maps only in dev
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
};
```

If error monitoring with stack trace decoding (Sentry, Datadog) is needed — configure the upload of source maps to their sourcemap-storage as a separate CI step, not in the public `_next/static`.

## `serverExternalPackages` — for native and CommonJS dependencies

Some server packages (`bcrypt`, `sharp`, native modules) do not work through Turbopack/Webpack bundling — they need to be loaded via `require()` at server runtime. Declare such packages explicitly.

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['bcrypt', 'sharp'],
};
```

The warning `Critical dependency: the request of a dependency is an expression` during `next build` usually indicates a candidate for `serverExternalPackages`.

## ⚠️ OneEntry SDK in the client bundle

Importing `defineOneEntry` from a `'use client'` file pulls the SDK into the client bundle. How much exactly depends on the SDK version:

| SDK | What is actually loaded |
| --- | --- |
| ≤ 1.0.158 | **~110 KB gzip (536 KB min)** — Zod and validation schemas were always loaded statically, `socket.io-client` too |
| ≥ 1.0.160 | **~9.7 KB gzip (43 KB min)** for a project without validation and without socket: schemas and Zod are loaded on demand (the first response that is actually validated), `socket.io-client` — on the first `WS.connect()` |

Conditions under which the bottom line works:

- **The bundler performs code-splitting** — default in webpack, Vite, Rollup, and Next.js. A build forcibly glued into one file compresses only to ~427 KB min: Zod is inlined, although not executed.
- **`validation.enabled` is turned off** (default `false`). With validation enabled, Zod and schemas come into the bundle — this is the price of diagnostics, keep it for the dev environment, not for production (`.claude/rules/troubleshooting.md`).
- **The `WS` module is not used.** `WS.connect()` remains synchronous and returns `Socket`, but the `socket.io-client` (~41 KB) is loaded on the first call; everything done with the object (`on`, `emit`, `disconnect`) is played on the real socket at the moment of its creation — events are not lost. The only difference is: methods that must **return** something (`listeners()`) and nested objects (`socket.io`) are only available after the chunk is loaded.

Starting from v1.0.160, the package is also provided in ESM (`module: esm/index.js`, `sideEffects: false`), so unused SDK modules are tree-shaken; the ESM build is loaded by Node itself, not just the bundler. The `exports` map routes `oneentry` and `oneentry/types` based on conditions (`require` → CJS, `import` → ESM), old deep imports (`oneentry/dist/<module>/<module>Interfaces`, with and without `.js`) are covered by explicit patterns and work as before.

> Do not install version 1.0.159: the tarball is built from an outdated directory and `require('oneentry')` fails in it (`Cannot find module '../base/lazySchema'`) — fixed in 1.0.160 with the same set of functions. Details — `.claude/rules/typescript.md`.

The rule remains unchanged: public data (Pages, Products, Menus, Forms) should be read on the server (server components, server actions, route handlers) — the SDK is not needed on the client at all.

```typescript
// ❌ INCORRECT — SDK in the client chunk for public data
// src/components/AddToCartButton.tsx
'use client';
import { defineOneEntry } from 'oneentry';   // unnecessary weight in every chunk where there is a button

// ✅ CORRECT — SDK on the server, client calls server action
// src/components/AddToCartButton.tsx
'use client';
import { addToCartAction } from '@/app/actions/cart';

// src/app/actions/cart.ts
'use server';
import { getApi } from '@/lib/oneentry';
```

**The most insidious leakage channel is the global client store.** If the Redux/RTK Query store (`'use client'`, provider in the root layout) imports a module with `defineOneEntry` (for example, in `queryFn`), the SDK ends up in **the first-load of every page**, even those where user data is not needed. A single client `import` in the store → API module chain — and the 200 KB budget is breached. Check the import chain from the root provider.

A conscious exception is **user-auth methods** (`Users`, `Orders`, `Payments` after `reDefine()`): they are called from Client Component (fingerprint, localStorage session), and the SDK is indeed needed on the client for them. In that case: isolate the SDK import in lazy-loaded chunks of account routes (`dynamic()`), not in the common store of the root layout.

Quick check before commit:

```bash
# each match is a conscious decision (user-auth), not an accidental import
grep -rln "'use client'" --include="*.tsx" --include="*.ts" \
  | xargs grep -l "from 'oneentry'\|@/lib/oneentry"
```

## Checklist before commit

- [ ] `@next/bundle-analyzer` is connected; primary JS on the main route < 200 KB gzipped
- [ ] All used barrel packages (`lucide-react`, `date-fns`, `gsap`, …) are in `experimental.optimizePackageImports`
- [ ] No `index.ts` re-exports in own code (`src/components/`, `src/lib/`, `utils/`)
- [ ] `dynamic()` is used only for modules ≥ 30 KB or libraries rendered on event
- [ ] `productionBrowserSourceMaps: false` in `next.config`
- [ ] Importing `oneentry` / `@/lib/oneentry` in `'use client'` files — only for user-auth methods and not through the root layout store (grep above)

> Related rules: `.claude/rules/performance.md` (lazy splitting of heavy libraries via `dynamic`, sticky-mount patterns), `.claude/rules/performance-gsap.md` (`optimizePackageImports` for GSAP), `.claude/rules/server-actions.md` (where SDK calls should live).
