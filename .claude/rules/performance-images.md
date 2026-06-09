<!-- META
type: rules
fileName: performance-images.md
rulePaths: ["next.config.ts", "next.config.js", "next.config.mjs", "**/*Image*.tsx", "components/**/*.tsx"]
-->

# Performance: Images — OneEntry Rules

Rules for serving images from OneEntry CDN via `next/image`. Complements `.claude/rules/performance.md` (which covers `useNearViewport` for repeating cards) — this section focuses specifically on `next.config` configuration, formats, sizes, and blur placeholders.

Applicable to projects that read `downloadLink` / `previewLink` from `attributeValues` OneEntry and serve them in `<Image src={…} />`.

## ⚠️ `remotePatterns` — specific, not `'**'`

`<Image>` refuses to render external URLs that are not declared in `next.config`. Specify only OneEntry CDN domains — a broad wildcard scheme `hostname: '**'` breaks the built-in protection against SSRF (through `/_next/image?url=…` you can proxy any external host).

```typescript
// ❌ INCORRECT — open to any host
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

// ✅ CORRECT — only OneEntry CDN domains
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.oneentry.cloud', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.oneentry.cloud', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};
```

`hostname: '*.oneentry.cloud'` covers all OneEntry instances, including dev/stage subdomains. If the frontend works with a single fixed project — leave a specific subdomain (`example-project.oneentry.cloud`).

## Trim `deviceSizes` to actual design breakpoints

Next.js by default generates 8 sizes (`[640, 750, 828, 1080, 1200, 1920, 2048, 3840]`). This means that each OneEntry image rendered via `<Image>` goes through the optimizer **eight** times. If the design uses 4 breakpoints — the other four sizes are unnecessary work on the `/_next/image` endpoint.

```typescript
// ✅ CORRECT — follows the actual Tailwind grid (sm/md/lg/xl/2xl)
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [/* … */],
    deviceSizes: [640, 768, 1024, 1280, 1920],
    imageSizes: [16, 32, 64, 128, 256, 384],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,    // 30 days — edge cache
  },
};
```

`minimumCacheTTL` is important: without it, Next.js uses the `Cache-Control` of the source, and OneEntry CDN provides a short TTL — each image request turns into a re-optimization.

## `sizes` — do not leave default `100vw` for non-full-width images

`<Image>` uses `sizes` to select a variant from `srcSet`. With the default `100vw`, the browser always picks the largest variant — even for a card that is 340 pixels wide in the grid.

```tsx
// ❌ INCORRECT — browser downloads 1920px for thumbnail card
<Image
  src={product.image}
  width={340}
  height={340}
  alt={product.title}
/>

// ✅ CORRECT — exact match to the grid
<Image
  src={product.image}
  width={340}
  height={340}
  sizes="(min-width: 1280px) 340px, (min-width: 768px) 33vw, 50vw"
  alt={product.title}
/>
```

`sizes` template for typical OneEntry layouts:

| Context | `sizes` |
| --- | --- |
| Product card grid (4 in a row on desktop) | `(min-width: 1280px) 340px, (min-width: 768px) 33vw, 50vw` |
| Main image of the product page | `(min-width: 1024px) 50vw, 100vw` |
| Full-width hero banner | `100vw` |
| Icon / avatar / small preview | `64px` |

## `priority` — only for one LCP candidate, not for the entire first row

`priority` injects `<link rel="preload">` into `<head>` and removes `loading="lazy"`. If applied to every image in the first four grid cards, the browser will start downloading 4 files simultaneously with critical CSS — delaying LCP instead of speeding it up.

```tsx
// ❌ INCORRECT — four competitors for critical budget
{products.slice(0, 4).map((p) => (
  <Image key={p.id} src={p.image} priority alt={p.title} … />
))}

// ✅ CORRECT — priority only on one LCP candidate
<Image src={hero.image} priority alt={hero.title} … />
{products.map((p) => (
  <Image key={p.id} src={p.image} loading="lazy" alt={p.title} … />
))}
```

One `priority` per route — usually the hero banner or the main image of the product page.

## Blur placeholder via LQIP from `previewLink`

OneEntry returns `previewLink` and `downloadLink` in `attributeValues.image[0]`. `previewLink` is a compressed version (~5 KB), perfect for a blur placeholder. Do not generate `blurDataURL` on the client — it burdens the main thread and negates all savings.

```tsx
// ❌ INCORRECT — generated on the client, blocks main thread
'use client';
const blur = await generateBlurDataURL(product.image);   // bad pattern

// ✅ CORRECT — server fetch + base64 in RSC
import { extractImage } from '@/utils/attribute-values';
import { fetchBlurDataURL } from '@/utils/blur';

const ProductCard = async ({ product }: { product: IProductEntity }) => {
  const image = extractImage(product.attributeValues, 'image');
  const blurDataURL = image?.previewLink
    ? await fetchBlurDataURL(image.previewLink)
    : undefined;

  return (
    <Image
      src={image.downloadLink}
      width={340}
      height={340}
      placeholder={blurDataURL ? 'blur' : 'empty'}
      blurDataURL={blurDataURL}
      sizes="(min-width: 1280px) 340px, 50vw"
      alt={product.title}
    />
  );
};
```

`fetchBlurDataURL` is wrapped in `unstable_cache` with a 7-day TTL and the tag `oneentry-images` — preview images on OneEntry change very rarely, re-fetching them on every render is wasteful:

```typescript
// utils/blur.ts
import { unstable_cache } from 'next/cache';

export const fetchBlurDataURL = unstable_cache(
  async (previewLink: string): Promise<string> => {
    const res = await fetch(previewLink);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  },
  ['oneentry-blur'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['oneentry', 'oneentry-images'] }
);
```

## `unoptimized` — only for SVG and animated GIFs

`<Image unoptimized />` disables the optimizer and serves the source as is. Useful only for two cases: SVG (the optimizer may break `viewBox` / refs) and animated GIFs (Next.js converts the first frame to WebP — losing the animation).

```tsx
// ❌ INCORRECT — disables all CDN optimization for laziness
<Image src={product.image} unoptimized … />

// ✅ CORRECT — only for known problematic formats
const isSvg = image.downloadLink.endsWith('.svg');
<Image src={image.downloadLink} unoptimized={isSvg} … />
```

For other formats — let the optimizer work. And check the `Content-Type` from OneEntry CDN: it should be `image/jpeg`/`image/png`/`image/webp`, not `application/octet-stream` (the latter breaks format detection in `next/image`).

## Checklist before commit

- [ ] `next.config.ts` declares `remotePatterns` specifically — without `hostname: '**'`
- [ ] `formats: ['image/avif', 'image/webp']` — saving 20–35% compared to JPEG
- [ ] `deviceSizes` trimmed to actual Tailwind breakpoints (5 values are sufficient)
- [ ] `minimumCacheTTL ≥ 86400` (1 day), preferably 30 days for CMS images
- [ ] Each `<Image>` has a meaningful `sizes`, not the default `100vw`
- [ ] `priority` is set on **one** image of the route — the LCP candidate
- [ ] For repeating cards, `loading="lazy"` + `useNearViewport` is enabled (see `performance.md`)
- [ ] Blur placeholder is taken from `previewLink` OneEntry, base64-encoded on the server with caching
- [ ] `unoptimized` is set only for SVG and animated GIFs

> Related rules: `.claude/rules/performance.md` (`useNearViewport` for repeating images), `.claude/rules/attribute-values.md` (structure of `attributeValues.image` — `downloadLink` / `previewLink`).
