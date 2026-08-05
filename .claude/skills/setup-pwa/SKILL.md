---
name: setup-pwa
description: Add PWA support to a OneEntry storefront — manifest, hand-written service worker, offline fallback
---
# Add PWA to a OneEntry storefront

Creates `app/manifest.ts`, `public/sw.js`, `public/offline.html`, and SW registration.

> Rule: `.claude/rules/pwa.md`. Key prohibition: **requests to OneEntry are not cached by the service worker**.

---

## Step 1: Clarify with the user

1. **Name and short name** of the application (`short_name` ≤ 12 characters — otherwise it will be truncated under the icon).
2. **Colors** `theme_color` / `background_color` — usually from the project's design system.
3. **Icons 192×192 and 512×512** — are there any ready in `public/icons/`? If not, ask.
4. **Cache images from CDN** (saves traffic but increases storage).

If the site's constants already exist (`SITE_NAME`, `SITE_DESCRIPTION` from SEO settings) — take them from there, do not create a second copy.

---

## Step 2: `app/manifest.ts`

```typescript
import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_DESCRIPTION } from '@/app/data/seoData'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Store',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111111',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
```

---

## Step 3: `public/sw.js`

```javascript
const CACHE_NAME = 'oe-store-v1'      // versioning: without this, the old shell lives forever
const STATIC_CACHE = 'oe-static-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ⚠️ MANDATORY: OneEntry bypasses the cache. Cart/wishlist/profile differ
  // by headers x-guest-id / Authorization, and SW caches by URL —
  // a cached response will show the next visitor someone else's data.
  if (url.hostname.endsWith('.oneentry.cloud')) return

  const isDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

  // Next static — cache-first only in production: in dev the chunk content changes
  // without changing the filename, and the cached chunk breaks the page
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

**Do not use `next-pwa` / `serwist`:** their default runtime rules cache, including API requests, and the prohibition above has to be configured on top of the generator.

---

## Step 4: `public/offline.html`

Self-sufficient page: inline CSS, zero network requests, zero JS bundle. Logo, "No connection", button `location.reload()`.

Do not show an offline version of the catalog — the data is user-scoped, and simulating functionality is worse than an honest message.

---

## Step 5: SW Registration

```tsx
// components/ServiceWorkerRegistrar.tsx — 'use client', connect in layout
useEffect(() => {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => { /* not critical */ })
}, [])
```

---

## Step 6: Coordinate with CSP

If security headers are configured in the project (`.claude/rules/security.md`), check that `default-src 'self'` allows `/manifest.webmanifest` and `/sw.js` (it allows — they are from the same origin), and `img-src` permits icons.

---

## Step 7: Document the unimplemented

In `docs/PWA.md` or in `MISMATCH-LOG.md` (section "Conscious deviations") list what is intentionally missing: push notifications, background sync, custom `beforeinstallprompt`. Otherwise, the next agent will come to "fix" an incomplete PWA.

---

## Step 8: Verification

1. DevTools → Application → Manifest: name, icons, `start_url` are picked up.
2. Application → Service Workers: SW is active (in production build).
3. Network → Offline → reload: `offline.html` is served.
4. **Key:** log in, add an item to the cart, open in another browser — the cart should not "leak". Requests to `*.oneentry.cloud` in Network are not marked `(from ServiceWorker)`.
5. Lighthouse → PWA: installation is available.

---

## Step 9: Remind key rules

```md
1. Requests to *.oneentry.cloud are NEVER cached by SW — cart/profile scoped by headers
2. _next/static is cached cache-first only in production (in dev the chunk changes without changing the name)
3. Cache names are versioned, old ones are deleted in activate
4. SW is registered only in production
5. Manifest takes name/description from common site constants, not from hardcode
6. offline.html does not make network requests
7. Unimplemented (push, background sync) is explicitly listed
```
