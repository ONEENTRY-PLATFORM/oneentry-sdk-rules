# About the Project

oneentry — OneEntry NPM package

**SDK Documentation:** https://js-sdk.oneentry.cloud/docs/index/

## Project Context

**What is OneEntry:**
OneEntry — a headless CMS for e-commerce and content projects.

**The SDK allows you to:**

- Manage a product catalog and categories
- Create and process orders
- Work with authentication and user profiles
- Integrate payment systems
- Manage multilingual content
- Work with forms, menus, pages, and many other entities

## Instructions for AI

### 🗂️ Temporary files — only in `.claude/temp/`

While working on a project, AI often creates temporary scripts for API inspection, testing, and debugging (`_inspect.mjs`, `test.ts`, `debug.js`, etc.).

**Rule:**

- Create all temporary files **only** in `.claude/temp/`
- The `.claude/temp/` folder persists throughout the project — files can be reused between sessions
- When a task is done and a temporary file is no longer needed — delete it
- **NEVER** leave temporary files in the project root or other folders

```text
.claude/
  temp/
    inspect-api.mjs     ← API inspection scripts
    debug-blocks.mjs    ← debug scripts
    test-auth.mjs       ← auth tests
```

---

### 🗂️ `components/` folder structure

**NEVER** put components in a flat `components/` folder. Always organize them into logical groups:

```text
components/
  layout/       ← Navbar, Footer, NavLoader, NavbarSkeleton
  product/      ← ProductCard, ProductCardSkeleton, ProductGallery, RelatedProductsSlider
  catalog/      ← CatalogSection, FilterPanel, InfiniteProductGrid, Pagination
  cart/         ← CartDrawer, AddToCartButton, AddBundleToCartButton
  favorites/    ← FavoriteButton
  search/       ← SearchBar
  user/         ← UserStateSync, ProfileForm
  ui/           ← reusable primitives (Button, Modal, Skeleton, etc.)
```

**Rules:**

- When creating a new component — immediately decide which group it belongs to
- If a component doesn't fit any group — create a new one with a clear name
- `ui/` — only for universal reusable primitives without business logic

---

When generating code with the OneEntry SDK **ALWAYS**:

### ⚠️ CRITICAL: Check types BEFORE writing code and use them

#### ALWAYS check the data structure in the SDK BEFORE writing code

`node_modules/oneentry/dist/` contains all interfaces (IProductsEntity, IBlockEntity, IAuthPostBody, etc.). Use `grep` to find interfaces BEFORE writing code.

```bash
# Find an interface
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10

# Find a method signature
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

**NEVER FABRICATE data structure!** Even if documentation examples look different — check the real TypeScript types.
**NEVER FABRICATE DATA! Always fetch from API (Pages, Menus, Products, Blocks, and other entities). Don't know where to get data → ASK THE USER. This is CRITICALLY IMPORTANT!**

#### Import types from the SDK

(`oneentry/dist/.../...Interfaces`)

#### Check the result of every API call

### 🚫 FORBIDDEN to use `as any` and `any[]`

Instead of `as any` — always import the type from `oneentry/dist/`:

- `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`
- `import type { IProductsResponse, IProductsEntity } from 'oneentry/dist/products/productsInterfaces'`

Exception: the SDK itself declares a field as `any` (e.g. `ILocalizeInfo`, `IError`) — then `as any` is not needed at all.

### 🔍 Pre-code checklist

**ALWAYS verify BEFORE generating code:**

1. ☑️ **Where does the data come from?**
   - Is there an API method? → Use it
   - No API method? → ASK THE USER where to get the data
   - Do NOT fabricate a data source!
1. ☑️ **Did you check the types in the SDK?**
   - **CRITICALLY IMPORTANT:** ALWAYS check interfaces BEFORE writing code!
   - Use grep: `grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   - Check method signature: `grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts"`
   - Do NOT rely on documentation examples — they may be outdated!
   - Do NOT fabricate data structures — check real TypeScript types!
1. ☑️ **Do you know the data structure?**
   - 1️⃣ First look at the type in the SDK (`node_modules/oneentry/dist/`)
   - 2️⃣ Then make a real call and inspect the data (`console.log`)
   - Do NOT guess object fields!
1. ☑️ **Is a marker needed?**
   - Method requires a marker? → run **`/inspect-api`** to see real markers from the API
   - No Bash access? → ASK THE USER what marker to use
   - Do NOT guess markers like 'main', 'header', 'footer'!
1. ☑️ **Is the langCode correct?**
   - Are params available in Next.js? → Use them (don't forget await in Next.js 15+/16!)
   - Do NOT hardcode 'en_US' in components! The default language is already set and langCode is optional.
   - Localization rules: `.claude/rules/localization.md`
1. ☑️ **Are you using params in Next.js 15+/16?**
   - Is the function async? → Yes, required!
   - Is params type `Promise<{...}>`? → Yes, it's a Promise!
   - Awaited params? → `const { locale } = await params;`
   - Do NOT forget await — otherwise you'll get undefined!
1. ☑️ **Is data transformation needed?**
   - Is data from the API already in the required format? → Use it directly
   - Do NOT create intermediate objects unnecessarily!
1. ☑️ **Does the component require the SDK (form, auth, data)?**
   - User provided markup for a form/component → IMMEDIATELY connect to the SDK, don't create a static placeholder first
   - Marker needed → run **`/inspect-api`** BEFORE writing the component
   - Server Action needed → create it TOGETHER with the component in one step
   - **NEVER** defer SDK integration to "later"

#### 🛑 When to STOP and ASK the user

**Do NOT write code if:**

1. ❓ **You haven't checked types in the SDK**
   → FIRST: `grep -r "interface I[TypeName]" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   → Example: Before using `getApi().AuthProvider.auth()` ALWAYS check the IAuthPostBody structure
1. ❓ **You don't know the marker** for Menus, Forms, Orders, Blocks, AuthProvider, etc.
   → Run **`/inspect-api`** — returns real markers from the API
   → No Bash access: For AuthProvider — `getApi().AuthProvider.getAuthProviders()`, for Forms — `getApi().Forms.getAllForms()`
   → Nothing worked: Ask: "What marker should I use for [name]?"
1. ❓ **Getting 403 Forbidden**
   → Check: are you calling `AuthProvider.auth/signUp/generateCode` via Server Action? → move to Client Component (fingerprint)
   → Or check user group permissions in the admin panel (`PROJECT_URL/users/groups`)
1. ❓ **Haven't seen the markup** but need to create a component
   → Ask: "Is there a markup/design example for this component?"
1. ❓ **Markup exists but you don't know the marker** for SDK connection
   → First run **`/inspect-api`**, get the marker — then create the component already connected
   → Do NOT create a static placeholder intending to "connect later"
1. ❓ **Don't understand where to get data**
   → Ask: "Where should the data for [component] come from?"
1. ❓ **Multiple solution options exist**
   → Suggest options: "Can be done as X or Y, which do you prefer?"

### Required

1. **💰 SAVE TOKENS: Don't fix linting, formatting, minor warnings. Leave that work to the user. Focus on the main task.**
1. **🎯 WRITE CODE BY LINTER RULES: When writing new code, always follow the project's linter settings (ESLint, Prettier, etc.). Check the linter config in the project before writing code if you don't know the settings.**
1. **🎨 COPY MARKUP EXACTLY: If the user provided markup (HTML/JSX), copy it exactly, especially if the same framework is used (e.g. Tailwind CSS). Don't change classes, structure, and styles without explicit need. Only replace hardcoded data with API data.**
1. **🔌 CONNECT TO SDK IMMEDIATELY: If the user provided markup for a component that should work with the SDK (auth form, order form, CMS data) — NEVER create a static UI placeholder first. Right away: (1) run `/inspect-api` to get markers, (2) create Server Action, (3) connect component to SDK — all in one step.**
1. **📋 FORMS ARE ALWAYS DYNAMIC: NEVER hardcode form fields (`<input>` with hardcoded `name`/`type`). Always get fields via `getFormByMarker(marker)` and render them dynamically by `attribute.type` and `attribute.marker`. User's markup defines only the visual style — fields come from the API.**
1. **❓ ASK FOR MARKERS:** Many API methods require a marker (Menus.getMenusByMarker, etc.) but there are no "get all" methods. Do NOT guess markers like 'main', 'footer', 'header'. ALWAYS ask the user which marker to use for the entity.
1. For AuthProvider you can get the list of providers: `getApi().AuthProvider.getAuthProviders()` to find available markers. For Forms you can get the list of forms: `getApi().Forms.getAllForms()` to find available markers. etc.
1. Create `isError` type guard
1. Use async/await
1. **Extract the API instance into a separate file (singleton). Use `getApi()` to get the current instance. Do NOT create new `defineOneEntry()` instances in components — use `reDefine()` to change configuration (refreshToken, langCode)**
1. **🚨 ONE API instance per group of user-authorized calls: Each call to `defineOneEntry(url, { auth: { refreshToken } })` calls `/refresh` and burns the token. NEVER call `makeUserApi(refreshToken)` multiple times with the same token. Combine all related calls into ONE Server Action with ONE instance:**

   ```typescript
   // ❌ WRONG — token burned by first function, second gets 401
   const storages = await getAllOrdersStorage(refreshToken);
   const orders = await getAllOrdersByMarker(marker, refreshToken); // 401!

   // ✅ CORRECT — one instance for all calls
   export async function loadAllOrders(refreshToken: string) {
     const { api } = makeUserApi(refreshToken); // single /refresh
     const storages = await api.Orders.getAllOrdersStorage(); // ← use api, not getApi()!
     const orders = await api.Orders.getAllOrdersByMarker(marker); // ← use api, not getApi()!
     return orders;
   }
   ```

1. Use correct TypeScript types
1. **When creating pages — get content from CMS Pages, don't hardcode**
1. **When working with attributeValues: if you KNOW the marker (attribute name), access directly `attrs.title?.value`. If you DON'T know — ask the user or search by type if the user doesn't know either `Object.values(attrs).find(a => a.type === 'image')`**
1. **🚨 BEFORE writing attribute access code — ALWAYS check its `type`, then use the correct `value` structure for that type. Do NOT guess the structure! Type table:**
   - `string`, `integer`, `real`, `float` → `attrs.marker?.value` (primitive)
   - `text` → `attrs.marker?.value?.htmlValue` or `value.plainValue` (object with fields)
   - `textWithHeader` → `attrs.marker?.value?.header`, `value.htmlValue`
   - `image`, `groupOfImages` → `attrs.marker?.value?.[0]?.downloadLink` (ARRAY!)
   - `file` → `attrs.marker?.value?.downloadLink` (object)
   - `date`, `dateTime`, `time` → `attrs.marker?.value?.fullDate` or `value.formattedValue`
   - `radioButton` → `attrs.marker?.value` (string id)
   - `list` → `attrs.marker?.value` (array of ids or objects with extended)
   - `entity` → `attrs.marker?.value` (array of markers)
   - `json` → `JSON.parse(attrs.marker?.value || '{}')`
   - `spam` → **captcha field (Google reCAPTCHA v3 Enterprise)** — do NOT render as `<input>`! Render the `FormReCaptcha` component. ⚠️ The type is called `'spam'`, not `'captcha'`
   - **If you don't know the attribute type — first add `console.log` to see the data, then write code**
1. **For "image, groupOfImages" type, value is an ARRAY — take `value[0].downloadLink`, not just `value`**
1. The SDK works both on the server and on the client (`NEXT_PUBLIC_*` variables are available in both contexts). The choice between Server Component / Server Action / Client Component is a matter of **rendering strategy**, not SDK limitations. Exception: `AuthProvider.auth/signUp/generateCode` — **client only** (device fingerprint).

### IMPORTANT: API permissions and record count limits

By default in OneEntry, the "Guests" user group has a limit of **maximum 10 objects** for entities (Pages, Products, etc.).

**Before using entity queries:**

1. Open the admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
1. For each entity (Pages, Products, Forms, etc.) change the permissions:
   - **Read: Yes, with restriction - with restriction on the number of records**
   - → switch to **without restrictions**
1. This allows fetching **all entities without count restrictions**

**Example:**

```text
https://react-native-course.oneentry.cloud/users/groups/edit-group/1?tab
→ Pages: Read → without restrictions
→ Products: Read → without restrictions
```

Without this setting, `getPages()`, `getProducts()`, and other methods will return a maximum of 10 records!

### Recommended

1. Handle pagination for lists
1. Pass `langCode` from context (i18n)
1. Use markers instead of IDs where possible
1. Add loading states
1. Always check results with the `isError` guard

### Working with pages

When a user asks to create a page, **ALWAYS** get content from CMS Pages, don't hardcode it. Use `getPageByUrl(url)` and `getBlocksByPageUrl(url)`. The home page usually has URL `'home'`.

> Page pattern: `.claude/rules/nextjs-pages.md` | Skill: **`/create-page`**

### SDK call contexts (Next.js)

The SDK is isomorphic — works both on the server and on the client. The choice of context depends on the rendering strategy:

- **SSR/SSG/ISR** → Server Component / `generateStaticParams` / `revalidate`
- **Mutations, server logic** → Server Action (`'use server'`)
- **CSR, dynamic, search** → Client Component (`'use client'`) directly via `getApi()`
- **User data** (Orders, Users, Payments) → Server Action with `makeUserApi()` or Client with `reDefine()`

**The only hard restriction:** `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **Client Component only** (on the server, `deviceInfo.browser` in the fingerprint will be the server, not the real user's browser).

> Server Actions rules: `.claude/rules/server-actions.md` | Auth rules: `.claude/rules/auth-provider.md`

## SDK Initialization

> **Quick initialization for a new project:** use skill **`/setup-oneentry`** — creates `lib/oneentry.ts`, configures `next.config.ts` and shows the required environment variables.

### Minimal setup

```typescript
const api = defineOneEntry('https://your-project.oneentry.cloud', {
  token: 'your-api-token'
})
```

### Recommended setup (production)

```typescript
const api = defineOneEntry(process.env.ONEENTRY_URL, {
  token: process.env.ONEENTRY_TOKEN,
  langCode: 'en_US',
  validation: {
    enabled: process.env.NODE_ENV === 'development',
    strictMode: false,
    logErrors: true,
  }
})
```

### Next.js integration (Singleton pattern)

**`.env.local` setup:**

If the `.env.local` file doesn't exist — create it and ask the user for the project URL and App Token (Settings → App Token in the OneEntry admin panel).

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

> `NEXT_PUBLIC_` — variables are available both on the server and on the client. This allows using the SDK in both contexts.

The `lib/oneentry.ts` file contains three exports:

- **`getApi()`** — returns the current API instance. Use everywhere for public requests (works both on the server and on the client)
- **`reDefine(refreshToken, langCode)`** — recreates the instance with a user token (call after login **on the client**)
- **`makeUserApi(refreshToken)`** — one-time user-auth instance for Server Actions. ⚠️ Each call burns the token via `/refresh` — create once per function

Token rules are in `.claude/rules/tokens.md` (auto-loaded when working with `app/actions/**/*.ts`).

**⚠️ ONE `makeUserApi` per entire Server Action:**

```typescript
// ❌ WRONG — token burned by first call, second → 401
const storages = await getAllOrdersStorage(refreshToken);
const orders = await getAllOrdersByMarker(marker, refreshToken);

// ✅ CORRECT — one instance, all requests through it
export async function loadAllOrders(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const storages = await api.Orders.getAllOrdersStorage();
  const orders = await api.Orders.getAllOrdersByMarker(marker);
  return { orders, newToken: getNewToken() };
}
```

**IMPORTANT: `next.config.ts` — add `remotePatterns` for `*.oneentry.cloud` images, otherwise `next/image` will throw an error.**

### SDK execution contexts (Server vs Client)

The SDK works **both on the server and on the client** — `NEXT_PUBLIC_*` environment variables are available in both contexts. The context choice depends on the Next.js rendering strategy and operation type.

| Strategy | Where it runs | Example usage |
|---|---|---|
| **SSR** (Server Component) | Server | Catalog, pages, menus, blocks |
| **SSG** (`generateStaticParams`) | Server (build-time) | Generating static product routes |
| **ISR** (`revalidate`) | Server (periodically) | Infrequently updated content |
| **CSR** (Client Component) | Client (browser) | Auth, dynamic data, search |
| **Server Action** (`'use server'`) | Server | Mutations, form submission, user-authorized data |

```tsx
// SSR — Server Component
export default async function CatalogPage({ params }) {
  const { locale } = await params;
  const products = await getApi().Products.getProducts({ langCode: locale });
  // ...
}

// SSG — static path generation
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 });
  if (isError(products)) return [];
  return products.map(p => ({ id: String(p.id) }));
}

// ISR — incremental regeneration
export const revalidate = 3600; // update every hour

// CSR — Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const results = await getApi().Products.searchProducts({ name: query });
```

### ⚠️ Auth — Client ONLY (fingerprint)

The SDK transmits the user's **device fingerprint** during authentication. On the server the SDK also generates a fingerprint, but `deviceInfo.browser` will be `"Node.js/..."` instead of the real user's browser. Therefore `auth()` / `signUp()` should be called from the client.

```tsx
// ❌ UNDESIRABLE — auth via Server Action (deviceInfo.browser = "Node.js/...", not real browser)
// app/actions/auth.ts
'use server';
export async function signIn(authData) {
  return await getApi().AuthProvider.auth('email', { authData }); // browser in fingerprint = Node.js
}

// ✅ CORRECT — auth directly from Client Component (fingerprint = user's browser)
// components/user/AuthForm.tsx
'use client';
import { getApi, isError } from '@/lib/oneentry';

async function handleSignIn(authData) {
  const result = await getApi().AuthProvider.auth('email', { authData });
  if (isError(result)) { /* handle error */ return; }
  localStorage.setItem('accessToken', result.accessToken);
  localStorage.setItem('refreshToken', result.refreshToken);
}
```

> Detailed auth rules: `.claude/rules/auth-provider.md`

### Summary: what to call where

| Operation | Context | Why |
|---|---|---|
| Public data (Pages, Products, Menus, Blocks) | Server Component / Server Action / Client Component | No restrictions — depends on rendering strategy |
| Auth (auth, signUp, generateCode) | **Client Component only** | Device fingerprint |
| User data (Orders, Users, Payments) | Server Action (`makeUserApi`) or Client (`reDefine`) | Depends on architecture |
| Forms and data submission | Server Action or Client Component | Depends on strategy |

### ⚠️ params and searchParams in Next.js 15+/16 are Promises

In Next.js 15+, `params` and `searchParams` are Promises. Page rules are in `.claude/rules/nextjs-pages.md` (auto-loaded when working with `page.tsx` / `layout.tsx`).
Localization rules are in `.claude/rules/localization.md` (auto-loaded when working with `page.tsx`, `layout.tsx`, `app/actions/**/*.ts`).
In brief:

```tsx
// ✅ Always await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

## Error Handling

The SDK by default (`isShell: true`) returns errors as an `IError` object, not exceptions. Use the `isError` guard to check.

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

### IError structure (from SDK)

```typescript
// oneentry/dist/errors/errorsInterfaces
interface IError {
  statusCode: number
  message: string
  error?: string
}

// Check error code
if (isError(result)) {
  switch (result.statusCode) {
    case 400: // Bad Request
    case 401: // Unauthorized — missing or expired token
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

## Response Structures

**Entity interfaces** can be found in `node_modules/oneentry/dist/`. Key fields of any entity: `id`, `localizeInfos`, `attributeValues`, `pageUrl`.

```typescript
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces'
```

### attributeValues — types and value access

> Detailed examples for each type: `.claude/rules/attribute-values.md`

| Type | Value access | Note |
| --- | --- | --- |
| `string`, `integer`, `real`, `float` | `attrs.marker?.value` | primitive |
| `text` | `attrs.marker?.value?.htmlValue` | or `plainValue`, `mdValue` |
| `textWithHeader` | `attrs.marker?.value?.header`, `.htmlValue` | |
| `image`, `groupOfImages` | `attrs.marker?.value?.[0]?.downloadLink` | **ARRAY!** |
| `file` | `attrs.marker?.value?.downloadLink` | object |
| `date`, `dateTime`, `time` | `attrs.marker?.value?.fullDate` | or `formattedValue` |
| `radioButton` | `attrs.marker?.value` | string id |
| `list` | `attrs.marker?.value` | array of ids or objects with `extended` |
| `entity` | `attrs.marker?.value` | array of markers |
| `json` | `JSON.parse(attrs.marker?.value \|\| '{}')` | |
| `timeInterval` | `attrs.marker?.value` | `[[ISO, ISO], ...]` |
| `spam` | — | reCAPTCHA v3 captcha → `<FormReCaptcha>` |

```typescript
// If you know the marker — directly (preferred):
const title = attrs.title?.value
const img = attrs.photo?.value?.[0]?.downloadLink   // image — ARRAY!
const badges = attrs.badges?.value || []
const icon = badges[0]?.extended?.value?.downloadLink

// If you don't know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.[0]?.downloadLink || ''
```

### Filtering by attributeValues

| Operator | Description | Example |
| --- | --- | --- |
| `in` | Value in list | `"red,blue,green"` |
| `nin` | NOT in list | `"red,blue"` |
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

Contains data for the request language. Direct field access (no nesting by language!):

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.menuTitle    // menu title
page.localizeInfos?.htmlContent  // HTML content (check first)
page.localizeInfos?.content      // plain text
page.localizeInfos?.plainContent // text without formatting
```

## Typical Scenarios

### E-commerce

```typescript
// Product list
const products = await getApi().Products.getProducts()

// Product by ID
const product = await getApi().Products.getProductById(65)

// Filter: price 100-500
const filtered = await getApi().Products.getProducts(
  [
    { attributeMarker: 'price', conditionMarker: 'mth', conditionValue: 100 },
    { attributeMarker: 'price', conditionMarker: 'lth', conditionValue: 500 },
  ]
)

// Order + payment session (via makeUserApi — one /refresh)
const { api } = makeUserApi(refreshToken)
const order = await api.Orders.createOrder('storage_marker', {
  formIdentifier, paymentAccountIdentifier, formData, products,
}) as any
if (isError(order)) return
const session = await api.Payments.createSession(order.id, 'session', false) as any
```

Use skill **`/create-product-list`** to create a product catalog — it will create a Server Component with `getProductsByPageUrl`, URL query param filtering, load more pagination, `FilterPanel` with price and color data from the API, and `ProductGrid` with remount via `key`.

Use skill **`/create-product-card`** to create a single product page — it will create a product page with `getProductById`, attribute extraction by type and marker, image gallery, price block, and related products section via `getRelatedProductsById`.

Use skill **`/create-orders-list`** to create a user order list — it will create a Client Component loading via all storages (`getAllOrdersStorage` + `getAllOrdersByMarker`), one `makeUserApi` for everything, client pagination and token race condition protection.

Use skill **`/create-checkout`** to create a checkout page — it will create a form with fields from the Forms API (`getFormByMarker` by storage `formIdentifier`), `timeInterval` field handling (delivery slots), one `makeUserApi` for `createOrder` + `createSession`, and redirect to the payment page.

Use skill **`/create-cart-manager`** to manage the cart (Redux slice + redux-persist, add/remove/quantity) — creates `CartSlice`, store with persistence and `StoreProvider`.

Use skill **`/create-favorites`** for the favorites list (Redux slice + persist, stores only product IDs) — creates `FavoritesSlice`, button, and page with data loading from the API.

Use skill **`/create-filter-panel`** for the filter panel (price, color, availability + `FilterContext` + Apply/Reset).

Use skill **`/create-subscription-events`** to subscribe to product price and availability changes — `Events.subscribeByMarker` / `unsubscribeByMarker`.

### Auth and users

Use skill **`/create-auth`** to create an auth/registration form — it will create a Client Component with direct SDK calls (fingerprint!) and Server Actions only for `getAuthProviders`/`logout`. Dynamic fields from Forms API, correct `authData` structure, token synchronization.

Use skill **`/create-profile`** for the user profile page — fields from Users API, data update, token race condition handling.

Use skill **`/create-orders-list`** for the order list page — load via all storages, cancel, retry, client pagination.

Use skill **`/create-locale-switcher`** for the language switcher — loads locales via `getLocales()`, builds links to the current page with a different locale segment.

Use skill **`/create-search`** for the search bar — 300ms debounce, Server Action, dropdown results.

### Creating pages with CMS content

Use skill **`/create-page`** to create Next.js pages with OneEntry data — it will create a page file with `getPageByUrl`, `getBlocksByPageUrl`, and correct `isError` handling.

Page rules, langCode and `params` (Next.js 15+): `.claude/rules/nextjs-pages.md`.

## Content and Pages

> Use skill **`/create-page`** to create a page with CMS content.
> Rules for `params`/`searchParams` (Next.js 15+) and working with `langCode`: `.claude/rules/nextjs-pages.md` (auto-loaded when working with `page.tsx`/`layout.tsx`).

**⚠️ CRITICALLY IMPORTANT: pageUrl is a MARKER, not a full path!**

In OneEntry, the `pageUrl` field is a **page identifier/marker**, NOT the real URL route of the application.

```typescript
// ❌ WRONG - passing full route path
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ CORRECT - passing only the page marker
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// Same for Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// NOT 'shop/category/ship_designer'!
```

**Rule:** The route URL in Next.js (e.g. `/shop/category/ship_designer`) and `pageUrl` in OneEntry (`"ship_designer"`) are **different things**. When calling OneEntry SDK methods, always use only the marker from `pageUrl`.

### Multilingual content

```typescript
// Page in Russian
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Menu in English
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

### Navigation menu with hierarchy

Use skill **`/create-menu`** to create a navigation menu with submenu support and URL prefixes — it correctly handles hierarchy via `parentId`, normalizes `pages`, and builds URLs.

## Working with Blocks and Attributes

> `attributeValues` type table and access examples: `.claude/rules/attribute-values.md` (auto-loaded when working with `*.tsx` components).

### Working with Blocks

```typescript
// Get a block by marker
const block = await getApi().Blocks.getBlockByMarker('hero_section', 'en_US')
if (isError(block)) return null

const attrs = block.attributeValues || {}

// Extract attributes
const title = attrs.title?.value || block.localizeInfos?.title || ''
const description = attrs.description?.value || ''
const bgImage = attrs.bg?.value?.[0]?.downloadLink || ''

// Filter page blocks
const blocks = await getApi().Pages.getBlocksByPageUrl('home')
if (!isError(blocks)) {
  // Exclude specific blocks by identifier
  const filteredBlocks = blocks.filter(
    (block: any) => block.identifier !== 'home_badges'
  )

  // Sort by position
  const sortedBlocks = [...blocks].sort(
    (a: any, b: any) => a.position - b.position
  )
}
```

## Common Mistakes

### Forgetting error checking

```typescript
// WRONG
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title) // Crashes if IError

// CORRECT
const product = await getApi().Products.getProductById(123)
if (isError(product)) return
console.log(product.attributeValues.title)
```

### Creating SDK instance in a component

```typescript
// ❌ WRONG - new instance on every render
function ProductList() {
  const api = defineOneEntry(url, config)
}

// ✅ CORRECT - singleton via getApi()
const products = await getApi().Products.getProducts()
```

> Full singleton pattern: **SDK Initialization** section

### Guessing menu markers and filtering by names

```typescript
// WRONG - guess marker 'main' and filter by names
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// CORRECT - ask user for marker and get directly
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
const quickLinks = !isError(quickLinksMenu) && quickLinksMenu.pages
  ? (Array.isArray(quickLinksMenu.pages) ? quickLinksMenu.pages : [quickLinksMenu.pages])
  : []
```

### Creating intermediate types and mapping API data to custom objects

**NEVER** create an intermediate `type`/`interface` to wrap API data and map it in Server Actions. Components should work directly with what the API returned.

```typescript
// ❌ WRONG — creating custom type and mapping attributes to it
type FeedbackField = { marker: string; title: string; required: boolean; ... }

export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  return {
    fields: form.attributes.map((a: any) => ({
      marker: a.marker,
      title: a.localizeInfos?.title,                        // ← already in a.localizeInfos.title!
      required: !!a.validators?.requiredValidator?.strict,  // ← already in a.validators!
      listOptions: a.listTitles.map((t: any) => t.value),  // ← lose title, extended!
    }))
  }
}

// ✅ CORRECT — return attributes as-is
export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }
  return {
    attributes: (form.attributes || [])
      .filter((a: any) => a.type !== 'spam' && a.type !== 'button')
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
  }
}

// In the component, access fields directly:
field.localizeInfos?.title
field.validators?.requiredValidator?.strict
field.validators?.stringInspectionValidator?.stringMax
field.listTitles   // full objects with title, value, extended
```

**Rule:** A Server Action is a thin proxy. The only acceptable operations on API data are: `filter` (exclude types) and `sort` (by `position`). Everything else — in the component.

### Fabricating data structures and creating unnecessary transformations

```typescript
// WRONG - creating intermediate object, fabricating structure
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // ← there is NO children field in the API!
}))

// CORRECT - use API data directly as-is
const navItems = pages.filter((p: any) => !p.parentId)

// In JSX access API fields directly
{navItems.map((item: any) => (
  <Link href={`/${item.pageUrl}`}>
    {item.localizeInfos?.title}
  </Link>
))}
```

### Logging out the user on any error in account pages

**Problem:** On 401 you need to retry with the current token from localStorage (another operation may have already updated it), and log out ONLY on confirmed 401/403 after retry.

Full profile page pattern — skill **`/create-profile`**.
Full orders page pattern — skill **`/create-orders-list`**.

**Never do `localStorage.removeItem('refreshToken')` on form/data load error** — this destroys the fresh token that another operation just wrote.

### Showing a preloader on state changes (not just initial load)

**Problem:** When adding/removing from favorites/cart, the entire list reloads with a loader.

**Solution:** cache in `useState<Record<id, Entity>>` + `useMemo` for the visible list. `useEffect` fetches only NEW ids (via `prevIdsRef`), removed items are recalculated without a request.

> Ready pattern with Redux + persist — skill **`/create-favorites`**

### Calling setState synchronously inside useEffect

**Problem:** Synchronous `setState` / `dispatch` in the `useEffect` body causes cascading re-renders.

```typescript
// ❌ WRONG — synchronous setState in useEffect
useEffect(() => { setMounted(true); }, []);

// ❌ WRONG — synchronous dispatch inside effect
useEffect(() => {
  if (!ids.length) { dispatch(setLoadedProducts([])); return; }
  // ...
}, [ids]);
```

**Rules:**

- Do not call `setState` / `dispatch` synchronously in the `useEffect` body — put the initial value into `useState(initialValue)` or compute via `useMemo`
- To check "is the component mounted" — **do not use** `useEffect + setMounted`. Instead use `useSyncExternalStore` or manage visibility through data
- If you need to reset state when a dependency changes — pass the initial value directly to `useState`, not via an effect
- Async calls (fetch, dispatch after await) — allowed inside `useEffect`

```typescript
// ✅ CORRECT — initial value right in useState
const [items, setItems] = useState<Item[]>(() => computeInitial());

// ✅ CORRECT — dispatch only after async operation
useEffect(() => {
  if (!ids.length) return; // just return, not dispatch
  fetchProductsByIds(ids).then((loaded) => {
    dispatch(setLoadedProducts(loaded)); // ← after await — ok
  });
}, [ids]);

// ✅ CORRECT — mounted via useSyncExternalStore
import { useSyncExternalStore } from 'react';
const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false  // serverSnapshot
);
```

## Common AI Hallucinations (real error examples)

### Fabricated `children` field in menus

There is no `children` field in `IMenusPages` — use `parentId` (see section above).

> Skill: **`/create-menu`**

### Rendering the captcha field as a regular input

The captcha type in OneEntry is `'spam'`, not `'captcha'`. This is an **invisible** reCAPTCHA v3 — render `<FormReCaptcha>`, not `<input>`.

```tsx
// ❌ HALLUCINATION
if (field.type === 'captcha') return <input type="text" />;

// ✅ CORRECT
if (field.type === 'spam') {
  return <FormReCaptcha siteKey={field.validators?.siteKey} ... />;
}
```

Full dynamic form pattern — skill **`/create-form`**.

### Hardcoded langCode

```typescript
// ❌ HALLUCINATION - hardcoded language in components
const page = await getApi().Pages.getPageByUrl('home', 'en_US')

// ✅ CORRECT — await params in Next.js 15+!
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const page = await getApi().Pages.getPageByUrl('home', locale)
}
```

### Hardcoding filter data (colors, price range)

Get colors and price range from the API, don't hardcode them. Full catalog with filters pattern — skill **`/create-product-list`**.

### Passing filters and gridKey as server props to ShopView

`ShopView` MUST read `activeFilters` and `gridKey` from `useSearchParams`, otherwise `loadMore` ignores filters. Full pattern — skill **`/create-product-list`**.

## Working with Real Project Data

**IMPORTANT:** Use real project data to determine the data structure and entity fields.

### ✅ PREFERRED METHOD: `/inspect-api` skill

Use skill **`/inspect-api`** — it will automatically read `.env.local` and make the needed curl requests:

```
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

- `items[0].statusIdentifier` — real product status
- `items[0].attributeValues` — all attributes with `marker`, `type`, `value`
- `identifier` — real marker for menus/forms/providers
- `pageUrl` — real marker for pages

## Template for Working with a New Entity

**When working with a new entity (Product, Page, Block, Menu):**

### Step 1: Look up the type in the SDK

```typescript
// node_modules/oneentry/dist/products/productsInterfaces.ts
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
```

### Step 2: Make a real call and inspect the data

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
const title = attrs.product_title?.value  // ← know product_title exists from steps 1-2
```

**⚠️ Do NOT skip steps 1-2! Do NOT guess the structure!**

## 🚨 FORBIDDEN: Taking markers from existing code

**Existing code may have been written with an error or guessed — it is NOT the source of truth.**

```typescript
// ❌ NOT ALLOWED — you see it in code and use it without verification:
const inStock = product.statusIdentifier === 'in_stock'
// → and immediately write: query.statusMarker = 'in_stock'  ← NOT ALLOWED!

// ❌ NOT ALLOWED — you see it in code and use it without verification:
const stockQty = attrs.units_product?.value
// → and immediately write: { attributeMarker: 'units_product', ... }  ← NOT ALLOWED!
```

**Even if the value looks plausible — ALWAYS verify via a real API request.**

### How to verify before writing code

Use skill **`/inspect-api`** — it will automatically read `.env.local` and return real markers.

If `.env.local` is not found — ask the user for the project URL and token.

## Common Patterns

### Working with markers

```typescript
// By ID
const product = await getApi().Products.getProductById(123)
// By marker/URL
const product = await getApi().Products.getProductByUrl('/catalog/sneakers')
```

### Localization

- `langCode?: string` — language code (default: "en_US")

```typescript
const productEN = await getApi().Products.getProductById(123, 'en_US')
const productRU = await getApi().Products.getProductById(123, 'ru_RU')
```

### Pagination

- `offset?: number` — offset (default: 0)
- `limit?: number` — record count (default: 30)

```typescript
// Page 1
const page1 = await getApi().Products.getProducts({ offset: 0, limit: 20 })
// Page 2
const page2 = await getApi().Products.getProducts({ offset: 20, limit: 20 })
```

### Filtering (AttributeType[])

```typescript
interface AttributeType {
  attributeMarker: string  // attribute name
  conditionMarker: string  // operator: "eq", "mth", "lth", "in", "nin"
  conditionValue: any      // value
}

// Example: price 100-500
const filters: AttributeType[] = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 }
]
const products = await getApi().Products.getProducts({ body: filters })
```

### SSR/SSG strategies (Next.js)

```tsx
// SSG - static generation
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 })
  if (isError(products)) return []
  return products.map(p => ({ id: String(p.id) }))
}

export default async function ProductPage({ params }) {
  const product = await getApi().Products.getProductById(Number(params.id))
  if (isError(product)) notFound()
  return <ProductView product={product} />
}

// ISR - incremental regeneration
export const revalidate = 3600 // 1 hour
```

### user.state — arbitrary user data storage

`user.state` is a free-form object in `IUserEntity` that can be used to store any client data: cart, favorites, settings, view history.

**⚠️ Critical rules:**

1. **Always spread** `{ ...user.state, newField }` — don't overwrite other fields entirely
2. **One `makeUserApi`** for getUser + updateUser — otherwise the token burns between calls
3. **`formIdentifier`** is taken from `user.formIdentifier` — don't hardcode it

```typescript
// app/actions/users.ts
'use server';

// Read state
export async function getUserState(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
    newToken: getNewToken(),
  };
}

// Write one field — ONE instance for getUser + updateUser
export async function saveUserFavorites(refreshToken: string, favorites: number[]) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  await api.Users.updateUser({
    formIdentifier: user.formIdentifier, // from user!
    state: { ...user.state, favorites }, // spread — don't wipe cart and other fields
  });
  return { success: true, newToken: getNewToken() };
}
```

**Typical state structure:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // array of productIds
  // any other fields...
}
```

**Sync after login:** one `makeUserApi` to load all state. For local storage without server sync — `/create-cart-manager` and `/create-favorites`.

### Parallel requests

```typescript
async function loadPageData(productId: number) {
  const [product, relatedProducts, reviews] = await Promise.all([
    getApi().Products.getProductById(productId),
    getApi().Products.getRelatedProductsById(productId),
    getApi().FormData.getFormsDataByMarker("reviews", productId, {}, 1)
  ])

  // Error checking
  if (isError(product)) throw new Error("Product not found")

  return {
    product,
    relatedProducts: isError(relatedProducts) ? [] : relatedProducts,
    reviews: isError(reviews) ? [] : reviews
  }
}
```

## Extended Common Scenarios

### Checkout form from OneEntry Forms API

**The form for checkout (delivery, address, date/time) comes from the OneEntry Forms API**, not hardcoded.

**How it works:**

1. `getApi().Orders.getAllOrdersStorage()` returns order storages, each has a `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` returns the delivery form fields
3. Form fields are rendered dynamically by type (`string`, `date`, `timeInterval`, etc.)

**The `timeInterval` field type in the order form** is a field with a list of available delivery slots. Its `value` contains an array of available time intervals `[[start, end], ...]`, from which:

- Available calendar dates are determined (unique dates from start values)
- Available times for the selected date (times from start values for that date)

**⚠️ IMPORTANT:**

- The delivery form (`formIdentifier`) is tied to the order storage
- `timeInterval` in the form = list of available delivery slots, NOT entered data
- All user-auth calls in ONE instance

Use skill **`/create-checkout`** to implement the full checkout flow.

### Product catalog with filters and pagination

Use skill **`/create-product-list`** to create a product catalog with URL filters, infinite scroll, and Server Actions — it will create `lib/filters.ts`, `app/actions/products.ts`, Server Page, `ShopView`, and `ProductGrid` with the correct architecture.

Use skill **`/create-filter-panel`** to create a filter panel UI with `FilterContext`, price/color/availability components, and Apply/Reset buttons — complements `/create-product-list`.

### Search

Use skill **`/create-search`** to create a search bar (dropdown or separate page).

Use skill **`/create-locale-switcher`** for the language switcher.

### FormData — reading form submissions

`FormData.getFormsDataByMarker` allows reading form submissions — applications, contact messages.

**⚠️ Requires Server Action** — server-side only.

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

**Response structure:** each element contains `id`, `time`, `formData: [{ marker, value, type }]`.

**Field access:** `Object.fromEntries(submission.formData.map(f => [f.marker, f.value]))`.

**Status update / delete:**

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Reviews with hierarchy** (`isNested: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

**⚠️ Reviews in OneEntry are implemented via FormData** — use skill **`/create-reviews`**.

### IntegrationCollections — custom collections

IntegrationCollections — arbitrary data tables in OneEntry (FAQ, reference books, custom content). Full CRUD available without authentication.

**⚠️ Collection marker:** get via `/inspect-api` or `getICollections()` — don't guess.

```typescript
// Read rows
const rows = await getApi().IntegrationCollections.getICollectionRowsByMarker('faq');
// rows.data — array of rows, rows.total — count

// Read one row
const row = await getApi().IntegrationCollections.getICollectionRowByMarkerAndId('faq', id);

// Create a row
await getApi().IntegrationCollections.createICollectionRow('faq', {
  data: { question: 'How to track my order?', answer: 'Via your profile page.' },
} as any);

// Update
await getApi().IntegrationCollections.updateICollectionRow('faq', id, {
  data: { answer: 'Updated answer.' },
});

// Delete
await getApi().IntegrationCollections.deleteICollectionRowByMarkerAndId('faq', id);
```

**Response structure:**

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

**Marker validation:**

```typescript
const isValid = await getApi().IntegrationCollections.validateICollectionMarker('faq');
```

### Category navigation

**⚠️ IMPORTANT:** `getRootPages()` and `getPages()` do NOT return `catalog_page` (product catalogs).
Pages have a `type` field: `common_page`, `error_page`, `catalog_page`.
Use `getPageByUrl()` to get catalogs — it finds pages of any type.
`getChildPagesByParentUrl()` also returns `catalog_page` child pages.

```typescript
// ❌ WRONG - catalog_page won't be in getRootPages/getPages results
const rootPages = await getApi().Pages.getRootPages()
// shop, category and other catalog_page items WON'T be here!

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

### Request errors

#### 401 Unauthorized — refreshToken burned when creating API instance

**🚨 CRITICALLY IMPORTANT:** Each call to `defineOneEntry(url, { auth: { refreshToken } })` calls `/refresh` and **burns** the token. After first use, the token becomes invalid.

**Symptom:** First API call succeeds, all subsequent ones return `401 Unauthorized`.

```typescript
// ❌ WRONG — each makeUserApi() calls /refresh and burns the token
const storages = await getAllOrdersStorage(refreshToken);    // token burned
const orders = await getAllOrdersByMarker(marker, refreshToken);  // 401!
```

**Rule:** Combine all user-authorized calls into **one Server Action** with **one** `makeUserApi(refreshToken)`.

> Pattern: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

#### 401 Unauthorized — token race condition

**Symptom:** User is logged in, navigates to profile/orders page — and gets logged out.

**Cause:** A parallel operation (CartContext, FavoritesContext) already burned the same `refreshToken`. The new page reads a stale token from localStorage.

**Rule for all account pages:**

1. Server Action MUST return `statusCode` in the error object
2. On 401 — retry with `localStorage.getItem('refreshToken')` (token may have been updated)
3. Log out ONLY on 401/403 AFTER retry
4. Never do `removeItem('refreshToken')` on data load error

> Skill: **`/create-profile`** (profile) and **`/create-orders-list`** (orders)

#### 401 Unauthorized — invalid or expired token

Normal expired session. Redirect to `/login`.

> ⚠️ If the token expires too quickly — check the token lifetime in the OneEntry admin panel: `PROJECT_URL/users/auth-providers`.

#### 403 Forbidden

**Cause 1:** insufficient permissions for the action (user group settings in the admin panel).

**Cause 2:** calling `AuthProvider.auth/signUp/generateCode` via Server Action → `deviceInfo.browser` in fingerprint will be server-side, not the real user's browser. Move the call to a Client Component.

**Method context distribution:**

- Public (Pages, Products, Menus, Forms) — any context (server or client)
- `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **Client Component only** (fingerprint)
- `AuthProvider.logout()`, `.logoutAll()`, `.getAuthProviders()` — any context
- `Users.*`, `Orders.*`, `Payments.*` — Server Action with `makeUserApi()` or Client with `reDefine()`

#### 400 Bad Request — `notificationData.phoneSMS` is not allowed to be empty

An empty string `''` is rejected by the validator. **Don't pass `phoneSMS` at all** if the user has no phone — use `as any` to bypass TypeScript.

> Full signUp pattern: `.claude/rules/auth-provider.md`

#### 400 Bad Request — `authData` with extra fields or empty values

`authData` must contain **only** `{ marker, value }`, without metadata from the Forms API. Filter empty values before sending.

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

**Cause:** calling `Users.*`, `Orders.*`, `Payments.*` via `getApi()` without a user token. These methods require a user accessToken.

```typescript
// ❌ WRONG — getApi() has no user accessToken
const user = await getApi().Users.getUser();  // 500!

// ✅ CORRECT
const { api } = makeUserApi(refreshToken);
const user = await api.Users.getUser();
```

### Debugging requests

Enable logging: `validation: { enabled: true, logErrors: true }` in the `defineOneEntry` config.

## SDK Modules

```ts
const {
  Admins, AttributesSets, AuthProvider, Blocks, Events, FileUploading,
  Forms, FormData, GeneralTypes, IntegrationCollections, Locales, Menus,
  Orders, Pages, Payments, ProductStatuses, Products, System,
  Templates, TemplatePreviews, Users, WS
} = defineOneEntry('your-url', { token: 'your-app-token' });
```

**Methods requiring `makeUserApi(refreshToken)` instead of `getApi()`:**
Events, Orders, Payments, Users, WebSocket

**`langCode` is an optional parameter** for most methods. The default language is set at SDK initialization. Pass explicitly only in multilingual apps (e.g. `getPageByUrl(url, locale)`). Find all interfaces and return types in `node_modules/oneentry/dist/`.

### Admins

```ts
getAdminsInfo(body?: AttributeType[], langCode?: string, offset?: number, limit?: number): IAdminEntity[]
```

### AttributeSets

```ts
getAttributes(langCode?: string, offset?: number, limit?: number, typeId?: any, sortBy?: string): IAttributesSetsResponse
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
```

### Events ⚠️ makeUserApi

```ts
getAllSubscriptions(offset?, limit?): ISubscriptions
subscribeByMarker(marker, productId, langCode?): boolean
unsubscribeByMarker(marker, productId, langCode?): any
```

### FileUploading

```ts
upload(file: File | Blob, fileQuery?: IUploadingQuery): IUploadingReturn[]
delete(filename, fileQuery?): any
createFileFromUrl(url, filename, mimeType?): Promise<File>
getFile(id, type, entity, filename, template?): any
```

### Forms

```ts
getAllForms(langCode?, offset?, limit?): IFormsEntity[]
getFormByMarker(marker, langCode?): IFormsEntity
```

### FormData

```ts
postFormsData(body: IBodyPostFormData, langCode?): IPostFormResponse
getFormsDataByMarker(marker, formModuleConfigId, body?, isExtended?, langCode?, offset?, limit?): IFormsByMarkerDataEntity
updateFormsDataByid(id, body?): IUpdateFormsData
updateFormsDataStatusByid(id, body?): boolean
deleteFormsDataByid(id): boolean
```

### GeneralTypes

```ts
getAllTypes(): IGeneralTypesEntity[]
```

### IntegrationCollections

```ts
getICollections(langCode?, userQuery?): ICollectionEntity[]
getICollectionById(id, langCode?): ICollectionEntity
getICollectionRowsById(id, langCode?, userQuery?): ICollectionRowsResponce
validateICollectionMarker(marker): ICollectionIsValid
getICollectionRowsByMarker(marker, langCode?): ICollectionRowsResponce
getICollectionRowByMarkerAndId(marker, id, langCode?): ICollectionRow
createICollectionRow(marker, body, langCode?): ICollectionRow
updateICollectionRow(marker, id, body, langCode?): ICollectionRow
deleteICollectionRowByMarkerAndId(marker, id): boolean
```

### Locales

```ts
getLocales(): ILocalEntity[]
```

### Menus

```ts
getMenusByMarker(marker, langCode?): IMenusEntity
```

### Orders ⚠️ makeUserApi

```ts
getAllOrdersStorage(langCode?, offset?, limit?): IOrdersEntity[]
getAllOrdersByMarker(marker, langCode?, offset?, limit?): IOrdersByMarkerEntity
getOrderByMarker(marker, langCode?): IOrdersEntity
getOrderByMarkerAndId(marker, id, langCode?): IOrderByMarkerEntity
createOrder(marker, body: IOrderData, langCode?): IBaseOrdersEntity
updateOrderByMarkerAndId(marker, id, body: IOrderData, langCode?): IBaseOrdersEntity
```

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

### Payments ⚠️ makeUserApi

```ts
getSessions(offset?, limit?): ISessionsEntity
getSessionById(id): ISessionEntity
getSessionByOrderId(id): IAccountsEntity
createSession(orderId, type: 'session'|'intent', automaticTaxEnabled?): ICreateSessionEntity
getAccounts(): IAccountsEntity
getAccountById(id): IAccountsEntity
```

### Products

`body: IFilterParams[]` — required parameter, but defaults to `[]`. Can be omitted if no filters needed.

```ts
getProducts(body?: IFilterParams[], langCode?, userQuery?: IProductsQuery): IProductsResponse
getProductsEmptyPage(langCode?, userQuery?): IProductsResponse
getProductsByPageId(id, body?, langCode?, userQuery?): IProductsResponse
getProductsPriceByPageUrl(url, langCode?, userQuery?): IProductsInfo
getProductsByPageUrl(url, body?, langCode?, userQuery?): IProductsResponse
getRelatedProductsById(id, langCode?, userQuery?): IProductsResponse
getProductsByIds(ids: string, langCode?, userQuery?): IProductsEntity[]
getProductById(id, langCode?): IProductsEntity
getProductBlockById(id): IProductBlock
searchProduct(name, langCode?): IProductsEntity[]
getProductsCount(body?): IProductsCount
getProductsCountByPageId(id, body?): IProductsCount
getProductsCountByPageUrl(url, body?): IProductsCount
```

### ProductStatuses

```ts
getProductStatuses(langCode?): IProductStatusEntity[]
getProductsByStatusMarker(marker, langCode?): IProductStatusEntity
validateMarker(marker): boolean
```

### System

```ts
validateCapcha(): any
getApiStat(): any
```

### Templates

```ts
getAllTemplates(langCode?): Record<Types, ITemplateEntity[]>
getTemplateByType(type, langCode?): ITemplateEntity[]
getTemplateByMarker(marker, langCode?): ITemplateEntity
```

### TemplatesPreview

```ts
getTemplatePreviews(langCode?): ITemplatesPreviewEntity[]
getTemplatePreviewByMarker(marker, langCode?): ITemplatesPreviewEntity
```

### Users ⚠️ makeUserApi

```ts
getUser(langCode?): IUserEntity
updateUser(body: IUserBody, langCode?): boolean
archiveUser(): boolean
deleteUser(): boolean
addFCMToken(token): boolean
deleteFCMToken(token): boolean
```

### WebSocket ⚠️ makeUserApi

```ts
connect(): Socket
```
