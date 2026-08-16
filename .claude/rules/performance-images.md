---
paths:
  - "next.config.ts"
  - "next.config.js"
  - "next.config.mjs"
  - "**/*Image*.tsx"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Performance: Images — OneEntry Rules

Rules for serving images from OneEntry CDN via `next/image`. Complements `.claude/rules/performance.md` (which discusses `useNearViewport` for repeating cards) — this section is specifically about `next.config` configuration, formats, sizes, and blur placeholders.

Applicable to projects that read `downloadLink` / `previewLink` from `attributeValues` OneEntry and serve them in `<Image src={…} />`.

## ⚠️ `remotePatterns` — specifically, not `'**'`

`<Image>` refuses to render external URLs that are not declared in `next.config`. Specify exactly the domains of OneEntry CDN — a broad wildcard scheme `hostname: '**'` breaks the built-in protection against SSRF (through `/_next/image?url=…` you can proxy any external host).

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

`hostname: '*.oneentry.cloud'` covers all OneEntry instances, including dev/stage subdomains. If the front end works with a single fixed project — leave a specific subdomain (`example-project.oneentry.cloud`).

## Trim `deviceSizes` to real design breakpoints

Next.js by default generates 8 sizes (`[640, 750, 828, 1080, 1200, 1920, 2048, 3840]`). This means that each OneEntry image rendered via `<Image>` goes through the optimizer **eight** times. If the design uses 4 breakpoints — the other four sizes are wasted work on the `/_next/image` endpoint.

```typescript
// ✅ CORRECT — follows the real Tailwind grid (sm/md/lg/xl/2xl)
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

`minimumCacheTTL` is important: without it, Next.js uses the `Cache-Control` of the source, and OneEntry CDN provides a short TTL — each image request turns into a repeated optimization.

## `sizes` — do not leave the default `100vw` for non-full-width images

`<Image>` uses `sizes` to select the variant from `srcSet`. With the default `100vw`, the browser always takes the largest variant — even for a card that is 340 pixels wide in the grid.

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

`priority` injects `<link rel="preload">` into `<head>` and removes `loading="lazy"`. If set on every image in the first four cards of the grid, the browser will start downloading 4 files simultaneously with critical CSS — delaying LCP instead of speeding it up.

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

### ⚠️ Ask first — blur is not enabled silently

Not all projects have built-in LQIP, and it is not needed everywhere. The order:

1. **Check if LQIP exists in real data** — `/inspect-api` or `console.log(attrs.<marker>?.value)`. `previewLink` appears only for files uploaded with **configured preview template** (`&template=1`, see `/admin-upload-images`). If there is no `previewLink` for any file → do not implement blur at all and **do not generate a manual replacement**; tell the user that previews can be enabled by re-uploading files via `/admin-upload-images`.
2. **LQIP exists → ask the user.** First, inform them: built-in LQIP found in the data (`previewLink.default[0]`). Then ask a question — exactly one, and only about the choice: “Where to enable `placeholder="blur"` — everywhere, only on the hero and main product photo, or nowhere?” The question is not rhetorical: each base64 string weighs ~0.5–2 KB **in HTML/RSC payload for each image** — in a grid of 40 cards, this adds up to tens of extra kilobytes for an effect lasting fractions of a second.
3. **User remains silent** → enable only on the LCP candidate (hero / main image of the product page), not in card grids.

Apply the solution uniformly across the project, not mixed across components. For images ≤48 px (avatars, icons, stickers) blur is not visible — do not offer it there at all.

OneEntry returns `previewLink` and `downloadLink` in the image object (`attributeValues.<marker>.value` — object for one image, array for multiple; with v1.0.157 this rule is consistent across all modules, so `extractImage` below should handle both forms). In the image attributes of entities, `previewLink` — **an object by presets** of the form `{ default: [lqip, previewUrl] }`, where `previewLink.default[0]` — **the ready base64 string LQIP** (`data:image/webp;base64,…`), and `previewLink.default[1]` — URL of the reduced preview version. Base64 for `blurDataURL` **is already included in the response** — do not fetch it over the network and do not generate it on the client.

```tsx
// ❌ INCORRECT — generated on the client / unnecessary fetch (base64 is already in the response)
'use client';
const blur = await generateBlurDataURL(product.image);   // bad pattern

// ✅ CORRECT — base64 LQIP taken directly from previewLink, without request
// Single image parsing lives in src/lib/oneentry.ts (getImageUrl/getImageUrls),
// see .claude/rules/attribute-values.md — do not create a parallel extractImage
import { extractImage } from '@/utils/attribute-values';
import { getLqip } from '@/utils/blur';

const ProductCard = ({ product }: { product: IProductEntity }) => {
  const image = extractImage(product.attributeValues, 'image');
  const blurDataURL = getLqip(image?.previewLink);

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

`getLqip` extracts the base64 of the first available preset — **synchronously, without `fetch` and `unstable_cache`** (LQIP comes with the product, nothing to cache):

```typescript
// utils/blur.ts
// previewLink in image attributes — Record<preset, [lqip, previewUrl]>;
// previewLink can only be a string outside image attributes (forms-data / orders)
type PreviewLink = Record<string, [string, string]> | string | null | undefined;

export function getLqip(previewLink: PreviewLink): string | undefined {
  if (!previewLink || typeof previewLink === 'string') return undefined;
  const preset = previewLink.default ?? Object.values(previewLink)[0];
  const lqip = preset?.[0];
  return lqip?.startsWith('data:') ? lqip : undefined; // [0] — ready data:base64 LQIP
}
```

## `unoptimized` — only for SVG and animated GIFs

`<Image unoptimized />` disables the optimizer and serves the source as is. Useful only for two cases: SVG (the optimizer may break `viewBox` / refs) and animated GIFs (Next.js converts the first frame to WebP — the animation is lost).

```tsx
// ❌ INCORRECT — disables all CDN optimization for laziness
<Image src={product.image} unoptimized … />

// ✅ CORRECT — only for known problematic formats
const isSvg = image.downloadLink.endsWith('.svg');
<Image src={image.downloadLink} unoptimized={isSvg} … />
```

For other formats — let the optimizer work. And check the `Content-Type` from OneEntry CDN: it should be `image/jpeg`/`image/png`/`image/webp`, not `application/octet-stream` (the latter breaks format detection in `next/image`).

### Third case: the optimizer itself became a point of failure

`/_next/image` is a proxy, meaning **an additional point of failure between the visitor and the image**. In some deployments under competitive load, a noticeable portion of requests to it fail (`ERR_ABORTED` in the browser, images "flicker" with emptiness), while OneEntry CDN already serves reasonably compressed previews.

This is not a license for `unoptimized: true` by default — it is a diagnosis that must be **confirmed** before disabling the optimizer:

1. in DevTools → Network filter `/_next/image` and ensure that failures are indeed occurring there, not on the CDN;
2. check the server's stdout — 400s due to DNS64/NAT64 look similar, but are treated differently (see `.claude/rules/troubleshooting.md`, "400 on `/_next/image`");
3. compare weights: if the CDN serves previews 2–3 times heavier than optimized, it is cheaper to fix the deployment than to serve originals.

If the diagnosis is confirmed — a global `images.unoptimized: true` in `next.config.ts` is permissible. Keep `remotePatterns` **(the component can revert to optimization via `unoptimized={false}`), and document the deviation in `MISMATCH-LOG.md`, section "Conscious Deviations" — otherwise, the next agent will come to "fix" it according to the same rule (see `.claude/rules/mismatch-log.md`).

## Checklist before commit

- [ ] `next.config.ts` declares `remotePatterns` specifically — without `hostname: '**'`
- [ ] `formats: ['image/avif', 'image/webp']` — saving 20–35% compared to JPEG
- [ ] `deviceSizes` trimmed to real Tailwind breakpoints (5 values are sufficient)
- [ ] `minimumCacheTTL ≥ 86400` (1 day), preferably 30 days for CMS images
- [ ] Each `<Image>` has a meaningful `sizes`, not the default `100vw`
- [ ] `priority` is set on **one** image of the route — the LCP candidate
- [ ] For repeating cards, `loading="lazy"` + `useNearViewport` is enabled (see `performance.md`)
- [ ] Use of blur is agreed with the user (or the default "only LCP image" is applied), and the base64 is taken from `previewLink` synchronously — without `fetch` and generation on the client
- [ ] `unoptimized` is set only for SVG and animated GIFs — or globally, but with a confirmed diagnosis and a record in `MISMATCH-LOG.md`

> Related rules: `.claude/rules/performance.md` (`useNearViewport` for repeating images), `.claude/rules/attribute-values.md` (structure of `attributeValues.image` — `downloadLink` / `previewLink`).
