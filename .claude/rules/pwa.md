<!-- META
type: rules
fileName: pwa.md
rulePaths: ["app/manifest.ts","public/sw.js","public/offline.html"]
paths:
  - "app/manifest.ts"
  - "public/sw.js"
  - "public/offline.html"
-->

# PWA for the showcase on OneEntry

Skill recipe: **`/setup-pwa`**.

The main limitation that requires a separate rule for PWA on OneEntry is: **the service worker must not cache requests to OneEntry**. The cart, wishlist, profile, and orders are addressed with the headers `x-guest-id` / `Authorization`, while the SW caches by URL. A cached response will show the next visitor someone else's cart or resurrect a deleted item.

---

## 1. What to cache, what not to

| Resource | Strategy | Why |
| --- | --- | --- |
| `/_next/static/**` | cache-first | the file name contains a hash of the content |
| HTML navigation | network-first + offline fallback | content changes, but an old page is better than nothing |
| Requests to OneEntry (`*.oneentry.cloud`) | **do not cache** | user/guest-scoped, differ by headers, not URL |
| CDN images | optionally cache-first | safe, but watch the storage size |

```javascript
// public/sw.js
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ⚠️ Everything going to OneEntry bypasses the SW — otherwise, the buyer will see someone else's cart
  if (url.hostname.endsWith('.oneentry.cloud')) return

  const isDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

  // Next static — cache-first, but only in production: in dev, Turbopack changes
  // the content of the chunk without changing the file name, and the cached chunk breaks the page
  if (!isDev && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const res = await fetch(request)
      if (res.ok) cache.put(request, res.clone())
      return res
    }))
    return
  }

  // Only navigation: everything else is handed to the network as is
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, c)) }
        return res
      })
      .catch(() => caches.match(OFFLINE_URL)),
  )
})
```

---

## 2. Manual service worker, not `next-pwa` / `serwist`

Wrappers generate aggressive runtime rules that by default cache API requests — exactly what is prohibited here, and you have to disable this with config on top of the generator. The file above is 60 lines, readable in its entirety, and does exactly what is written.

Registration — from Client Component in layout, **only in production**:

```tsx
useEffect(() => {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js')
}, [])
```

⚠️ Version cache names (`oe-store-v1`) and clean up old ones in `activate` — otherwise, after deployment, users will be stuck on the old shell for months.

---

## 3. `manifest.ts` is built from the same constants as SEO

```typescript
// app/manifest.ts
import { SITE_NAME, SITE_DESCRIPTION } from '@/app/data/seoData'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,                 // the same constants as in generateMetadata
    short_name: 'Store',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111111',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
```

No hardcoding: the name and description are taken from the same place as the metadata (`.claude/rules/seo-metadata.md`). Otherwise, the name in the manifest will diverge from `<title>` after the first edit.

---

## 4. Offline fallback — static shell

`public/offline.html` — a self-sufficient page without requests to OneEntry and without a JS bundle: logo, "no network", "retry" button. Pre-cached on `install`.

Do not try to show an offline real catalog: user-scoped data, and faking "as if it works" is worse than an honest message.

---

## 5. An explicit list of what is consciously absent

Be sure to document in `docs/PWA.md` (or in `MISMATCH-LOG.md`, section "Conscious deviations") what is **not** implemented and why:

- push notifications — a server key and user permission are needed;
- background sync — offline order needs to be validated with the price on the server;
- `beforeinstallprompt` — custom installation prompt.

Without such a list, the next agent will see "incomplete PWA" and will come to "fix" what was decided not to do.

---

## Checklist

1. Requests to `*.oneentry.cloud` do not pass through the SW cache.
2. Static `_next/static` is cached only in production.
3. Cache names are versioned, old ones are removed in `activate`.
4. SW is registered only in production.
5. `manifest.ts` takes the name/description from the same constants as the SEO metadata.
6. `offline.html` does not make network requests.
7. Unimplemented items are explicitly listed.
8. E2E checks the offline fallback (`.claude/rules/playwright-e2e.md`).

> Related rules: `.claude/rules/seo-metadata.md` (common site constants), `.claude/rules/security.md` (CSP: `manifest` and `sw.js` must pass `default-src 'self'`), `.claude/rules/sdk-init.md` (why session and cart are not cached by URL).
