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

Rules about bundle size, code-splitting, and chunk auditing for Next.js + OneEntry. Complements `.claude/rules/performance.md` (which discusses `dynamic()` for lightboxes/toasts) — this is specifically about the `next.config` config, `optimizePackageImports`, and analysis tools.

## Install and regularly run `@next/bundle-analyzer`

Without chunk visualization, any "bundle optimizations" are random. Install the analyzer right when initializing the project and run it before each release.

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

> ⚠️ **Turbopack (Next 16):** `@next/bundle-analyzer` — a webpack plugin, under the Turbopack build the report **is not generated** ("not compatible with Turbopack builds, no report will be generated"). Options: `next experimental-analyze` (interactive treemap) or classic report via `next build --webpack`. The `next build` table under Turbopack also **does not print First Load JS** — measure sizes manually: gzip chunks `.next/static/chunks/*.js` + `build-manifest.json` (`rootMainFiles` = shared first-load; `app-build-manifest.json` — webpack artifact, not available under Turbopack).

The goal — first-load JS on the route `/` should be **under 200 KB gzipped**. Each `src/app/[locale]/page.tsx`, `src/app/[locale]/shop/page.tsx`, etc. — a separate number in the `next build` report. If anything is higher — open the HTML report of the analyzer and look for the heaviest modules.

## `optimizePackageImports` — for packages with barrel imports

Many packages export through `index.ts` re-exports: one `import { Button } from 'lucide-react'` pulls in **the entire** library. Next.js can automatically rewrite such imports to subpath imports — but only if the package is in `optimizePackageImports`.

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

The `oneentry` SDK uses subpath exports — no need to add it to the list.

How to check if a package is a candidate: open `node_modules/<pkg>/dist/index.{js,mjs}` and look for `export * from './…'` lines. If there are many — the package is barrel-style, add it.

## ⚠️ Never create barrel `index.ts` in your own code

The file `src/components/index.ts`, which re-exports everything, breaks tree-shaking even after `optimizePackageImports`: one `import { ProductCard } from '@/components'` pulls in the entire graph of components into one page chunk.

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

Not every component is worth moving to `dynamic()`. The overhead (a separate HTTP request for the chunk, separate code for hydration) pays off only on heavy modules.

| Candidate | Solution |
| --- | --- |
| Button `Submit` 1 KB | Static import |
| Form validator `zod` 12 KB | Static import (used on every form) |
| Lightbox `yet-another-react-lightbox` 45 KB + CSS | `dynamic({ ssr: false })` |
| Charts `recharts` 90 KB | `dynamic({ ssr: false })` |
| Rich-text editor `tiptap` 120 KB | `dynamic({ ssr: false })` + sticky-mounting |

Specific patterns (sticky-mount, static CSS import inside a lazy module, bypassing Turbopack issues with dynamic `import()` CSS) — see `.claude/rules/performance.md`.

## `productionBrowserSourceMaps: false` — for production builds

Source maps are convenient in dev, but in production they double the size of `.next/static/chunks`. Hosting with a properly configured CDN will still compress them — but extra build time and space on S3 are unnecessary.

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

If you need error monitoring with stack trace decoding (Sentry, Datadog) — set up the upload of source maps to their sourcemap-storage as a separate CI step, not in the public `_next/static`.

## `serverExternalPackages` — for native and CommonJS dependencies

Some server packages (`bcrypt`, `sharp`, native modules) do not work through Turbopack/Webpack bundling — they need to be loaded via `require()` at server runtime. Declare such packages explicitly.

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['bcrypt', 'sharp'],
};
```

The warning `Critical dependency: the request of a dependency is an expression` during `next build` usually indicates a candidate for `serverExternalPackages`.

## ⚠️ OneEntry SDK in the client bundle — the heaviest single module

Importing `defineOneEntry` from any `'use client'` file pulls the entire SDK into the client bundle: measurement on SDK 1.0.156 — **~126 KB gzip (~580 KB raw)**, the largest single chunk of the application. Public data (Pages, Products, Menus, Forms) should be read on the server (server components, server actions, route handlers) — the SDK is not needed on the client for them.

```typescript
// ❌ INCORRECT — SDK in the client chunk for public data
// src/components/AddToCartButton.tsx
'use client';
import { defineOneEntry } from 'oneentry';   // +126 KB gzip in every chunk where there is a button

// ✅ CORRECT — SDK on the server, client calls server action
// src/components/AddToCartButton.tsx
'use client';
import { addToCartAction } from '@/app/actions/cart';

// src/app/actions/cart.ts
'use server';
import { getApi } from '@/lib/oneentry';
```

**The most insidious leak channel — global client store.** If the Redux/RTK Query store (`'use client'`, provider in the root layout) imports a module with `defineOneEntry` (for example, in `queryFn`), the SDK ends up in **the first-load of every page**, even those where user data is not needed. One client `import` in the store → API module chain — and the 200 KB budget is breached. Check the import chain from the root provider.

A conscious exception — **user-auth methods** (`Users`, `Orders`, `Payments` after `reDefine()`): they are called from Client Component (fingerprint, localStorage session), and the SDK is indeed needed on the client for them. In that case: isolate the SDK import in lazy-loaded chunks of account routes (`dynamic()`), not in the common store of the root layout.

Quick check before commit:

```bash
# each match — a conscious decision (user-auth), not a random import
grep -rln "'use client'" --include="*.tsx" --include="*.ts" \
  | xargs grep -l "from 'oneentry'\|@/lib/oneentry"
```

## Checklist before commit

- [ ] `@next/bundle-analyzer` is connected; primary JS on the main route < 200 KB gzipped
- [ ] All used barrel packages (`lucide-react`, `date-fns`, `gsap`, …) in `experimental.optimizePackageImports`
- [ ] No `index.ts` re-exports in own code (`src/components/`, `src/lib/`, `utils/`)
- [ ] `dynamic()` used only for modules ≥ 30 KB or libraries rendered on event
- [ ] `productionBrowserSourceMaps: false` in `next.config`
- [ ] Import `oneentry` / `@/lib/oneentry` in `'use client'` files — only for user-auth methods and not through the root layout store (grep above)

> Related rules: `.claude/rules/performance.md` (lazy splitting of heavy libraries via `dynamic`, sticky-mount patterns), `.claude/rules/performance-gsap.md` (`optimizePackageImports` for GSAP), `.claude/rules/server-actions.md` (where SDK calls should live).
