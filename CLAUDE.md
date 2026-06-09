# About the Project

oneentry — OneEntry NPM package

**SDK Documentation:** <https://js-sdk.oneentry.cloud/docs/index/>

## Glossary of OneEntry SDK Terms

A quick reference for key concepts. If you're unsure about a term — check here.

---

### marker

A string identifier for an entity in OneEntry (page, menu, form, attribute, authorization provider).

- **DO NOT guess markers** — always obtain them via `/inspect-api` or the API
- `pageUrl` for pages is also a marker, not a Next.js route URL
- Examples: `'home'`, `'main-menu'`, `'contact_us'`, `'email'`

> How to find a marker: `/inspect-api` | Rule: do not guess — `02-ai-rules.md`

---

### id

A numeric identifier. Use only when the API explicitly requires `id`.
Prefer `marker`/`pageUrl` where possible — they are stable during data migration.

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

A set of attributes (template) assigned to the entity. Do not confuse with `attributeValues` — this is a schema, not values.

> Rules: `.claude/rules/attribute-sets.md`

---

### locale / langCode

Language code for API requests.

- `locale` — a string from Next.js params (`'en_US'`, `'ru_RU'`)
- `langCode` — the same, a parameter for SDK methods
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

Callback in the SDK config that is called **automatically** on each rotation of `refreshToken`.
No need to manage the token manually — just save it on the first login.

> Details: `.claude/rules/tokens.md`

---

### isError()

Type guard to check the SDK response for an error. Create it in `lib/oneentry.ts`.

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

Data about the user's device that the SDK sends during authorization.
On the server, `deviceInfo.browser` will be `"Node.js/..."` — therefore:

**`auth()`, `signUp()`, `generateCode()`, `checkCode()` — only from Client Component**

> Rules: `.claude/rules/auth-provider.md`

---

### image vs groupOfImages

The `image` type returns **different structures** depending on the entity (verified with real data):

| Entity | `image` | Access |
| --- | --- | --- |
| **Products** | OBJECT | `attrs.pic?.value?.downloadLink` |
| **Pages** | ARRAY | `attrs.icon?.value?.[0]?.downloadLink` |
| **Blocks** | ARRAY | `attrs.bg?.value?.[0]?.downloadLink` |

`groupOfImages` — always an ARRAY: `attrs.marker?.value?.[0]?.downloadLink`

> ⚠️ **ALWAYS** run `/inspect-api` or `console.log(attrs.marker?.value)` before use.
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
| `pageUrl` (marker) | `'about'` | Argument of `getPageByUrl()` |
| Next.js route | `'/[locale]/about'` | Folders in `app/` |
| `href` for Link | `'/about'` | `<Link href>` |

---

### guestId / guest mode

Identifier for an anonymous visitor. The SDK sends it in the `x-guest-id` header on unauthorized requests — this enables guest cart, wishlist, activity tracking, and contextual recommendations.

- **Browser** — generated and stored automatically (`localStorage` key `oneentry_guest_id`). No setup needed.
- **Server** — NOT generated by itself; pass it explicitly: `config.guestId` or `getApi().setGuestId(id)` (chainable; `''` — reset).
- When `accessToken` is present, the `x-guest-id` header **is not sent**.

> Details: `03-sdk-init.md` (section "Guest Mode").

---

### cart / wishlist (server-side)

The cart and wishlist that are stored **on the OneEntry server** and synchronized between devices — for authorized users or guests (by `guestId`).

```typescript
await getApi().Users.addCartItem({ productId: 123, qty: 2 })
const cart = await getApi().Users.getCart()  // { items: [{ productId, qty }], total }
```

- Stores only `productId` + `qty` (cart) / `productId` (wishlist) — load full product data via `Products.getProductsByIds`.
- Do not confuse with client-side Redux cart — this is an alternative/addition with cross-device synchronization.

> Skills: `/create-cart-manager`, `/create-favorites`.

---

### bonus (bonus balance)

Internal bonus "currency" of the user (accruals/deductions). Separate from coupons and discounts.

- `Discounts.getBonusBalance()` → `{ balance }` (⚠️ requires authorization).
- `Discounts.getBonusHistory(...)` → transaction history (`IBonusTransactionEntity[]`).
- Deduction of bonuses in an order — field `bonusAmount` in `previewOrder` / `createOrder`; in the response — `bonusApplied`, `totalDue`.

> Details: `.claude/rules/orders.md`.

---

### content filter (Filters)

A customizable tree of nodes in the admin panel (`Filters.getFilterByMarker(marker)`), combining heterogeneous entities — pages, products, attributes, discounts, bonuses, payment methods. Nodes are nested through `children`, node type is in `item.type`.

> Do not confuse with catalog filters (`IFilterParams[]` in `Products.getProducts`) — these are different things. Skill: `/create-content-filter`.

## Project Context

**What is OneEntry:**
OneEntry is a headless CMS for e-commerce and content projects.

**The SDK allows:**

- Manage product catalogs and categories
- Create and process orders
- Work with authentication and profiles
- Integrate payment systems
- Manage multilingual content
- Work with forms, menus, pages, and many other entities

## Start of each session — mandatory checklist

### 🚨 BEFORE writing any code

1. Read `CLAUDE.md` **in full** (do not stop halfway)
2. `ls .claude/skills/` — check available skills
3. `ls .claude/rules/` — read **all** rule files (`cat .claude/rules/*.md`)
4. Read `eslint.config.mjs` — write code only according to the linter
5. Run the necessary skill if available (do not invent it yourself)

### Mandatory code requirements

- **No `any`** — use types from `node_modules/oneentry/dist/**/*.d.ts` (see `.claude/rules/typescript.md`)
- **Linter** — code must pass without errors (`next/core-web-vitals` + `next/typescript`)
- **Imports** — only used ones, no unnecessary imports
- **`<img>`** → `next/image`, **`<a>`** → `next/link`

### Skills for typical tasks

| Task                   | Skill                      |
|------------------------|----------------------------|
| Project initialization  | `/setup-oneentry`          |
| Orders page            | `/create-orders-list`      |
| Authentication form     | `/create-auth` (check)     |
| Page                   | `/create-page`             |
| Server Action          | `/create-server-action`    |
| Inspect API markers     | `/inspect-api`             |

### Before each new component

- Is there a skill? → run the skill
- Is there a rules file (`.claude/rules/`)? → read it
- Are SDK types checked via `grep -r "interface I..." node_modules/oneentry/dist --include="*.d.ts"`?

### Architectural decisions of the project

- **Tokens**: store in `localStorage` with the key `'refresh-token'`
- **`lib/oneentry.ts`**: the only file with `getApi`, `reDefine`, `makeUserApi`, `isError` — do not duplicate `isError` in other files
- **`makeUserApi`** returns `{ api, getNewToken }` — not just api
- **Orders page**: Client Component (`'use client'`) + `useEffect` + localStorage
- **Server Actions for orders**: `app/actions/orders.ts` with local `makeUserApi`
- **AuthProvider.auth/signUp/generateCode**: only from Client Component (fingerprint)
- **`next.config.ts`**: `remotePatterns` with `*.oneentry.cloud` for `next/image`

## Available skills

| Skill                          | What it creates                                        |
|-------------------------------|------------------------------------------------------|
| `/setup-nextjs`               | Create a Next.js project from scratch                |
| `/setup-oneentry`             | SDK initialization in an existing project            |
| `/create-auth`                | Authentication: login, registration, logout, AuthContext |
| `/create-google-oauth`        | Google OAuth: redirect, callback, code exchange      |
| `/create-profile`             | User profile page                                    |
| `/create-orders-list`         | Orders list page with cancellation and pagination     |
| `/create-checkout`            | Checkout: delivery form, timeInterval, payment      |
| `/create-product-list`        | Product list with filtering and pagination            |
| `/create-product-card`        | Product card                                        |
| `/create-product-page`        | Product page                                        |
| `/create-page`                | Page from CMS (Pages API)                           |
| `/create-menu`                | Navigation menu                                     |
| `/create-form`                | Form from Forms API                                 |
| `/create-cart-manager`        | Cart (CartContext / Redux)                          |
| `/create-favorites`           | Favorites                                           |
| `/create-filter-panel`        | Filter panel by attributes                           |
| `/create-locale-switcher`     | Language switcher                                    |
| `/create-search`              | Search by products / pages                           |
| `/create-reviews`             | Product reviews                                      |
| `/create-subscription-events` | Subscription to product events (price, availability) |
| `/create-server-action`       | Server Action for public SDK methods                 |
| `/inspect-api`                | API exploration: markers, response structure         |
| `/setup-playwright`           | E2E testing: Playwright + MCP server                 |

## Instructions for AI

### Starting a session — two mandatory questions

At the very beginning of the project, ask two questions (once per session) and save the answers in **project** memory (`~/.claude/projects/<project>/memory/`):

1. **“Do we need to save tokens?”**
   - **save** → do not run linter/build, do not write comments
   - **full** → JSDoc + lint + build after writing
   - Save as `feedback_token_mode.md`

2. **“Do we need to write E2E tests with Playwright?”**
   - **yes** → run **`/setup-playwright`**, write tests in `e2e/` for each new component/page, add `data-testid` to interactive elements
   - **no** → do not create `e2e/`
   - Save as `feedback_playwright.md`

**Memory file template:**

```markdown
---
name: <token-mode | playwright-mode>
description: <one line>
type: feedback
---

<mode>: [value].
**Why:** the user indicated at the beginning of the session.
**How to apply:** do not ask again, use automatically.
```

At the beginning of each new session — first read the project memory. If the file already exists — **do not ask**.

---

### 🗂️ Temporary files — only in `.claude/temp/`

All API inspection, debugging, test scripts (`inspect.mjs`, `debug.js`, etc.) — **only** in `.claude/temp/`. This folder survives sessions, files are reused. Never leave temporary files in the root or other folders.

---

### 🗂️ Folder structure `components/`

**NEVER** store components in a flat `components/`. Organize them into groups:

```text
components/
  layout/       ← Navbar, Footer, NavLoader
  product/      ← ProductCard, ProductGallery, RelatedProductsSlider
  catalog/      ← FilterPanel, InfiniteProductGrid, Pagination
  cart/         ← CartDrawer, AddToCartButton
  favorites/    ← FavoriteButton
  search/       ← SearchBar
  user/         ← UserStateSync, ProfileForm
  ui/           ← primitives (Button, Modal, Skeleton) — only without business logic
```

If it does not fit into any group — create a new one with a clear name.

---

### Main rule: check types and markers BEFORE the code

Unifies everything that was previously scattered across several checklists. Applies to **every** subtask.

#### 1. Types — from SDK, not from examples

`node_modules/oneentry/dist/` — the only source of truth. Documentation and existing code may be outdated / contain errors.

```bash
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

Import types: `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`. **Prohibited** `as any`/`any[]` — exception only for fields that the SDK itself declares as `any` (`ILocalizeInfo`, `IError`).

#### 2. Markers — from API via `/inspect-api`, not from memory

Run **`/inspect-api`** — it will read `.env.local` and return real markers (Pages, Forms, Menus, AuthProvider, …). Markers like `'main'`, `'header'`, `'footer'` — hallucination. If `.env.local` is missing — ask for URL and token.

**🚨 Existing code — NOT a source of truth:**

```typescript
// ❌ If you see it in the code — DO NOT repeat without verification:
const inStock = product.statusIdentifier === 'in_stock'
const stockQty = attrs.units_product?.value
// Before using these markers — confirm via `/inspect-api`.
```

#### 3. Entities must exist in OneEntry before connecting

If asked “add form X” / “connect product Y” — first confirm existence via API:

```ts
// Forms: getApi().Forms.getAllForms()
// Pages: getApi().Pages.getRootPages()
// Products: getApi().Products.getProducts()
// Attributes: getApi().AttributesSets.getAttributes()
```

If not found → respond: **“First create [name] in OneEntry Admin Panel, then I will connect it in the code.”**

#### 4. SDK binding immediately, without static stubs

If the user provided the layout of a component that should work with the SDK (authorization form, order form, data from CMS) — NEVER create a static UI stub. One step: (1) `/inspect-api` → markers → (2) Server Action → (3) connected component.

#### 5. Forms — ALWAYS dynamic

Never hardcode `<input name="..." type="...">`. Get fields via `getFormByMarker(marker)`, render dynamically by `attribute.type` and `attribute.marker`. The layout defines the style — fields come from the API.

#### 6. langCode — from `params`, not hardcoded

In Next.js 15+: `params` is `Promise<{locale: string}>`, need to `await params`. Do not hardcode `'en_US'` in components — the parameter is optional, the default is taken from SDK initialization. Details: `.claude/rules/localization.md`.

#### 7. attributeValues — by `type`, not randomly

| Context | Access to image |
| --- | --- |
| **Products** | `attrs.marker?.value?.downloadLink` (OBJECT) |
| **Pages/Blocks** | `attrs.marker?.value?.[0]?.downloadLink` (ARRAY) |
| **groupOfImages** | `attrs.marker?.value?.[0]?.downloadLink` (ARRAY) |
| **spam** (reCAPTCHA) | Render `<FormReCaptcha>`, NOT `<input>` |

If you don’t know the type — `console.log(attrs.marker)`. Full table: `.claude/rules/attribute-values.md`.

#### 8. “Add to Cart” button — by default, without question

For card / catalog / product page — `AddToCartButton` is added automatically. Cart not implemented — first `/create-cart-manager`. The “Add to Favorites” button (`FavoriteButton`) — **only on request**.

#### 9. `isError` + singleton SDK + exact types

- Check every API call through type guard `isError`.
- One instance of SDK in `lib/oneentry.ts`, use via `getApi()`. For changing configuration (`refreshToken`, `langCode`) — `reDefine()`, **not** new `defineOneEntry()`.
- Exact TS types from `oneentry/dist/`, never `as any`.

---

### 📋 Composite prompt = step-by-step execution

“Do X + add Y + create Z” — this is **not** a single pass. Real case: skipping the flag `isCheckCode: true` in the auth flow due to “general pass”.

**Step 1. Decomposition in TodoWrite:** for each subtask, define the required skill (see table below) and relevant `.claude/rules/*.md`.

**Step 2. Execution mode:**

- **Sequentially** (default) — one subtask → its rules → checklist → next.
- **In parallel** — only for completely independent tasks without common dependencies (different pages/components without common AuthContext/`lib/oneentry.ts`). Through Agent tool, each with full context.

**Step 3. Checklist after each subtask:** have all rules been applied, have all API fields been processed, have all flags (`isCheckCode`, `systemCodeTlsSec`, …) been considered.

❌ **NOT ALLOWED:** read the prompt with 3 tasks → immediately write 3 components in one message without a checklist in between.

#### Trigger keywords for skills

| Words in prompt | Required skill |
| --- | --- |
| login, registration, authorization, personal account, auth | `/create-auth` |
| google login, oauth, login via google/facebook | `/create-google-oauth` |
| profile, user personal data | `/create-profile` |
| orders, order history | `/create-orders-list` |
| checkout | `/create-checkout` |
| product list, catalog | `/create-product-list` |
| product card (in list) | `/create-product-card` |
| product page (detailed) | `/create-product-page` |
| cart | `/create-cart-manager` |
| favorites, wishlist | `/create-favorites` |
| filters, filter panel | `/create-filter-panel` |
| search, search bar | `/create-search` |
| reviews, reviews | `/create-reviews` |
| product subscription, notifications about price/availability | `/create-subscription-events` |
| language switcher, locale switcher | `/create-locale-switcher` |
| menu, navigation | `/create-menu` |
| feedback form, form from CMS | `/create-form` |
| page from CMS | `/create-page` |
| server action, server action | `/create-server-action` |
| create next.js project | `/setup-nextjs` |
| connect SDK, configure oneentry | `/setup-oneentry` |
| e2e tests, playwright | `/setup-playwright` |

> Trigger found → **first skill, then code**. Multiple triggers → multiple skills, each with its own checklist.

---

### When to stop and ask the user

- **Don’t know the marker** → `/inspect-api`; no Bash — ask.
- **403 Forbidden** → check: is `AuthProvider.auth/signUp/generateCode` called via Server Action? Move it to Client Component (fingerprint). Or check group permissions in the admin panel.
- **No layout** → “Is there an example of layout/design?”
- **Don’t understand the data source** → “Where should the data for [component] come from?”
- **Multiple solutions** → “X or Y, which do you prefer?”

---

### API permissions for the “Guests” group

By default, the “Guests” group has a limit of **10 objects** per entity. Before requests:

1. Open the admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
2. For each entity (Pages, Products, Forms, …): **Read: Yes, with restriction → without restrictions**
3. Without this, `getPages()`, `getProducts()`, etc. will return a maximum of 10 records.

---

### SDK call contexts (Next.js)

The SDK is isomorphic — works on the server and on the client. Context selection = rendering strategy:

- **SSR/SSG/ISR** → Server Component / `generateStaticParams` / `revalidate`
- **Mutations, server logic** → Server Action (`'use server'`)
- **CSR, dynamics, search** → Client Component via `getApi()`
- **User data** (Orders, Users, Payments) → Client Component via `getApi()` after `reDefine()`

**Strict limitation:** `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **only from Client Component** (on the server, the fingerprint is incorrect).

> Rules: `.claude/rules/server-actions.md`, `.claude/rules/auth-provider.md`, `.claude/rules/nextjs-pages.md`

---

### Miscellaneous

- **Pages — from CMS** (`getPageByUrl` + `getBlocksByPageUrl`), not hardcoded. The main one is usually `'home'`. Skill: `/create-page`.
- **Exactly copy the user’s layout** (Tailwind/JSX) — only change hardcoded data to API data.
- **Linter:** write code according to the project linter config. Do not fix someone else's linting/formatting — that’s the user’s job.
- **Pagination, loading states, markers instead of IDs** — recommended by default.

## SDK Initialization

> **Quick initialization of a new project:** use the skill **`/setup-oneentry`** — it will create `lib/oneentry.ts`, configure `next.config.ts`, and show the required environment variables.

### Minimal Configuration

```typescript
const api = defineOneEntry('https://your-project.oneentry.cloud', {
  token: 'your-api-token'
})
```

### Recommended Configuration (production)

```typescript
import { defineOneEntry } from 'oneentry';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

// saveFunction — called by the SDK automatically on each refreshToken rotation
const saveFunction = async (refreshToken: string): Promise<void> => {
  if (!refreshToken) {
    return;
  }
  localStorage.setItem('refresh-token', refreshToken);
};

/** Internal api instance that can be mutated */
let apiInstance = defineOneEntry(PROJECT_URL, {
  langCode: 'en_US',
  token: APP_TOKEN,
  auth: {
    saveFunction,
  },
});

/**
 * API getter that returns current api instance
 * @returns {ReturnType<typeof defineOneEntry>} Current api instance
 * @see {@link https://oneentry.cloud/instructions/npm OneEntry CMS docs}
 */
export const getApi = (): ReturnType<typeof defineOneEntry> => apiInstance;

/**
 * This function is used to update api config
 * @param {string} refreshToken - Refresh token from localStorage
 * @param {string} langCode     - Current language code
 * @see {@link https://oneentry.cloud/instructions/npm OneEntry CMS docs}
 */
export async function reDefine(
  refreshToken: string,
  langCode: string,
): Promise<void> {
  if (!refreshToken) {
    return;
  }

  apiInstance = defineOneEntry(PROJECT_URL, {
    langCode: langCode || 'en_US',
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction, // ← SDK calls this on rotation, the token is saved automatically
    },
  });
}
```

### Integration with Next.js (Singleton pattern)

**Setting up `.env.local`:**

If the file `.env.local` does not exist — create it and ask the user for the project URL and App Token (Settings → App Token in the OneEntry admin panel).

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

> `NEXT_PUBLIC_` — variables are available on both the server and the client. This allows using the SDK in both contexts.

The file `lib/oneentry.ts` contains exports:

- **`getApi()`** — returns the current API instance. Use it everywhere (works on both server and client). After `reDefine()` — works with user authorization
- **`reDefine(refreshToken, langCode)`** — recreates the instance with a user token (call this when initializing the session from localStorage **on the client**). The `reDefine` itself does not refresh — the SDK proactively gets the access token before the first user-auth request (≥ 1.0.152). Before calling, check `hasActiveSession` to avoid unnecessarily recreating an active instance and making an extra `/refresh`. After `login()`, use `syncTokens`, not `reDefine` (tokens are already in the response from `auth()`)
- **`hasActiveSession()`** — returns `true` if the current instance has an accessToken
- **`getLang()`** — returns the current langCode of the SDK (`'en_US'` by default). Use in Client Components for localization without `useParams`
- **`getImageUrl(value)`** — normalizes the image field (object or array) into a URL string
- **`isError(result)`** — type guard for checking the SDK response for errors

**⚠️ reDefine — check hasActiveSession before calling:**

```typescript
import { reDefine, hasActiveSession } from '@/lib/oneentry'

// Immediately after login, it's better to syncTokens (see rules/tokens.md): reDefine will recreate
// the instance and make the SDK unnecessarily go to /refresh, rotating a fresh token
// ❌ REDUNDANT — blind reDefine without checking
await reDefine(refreshToken, langCode)

// ✅ CORRECT — skip if the session is already active
if (!hasActiveSession()) {
  await reDefine(refreshToken, langCode)
}
```

Token handling rules are outlined in `.claude/rules/tokens.md` (automatically loaded when working with `app/actions/**/*.ts`).

**IMPORTANT: `next.config.ts` — add `remotePatterns` for images `*.oneentry.cloud`, otherwise `next/image` will throw an error.**

### SDK Execution Contexts (Server vs Client)

The SDK works **both on the server and on the client** — environment variables `NEXT_PUBLIC_*` are available in both contexts. The choice of context depends on the Next.js rendering strategy and the type of operation.

| Strategy | Where it runs | Example usage |
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
  const products = await getApi().Products.getProducts({ langCode: locale });
  // ...
}

// SSG — generating static paths
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 });
  if (isError(products)) return [];
  return products.map(p => ({ id: String(p.id) }));
}

// ISR — incremental regeneration
export const revalidate = 3600; // update once an hour

// CSR — Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const results = await getApi().Products.searchProducts({ name: query });
```

### ⚠️ Authorization — ONLY on the client (fingerprint)

`auth()`, `signUp()`, `generateCode()`, `checkCode()` — **only from Client Component**.

> Detailed rules and examples: `.claude/rules/auth-provider.md`

### Summary: what to call where

| Operation | Context | Why |
| --- | --- | --- |
| Public data (Pages, Products, Menus, Blocks) | Server Component / Server Action / Client Component | No restrictions — depends on the rendering strategy |
| Authorization (auth, signUp, generateCode) | **Only Client Component** | Device fingerprint |
| User data (Orders, Users, Payments) | Client Component via `getApi()` after `reDefine()` | Token is managed by `saveFunction` automatically |
| Forms and data submission | Server Action or Client Component | Depends on the strategy |

### Guest Mode

Cart, wishlist (`Users.getCart/setCart/...`), activity tracking (`UserActivity.trackUserActivity`), and contextual recommendations Blocks (`getCartComplement`, `getCartSimilar`, `getPersonalRecommendations`, `getRecentlyViewed`, …) work for **unauthorized guests** as well. For this, the SDK sends the header `x-guest-id` on requests without `accessToken`. When the user is authorized — the header **is not sent** (to avoid linking the guest trace with the account).

**In the browser — no configuration is needed.** If `guestId` is not set, the SDK generates a stable id (via Web Crypto) on the first request and saves it in `localStorage` under the key `oneentry_guest_id`. It survives reloads — the guest cart is not lost.

**On the server, the SDK DOES NOT generate guest id automatically.** A single shared instance of `defineOneEntry` serves all visitors — auto-generation would lead to one guest cart leaking to everyone. Therefore, on the server, **pass `guestId` explicitly** for each visitor (for example, from a cookie):

```typescript
// Method 1 — in the config when creating the instance
const api = defineOneEntry(PROJECT_URL, {
  token: APP_TOKEN,
  guestId: cookieGuestId,   // your stable id for the visitor (from cookie/session)
});

// Method 2 — at runtime, chainable (like setAccessToken)
getApi().setGuestId(cookieGuestId);   // will return this — can be chained
getApi().setGuestId('');              // empty string — reset guest id
```

> Pattern for Next.js: on the first visit, generate an id (`crypto.randomUUID()`), place it in an `httpOnly` cookie, and on the server, pass it to `setGuestId()` before guest calls to cart/wishlist. After login — the guest cart is usually "merged" into the user cart via `Users.setCart()` and reset `setGuestId('')`.

### ⚠️ params and searchParams in Next.js 15+/16 — these are Promises

In Next.js 15+, `params` and `searchParams` are Promises. Rules for pages are outlined in `.claude/rules/nextjs-pages.md` (automatically loaded when working with `page.tsx` / `layout.tsx`).
Localization rules are outlined in `.claude/rules/localization.md` (automatically loaded when working with `page.tsx`, `layout.tsx`, `app/actions/**/*.ts`).
In short:

```tsx
// ✅ Always await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

## Error Handling

The SDK by default (`isShell: true`) returns errors as an `IError` object instead of throwing an exception. Use the `isError` guard to check.

If the SDK is initialized with `isShell: false` — it throws exceptions, use `try/catch`.

```typescript
function isError(result: any): result is IError {
  return result !== null && typeof result === 'object' && 'statusCode' in result
}

async function getProduct(id: number) {
  const product = await getApi().Products.getProductById(id)

  if (isError(product)) {
    console.error(`Error ${product.statusCode}: ${product.message}`)
    return null
  }

  return product
}
```

### Structure of IError (from SDK)

```typescript
// oneentry/dist/base/utils
interface IError {
  statusCode: number
  message: string | string[]  // ⚠️ For form validator errors — ARRAY of strings!
  pageData: any
  timestamp: string
  [key: string]: any
}

// ⚠️ Normalize message — always! Especially for postFormsData (validators return string[]):
function normalizeErrorMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}
// Usage: return { error: normalizeErrorMessage(result.message) }

// Checking the error code
if (isError(result)) {
  switch (result.statusCode) {
    case 400: // Bad Request
    case 401: // Unauthorized — no or expired token
    case 403: // Forbidden — no permissions
    case 404: // Not Found — resource not found
    case 429: // Rate Limit Exceeded
    case 500: // Server Error
    case 502: // Bad Gateway
    case 503: // Service Unavailable
    case 504: // Gateway Timeout
  }
}
```

### Centralized handler — `ApiError` + `handleApiError`

In projects with many call sites for the SDK, it is convenient to extract error normalization into one place: `app/utils/errorHandler.ts`. This provides:

- a consistent error shape at all levels (`ApiError` extends `Error` + `.statusCode` + `.originalError`);
- a unified log collector with `handle` (caller name) and `timestamp`;
- mapping status code → user-facing message in one place.

```typescript
// app/utils/errorHandler.ts
import type { IError } from 'oneentry/dist/base/utils';
import { toast } from 'react-toastify'; // or your toast library

export class ApiError extends Error {
  statusCode: number;
  originalError?: unknown;

  constructor(message: string, statusCode: number, originalError?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

export function isIError(error: unknown): error is IError {
  return typeof error === 'object' && error !== null && 'statusCode' in error && 'message' in error;
}

export function handleApiError(handle: string, error: unknown): ApiError {
  if (isIError(error)) {
    console.log('API Error:', { handle, message: error.message, statusCode: error.statusCode, timestamp: new Date().toISOString() });
    return new ApiError(String(error.message) || 'An error occurred', error.statusCode || 500, error);
  }
  if (error instanceof Error) {
    console.log('Generic Error:', { handle, message: error.message, timestamp: new Date().toISOString() });
    return new ApiError(error.message || 'An error occurred', 500, error);
  }
  console.log('Unknown Error:', { handle, error, timestamp: new Date().toISOString() });
  return new ApiError('An unknown error occurred', 500, error);
}

// Optional hook — toast + ApiError in one call
export function useApiErrorHandler() {
  return (error: unknown): ApiError => {
    const apiError = handleApiError('useApiErrorHandler', error);
    toast.error(apiError.message);
    return apiError;
  };
}

// Mapping by status codes — user-friendly text
export function formatErrorMessage(error: unknown, defaultMessage = 'An error occurred'): string {
  if (isIError(error)) {
    switch (error.statusCode) {
      case 400: return 'Bad Request: Please check your input';
      case 401: return 'Unauthorized: Please log in';
      case 403: return 'Forbidden: You do not have permission';
      case 404: return 'Not Found: The requested resource was not found';
      case 500: return 'Internal Server Error: Please try again later';
      default:  return Array.isArray(error.message) ? error.message.join('; ') : (error.message || defaultMessage);
    }
  }
  return error instanceof Error ? (error.message || defaultMessage) : defaultMessage;
}
```

**Usage on the call site:**

```typescript
import { handleApiError } from '@/app/utils/errorHandler';

try {
  const order = await getApi().Orders.createOrder(storage, body);
  if (isError(order)) {
    // SDK isShell:true path — order is IError
    const e = handleApiError('createOrder', order);
    return { ok: false, error: e.message };
  }
  return { ok: true, orderId: order.id };
} catch (e) {
  // throw path — network, parsing, unexpected
  const apiError = handleApiError('createOrder', e);
  return { ok: false, error: apiError.message };
}
```

> ⚠️ `isError` (SDK guard) and `isIError` (local) duplicate each other — in new projects use one: either `isError` from `@/lib/oneentry`, or `isIError` from `errorHandler.ts`. Not both.

### "Resource is closed" — graceful fallback

`statusCode: 403` + `message: "Resource is closed"` means that the resource is not open in the admin panel (the page, form, block is not configured). This **is not a real authorization error** — it is a signal that "the admin has not set it up yet." Handle it as an empty result and log the item in [`MISMATCH-LOG.md`](../rules/mismatch-log.md) (Section C):

```typescript
const reviews = await getProductReviews(productId);
// graceful fallback: will return [] instead of throw if the review_form is not open in the admin panel
```

See the rule in [`rules/mismatch-log.md`](../rules/mismatch-log.md).

## Response Structures

**Entity interfaces** can be found in `node_modules/oneentry/dist/`. Key fields of any entity: `id`, `localizeInfos`, `attributeValues`, `pageUrl`.

```typescript
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces'
```

### attributeValues — types and access to value

> Detailed examples of each type: `.claude/rules/attribute-values.md`

| Type | Access to value | Note |
| --- | --- | --- |
| `string`, `integer`, `real`, `float` | `attrs.marker?.value` | primitive |
| `text` | `attrs.marker?.value?.htmlValue` | or `plainValue`, `mdValue` |
| `textWithHeader` | `attrs.marker?.value?.header`, `.htmlValue` | |
| `image` | `attrs.marker?.value?.downloadLink` | object |
| `groupOfImages` | `attrs.marker?.value?.[0]?.downloadLink` | **ARRAY!** |
| `file` | `attrs.marker?.value?.downloadLink` | object |
| `date`, `dateTime`, `time` | `attrs.marker?.value?.fullDate` | or `formattedValue` |
| `radioButton` | `attrs.marker?.value` | string-id |
| `list` | `attrs.marker?.value` | array of ids or objects with `extended` |
| `entity` | `attrs.marker?.value` | array of markers |
| `json` | `JSON.parse(attrs.marker?.value \|\| '{}')` | |
| `timeInterval` | `attrs.marker?.value` | `[[ISO, ISO], ...]` |
| `spam` | — | reCAPTCHA v3 captcha → `<FormReCaptcha>` |

```typescript
// If you know the marker — directly (preferred):
const title = attrs.title?.value
const img = attrs.photo?.value?.downloadLink         // image — object
const imgs = attrs.photos?.value?.[0]?.downloadLink  // groupOfImages — array
const badges = attrs.badges?.value || []
const icon = badges[0]?.extended?.value?.downloadLink

// If you don't know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.[0]?.downloadLink || ''
```

### Filtering by attributeValues

| Operator | Description | Example |
| --- | --- | --- |
| `in` | Value in the list | `"red,blue,green"` |
| `nin` | NOT in the list | `"red,blue"` |
| `eq` | Equal | `100` |
| `neq` | Not equal | `0` |
| `mth` | More than | `50` |
| `lth` | Less than | `1000` |
| `exs` | Exists | — |
| `nexs` | Does not exist | — |
| `pat` | Contains substring | `"Pro"` |
| `same` | Exact match | `"Headphones"` |

Special values: `today` (for date/dateTime), `now` (for time/dateTime).

```typescript
const filters = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 },
]
const products = await getApi().Products.getProducts(filters)
```

### localizeInfos

Contains data for the request language. Direct access to fields (without nesting by language!):

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.menuTitle    // menu title
page.localizeInfos?.htmlContent  // HTML content (check first)
page.localizeInfos?.content      // plain text
page.localizeInfos?.plainContent // unformatted text
```

## Typical Scenarios

### E-commerce

```typescript
// List of products
const products = await getApi().Products.getProducts()

// Product by ID
const product = await getApi().Products.getProductById(65)

// Filtering: price 100-500
const filtered = await getApi().Products.getProducts(
  [
    { attributeMarker: 'price', conditionMarker: 'mth', conditionValue: 100 },
    { attributeMarker: 'price', conditionMarker: 'lth', conditionValue: 500 },
  ]
)

// Order + payment session (call from client after reDefine)
const order = await getApi().Orders.createOrder('storage_marker', {
  formIdentifier, paymentAccountIdentifier, formData, products,
}) as any
if (isError(order)) return
const session = await getApi().Payments.createSession(order.id, 'session', false) as any
```

To create a product catalog, use the skill **`/create-product-list`** — it will create a Server Component with filtering through URL query params, pagination (load more), `FilterPanel` with price and color data from the API, and `ProductGrid` with remounting via `key`.

**Which method to use:**

| Scenario | Method |
| --- | --- |
| **Entire catalog** (all products of the project) | `getProducts(filters, locale, query)` |
| **Category products** (linked to category page in OneEntry) | `getProductsByPageUrl(categoryUrl, filters, locale, query)` |

```typescript
// ✅ Entire catalog
const result = await getApi().Products.getProducts([], locale, { offset: 0, limit: 10 })

// ✅ Products of a specific category (pageUrl — marker, not URL-route!)
const result = await getApi().Products.getProductsByPageUrl('soft_toys', [], locale, { offset: 0, limit: 10 })
```

⚠️ **Do not use `getProductsByPageUrl` to display the entire catalog** — it will return only products linked to a specific catalog_page.

To create a single product page, use the skill **`/create-product-card`** — it will create a product page with `getProductById`, extracting attributes by type and marker, an image gallery, a price block, and a section for related products via `getRelatedProductsById`.

To create a user orders list, use the skill **`/create-orders-list`** — it will create a Client Component with loading through all storages (`getAllOrdersStorage` + `getAllOrdersByMarker`), direct calls to `getApi()` from the client, and client-side pagination.

To create a checkout page, use the skill **`/create-checkout`** — it will create a form with fields from the Forms API (`getFormByMarker` by `formIdentifier` storage), handling the `timeInterval` type field (delivery slots), direct calls to `getApi()` for `createOrder` + `createSession`, and redirecting to the payment page.

To manage the cart (Redux slice + redux-persist, add/remove/quantity), use the skill **`/create-cart-manager`** — it will create a `CartSlice`, store with persistence, and `StoreProvider`.

For a favorites list (Redux slice + persist, stores only product IDs), use the skill **`/create-favorites`** — it will create a `FavoritesSlice`, a button, and a page with data loading from the API.

For a filter panel (price, color, availability + `FilterContext` + Apply/Reset), use the skill **`/create-filter-panel`**.

To subscribe to changes in product price and availability, use the skill **`/create-subscription-events`** — `Events.subscribeByMarker` / `unsubscribeByMarker`.

### Authorization and Users

To create an authorization/registration form, use the skill **`/create-auth`** — it will create a Client Component with direct SDK calls (fingerprint!) and Server Actions only for `getAuthProviders`/`logout`. Fields are dynamic from the Forms API, correct structure of `authData`, token synchronization.

For the user profile page, use the skill **`/create-profile`** — fields from the Users API, data updating, handling token race condition.

For the orders list page, use the skill **`/create-orders-list`** — loading through all storages, cancellation, repeat, client-side pagination.

For the language switcher, use the skill **`/create-locale-switcher`** — loads locales via `getLocales()`, builds links to the current page with a different locale segment.

For the search bar, use the skill **`/create-search`** — debounce 300ms, Server Action, dropdown of results.

### Creating Pages with Content from CMS

To create Next.js pages with data from OneEntry, use the skill **`/create-page`** — it will create a page file with `getPageByUrl`, `getBlocksByPageUrl`, and proper handling of `isError`.

Rules for working with pages, langCode, and `params` (Next.js 15+): `.claude/rules/nextjs-pages.md`.

## Content and Pages

> To create a content page from the CMS, use the skill **`/create-page`**.
> Rules for `params`/`searchParams` (Next.js 15+) and working with `langCode`: `.claude/rules/nextjs-pages.md` (loaded when working with `page.tsx`/`layout.tsx`).

**⚠️ CRITICALLY IMPORTANT: pageUrl is a MARKER, not a full path!**

In OneEntry, the `pageUrl` field is a **page identifier/marker**, NOT the actual URL of the application route.

```typescript
// ❌ INCORRECT - passing the full route path
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ CORRECT - passing only the page marker
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// The same for Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// NOT 'shop/category/ship_designer'!
```

**Rule:** The route URL in Next.js (for example, `/shop/category/ship_designer`) and `pageUrl` in OneEntry (`"ship_designer"`) are **different things**. When calling OneEntry SDK methods, always use only the marker from `pageUrl`.

### Multilingual Content

```typescript
// Page in Russian
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Menu in English
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

### Navigation Menu with Hierarchy

To create a navigation menu with support for submenus and URL prefixes, use the skill **`/create-menu`** — it will correctly handle the hierarchy through `parentId`, normalize `pages`, and build the URL.

## Working with Blocks and Attributes

> Table of `attributeValues` types and access examples: `.claude/rules/attribute-values.md` (loaded when working with `*.tsx` components).

### Working with Blocks

```typescript
// Getting a block by marker
const block = await getApi().Blocks.getBlockByMarker('hero_section', 'en_US')
if (isError(block)) return null

const attrs = block.attributeValues || {}

// Extracting attributes
const title = attrs.title?.value || block.localizeInfos?.title || ''
const description = attrs.description?.value || ''
const bgImage = attrs.bg?.value?.[0]?.downloadLink || ''

// Filtering page blocks
const blocks = await getApi().Pages.getBlocksByPageUrl('home')
if (!isError(blocks)) {
  // Exclude certain blocks by identifier
  const filteredBlocks = blocks.filter(
    (block: any) => block.identifier !== 'home_badges'
  )

  // Sorting by position
  const sortedBlocks = [...blocks].sort(
    (a: any, b: any) => a.position - b.position
  )
}
```

## Typical Mistakes

### Forgetting Error Checking

```typescript
// ❌ Crashes if IError
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title)

// ✅ Type guard isError
if (isError(product)) return
console.log(product.attributeValues.title)
```

> Detailed error handling — section **Error Handling**.

### Creating SDK Instance in Component

`defineOneEntry()` in a component = new instance on every render. Use singleton via `getApi()`. Full pattern — section **SDK Initialization**.

### Guessing Menu Markers and Filtering by Titles

```typescript
// ❌ Guessed marker 'main', filtering by title
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// ✅ Ask for marker and get the desired menu directly
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
```

### Creating Intermediate Types and Mapping API to Custom Objects

**NEVER** create an intermediate `type`/`interface` to wrap API data and map them in Server Actions. The component works directly with what the API returned.

```typescript
// ❌ Custom type, mapping — losing title/extended from listTitles, duplicating validators
type FeedbackField = { marker: string; title: string; required: boolean; ... }
return form.attributes.map((a: any) => ({
  marker: a.marker,
  title: a.localizeInfos?.title,
  required: !!a.validators?.requiredValidator?.strict,
  listOptions: a.listTitles.map((t: any) => t.value),
}))

// ✅ attributes as is (IFormAttribute[])
import type { IFormsEntity, IFormAttribute } from 'oneentry/dist/forms/formsInterfaces'
const form = await getApi().Forms.getFormByMarker('contact_us')
if (isError(form)) return { error: form.message }
const f = form as IFormsEntity
return {
  localizeInfos: f.localizeInfos,
  attributes: (f.attributes as IFormAttribute[])
    .filter((a) => a.type !== 'spam' && a.type !== 'button')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

// In the component — directly:
field.localizeInfos?.title
field.validators?.requiredValidator?.strict
field.validators?.stringInspectionValidator?.stringMax
field.listTitles   // full objects with title, value, extended
```

**Rule:** Server Action — a thin proxy. The only allowed operations: `filter` (exclude types) and `sort` (by `position`). Everything else — in the component.

### Inventing API Fields and Creating Unnecessary Transformations

```typescript
// ❌ Creating an intermediate object with invented children
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // ← field children NOT in API!
}))

// ✅ API object directly (hierarchy via parentId)
const navItems = pages.filter((p: any) => !p.parentId)
{navItems.map((item) => (
  <Link href={`/${item.pageUrl}`}>{item.localizeInfos?.title}</Link>
))}
```

### Logging Out on Any Error on Account Pages

On 401 — retry with the current token from localStorage (another operation might have updated it). Log out ONLY on confirmed 401/403 after retry.

**Never do `localStorage.removeItem('refreshToken')`** on form/data loading error — this destroys the fresh token that another operation just wrote.

> Full patterns: `/create-profile`, `/create-orders-list`.

### Showing Preloader on State Change (Not Just on Load)

When adding/removing from favorites/cart, the entire list reloads with a loader.

**Solution:** cache `useState<Record<id, Entity>>` + `useMemo` for the visible list. `useEffect` fetches only NEW ids (via `prevIdsRef`), removed ones are recalculated without a request.

> Ready pattern with Redux + persist — skill **`/create-favorites`**.

### Calling setState Synchronously Inside useEffect

Synchronous `setState`/`dispatch` in the body of `useEffect` causes cascading re-renders.

```typescript
// ❌ Synchronous setState / dispatch
useEffect(() => { setMounted(true); }, []);
useEffect(() => {
  if (!ids.length) { dispatch(setLoadedProducts([])); return; }
}, [ids]);

// ✅ Initial value directly in useState
const [items, setItems] = useState<Item[]>(() => computeInitial());

// ✅ dispatch only after async operation
useEffect(() => {
  if (!ids.length) return;
  fetchProductsByIds(ids).then((loaded) => {
    dispatch(setLoadedProducts(loaded));
  });
}, [ids]);

// ✅ mounted via useSyncExternalStore (if needed)
import { useSyncExternalStore } from 'react';
const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
```

**Rules:**

- Do not call `setState`/`dispatch` synchronously in the body of `useEffect`.
- Initial value — in `useState(initialValue)` or via `useMemo`.
- For "is the component mounted" — `useSyncExternalStore`, not `useEffect + setMounted`.
- Asynchronous calls (fetch, dispatch after `await`) — are allowed.

## Frequent AI Hallucinations

### Hardcoding OAuth Provider URL or Skipping Redirect

`config.oauthAuthUrl` from `getAuthProviderByMarker` contains the base URL. Do not hardcode — take it from the config. `oauth()` requires `code` (only after redirect).

```typescript
// ❌ Hardcoded URL
window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?...`

// ✅ baseUrl from OneEntry provider
const provider = await getApi().AuthProvider.getAuthProviderByMarker('google_ios')
if (isError(provider)) return
const baseUrl = (provider as any).config?.oauthAuthUrl
window.location.href = `${baseUrl}?client_id=...&redirect_uri=...`
```

**OAuth flow:** button → `getAuthProviderByMarker` → `config.oauthAuthUrl` + params → redirect → callback reads `code` → `oauth(code)` via Server Action.

> Details: `.claude/rules/auth-provider.md` (section "OAuth Providers").

### Invented Field `children` in Menu

Field `children` is not in `IMenusPages` — use `parentId`. Skill: **`/create-menu`**.

### Rendering Captcha as Regular Input

The captcha type in OneEntry is **`'spam'`**, not `'captcha'`. This is an invisible reCAPTCHA v3 — render `<FormReCaptcha>`, not `<input>`. Full pattern for dynamic form — skill **`/create-form`**.

### Using `getProductsByPageUrl` for Entire Catalog

`getProductsByPageUrl` returns **only products of a specific catalog_page**. For all products in the project — `getProducts`.

```typescript
// ✅ Entire catalog
await getApi().Products.getProducts([], locale, { offset: 0, limit: 30 })
// ✅ Category products (marker catalog_page in OneEntry)
await getApi().Products.getProductsByPageUrl('soft_toys', [], locale, { offset: 0, limit: 30 })
```

`getProducts` — global search, cart, "all products" page. `getProductsByPageUrl` — category page with the corresponding `catalog_page`. Skill **`/create-product-list`** at step 2 asks "where are the products from?" and creates both Server Actions.

### Hardcoding langCode

In Next.js 15+ `params` — Promise, `await params` is mandatory. Do not hardcode `'en_US'`. Details: `.claude/rules/localization.md`.

### Hardcoding Filter Data (Colors, Price Range)

Get from API. Full pattern for catalog with filters — skill **`/create-product-list`**.

### Passing `filters` and `gridKey` as Server Props in ShopView

`ShopView` MUST read `activeFilters` and `gridKey` from `useSearchParams`, otherwise `loadMore` ignores filters. Full pattern — skill **`/create-product-list`**.

## Working with Real Project Data

**IMPORTANT:** Use real project data to determine the structure of data and entity fields.

### ✅ PREFERRED METHOD: skill `/inspect-api`

> **IMPORTANT:** All API requests are performed **only through the SDK** (not via curl).
> The SDK normalizes the data before returning: it removes the locale wrapper from `attributeValues` and `localizeInfos`, converts `additionalFields` from an array to `Record<marker, field>`, transforms a single `image.value` from an array to an object. curl returns raw data — the code based on it will contain errors.

Use the skill **`/inspect-api`** — it will automatically read `.env.local` and run the SDK script:

```text
/inspect-api             # all data at once
/inspect-api pages       # page markers
/inspect-api menus       # menu markers
/inspect-api products    # product attributes
/inspect-api forms       # form markers
/inspect-api auth-providers
/inspect-api product-statuses
```

Result: a structured report with real markers, attribute types, and `statusIdentifier`.

**What to analyze in the response:**

- `items[0].statusIdentifier` — the real status of the product
- `items[0].attributeValues` — all attributes with `marker`, `type`, `value`
- `identifier` — the real marker for menus/forms/providers
- `pageUrl` — the real marker for pages

## Template for Working with a New Entity

**When working with a new entity (Product, Page, Block, Menu):**

### Step 1: Check the type in the SDK

```typescript
// node_modules/oneentry/dist/products/productsInterfaces.ts
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
```

### Step 2: Make a real call and check the data

```typescript
// Get 1 object and check the real structure
const testData = await getApi().Products.getProducts({ limit: 1 })
console.log('Structure:', testData[0])
console.log('Attributes:', testData[0]?.attributeValues)
```

### Step 3: Write code based on the real structure

```typescript
// Use REAL fields from steps 1-2
const attrs = product.attributeValues || {}
const title = attrs.product_title?.value  // ← I know that product_title exists from steps 1-2
```

**⚠️ DO NOT skip steps 1-2! DO NOT guess the structure!**

## General Patterns

### Working with Markers

```typescript
// By ID
const product = await getApi().Products.getProductById(123)
// By marker/URL
const product = await getApi().Products.getProductByUrl('/catalog/sneakers')
```

### Localization

`langCode?: string` — default `"en_US"`. Pass explicitly only in multilingual applications.

```typescript
const productEN = await getApi().Products.getProductById(123, 'en_US')
const productRU = await getApi().Products.getProductById(123, 'ru_RU')
```

### Pagination

`offset?: number` (default `0`), `limit?: number` (default `30`).

```typescript
const page1 = await getApi().Products.getProducts({ offset: 0, limit: 20 })
const page2 = await getApi().Products.getProducts({ offset: 20, limit: 20 })
```

### Filtering (`AttributeType[]`)

```typescript
interface AttributeType {
  attributeMarker: string  // attribute name
  conditionMarker: string  // "eq", "mth", "lth", "in", "nin"
  conditionValue: any
}

// Price 100-500
const filters: AttributeType[] = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 }
]
const products = await getApi().Products.getProducts({ body: filters })
```

### SSR/SSG Strategies (Next.js)

```tsx
// SSG — static generation
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 })
  if (isError(products)) return []
  return products.map(p => ({ id: String(p.id) }))
}

// ISR — incremental regeneration
export const revalidate = 3600 // 1 hour

// force-dynamic — disable SSG (only for cart/profile/orders)
export const dynamic = 'force-dynamic'
```

> Full rules for caching/streaming/parallelism: `.claude/rules/performance.md` + family of performance-* rules.

### user.state — storage for arbitrary user data

`user.state` — an object of arbitrary shape in `IUserEntity` for client data: cart, favorites, settings, browsing history.

**Critical rules:**

1. **Always spread** `{ ...user.state, newField }` — do not overwrite other fields.
2. **`formIdentifier`** is taken from `user.formIdentifier` — do not hardcode.
3. **Call from the client** via `getApi()` after `reDefine()` — the token is managed by `saveFunction`.
4. **Before each write — fresh `getUser()`.** The cached object between read and write may be outdated (another code may have changed `cart`/`favorites`).

```typescript
// lib/userState.ts
import { getApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

export async function getUserState() {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return { error: (user as any).message };
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
  };
}

// ✅ Fresh getUser → updateUser in one flow
export async function updateUserState(data: { cart?: Record<number, number>; favorites?: number[] }) {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return;
  await getApi().Users.updateUser({
    formIdentifier: user.formIdentifier,
    state: { ...user.state, ...data }, // spread the current state
  });
}
```

**Typical state structure:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // array of productId
  // any other fields
}
```

**Synchronization after login:** `getUserState()` from the client after `reDefine()`. For local storage without server synchronization — `/create-cart-manager` and `/create-favorites`.

#### Versioning for single initialization of Redux from server state

Without the `version` flag, the effect will overwrite Redux on every re-render, destroying local user changes. The pattern (shown for one field — similarly for others):

```typescript
const [cartVersion, setCartVersion] = useState(0)

useEffect(() => {
  if (!user?.state.cart || cartVersion > 0) return // already initialized
  user.state.cart.forEach((p: any) => dispatch(addToCart(p)))
  setCartVersion(1) // no longer reload from server
}, [user, cartVersion])

// Synchronization Redux → server only after initialization
useEffect(() => {
  if (!isAuth) return
  if (cartVersion === 0 && favoritesVersion === 0) return
  updateUserState({ cart: productsInCart, favorites: favoritesIds })
  // DO NOT pass user as a parameter — updateUserState fetches fresh data itself
}, [isAuth, productsInCart, favoritesIds])
```

### RTK Query for caching read requests

Use when the same data is needed by multiple Client Components (automatic deduplication + cache).

| Scenario | Approach |
| --- | --- |
| Server Component, one-time request | Direct `getApi()` |
| One Client Component, one-time request | Direct `getApi()` |
| Multiple Client Components read the same data | RTK Query (deduplication) |
| Polling (updating user state in real time) | RTK Query with `pollingInterval` |

```typescript
// app/api/RTKApi.ts — skeleton
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

export const oneEntryApi = createApi({
  reducerPath: 'oneEntryApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (build) => ({
    getBlockByMarker: build.query<IBlockEntity, { marker: string; lang: string }>({
      queryFn: async ({ marker, lang }) => {
        const result = await getApi().Blocks.getBlockByMarker(marker, lang)
        if (isError(result)) return { error: result }
        return { data: result as IBlockEntity }
      },
    }),
    getMe: build.query<IUserEntity, void>({
      queryFn: async () => {
        const result = await getApi().Users.getUser()
        if (isError(result)) return { error: result }
        return { data: result as IUserEntity }
      },
    }),
  }),
})
```

**Polling for auth state** (poll only when `isAuth`):

```typescript
const { data: freshUser } = useGetMeQuery(undefined, {
  skip: !isAuth,
  pollingInterval: isAuth ? 3000 : 0,
})
```

> Full rules (skip patterns, `keepUnusedDataFor` by resource type, `pollingInterval ≥ 30 s`, when **not** to use RTK Query, optimistic updates): `.claude/rules/performance-rtk.md`.

### Parallel Requests

```typescript
async function loadPageData(productId: number) {
  const [product, relatedProducts, reviews] = await Promise.all([
    getApi().Products.getProductById(productId),
    getApi().Products.getRelatedProductsById(productId),
    getApi().FormData.getFormsDataByMarker("reviews", productId, {}, 1)
  ])
  if (isError(product)) throw new Error("Product not found")
  return {
    product,
    relatedProducts: isError(relatedProducts) ? [] : relatedProducts,
    reviews: isError(reviews) ? [] : reviews
  }
}
```

## Frequent Scenarios (Extended)

### Order Form from OneEntry Forms API

**The order form (delivery, address, date/time) is taken from the OneEntry Forms API**, not hardcoded.

**How it works:**

1. `getApi().Orders.getAllOrdersStorage()` returns order storages, each with a `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` returns the fields of the delivery form
3. The form fields are rendered dynamically by type (`string`, `date`, `timeInterval`, etc.)

**The `timeInterval` field in the order form** is a field with a list of available delivery slots. Its `value` contains an array of available time intervals `[[start, end], ...]`, from which the following are determined:

- Available dates in the calendar (unique dates from start values)
- Available times for the selected date (times from start values for that date)

**⚠️ IMPORTANT:**

- The delivery form (`formIdentifier`) is tied to the order storage
- `timeInterval` in the form = list of available delivery slots, NOT entered data
- All user-auth calls in ONE instance

To implement the full checkout flow, use the skill **`/create-checkout`**.

### Product Catalog with Filters and Pagination

To create a product catalog with URL filters, infinite scrolling, and Server Actions, use the skill **`/create-product-list`** — it will create `lib/filters.ts`, `app/actions/products.ts`, Server Page, `ShopView`, and `ProductGrid` with the correct architecture.

To create a UI filter panel with `FilterContext`, price/color/availability components, and Apply/Reset buttons, use the skill **`/create-filter-panel`** — it complements `/create-product-list`.

### Search

To create a search bar (dropdown or separate page), use the skill **`/create-search`**.

For the language switcher, use the skill **`/create-locale-switcher`**.

### FormData — Reading Data from Forms

`FormData.getFormsDataByMarker` allows reading form submissions — applications, contact messages.

**⚠️ Requires Server Action** — called only server-side.

```typescript
// app/actions/forms.ts
'use server';
import { getApi } from '@/lib/oneentry';

export async function getFormSubmissions(marker: string) {
  try {
    const result = await getApi().FormData.getFormsDataByMarker(marker, 0, {}, 1);
    return { data: (result as any).data || [], total: (result as any).total || 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}
```

**Response Structure:** each element contains `id`, `time`, `formData: [{ marker, value, type }]`.

**Accessing Fields:** `Object.fromEntries(submission.formData.map(f => [f.marker, f.value]))`.

**Updating Status / Deleting:**

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Reviews with Hierarchy** (`isNested: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

**⚠️ Reviews in OneEntry are implemented through FormData** — use the skill **`/create-reviews`**.

### IntegrationCollections — Custom Collections

IntegrationCollections are arbitrary data tables in OneEntry (FAQ, directories, arbitrary content). Full CRUD is available without authorization.

**⚠️ Collection Marker:** obtain via `/inspect-api` or `getICollections()` — do not guess.

```typescript
// Reading rows
const rows = await getApi().IntegrationCollections.getICollectionRowsByMarker('faq');
// rows.data — array of rows, rows.total — count

// Reading a single row
const row = await getApi().IntegrationCollections.getICollectionRowByMarkerAndId('faq', id);

// Creating a row
await getApi().IntegrationCollections.createICollectionRow('faq', {
  data: { question: 'How to track my order?', answer: 'Via your profile page.' },
} as any);

// Updating
await getApi().IntegrationCollections.updateICollectionRow('faq', id, {
  data: { answer: 'Updated answer.' },
});

// Deleting
await getApi().IntegrationCollections.deleteICollectionRowByMarkerAndId('faq', id);
```

**Response Structure:**

```typescript
{
  data: [
    {
      id: 1,
      collectionIdentifier: 'faq',
      data: { question: '...', answer: '...' }, // arbitrary schema fields
      position: 1,
    }
  ],
  total: 42,
}
```

**Marker Validation:**

```typescript
const isValid = await getApi().IntegrationCollections.validateICollectionMarker('faq');
```

### Navigation by Categories

**⚠️ IMPORTANT:** `getRootPages()` and `getPages()` do NOT return `catalog_page` (product catalogs).
Pages have a `type` field: `common_page`, `error_page`, `catalog_page`.
To get a catalog, use `getPageByUrl()` — it finds pages of any type.
`getChildPagesByParentUrl()` also returns `catalog_page` child pages.

```typescript
// ❌ INCORRECT - catalog_page will not be in the results of getRootPages/getPages
const rootPages = await getApi().Pages.getRootPages()
// shop, category, and other catalog_page will NOT be here!

// ✅ CORRECT - getPageByUrl finds pages of ANY type
const shop = await getApi().Pages.getPageByUrl('shop', 'en_US')
if (isError(shop)) return []
console.log(shop.type) // "catalog_page"

// ✅ getChildPagesByParentUrl also returns catalog_page
const categories = await getApi().Pages.getChildPagesByParentUrl('shop', 'en_US')
if (isError(categories)) return []
// categories contains child catalogs (type: "catalog_page") and regular pages
```

## Troubleshooting

### Request Errors

#### 401 Unauthorized — session not initialized

**Symptom:** Calls to `Users.*`, `Orders.*`, `Payments.*` return 401.

**Cause:** `reDefine(refreshToken)` was not called before accessing user-auth methods, or the session has expired.

**Solution:** Ensure that `reDefine(refreshToken, locale)` is called during initialization (e.g., in AuthContext) before any user-auth calls. `saveFunction` automatically updates the token in localStorage on each rotation.

> Pattern: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

#### 401 Unauthorized — token race condition

**Symptom:** User is logged in, navigates to the profile/orders page — and finds themselves logged out.

**Cause:** A parallel operation (CartContext, FavoritesContext) has already invalidated the same `refreshToken`. The new page reads the stale token from localStorage.

> SDK (≥ 1.0.152) deduplicates simultaneous refreshes within *one* instance of `getApi()` (single-flight) — a race of parallel requests on the same page no longer logs out users. There remains a race between **tabs/reloads** (the fresh context takes the token from localStorage) — the rule below is relevant for it.

**Rule for all account pages:**

1. Server Action MUST return `statusCode` in the error object
2. On 401 — retry with `localStorage.getItem('refreshToken')` (the token may have been refreshed)
3. Log out ONLY on 401/403 AFTER retry
4. Never call `removeItem('refreshToken')` on data loading error

> Skill: **`/create-profile`** (profile) and **`/create-orders-list`** (orders)

#### 401 Unauthorized — invalid or expired token

A typical expired session. Redirect to `/login`.

> ⚠️ If the token expires too quickly — check the token lifetime in the OneEntry admin panel: `PROJECT_URL/users/auth-providers`.

#### 403 Forbidden

**Cause 1:** insufficient permissions for the action (user group settings in the admin panel).

**Cause 2:** calling `AuthProvider.auth/signUp/generateCode` via Server Action → `deviceInfo.browser` in the fingerprint will be server-side, not the user's actual browser. Move the call to Client Component.

**Method distribution by context:**

- Public (Pages, Products, Menus, Forms) — any context (server or client)
- `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **only Client Component** (fingerprint)
- `AuthProvider.logout()`, `.logoutAll()`, `.getAuthProviders()` — any context
- `Users.*`, `Orders.*`, `Payments.*` — **only Client Component** after `reDefine()`

#### 400 Bad Request — `notificationData.phoneSMS` is not allowed to be empty

An empty string `''` is rejected by the validator. **Do not pass `phoneSMS` at all** if the user does not have a phone — use `as any` to bypass TypeScript.

> Full signUp pattern: `.claude/rules/auth-provider.md`

#### 400 Bad Request — `authData` with extra fields or empty values

`authData` must contain **only** `{ marker, value }`, without metadata from Forms API. Filter out empty values before sending.

```typescript
// ✅ CORRECT
const authData = formFields
  .filter(f => formValues[f.marker]?.trim())
  .map(f => ({ marker: f.marker, value: formValues[f.marker] }))
```

> Full auth pattern: `.claude/rules/auth-provider.md` | Skill: **`/create-auth`**

#### 404 Not Found

```typescript
const product = await getApi().Products.getProductById(id)
if (isError(product) && product.statusCode === 404) return <NotFound />
```

#### 500 Server Error

**Cause:** calling `Users.*`, `Orders.*`, `Payments.*` via `getApi()` without prior `reDefine()`. These methods require user accessToken.

```typescript
// ❌ INCORRECT — reDefine() was not called, no user accessToken
const user = await getApi().Users.getUser();  // 500!

// ✅ CORRECT — reDefine() called before use (e.g., in AuthContext)
await reDefine(refreshToken, locale);
const user = await getApi().Users.getUser();
```

### Debugging Requests

Enable logging: `validation: { enabled: true, logErrors: true }` in the `defineOneEntry` config.

## Performance — SSR caching, lazy, parallelism

Full rules: ISR (`force-static` + `revalidate`), `unstable_cache` on top of server fetchers, lazy-mounting popups through a single `PopupRoot` + prefetch on hover, IntersectionObserver gate for images, deferred loading via `requestIdleCallback`, parallelization of layout fetches through Promise prop with React 19 `use()` — in `.claude/rules/performance.md`.

### Performance Rule Family

| Rule | When it applies | rulePaths (auto-load fingerprint) |
| --- | --- | --- |
| `.claude/rules/performance.md` | Any Next.js + OneEntry project | `app/**/page.tsx`, `app/**/layout.tsx`, `app/api/**/*.ts`, `components/**/*.tsx` |
| `.claude/rules/performance-popups.md` | There is a system of curtains / popups | `components/**/*Popup*.tsx`, `components/**/*Modal*.tsx`, `components/**/*Drawer*.tsx` |
| `.claude/rules/performance-rtk.md` | RTK Query is used | `**/RTKApi.ts`, `store/**/*.ts`, `app/store/**/*.ts` |
| `.claude/rules/performance-gsap.md` | GSAP animations are present | `**/animations/**/*.tsx`, `**/*Animation*.tsx`, `**/RegisterGSAP*.tsx` |
| `.claude/rules/performance-images.md` | `next/image` is used with OneEntry CDN | `next.config.{ts,js,mjs}`, `**/*Image*.tsx`, `components/**/*.tsx` |
| `.claude/rules/performance-streaming.md` | Streaming via `loading.tsx` / `<Suspense>` | `app/**/loading.tsx`, `app/**/page.tsx`, `app/**/layout.tsx` |
| `.claude/rules/performance-bundle.md` | Bundle size audit, code-splitting | `next.config.{ts,js,mjs}`, `package.json`, `app/**/page.tsx` |

`.claude/rules/performance.md` — universal entry point, loaded on any matching file. The other six auto-connect only if the project contains the corresponding "fingerprint" files — projects without RTK Query / GSAP / popups do not receive unnecessary context.

### tl;dr

- Content pages — `export const dynamic = 'force-static'; export const revalidate = 300;`. Never `force-dynamic` without justification.
- Each `useSearchParams()` in the page tree — in `<Suspense>`, otherwise ISR silently turns off.
- Server fetcher = `unstable_cache(impl, [keyParts], { revalidate, tags })` wrapped in React `cache()`. This is composition, not an alternative.
- In one server component, independent fetches — `Promise.all`. Listing-fetch by items — `Promise.all(items.map(...))`. No for-await waterfalls.
- Popups (Cart/Profile/Reservation/Modal) are mounted only through a single `PopupRoot` over `OpenDrawerContext`. Loader is added in `popupRegistry.ts`. On the trigger button — `onPointerEnter={() => prefetchPopup('CartPopup')}`. Details: `.claude/rules/performance-popups.md`.
- Heavy libs (lightbox/charts) — a separate module with static CSS import, `dynamic({ ssr: false })`, `mounted` state. Turbopack does NOT support dynamic `import()` CSS.
- Repeating product images — gate via `useNearViewport({ rootMargin: '300px' })` over `<Image loading="lazy">`.
- `<Link>` in listings — `prefetch={false}` for product cards.
- `next/image` with OneEntry CDN: `remotePatterns` specifically (not `'**'`), `formats: ['image/avif','image/webp']`, blur placeholder from `previewLink` via `unstable_cache`, one `priority` per route — see `.claude/rules/performance-images.md`.
- Each route segment with CMS loading has an adjacent `loading.tsx` with a fixed-size skeleton; slow blocks are moved to a separate async component outside local `<Suspense>`; PPR is enabled via `experimental.ppr: 'incremental'` + `export const experimental_ppr = true` on specific routes — see `.claude/rules/performance-streaming.md`.
- `@next/bundle-analyzer` is connected; first-load JS < 200 KB gzipped; barrel-`index.ts` is prohibited in own code; `optimizePackageImports` for `lucide-react`, `date-fns`, `gsap`, `lodash-es`; `@oneentry/web-sdk` is NOT imported in `'use client'` files — see `.claude/rules/performance-bundle.md`.
- GSAP: core + `ScrollTrigger` through a single `RegisterGSAP` at the root; lazy registration of `ScrollToPlugin`/`Draggable`/`Flip` on first use; `useGSAP({ scope })` for all timelines — see `.claude/rules/performance-gsap.md`.
- RTK Query: `pollingInterval ≥ 30 s`; `skip` on `!isOpen`/`!isAuth`/`!id`; do not use RTK Query for SSR-only data (there — `unstable_cache + cache()`); `keepUnusedDataFor` is selected based on resource type — see `.claude/rules/performance-rtk.md`.

## SDK Modules

```ts
const {
  AttributesSets, AuthProvider, Blocks, Discounts, Events, FileUploading,
  Filters, Forms, FormData, Locales, Menus, Orders, Pages, Payments,
  ProductStatuses, Products, Sitemap, Subscriptions, UserActivity, Users, WS
} = defineOneEntry('your-url', { token: 'your-app-token' });
```

**Methods requiring user authorization** (call after `reDefine(refreshToken)` on the client):
Events, Orders, Payments, Subscriptions, Users, WebSocket

**Guest mode.** Cart/wishlist (`Users.getCart/...`), activity tracking (`UserActivity`), and recommendations Blocks work for **unauthorized guests** — the SDK sends the header `x-guest-id` instead of `Authorization`. Details — `03-sdk-init.md` (section "Guest Mode").

**Field `rating`** (aggregate rating) is now available in `IProductsEntity`, `IPagesEntity`, and `IUserEntity` — use it for stars on cards. Rating forms — form type `'rating'` (see `/create-reviews`).

**`langCode` — optional parameter** for most methods. The default language is set during SDK initialization. Pass it explicitly only in multilingual applications. All interfaces and types of returned values are in `node_modules/oneentry/dist/`.

> **Rarely used modules** (`Admins`, `GeneralTypes`, `IntegrationCollections`, `Templates`, `TemplatesPreview`, `System`) are intentionally not described here — see signatures in `node_modules/oneentry/dist/*/...Interfaces.d.ts` if necessary.

### AttributeSets

```ts
getAttributes(langCode?, offset?, limit?, typeId?, sortBy?): IAttributesSetsResponse
getAttributesByMarker(marker, langCode?): IAttributeSetsEntity[]
getSingleAttributeByMarkerSet(setMarker, attributeMarker, langCode?): IAttributesSetsEntity
getAttributeSetByMarker(marker, langCode?): IAttributesSetsEntity
```

### AuthProvider

```ts
signUp(marker, body: ISignUpData, langCode?): ISignUpEntity
generateCode(marker, userIdentifier, eventIdentifier): void
checkCode(marker, userIdentifier, eventIdentifier, code): boolean
activateUser(marker, userIdentifier, code): boolean
auth(marker, body: IAuthPostBody): IAuthEntity
refresh(marker, token): IAuthEntity
logout(marker, token): boolean
logoutAll(marker): boolean
changePassword(marker, userIdentifier, eventIdentifier, type, code, newPassword, repeatPassword?): boolean
getAuthProviders(langCode?, offset?, limit?): IAuthProvidersEntity[]
getAuthProviderByMarker(marker, langCode?): IAuthProvidersEntity
getActiveSessionsByMarker(marker): IActiveSession[]
oauth(marker, body: IOauthData, langCode?): ISignUpEntity
```

### Blocks

```ts
getBlocks(type?: BlockType, langCode?, offset?, limit?): IBlocksResponse
getBlockByMarker(marker, langCode?, offset?, limit?): IBlockEntity
searchBlock(name, langCode?): ISearchBlock[]

// Recommendations / personalization (signPrice? — attribute marker for price signature)
getFrequentlyOrderedProducts(productId, marker, langCode?, signPrice?): IProductsResponse
getCartComplement(marker, langCode?, signPrice?): IProductsEntity[]
getCartComplementByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getCartSimilar(marker, langCode?, signPrice?): IProductsEntity[]
getCartSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getWishlistSimilar(marker, langCode?, signPrice?): IProductsEntity[]
getWishlistSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getPersonalRecommendations(marker, langCode?, signPrice?): IProductsEntity[]
getRecentlyViewed(marker, langCode?, signPrice?): IProductsEntity[]
getRepeatPurchase(marker, langCode?, signPrice?): IProductsEntity[]
getTrending(marker, langCode?, signPrice?): IProductsEntity[]

// Slider (only for slider_block): tree of slides with a flat pre-order array
getSlides(marker): IBlockSlidesResponse
```

- `...ByProductIds` — versions by explicit list: `body: IBlockProductsLookup = { productIds: number[], langCode?, limit?, signPrice? }`. Versions without `ByProductIds` take the cart/wishlist **from context** (authorized user or guest by `x-guest-id`).
- `BlockType` has been expanded with values: `'frequently_ordered_block'`, `'trending_block'`, `'recently_viewed_block'`, `'repeat_purchase_block'`, `'slider_block'`, `'personal_recommendations_block'`, `'cart_complement_block'`, `'cart_similar_block'`, `'wishlist_similar_block'`. Get the block marker in the OneEntry admin panel → Blocks.

### Discounts

```ts
getAllDiscounts(langCode?, offset?, limit?, type?: 'DISCOUNT' | 'BONUS' | 'PERSONAL_DISCOUNT'): IDiscountsResponse
getDiscountByMarker(marker, langCode?): IDiscountsEntity
validateDiscountsCoupon(code): ICouponValidationResult     // { valid, coupon?, error? }
getBonusBalance(): IBonusBalanceEntity                      // ⚠️ user — { balance }
getBonusHistory(type?, dateFrom?, dateTo?, discountId?, moduleId?, isAdmin?): IBonusTransactionEntity[]  // ⚠️ user
```

- `validateDiscountsCoupon` checks the coupon without linking to the cart; to calculate the discount on a specific cart, use `Orders.previewOrder` (see `.claude/rules/orders.md`).
- Bonuses: `getBonusBalance` / `getBonusHistory` require user authorization. `IBonusTransactionType` = `'ACCRUAL' | 'USAGE' | 'REDUCE' | 'REVERSAL_ACCRUAL' | 'REVERSAL_USAGE' | 'EXPIRATION'`.

### Events ⚠️ require authorization

```ts
// Product subscriptions (availability / price)
getAllSubscriptions(offset?, limit?): ISubscriptions
subscribeByMarker(marker, productId, langCode?): boolean
unsubscribeByMarker(marker, productId, langCode?): any

// Form event subscriptions
subscribeToForm(marker, body: ISubscribeFormEvent): boolean      // body: { formDataId, status? }
unsubscribeFromForm(marker, body: ISubscribeFormEvent): boolean
getFormSubscriptions(offset?, limit?): IListFormSubscription[]   // [{ eventMarker, formDataId }]

getAllEvents(): IContentApiEvent[]                               // public — all available events
```

> Do not confuse with the **Subscriptions** module (paid subscriptions) — these are different entities. `Events.getAllSubscriptions` → product subscriptions; `Subscriptions.getAllSubscriptions` → markers of paid subscriptions.

### FileUploading

```ts
upload(file: File | Blob, fileQuery?: IUploadingQuery): IUploadingReturn[]
delete(filename, fileQuery?): any
createFileFromUrl(url, filename, mimeType?): Promise<File>
getFile(id, type, entity, filename, template?): any
```

> `IUploadingReturn` now contains `contentType: string` (MIME type of the uploaded file).

### Filters

```ts
getFilterByMarker(marker, langCode?): IContentFilter            // tree of items (IContentFilterItem[])
```

Content filter — a customizable tree of nodes in the admin panel (pages, products, attributes, discounts, bonuses, payment methods). `IContentFilterItem.type` = `'page' | 'product' | 'admin' | 'attribute' | 'discount' | 'personal-discount' | 'bonus' | 'payment-method' | 'custom'`. Nodes are nested through `children`. Public (app-token).

### Forms

```ts
getAllForms(langCode?, offset?, limit?): IFormsEntity[]
getFormByMarker(marker, langCode?): IFormsEntity
```

> `IFormsEntity.type` is narrowed down to `'order' | 'sing_in_up' | 'collection' | 'data' | 'rating' | null`. `IFormConfig` (element `moduleFormConfigs`) has received the field `exceptionIds?: string[]`.

### FormData

```ts
postFormsData(body: IBodyPostFormData, langCode?): IPostFormResponse
getFormsDataByMarker(marker, formModuleConfigId, body?, isExtended?, langCode?, offset?, limit?): IFormsByMarkerDataEntity
updateFormsDataByid(id, body?): IUpdateFormsData
updateFormsDataStatusByid(id, body?): boolean
deleteFormsDataByid(id): boolean
```

> `IPostFormResponseData.fingerprint` is now `string | null` (for anonymous / app-token submissions it comes as `null`).

### Locales

```ts
getLocales(): ILocalEntity[]
```

### Menus

```ts
getMenusByMarker(marker, langCode?): IMenusEntity
```

### Orders ⚠️ require authorization

```ts
getAllOrdersStorage(langCode?, offset?, limit?): IOrdersEntity[]
getAllOrdersByMarker(marker, langCode?, offset?, limit?): IOrdersByMarkerEntity
getOrdersStorageByMarker(marker, langCode?): IOrdersEntity
getOrderByMarkerAndId(marker, id, langCode?): IOrderByMarkerEntity
previewOrder(body: ICreateOrderPreview, langCode?): IOrderPreviewResponse
createOrder(marker, body: IOrderData, langCode?): IBaseOrdersEntity
updateOrderByMarkerAndId(marker, id, body: IOrderData, langCode?): IBaseOrdersEntity
getAllStatusesByStorageMarker(marker, langCode?, offset?, limit?): IOrderStatus[]

// Refunds (refund requests) for the order
getRefunds(id): IRefundRequest[]
createRefundRequest(id, body: ICreateRefundRequest): boolean    // body: { products: Record<string, { quantity }>, note? }
cancelRefundRequest(id): boolean
```

> Bonuses and coupons: `ICreateOrderPreview` / `IOrderData` accept `couponCode`, `additionalDiscountsMarkers`, `bonusAmount`; responses (`IBaseOrdersEntity`, `IOrderPreviewResponse`) return `bonusApplied`, `totalDue`, `discountConfig`. Split payment (`IOrderSplit`) and `discountConfig` come in `getOrderByMarkerAndId`. Details — `.claude/rules/orders.md`.

### Pages

```ts
getRootPages(langCode?): IPagesEntity[]
getPages(langCode?): IPagesEntity[]
getPageById(id, langCode?): IPagesEntity
getPageByUrl(url, langCode?): IPagesEntity
getChildPagesByParentUrl(url, langCode?): IPagesEntity[]
getBlocksByPageUrl(url, langCode?): IPositionBlock[]
getConfigPageByUrl(url): IPageConfig
searchPage(name, url?, langCode?): IPagesEntity[]
```

> `IPagesEntity.type` is now typed as `PageType` = `'catalog_page' | 'common_page' | 'error_page' | 'external_page'` (a subset of `BlockType`). `categoryPath` has become `string | null` (for nested pages it comes as `null`).

### Payments ⚠️ require authorization

```ts
getSessions(offset?, limit?): ISessionsEntity
getSessionById(id): ISessionEntity
getSessionByOrderId(id): IAccountsEntity
createSession(orderId, type: 'session'|'intent', automaticTaxEnabled?): ICreateSessionEntity
getAccounts(): IAccountsEntity
getAccountById(id): IAccountsEntity
```

### Products

`body: IFilterParams[]` — required parameter, but defaults to `[]`. If filters are not needed, it can be omitted.

```ts
getProducts(body?: IFilterParams[], langCode?, userQuery?: IProductsQuery): IProductsResponse
getProductsEmptyPage(body?, langCode?, userQuery?): IAggregatedProductGroup[]   // ⚠️ POST, aggregated product groups without category
getProductsByPageId(id, body?, langCode?, userQuery?): IProductsResponse
getProductsPriceByPageUrl(url, langCode?, userQuery?): IProductsInfo
getProductsByPageUrl(url, body?, langCode?, userQuery?): IProductsResponse
getRelatedProductsById(id, langCode?, userQuery?): IProductsResponse
getProductsByIds(ids: string, langCode?, userQuery?): IProductsEntity[]
getProductById(id, langCode?, isNormalized?): IProductsEntity
getProductBlockById(id): IProductBlock[]
searchProduct(name, langCode?): IProductsEntity[]
getProductsByVectorSearch(body: IVectorSearchProducts, langCode?, offset?, limit?): IProductsEntity[]  // semantic (vector) search
getProductsCount(body?): IProductsCount
getProductsCountByPageId(id, body?): IProductsCount
getProductsCountByPageUrl(url, body?): IProductsCount
```

- `getProductsByVectorSearch` — `body: IVectorSearchProducts = { queryText, vectorDistanceThreshold?, maxHits?, debug? }`. Semantic search based on the meaning of the query (not substring, like `searchProduct`).
- `getProductsEmptyPage` — now **POST**, returns `IAggregatedProductGroup[]` (`{ attrValue, items, productIds, total }`), not `IProductsResponse`.

### ProductStatuses

```ts
getProductStatuses(langCode?): IProductStatusEntity[]
getProductsByStatusMarker(marker, langCode?): IProductStatusEntity
validateMarker(marker): boolean
```

### Sitemap

```ts
getSitemap(): string[]
updateSitemap(body: ISitemapQuery): string[]    // body: { baseUrls?, url?, lastmod?, changefreq?, priority? }
```

### Subscriptions ⚠️ require authorization

```ts
subscribe(body: ISubscribe): ICreatedSubscription          // body: { marker } → { id, amount, paymentUrl, status }
cancelSubscription(body: ICancelSubscription): boolean      // body: { marker }
getAllSubscriptions(): string[]                            // markers of all available subscriptions
getActiveSubscriptions(): string[]                         // markers of active user subscriptions
recoverSubscriptions(body: ICancelSubscription): boolean   // recovery through Stripe Billing Portal
```

Paid subscriptions. `subscribe` returns `paymentUrl` for redirecting to payment (like `createSession` for orders). Skill: `/create-subscription`.

### UserActivity

```ts
trackUserActivity(body: ITrackActivity): boolean           // works for user AND guest (x-guest-id)
```

`ITrackActivity = { type: TUserActivityType, productId?, pageId?, categoryId?, query?, meta? }`. `TUserActivityType` = `'product_view' | 'page_view' | 'category_view' | 'search' | 'product_add_to_cart' | 'product_remove_from_cart' | 'product_add_to_wishlist' | 'product_remove_from_wishlist' | 'product_purchase' | 'product_rating'`. These events feed the recommendations Blocks (recently-viewed, personal-recommendations, trending).

### Users ⚠️ require authorization

```ts
getUser(langCode?): IUserEntity
updateUser(body: IUserBody, langCode?): boolean
archiveUser(): boolean
deleteUser(): boolean
addFCMToken(token): boolean
deleteFCMToken(token): boolean

// Cart — works for user OR guest (x-guest-id)
getCart(): ICartResponse                       // { items: [{ productId, qty, addedAt? }], total }
setCart(body: ICartSet): ICartResponse         // full replacement: { items }
addCartItem(body: ICartAddItem): ICartResponse // { productId, qty } — add/update qty
removeCartItem(productId): ICartResponse

// Wishlist — works for user OR guest (x-guest-id)
getWishlist(): IWishlistResponse               // { items: [{ productId, addedAt? }], total }
setWishlist(body: IWishlistSet): IWishlistResponse
addWishlistItem(body: IWishlistAddItem): IWishlistResponse  // { productId }
removeWishlistItem(productId): IWishlistResponse
```

> Cart/Wishlist are stored on the OneEntry server and synchronized between devices/sessions. For anonymous visitors, a guest id is required (see `03-sdk-init.md`). Skills: `/create-cart-manager`, `/create-favorites`.

### WebSocket ⚠️ require authorization

```ts
connect(): Socket
```
