# OneEntry SDK Glossary

## OneEntry SDK Glossary

A quick reference for key concepts. If you're unsure about a term — check here.

---

### marker

A string identifier for an entity in OneEntry (page, menu, form, attribute, authorization provider).

- **DO NOT guess markers** — always obtain them via `/inspect-api` or API
- `pageUrl` for pages is also a marker, not a Next.js route URL
- Examples: `'home'`, `'main-menu'`, `'contact_us'`, `'email'`

> How to find a marker: `/inspect-api` | Rule: do not guess — `02-ai-rules.md`

---

### id

A numeric identifier. Use only when the API explicitly requires `id`.
Prefer `marker`/`pageUrl` where possible — they are stable when transferring data.

---

### pageUrl

The marker for a page for the `Pages` API. NOT the Next.js route path.

```typescript
// ❌ INCORRECT — this is a Next.js route, not a pageUrl
getApi().Pages.getPageByUrl('/en/about')

// ✅ CORRECT — this is a marker from the OneEntry admin panel
getApi().Pages.getPageByUrl('about', locale)
```

> Details: `.claude/rules/nextjs-pages.md`

---

### attributeValues

An object with the attributes of the entity. The key is the `marker` of the attribute.

```typescript
const attrs = entity.attributeValues || {}
const title = attrs.title?.value      // if you know the marker
```

> Table of types and access to value: `.claude/rules/attribute-values.md`

---

### attributeSets

A set of attributes (template) assigned to an entity. Do not confuse with `attributeValues` — this is a schema, not values.

> Rules: `.claude/rules/attribute-sets.md`

---

### locale / langCode

Language code for API requests.

- `locale` — a string from Next.js params (`'en_US'`, `'ru_RU'`)
- `langCode` — the same, a parameter of SDK methods
- **DO NOT hardcode** `'en_US'` in components — take it from `params`

```typescript
// ✅ From params (Next.js 15+)
const { locale } = await params
getApi().Pages.getPageByUrl('home', locale)
```

> Rules: `.claude/rules/localization.md`

---

### getApi()

Get the current SDK instance. Singleton — **do not create new instances** via `defineOneEntry()` in components.

```typescript
import { getApi } from '@/lib/oneentry'
const products = await getApi().Products.getProducts()
```

---

### reDefine()

Recreate the SDK instance with a different `refreshToken` and/or `langCode`. Used during authorization.

```typescript
// ✅ ALWAYS check hasActiveSession() before calling
if (!hasActiveSession()) {
  await reDefine(refreshToken, locale)
}
```

> Details: `.claude/rules/tokens.md`

---

### hasActiveSession()

Check if the current SDK instance has an active `accessToken`.

> ⚠️ Check before `reDefine()` — otherwise, you will unnecessarily recreate an active session and trigger an extra `/refresh` (SDK ≥ 1.0.152 refreshes proactively before the first request).

---

### saveFunction

A callback in the SDK config that is called **automatically** on each rotation of `refreshToken`.
No need to manage the token manually — just save it on the first login.

> Details: `.claude/rules/tokens.md`

---

### isError()

Type guard to check the SDK response for an error. Create in `lib/oneentry.ts`.

```typescript
const result = await getApi().Products.getProducts()
if (isError(result)) {
  console.error(result.message)
  return
}
// result here is guaranteed not to be an error
```

> Details: `04-error-handling.md`

---

### fingerprint

User device data (header `x-device-metadata`) that the SDK sends on POST requests and during token refresh.
On the server, `deviceInfo.browser` will be `"Node.js/..."` — therefore:

**`auth()`, `signUp()`, `generateCode()`, `checkCode()` — only from Client Component**

**Override fingerprint (SDK ≥ 1.0.155):** set explicitly — `config.deviceMetadata`, or `setDeviceMetadata(str)` / `getDeviceMetadata()` (methods on each module, state shared across instance; chainable; `''` — reset). NOT on the root object `defineOneEntry` — call through the module: `getApi().AuthProvider.getDeviceMetadata()`.

Refresh tokens are tied to this header. The server-side OAuth code exchange must stamp the **browser** fingerprint (get it in the browser via `getDeviceMetadata()` and pass it to the server) — otherwise, the token will not refresh from the browser. The pattern is a per-request instance: `defineOneEntry(url, { token, deviceMetadata })`.

> Rules: `.claude/rules/auth-provider.md`

---

### image / file vs groupOfImages

The types `image` and `file` are expanded into an **OBJECT** when there is only one file (single-element array → object); when there are two or more — it remains an **ARRAY**. Starting from v1.0.157, this works in **all** modules (blocks, pages, users, orders, and others — previously only products/menus/forms/attribute-sets), so the form depends **only on the number of files**, not on the entity type or response path. Capture both variants:

```typescript
const raw = attrs.pic?.value
const img = Array.isArray(raw) ? raw[0] : raw
const url = img?.downloadLink
```

`groupOfImages` — always an **ARRAY**: `attrs.marker?.value?.[0]?.downloadLink`

> ⚠️ The number of files is determined by the project content — run `/inspect-api` or `console.log(attrs.marker?.value)` before use and write code resilient to both forms.
> Details: `.claude/rules/attribute-values.md`

---

### spam (form attribute type)

The Google reCAPTCHA v3 Enterprise captcha field. DO NOT render as `<input>`.

```typescript
if (attr.type === 'spam') {
  return <FormReCaptcha key={attr.marker} />
}
```

> ⚠️ The type is called `'spam'`, not `'captcha'`

---

### moduleFormConfigs / formModuleConfigId

Required parameters for submitting a form via `postFormsData`. Obtain from `getFormByMarker()`.

```typescript
const form = await getApi().Forms.getFormByMarker('contact_us')
const formModuleConfigId = form.moduleFormConfigs?.[0]?.id ?? 0
const moduleEntityIdentifier = form.moduleFormConfigs?.[0]?.entityIdentifiers?.[0]?.id ?? ''
```

> Details: `.claude/rules/forms.md`

---

### pageUrl marker vs Next.js route

| Concept | Example | Where to use |
| --- | --- | --- |
| `pageUrl` (marker) | `'about'` | Argument `getPageByUrl()` |
| Next.js route | `'/[locale]/about'` | Folders in `app/` |
| `href` for Link | `'/about'` | `<Link href>` |

---

### guestId / guest mode

Identifier for an anonymous visitor. The SDK sends it in the header `x-guest-id` on unauthenticated requests — this includes guest cart, wishlist, activity tracking, and contextual recommendations.

- **Browser** — generated and stored automatically (`localStorage` key `oneentry_guest_id`). No setup is needed.
- **Server** — NOT generated automatically; pass explicitly: `config.guestId` or `getApi().Users.setGuestId(id)` (method available on each module, state shared across instance; chainable; `''` — reset).
- When `accessToken` is present, the header `x-guest-id` **is not sent**.

> Details: `03-sdk-init.md` (section "Guest mode").

---

### cart / wishlist (server-side)

The cart and wishlist that are stored **on the OneEntry server** and synchronized between devices — for authenticated users or guests (by `guestId`).

```typescript
await getApi().Users.addCartItem({ productId: 123, qty: 2 })
const cart = await getApi().Users.getCart()  // { items: [{ productId, qty }], total }
```

- Stores only `productId` + `qty` (cart) / `productId` (wishlist) — load full product data via `Products.getProductsByIds`.
- Do not confuse with client-side Redux cart — this is an alternative/addition with cross-device synchronization.

> Skills: `/create-cart-manager`, `/create-favorites`.

---

### bonus (bonus balance)

The user's internal bonus "currency" (accruals/deductions). Separate from coupons and discounts.

- `Discounts.getBonusBalance()` → `{ balance }` (⚠️ requires authorization).
- `Discounts.getBonusHistory(...)` → transaction history (`IBonusTransactionEntity[]`).
- Deduction of bonuses in an order — field `bonusAmount` in `previewOrder` / `createOrder`; in the response — `bonusApplied`, `totalDue`.

> Details: `.claude/rules/orders.md`.

---

### content filter (Filters)

A customizable tree of nodes in the admin panel (`Filters.getFilterByMarker(marker)`), combining heterogeneous entities — pages, products, attributes, discounts, bonuses, payment methods. Nodes are nested via `children`, the node type is in `item.type`.

> Do not confuse with catalog filters (`IFilterParams[]` in `Products.getProducts`) — these are different things. Skill: `/create-content-filter`.
