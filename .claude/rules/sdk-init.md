# SDK Initialization — Advanced Settings

The basic singleton `lib/oneentry.ts` and call contexts are in CLAUDE.md, section "SDK Initialization". Here is what you need specifically: guest mode, deviceMetadata, `traficLimit`, a complete summary of contexts.

## Exports from `lib/oneentry.ts`

- **`getApi()`** — returns the current API instance. Use everywhere (works on both server and client). After `reDefine()` — works with user authorization.
- **`reDefine(refreshToken, langCode)`** — recreates the instance with a user token (call this when initializing the session from localStorage **on the client**). `reDefine` itself does not refresh — the SDK proactively obtains the access token before the first user-auth request (≥ 1.0.152). Before calling, check `hasActiveSession` to avoid unnecessarily recreating an active instance and making an extra `/refresh`. After `login()`, use `syncTokens`, not `reDefine` (tokens are already in the response from `auth()`).
- **`hasActiveSession()`** — returns `true` if the current instance has an accessToken.
- **`getLang()`** — returns the current langCode of the SDK (`'en_US'` by default). Use in Client Components for localization without `useParams`.
- **`getImageUrl(value)`** — normalizes the image field (object or array) into a URL string.
- **`isError(result)`** — type guard to check the SDK response for an error.

**⚠️ reDefine — check hasActiveSession before calling:**

```typescript
import { reDefine, hasActiveSession } from '@/lib/oneentry'

// It's better to syncTokens right after login (see tokens.md): reDefine will recreate
// the instance and make the SDK unnecessarily go to /refresh, rotating the fresh token
// ❌ REDUNDANT — blind reDefine without checking
await reDefine(refreshToken, langCode)

// ✅ CORRECT — skip if the session is already active
if (!hasActiveSession()) {
  await reDefine(refreshToken, langCode)
}
```

## `traficLimit` — disabling auto-enrichment

The option `traficLimit: true` (exactly like this, with one "f") in the config disables automatic enrichment requests of the SDK: loading product blocks in `Blocks.getBlocks`/`getBlockByMarker` and `Pages.getBlocksByPageUrl`, loading full entities in `Pages.searchPage`/`Products.searchProduct`. The default is `false` (enrichment is enabled). The SDK's JSDoc describes the semantics inversely — in the code, traffic is saved with `true`.

## Summary: what to call where

| Operation | Context | Why |
| --- | --- | --- |
| Public data (Pages, Products, Menus, Blocks) | Server Component / Server Action / Client Component | No restrictions — depends on the rendering strategy |
| Authorization (auth, signUp, generateCode) | **Client Component** (by default); server — only with passing `deviceMetadata` (≥ 1.0.155) | Device fingerprint |
| User data (Orders, Users, Payments) | Client Component via `getApi()` after `reDefine()` | Token is managed by `saveFunction` automatically |
| Forms and data submission | Server Action or Client Component | Depends on strategy |

| Strategy | Where executed | Example usage |
| --- | --- | --- |
| **SSR** (Server Component) | Server | Catalog, pages, menus, blocks |
| **SSG** (`generateStaticParams`) | Server (build-time) | Generating static product routes |
| **ISR** (`revalidate`) | Server (periodically) | Content with rare updates |
| **CSR** (Client Component) | Client (browser) | Authorization, dynamic data, search |
| **Server Action** (`'use server'`) | Server | Mutations, form submissions, user-authorized data |

```tsx
// SSR — Server Component
export default async function CatalogPage({ params }) {
  const { locale } = await params;
  const products = await getApi().Products.getProducts([], locale); // IProductsResponse: { total, items }
}

// SSG — generating static paths
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts([], 'en_US', { limit: 100 });
  if (isError(products)) return [];
  return products.items.map(p => ({ id: String(p.id) }));
}

// ISR — incremental regeneration
export const revalidate = 3600; // update once an hour

// CSR — Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const results = await getApi().Products.searchProduct(query); // IProductsEntity[]
```

## Guest Mode

The cart, wishlist (`Users.getCart/setCart/...`), activity tracking (`UserActivity.trackUserActivity`), and contextual recommendations from Blocks (`getCartComplement`, `getCartSimilar`, `getPersonalRecommendations`, `getRecentlyViewed`, …) work for **unauthorized guests** as well. For this, the SDK sends the header `x-guest-id` on requests without `accessToken`. When the user is authorized — the header **is not sent** (to avoid linking the guest trace with the account).

**In the browser — no configuration is needed.** If `guestId` is not set, the SDK generates a stable id (via Web Crypto) on the first request and saves it in `localStorage` under the key `oneentry_guest_id`. It survives reloads — the guest cart is not lost.

**On the server, the SDK does NOT automatically generate a guest id.** A single shared instance `defineOneEntry` serves all visitors — auto-generation would lead to one guest cart leaking to all. Therefore, on the server, **pass `guestId` explicitly** for each visitor (for example, from a cookie):

```typescript
// Method 1 — in the config when creating the instance
const api = defineOneEntry(PROJECT_URL, {
  token: APP_TOKEN,
  guestId: cookieGuestId,   // your stable id for the visitor (from cookie/session)
});

// Method 2 — at runtime, chainable (like setAccessToken). The method is available on EVERY module
// (it is NOT on the root object defineOneEntry); state is shared — affects the entire instance
getApi().Users.setGuestId(cookieGuestId);   // will return the module — can be chained
getApi().Users.setGuestId('');              // empty string — reset guest id
```

> Pattern for Next.js: on the first visit, generate an id (`crypto.randomUUID()`), place it in an `httpOnly` cookie, and on the server, pass it to `Users.setGuestId()` before guest calls to cart/wishlist. After login — the guest cart is usually "merged" into the user cart via `Users.setCart()` and reset `Users.setGuestId('')`.

## Device Metadata (override fingerprint, SDK ≥ 1.0.155)

The API binds refresh tokens to the header `x-device-metadata` (device fingerprint); the SDK sends it on POST requests and on `/refresh`. By default, the string is computed from the environment in which the SDK operates — on the server, it is Node fingerprint, not browser.

- `deviceMetadata` in the `defineOneEntry` config — set the header string explicitly;
- `setDeviceMetadata(str)` — runtime setting; `setDeviceMetadata('')` resets to the computed fingerprint; chainable;
- `getDeviceMetadata()` — the string that the SDK actually sends (overrides either the computed fingerprint).

Both methods are available on **every module**, but not on the root object (like `setGuestId`): `getApi().Users.setDeviceMetadata(str)`, `getApi().AuthProvider.getDeviceMetadata()`; state is shared across the entire instance.

The main scenario is server issuance of tokens on behalf of the browser (OAuth code exchange in Server Action, see `/create-google-oauth`): on the client, take the string from `getApi().AuthProvider.getDeviceMetadata()`, pass it to the Server Action, and there create a **separate per-request instance** `defineOneEntry(PROJECT_URL, { token: APP_TOKEN, deviceMetadata })` before calling `oauth()`. Otherwise, the refresh token will be bound to the server's fingerprint and will not refresh from the browser. Do not call `setDeviceMetadata()` on the shared server singleton — this mutates the state for all visitors (the same reason why `guestId` is passed explicitly on the server).
