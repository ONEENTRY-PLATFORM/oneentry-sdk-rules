---
paths:
  - "app/**/page.tsx"
  - "src/app/**/page.tsx"
  - "app/**/layout.tsx"
  - "src/app/**/layout.tsx"
  - "app/api/**/*.ts"
  - "src/app/api/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Performance — OneEntry Rules

Rules to keep the initial load and SSR latency within budget when serving content from OneEntry CMS. Covers caching strategy, lazy loading, and parallelism.

## ⚠️ Never use `force-dynamic` for CMS pages

OneEntry content only changes when edited by an administrator — re-fetching it on every request is pointless. Use ISR by default.

```typescript
// ❌ INCORRECT — every visitor pays a full round-trip to OneEntry (3–8s from a cold start)
export const dynamic = 'force-dynamic';

// ✅ CORRECT — the first request renders and caches HTML; others receive ~10 ms
export const dynamic = 'force-static';
export const revalidate = 300; // 60 for rapidly changing listings
```

**Exceptions** — leave dynamic only for: `/profile`, `/cart`, `/auth/*`, anything that reads `cookies()` / `headers()`.

`force-static` makes the build loudly fail if anything in the tree slips back into dynamic mode — an early warning instead of silent degradation of ISR.

## ⚠️ Wrap every `useSearchParams()` in `<Suspense>`

An unwrapped `useSearchParams()` anywhere in the page tree causes **the entire** page to revert to dynamic rendering — ISR / `revalidate` quietly stop working.

```tsx
// ❌ INCORRECT — FilterPanel uses useSearchParams; the entire page becomes dynamic
<FilterPanel preferences={preferences} />

// ✅ CORRECT — Suspense isolates the consumer of the dynamic API
<Suspense fallback={null}>
  <FilterPanel preferences={preferences} />
</Suspense>
```

Applies to `useSearchParams`, `usePathname`, and everything else that Next.js marks as dynamic. `force-static` + `next build` is the simplest detector.

## Compose `unstable_cache` on top of server fetchers

React `cache()` deduplicates within a single render. `unstable_cache` deduplicates between requests and stores in Next.js Data Cache. **Use both.**

```typescript
// ❌ INCORRECT — only React deduplication within the render; each new request hits OneEntry again
import { cache } from 'react';
export const getPageByUrl = cache(async (url: string) => {
  const data = await getApi().Pages.getPageByUrl(url);
  if (isError(data)) return { isError: true, error: data };
  return { isError: false, page: data };
});

// ✅ CORRECT — inter-request cache with TTL + tags plus React deduplication
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

const fetchImpl = unstable_cache(
  async (url: string) => {
    const data = await getApi().Pages.getPageByUrl(url);
    if (isError(data)) return { isError: true, error: data };
    return { isError: false, page: data };
  },
  ['oneentry-getPageByUrl'],          // keyParts (namespace)
  { revalidate: 60, tags: ['oneentry', 'oneentry-pages'] }
);

export const getPageByUrl = cache(async (url: string) => fetchImpl(url));
```

### TTL by data type

| OneEntry Resource | TTL | Tags |
| --- | --- | --- |
| Pages, blocks, product listings | `60` | `oneentry-pages` / `oneentry-blocks` / `oneentry-products` |
| Menus, attribute sets (`static_content`, `preferences`) | `300` | `oneentry-menus` / `oneentry-attributes` |
| Forms (`getFormByMarker`) | `300` | `oneentry-forms` |
| Detailed product/page | `60` | `oneentry-products` / `oneentry-pages` |

### Object arguments → stable cache key

`unstable_cache` builds keys from positional arguments. Objects are serialized to JSON — different property order = different cache entry. Reduce to a canonical signature string.

```typescript
// ❌ INCORRECT — { handle: 'pizza', limit: 4 } and { limit: 4, handle: 'pizza' } are cached separately
const fetchProducts = unstable_cache(
  async (opts: { handle: string; limit: number; searchParams?: SearchParams }) => { … },
  ['oneentry-getProductsByPageUrl'],
  { revalidate: 60 }
);

// ✅ CORRECT — canonical signature string + positional primitives
const buildKey = (limit: number, handle: string, sp?: SearchParams) =>
  JSON.stringify([limit, handle, {
    search: sp?.search ?? '',
    color: sp?.color ?? '',
    // …all known keys, always in the same order, with explicit defaults
  }]);

const fetchProducts = unstable_cache(
  async (_signature: string, limit: number, handle: string, sp: SearchParams) => { … },
  ['oneentry-getProductsByPageUrl'],
  { revalidate: 60, tags: ['oneentry', 'oneentry-products'] }
);

export const getProductsByPageUrl = cache(async (opts) => {
  const sp = opts.searchParams ?? {};
  return fetchProducts(buildKey(opts.limit, opts.handle, sp), opts.limit, opts.handle, sp);
});
```

### Always pair tag `'oneentry'` + thematic

At least two tags — the umbrella tag allows a single `revalidateTag('oneentry')` from the admin edit webhook to reset all CMS data; thematic tags allow targeted hits on a single family of resources.

## ⚠️ Do not `await` data in the root layout — pass Promise

`async` server components return JSX only after each `await`. Child server components (Header, page) cannot start their fetches until the parent layout completes. If the layout `await`s data from OneEntry needed by the **client** provider, the entire tree serializes behind it.

```tsx
// ❌ INCORRECT — layout blocks until Header / page requests start
export default async function RootLayout({ children }) {
  const dict = await getDictionary();
  return (
    <DictProvider value={dict}>
      <Header />              {/* starts only after dict resolves */}
      {children}
    </DictProvider>
  );
}

// ✅ CORRECT — layout returns synchronous JSX; Promise unfolds on the client
export default function RootLayout({ children }) {
  const dictPromise = getDictionary();   // without await
  return (
    <DictProvider value={dictPromise}>
      <Header />                          {/* starts immediately */}
      {children}
    </DictProvider>
  );
}
```

```tsx
// DictProvider — client component unfolds Promise via React 19 `use()`
'use client';
import { use } from 'react';

const isPromise = (v: unknown): v is Promise<IAttributeValues> =>
  typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';

export const DictProvider = ({
  value,
  children,
}: {
  value: IAttributeValues | Promise<IAttributeValues> | undefined;
  children: ReactNode;
}) => {
  const resolved = isPromise(value) ? use(value) : value;
  return <DictContext.Provider value={resolved}>{children}</DictContext.Provider>;
};
```

`getDictionary()` is wrapped in React `cache()`, so server consumers (`t()` from Header, page metadata, etc.) share the same in-flight promise instead of spawning parallel fetches.

## Parallelize requests to OneEntry within a single server component

Independent fetches → `Promise.all`. Sequential `await` — only when one request **needs** the response of the previous.

```typescript
// ❌ INCORRECT — waterfall, total = sum(latencies)
const { pages } = await getApi().Pages.getChildPagesByParentUrl('menu');
const supportPage = await getApi().Pages.getPageByUrl('support');
const banners = await getApi().Pages.getChildPagesByParentUrl('blog');

// ✅ CORRECT — in parallel, total = max(latencies)
const [{ pages }, supportPage, banners] = await Promise.all([
  getApi().Pages.getChildPagesByParentUrl('menu'),
  getApi().Pages.getPageByUrl('support'),
  getApi().Pages.getChildPagesByParentUrl('blog'),
]);
```

### Fan-out N+1 → `Promise.all(items.map(…))`

```typescript
// ❌ INCORRECT — for-await loop, N × latency
const sections = [];
for (const category of categories) {
  const products = await getApi().Products.getProductsByPageUrl(category.pageUrl);
  sections.push({ category, products });
}

// ✅ CORRECT — one wave
const sections = await Promise.all(
  categories.map(async (category) => ({
    category,
    products: await getApi().Products.getProductsByPageUrl(category.pageUrl),
  }))
);
```

## ⚠️ Heavy third-party libraries — separate lazy chunk + static CSS import

Libraries that render only after user action (lightboxes, charts, toast containers, video players, rich-text editors) should live in their own module, loaded via `dynamic({ ssr: false })`, with mounting based on state.

```tsx
// ❌ INCORRECT — lightbox library + 4 plugins + 3 CSS files in the initial page chunk
'use client';
import 'yet-another-react-lightbox/styles.css';
import Lightbox from 'yet-another-react-lightbox';

const Gallery = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Lightbox open={open} … />     {/* mounts on first render */}
    </>
  );
};

// ✅ CORRECT — separate module for heavy library (static eagerly inside)
// src/components/RestaurantLightbox.tsx
'use client';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import Lightbox from 'yet-another-react-lightbox';
import Counter from 'yet-another-react-lightbox/plugins/counter';

const RestaurantLightbox = ({ open, onClose, slides }) => (
  <Lightbox open={open} close={onClose} slides={slides} plugins={[Counter]} />
);
export default RestaurantLightbox;

// src/components/Gallery.tsx — lazy + sticky mounting
const RestaurantLightbox = dynamic(() => import('./RestaurantLightbox'), { ssr: false });

const Gallery = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);     // sticky — true after first open
  return (
    <>
      <button onClick={() => { setMounted(true); setOpen(true); }}>Open</button>
      {mounted && <RestaurantLightbox open={open} onClose={() => setOpen(false)} slides={…} />}
    </>
  );
};
```

### ⚠️ Turbopack does not accept dynamic `import()` CSS

```typescript
// ❌ INCORRECT — Module not found: "Can't resolve '…/styles.css' — not an ecmascript client_module"
const LazyToast = dynamic(
  () => import('react-toastify').then(async (mod) => {
    await import('react-toastify/dist/ReactToastify.css');   // crashes Turbopack
    return mod.ToastContainer;
  }),
  { ssr: false }
);

// ✅ CORRECT — CSS is imported statically inside the lazy module source
// src/components/LazyToastContainer.tsx
'use client';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
export default function LazyToastContainer() { return <ToastContainer … />; }

// src/components/ResponsiveToastContainer.tsx
const LazyToastContainer = dynamic(() => import('./LazyToastContainer'), { ssr: false });
```

## Delay non-critical UI after the first render using `requestIdleCallback`

Toast containers, analytics widgets, chat bubbles — anything the user cannot interact with on the first render. Just `dynamic()` is not enough: the chunk still starts loading immediately after the parent renders. Gate the mounting using `requestIdleCallback`.

```tsx
const LazyToastContainer = dynamic(() => import('./LazyToastContainer'), { ssr: false });

const ResponsiveToastContainer = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return;
    }
    const id = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;
  return <LazyToastContainer />;
};
```

## Gate IntersectionObserver for repeating product images

Browser `loading="lazy"` is generous — it starts loading images long before they are visible. On a listing with 20+ product cards, the optimizer endpoint (`/_next/image?url=…`) gets hammered on initial load. Gate the mounting of `<Image>` based on proximity to the viewport.

```tsx
// src/hooks/useNearViewport.ts
'use client';
import { type RefObject, useEffect, useState } from 'react';

export const useNearViewport = (
  ref: RefObject<Element | null>,
  { rootMargin = '200px' }: { rootMargin?: string } = {}
): boolean => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, visible]);
  return visible;
};

// ProductImage.tsx
'use client';
const ProductImage = ({ src, alt }: { src: string; alt: string }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isNear = useNearViewport(wrapperRef, { rootMargin: '300px' });
  return (
    <div ref={wrapperRef} className="relative aspect-square w-full overflow-hidden">
      {isNear ? <Image src={src} alt={alt} width={340} height={340} sizes="…" loading="lazy" /> : null}
    </div>
  );
};
```

Apply to: repeating listing cards (products, articles, restaurants).
**Do not apply** to: hero sections / content above the fold (there use `priority`), as well as images inside lazy popups.

## `<Link prefetch>` — explicitly, not by default

Next.js prefetches the RSC payload of each `<Link>` in the visible area. On a catalog page with 20+ ProductCard links, this results in 20+ unnecessary requests on initial load.

```tsx
// ❌ INCORRECT — each card prefetches its product page
<Link href={`/shop/product/${id}`}> … </Link>

// ✅ CORRECT — repeating listing cards opt-out of prefetch
<Link prefetch={false} href={`/shop/product/${id}`}> … </Link>
```

Leave `prefetch={true}` (default) only for: 1–2 hero CTAs above the fold, next/prev pagination, and links inside popups.

## `next/font` — avoid Cartesian product weight × style

Declaring `weight: ['300', '400', '700']` along with `style: ['normal', 'italic']` creates **six** `@font-face` rules. Browsers will not download unused variants, but with `preload: true` Next.js injects `<link rel="preload">` for the main weight — and the CSS payload still contains all six.

```typescript
// ❌ INCORRECT — italic 300 / 400 declared, but never rendered
const lato = Lato({
  weight: ['300', '400', '700'],
  style: ['normal', 'italic'],
  preload: true,
  variable: '--font-lato',
});

// ✅ CORRECT — split into two font instances, preload only the main
const lato = Lato({
  weight: ['300', '400', '700'],
  style: ['normal'],
  preload: true,
  variable: '--font-lato',
});

const latoItalic = Lato({
  weight: ['700'],          // italic used only on bold weight
  style: ['italic'],
  preload: false,           // not above the fold — preload not needed
  variable: '--font-lato-italic',
});

// usage
<body className={`${lato.variable} ${latoItalic.variable}`}>
  <h1 style={{ fontFamily: 'var(--font-lato-italic)' }} className="italic font-bold">…</h1>
</body>
```

## Checklist before commit

- [ ] `export const dynamic = 'force-static'; export const revalidate = …;` on every CMS page
- [ ] Every consumer of `useSearchParams` wrapped in `<Suspense>` (run `next build` — `force-static` will otherwise fail)
- [ ] Every new server fetcher composes `unstable_cache(impl, [keyParts], { revalidate, tags: ['oneentry', …] })` on top of React `cache()`
- [ ] Layout does not `await` data needed only by the client provider — pass Promise
- [ ] Independent calls to OneEntry in a single server component → `Promise.all`; fan-out by items → `Promise.all(items.map(…))`
- [ ] Heavy libraries (lightboxes, charts, toasts, editors) → separate `'use client'` module with static CSS imports + `dynamic({ ssr: false })` + sticky mount state
- [ ] Non-critical UI delayed via `requestIdleCallback` (with fallback `setTimeout(1500)`)
- [ ] Repeating `<Image>` cards gated by `useNearViewport`
- [ ] Repeating `<Link>` cards set `prefetch={false}`
- [ ] `next/font` declared without unused combinations of weight × style

> Related performance family rules:
>
> - `.claude/rules/performance-popups.md` — popup / curtain system via single `PopupRoot` + `popupRegistry` + `prefetchPopup`.
> - `.claude/rules/performance-rtk.md` — RTK Query: `pollingInterval`, `skip`, `keepUnusedDataFor`, when **not** to use RTK Query.
> - `.claude/rules/performance-gsap.md` — GSAP: eager vs lazy registration of plugins, `useGSAP({ scope })`, `optimizePackageImports`.
> - `.claude/rules/performance-images.md` — `next/image` with OneEntry CDN: `remotePatterns`, `deviceSizes`, AVIF/WebP, blur via `previewLink`.
> - `.claude/rules/performance-streaming.md` — `loading.tsx`, local `<Suspense>` around slow blocks, PPR (`experimental.ppr: 'incremental'`).
> - `.claude/rules/performance-bundle.md` — `@next/bundle-analyzer`, `optimizePackageImports`, prohibit barrel `index.ts`, prohibit SDK in `'use client'`.
>
> Neighboring rules: `.claude/rules/nextjs-pages.md`, `.claude/rules/server-actions.md`, `.claude/rules/localization.md`.
