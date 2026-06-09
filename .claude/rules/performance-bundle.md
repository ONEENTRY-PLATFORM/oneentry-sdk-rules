<!-- META
type: rules
fileName: performance-bundle.md
rulePaths: ["next.config.ts", "next.config.js", "next.config.mjs", "package.json", "app/**/page.tsx", "app/**/layout.tsx"]
-->

# Performance: Bundle and Chunks — OneEntry Rules

Rules about bundle size, code-splitting, and chunk auditing for Next.js + OneEntry. Complements `.claude/rules/performance.md` (which covers `dynamic()` for lightboxes/toasts) — this is specifically about the `next.config` config, `optimizePackageImports`, and analysis tools.

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

The goal — first-load JS on the route `/` should be **under 200 KB gzipped**. Each `app/[locale]/page.tsx`, `app/[locale]/shop/page.tsx`, etc. — a separate number in the `next build` report. If anything is higher — open the HTML report of the analyzer and look for the bulkiest modules.

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

`@oneentry/web-sdk` uses subpath exports — no need to add it to the list.

How to check if a package is a candidate: open `node_modules/<pkg>/dist/index.{js,mjs}` and look for `export * from './…'` lines. If there are many — the package is barrel-style, add it.

## ⚠️ Never create barrel `index.ts` in your own code

A file `components/index.ts` that re-exports everything breaks tree-shaking even after `optimizePackageImports`: one `import { ProductCard } from '@/components'` pulls in the entire graph of components into one page chunk.

```typescript
// ❌ INCORRECT — components/index.ts
export * from './ProductCard';
export * from './CartPopup';
export * from './FavoritesPopup';
// + another 30 exports

// consumer
import { ProductCard } from '@/components';
// (imports the entire graph — CartPopup, FavoritesPopup, and everything else into the page chunk)

// ✅ CORRECT — direct subpath imports
import ProductCard from '@/components/ProductCard';
import CartPopup from '@/components/popups/CartPopup';
```

The same applies to `app/api/index.ts`, `lib/index.ts`, `utils/index.ts`. Never create such files — they look neat but turn every page into a monolithic chunk.

## Threshold for `dynamic()` — 30 KB gzipped or the library is rendered on event

Not every component is worth moving to `dynamic()`. The overhead (a separate HTTP request for the chunk, separate code for hydration) only pays off for heavy modules.

| Candidate | Solution |
| --- | --- |
| Button `Submit` 1 KB | Static import |
| Form validator `zod` 12 KB | Static import (used on every form) |
| Lightbox `yet-another-react-lightbox` 45 KB + CSS | `dynamic({ ssr: false })` |
| Charts `recharts` 90 KB | `dynamic({ ssr: false })` |
| Rich-text editor `tiptap` 120 KB | `dynamic({ ssr: false })` + sticky mounting |

Specific patterns (sticky-mount, static CSS import inside a lazy module, workarounds for Turbopack issues with dynamic `import()` CSS) — see `.claude/rules/performance.md`.

## `productionBrowserSourceMaps: false` — for production builds

Source maps are convenient in dev, but in production, they double the size of `.next/static/chunks`. Hosting with a properly configured CDN will compress them anyway — but extra build time and space on S3 are unnecessary.

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

If you need error monitoring with stack trace decoding (Sentry, Datadog) — set up the loading of source maps into their sourcemap-storage as a separate CI step, not in the public `_next/static`.

## `serverExternalPackages` — for native and CommonJS dependencies

Some server packages (`bcrypt`, `sharp`, native modules) do not work through Turbopack/Webpack bundling — they need to be loaded via `require()` at server runtime. Declare such packages explicitly.

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['bcrypt', 'sharp'],
};
```

The warning `Critical dependency: the request of a dependency is an expression` during `next build` usually indicates a candidate for `serverExternalPackages`.

## ⚠️ Do not import OneEntry SDK in client components

Any `'use client'` file with `import { defineOneEntry } from '@oneentry/web-sdk'` pulls the entire SDK into the client bundle — usually +80 KB gzipped. The SDK is intended for server use (server actions, server components, route handlers).

```typescript
// ❌ INCORRECT — SDK in client chunk
// components/AddToCartButton.tsx
'use client';
import { defineOneEntry } from '@oneentry/web-sdk';   // +80 KB in every chunk where the button is

// ✅ CORRECT — SDK on the server, client calls server action
// components/AddToCartButton.tsx
'use client';
import { addToCartAction } from '@/app/actions/cart';

// app/actions/cart.ts
'use server';
import { getApi } from '@/lib/oneentry';
```

The same goes for `@/lib/oneentry` (singleton initializer for the SDK) — never import it in files with `'use client'`.

Quick check before committing:

```bash
# should return empty
grep -rln "'use client'" --include="*.tsx" --include="*.ts" \
  | xargs grep -l "@oneentry/web-sdk\|@/lib/oneentry"
```

## Checklist before committing

- [ ] `@next/bundle-analyzer` is connected; primary JS on the main route < 200 KB gzipped
- [ ] All used barrel packages (`lucide-react`, `date-fns`, `gsap`, …) in `experimental.optimizePackageImports`
- [ ] No `index.ts` re-exports in your own code (`components/`, `lib/`, `utils/`)
- [ ] `dynamic()` used only for modules ≥ 30 KB or libraries rendered on event
- [ ] `productionBrowserSourceMaps: false` in `next.config`
- [ ] No `@oneentry/web-sdk` / `@/lib/oneentry` imports in `'use client'` files (grep above)

> Related rules: `.claude/rules/performance.md` (lazy splitting of heavy libraries via `dynamic`, sticky-mount patterns), `.claude/rules/performance-gsap.md` (`optimizePackageImports` for GSAP), `.claude/rules/server-actions.md` (where SDK calls should live).
