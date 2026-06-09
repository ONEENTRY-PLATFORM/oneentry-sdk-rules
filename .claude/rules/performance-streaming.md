<!-- META
type: rules
fileName: performance-streaming.md
rulePaths: ["app/**/loading.tsx", "app/**/page.tsx", "app/**/layout.tsx", "app/**/error.tsx"]
-->

# Performance: Streaming and Suspense — OneEntry Rules

Rules for streaming page rendering on the App Router. Complements `.claude/rules/performance.md` (which discusses wrapping `useSearchParams` in `<Suspense>`) — this is specifically about `loading.tsx`, granular Suspense boundaries within a page, and Partial Pre-Rendering (PPR).

Applicable to routes with heterogeneous latency: fast header + slow product listing, cached hero + uncached personalized recommendations, etc.

## Add `loading.tsx` to every route segment with CMS loading

The `loading.tsx` file next to `page.tsx` automatically wraps the page in `<Suspense>`. The user sees a skeleton **immediately** after clicking on `<Link>`, without waiting for the resolution of OneEntry requests.

```tsx
// ❌ INCORRECT — white screen for 800 ms while OneEntry delivers the page
// app/[locale]/shop/page.tsx
export default async function ShopPage() {
  const { products } = await getProductsByPageUrl('shop');
  return <ProductGrid products={products} />;
}
// (no loading.tsx — navigation looks stuck)

// ✅ CORRECT — skeleton with stable layout immediately after click
// app/[locale]/shop/loading.tsx
export default function ShopLoading() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="aspect-square w-full animate-pulse bg-neutral-200 rounded-md" />
      ))}
    </div>
  );
}
```

The skeleton should match the final layout in size — otherwise, when switching to the real content, CLS will occur. Use the same grid classes (`grid grid-cols-…`) as in `page.tsx`.

## ⚠️ Stream slow blocks of the page through local `<Suspense>`

`loading.tsx` blocks **the entire** route until all `await` in `page.tsx` are resolved. If there is one fast block on the page (hero from `unstable_cache` — 5 ms) and one slow block (personal recommendations without cache — 600 ms), the user waits 600 ms for the first render to start.

```tsx
// ❌ INCORRECT — page is blocked on the slow rec block
export default async function ProductPage({ params }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);                  // 5 ms (cache)
  const recommendations = await getRecommendationsFor(product.id);   // 600 ms

  return (
    <>
      <ProductHero product={product} />
      <Recommendations items={recommendations} />
    </>
  );
}

// ✅ CORRECT — hero streams immediately, recommendations load later
import { Suspense } from 'react';

export default async function ProductPage({ params }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);   // fast block

  return (
    <>
      <ProductHero product={product} />
      <Suspense fallback={<RecommendationsSkeleton />}>
        <RecommendationsSection productId={product.id} />
      </Suspense>
    </>
  );
}

// async server component inside Suspense — streams separately
const RecommendationsSection = async ({ productId }: { productId: string }) => {
  const items = await getRecommendationsFor(productId);
  return <Recommendations items={items} />;
};
```

Rule of thumb: if the latency of one block on the route is **2+ times** higher than the others — move it to a separate async component and wrap it in `<Suspense>`. This provides streaming HTML instead of blocking wait.

## Do not use `<Suspense>` deeply in the tree unnecessarily

Each Suspense boundary is a separate HTML chunk in the streaming response. Ten boundaries within one card mean ten `<template>` instructions in the DOM + ten separate code splits on hydration. The benefit of streaming only exists with a real difference in latency.

```tsx
// ❌ INCORRECT — granularity for the sake of granularity
<Suspense fallback={<TitleSkel />}>
  <ProductTitle product={product} />
</Suspense>
<Suspense fallback={<PriceSkel />}>
  <ProductPrice product={product} />
</Suspense>
<Suspense fallback={<DescriptionSkel />}>
  <ProductDescription product={product} />
</Suspense>
// (all three read from the same `product` — no point in streaming separately)

// ✅ CORRECT — one Suspense for a block with one data source
<Suspense fallback={<ProductBodySkeleton />}>
  <ProductBody product={product} />
</Suspense>
```

Place the boundary where there is a separate `await` or a separate OneEntry request — not "for each visual element."

## Fixed-size skeletons — no CLS

When replacing the skeleton with real content, the size should not shift. Use `aspect-square` / `min-h-[]` / the same `grid-template-rows` as the final layout. Cumulative Layout Shift (Core Web Vital) is penalized for such substitutions.

```tsx
// ❌ INCORRECT — skeleton 40px high, real card 280px
<div className="h-10 bg-neutral-200 animate-pulse rounded" />

// ✅ CORRECT — same aspect ratio as the final card
<div className="aspect-square w-full bg-neutral-200 animate-pulse rounded" />
```

## Partial Pre-Rendering — enable incrementally with Next.js 16

PPR separates the page into a static shell (pre-rendered at build time) and dynamic "holes," streamed on request. This gives the best of both worlds: instant HTML for the hero section + personalized content afterward.

```typescript
// next.config.ts (Next.js 16+)
const nextConfig: NextConfig = {
  experimental: {
    ppr: 'incremental',   // enabled only on routes with `export const experimental_ppr = true`
  },
};

// app/[locale]/shop/[handle]/page.tsx
export const experimental_ppr = true;
export const revalidate = 60;

export default async function ProductPage({ params }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);   // static — cache + revalidate

  return (
    <>
      <ProductHero product={product} />                {/* pre-rendered at build time */}
      <Suspense fallback={<UserBlockSkeleton />}>
        <UserSpecificBlock />                          {/* dynamic — cookies, orders */}
      </Suspense>
    </>
  );
}
```

`'incremental'` is important — it does not break existing pages and activates PPR only where `experimental_ppr = true` is explicitly declared. Do not enable `'enabled'` in production until fully tested.

## ⚠️ Do not stream critical metadata

`generateMetadata` executes before streaming — `<title>`, `<meta description>`, OpenGraph must be ready before the first byte of HTML is delivered. Therefore, **never** wrap the source for metadata in `<Suspense>`.

```tsx
// ❌ INCORRECT — trying to "defer" fetch for metadata — Next.js still waits
export async function generateMetadata({ params }) {
  const { handle } = await params;
  return { title: 'Loading…' };
}

// ✅ CORRECT — fetch inside generateMetadata is deduplicated with page (React `cache`)
export async function generateMetadata({ params }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);   // the same in-flight promise as in page
  return { title: product.title, description: product.attributeValues.description };
}
```

OneEntry fetcher (`getProductByHandle`, etc.) should be wrapped in React `cache()` — then `generateMetadata` and `page.tsx` are automatically deduplicated.

## Checklist before commit

- [ ] Each route segment with CMS loading has a neighboring `loading.tsx`
- [ ] The skeleton in `loading.tsx` matches the final layout in size (no CLS)
- [ ] If there is a block on the page with latency 2+ times higher than the others — it is moved to a separate async component outside `<Suspense>`
- [ ] Suspense boundaries are placed where there is a separate `await` — not by visual elements
- [ ] OneEntry fetcher for metadata is wrapped in React `cache()` (deduplication `generateMetadata` ↔ `page`)
- [ ] When PPR is enabled — `experimental.ppr: 'incremental'` + `export const experimental_ppr = true` on specific routes, not globally

> Related rules: `.claude/rules/performance.md` (Suspense wrapper for `useSearchParams`, `unstable_cache` + `cache()` composition), `.claude/rules/nextjs-pages.md` (structure of `page.tsx` with `params` as Promise).
