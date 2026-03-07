# About the project

oneentry — OneEntry NPM package

**SDK Documentation:** https://js-sdk.oneentry.cloud/docs/index/

## Project context

**What is OneEntry:**
OneEntry — headless CMS for e-commerce and content projects.

**The SDK allows you to:**

- Manage product catalog and categories
- Create and process orders
- Work with authentication and profiles
- Integrate payment systems
- Manage multilingual content
- Work with forms, menus, pages, and many other entities

## AI Instructions

### 🗂️ Temporary files — only in `.claude/temp/`

While working on a project, AI often creates temporary scripts for API inspection, testing, and debugging (`_inspect.mjs`, `test.ts`, `debug.js`, etc.).

**Rule:**

- Create all temporary files **only** in `.claude/temp/`
- The `.claude/temp/` folder persists throughout the project — files can be reused between sessions
- At the end of a task where the temporary file is no longer needed — delete it
- **NEVER** leave temporary files in the project root or other folders

```text
.claude/
  temp/
    inspect-api.mjs     ← API inspection scripts
    debug-blocks.mjs    ← debug scripts
    test-auth.mjs       ← auth tests
```

---

When generating code with the OneEntry SDK **ALWAYS**:

### ⚠️ CRITICALLY IMPORTANT: Check types BEFORE writing code and use them

#### ALWAYS verify the data structure in the SDK BEFORE writing code

`node_modules/oneentry/dist/` contains all interfaces (IProductsEntity, IBlockEntity, IAuthPostBody, etc.). Use `grep` to find interfaces BEFORE writing code.

```bash
# Find an interface
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10

# Find a method signature
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

**NEVER FABRICATE data structures!** Even if documentation examples look different — verify real TypeScript types.
**NEVER FABRICATE DATA! Always fetch from API (Pages, Menus, Products, Blocks and other entities). Don't know where to get data → ASK THE USER. This is CRITICALLY IMPORTANT!**

#### Import types from the SDK

(`oneentry/dist/.../...Interfaces`)

#### Check the result of every API call

### 🔍 Pre-code checklist

**ALWAYS verify BEFORE generating code:**

1. ☑️ **Where does the data come from?**
   - Is there an API method? → Use it
   - No API method? → ASK THE USER where to get the data
   - DO NOT fabricate data sources!
1. ☑️ **Have you checked types in the SDK?**
   - **CRITICALLY IMPORTANT:** ALWAYS check interfaces BEFORE writing code!
   - Use grep: `grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   - Check method signature: `grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts"`
   - DO NOT rely on documentation examples — they may be outdated!
   - DO NOT fabricate data structures — check real TypeScript types!
1. ☑️ **Do you know the data structure?**
   - 1️⃣ First look at the type in the SDK (`node_modules/oneentry/dist/`)
   - 2️⃣ Then make a real call and inspect the data (`console.log`)
   - DO NOT guess object fields!
1. ☑️ **Is a marker needed?**
   - Does the method require a marker? → run **`/inspect-api`** to see real markers from the API
   - No Bash access? → ASK THE USER what marker to use
   - DO NOT guess markers like 'main', 'header', 'footer'!
1. ☑️ **Is the langCode correct?**
   - Are there params in Next.js? → Use them (don't forget await in Next.js 15+/16!)
   - DO NOT hardcode 'en_US' in components! The default language is already set and langCode is optional.
   - Localization rules: `.claude/rules/localization.md`
1. ☑️ **Are you using params in Next.js 15+/16?**
   - Is the function async? → Yes, mandatory!
   - Is the params type `Promise<{...}>`? → Yes, it's a Promise!
   - Awaited params? → `const { locale } = await params;`
   - DO NOT forget await — otherwise you get undefined!
1. ☑️ **Is data transformation needed?**
   - Is the API data already in the required format? → Use it directly
   - DO NOT create intermediate objects unnecessarily!

#### 🛑 When to STOP and ASK the user

**DO NOT write code if:**

1. ❓ **Haven't checked types in the SDK**

   → FIRST: `grep -r "interface I[TypeName]" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   → Example: Before using `getApi().AuthProvider.auth()` ALWAYS check the IAuthPostBody structure

1. ❓ **Don't know the marker** for Menus, Forms, Orders, Blocks, AuthProvider, etc.

   → Run **`/inspect-api`** — it will return real markers from the API
   → No Bash access: For AuthProvider — `getApi().AuthProvider.getAuthProviders()`, for Forms — `getApi().Forms.getAllForms()`
   → Nothing worked: Ask: "What marker should I use for [name]?"

1. ❓ **Getting 403 Forbidden from a Client Component**

   → Check: are you calling the Forms API or another method requiring a token from a 'use client' component?
   → Solution: use **`/create-server-action`** to create a Server Action

1. ❓ **Haven't seen the layout** but need to create a component

   → Ask: "Is there a layout/design example for this component?"

1. ❓ **Don't understand where to get the data**

   → Ask: "Where should the data for [component] come from?"

1. ❓ **There are multiple solution options**

   → Suggest options: "We can do X or Y, which do you prefer?"

### Required

1. **💰 SAVE TOKENS: Do not fix linting, formatting, or minor warnings. Leave that work to the user. Focus on the main task.**
1. **🎨 COPY LAYOUT EXACTLY: If the user provided a layout (HTML/JSX), copy it exactly, especially if the same framework (e.g. Tailwind CSS) is used. Do not change classes, structure, and styles without explicit necessity. Only replace hardcoded data with API data.**
1. **❓ ASK FOR MARKERS:** Many API methods require a marker (Menus.getMenusByMarker, etc.), but there are no "get all" methods. DO NOT GUESS markers like 'main', 'footer', 'header'. ALWAYS ask the user what marker to use for the needed entity.
1. For AuthProvider you can get the provider list: `getApi().AuthProvider.getAuthProviders()` to find available markers. For Forms you can get the form list: `getApi().Forms.getAllForms()` to find available markers. etc.
1. Create `isError` type guard
1. Use async/await
1. **Extract the API instance into a separate file (singleton). Use `getApi()` to get the current instance. DO NOT create new `defineOneEntry()` instances in components — use `reDefine()` to change configuration (refreshToken, langCode)**
1. **🚨 ONE API instance per group of user-authorized calls: Every call to `defineOneEntry(url, { auth: { refreshToken } })` calls `/refresh` and burns the token. NEVER call `makeUserApi(refreshToken)` multiple times with the same token. Combine all related calls into ONE Server Action with ONE instance:**

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

1. Specify correct TypeScript types
1. **When creating pages — get content from CMS Pages, don't hardcode it**
1. **When working with attributeValues: if you KNOW the marker (attribute name), access it directly `attrs.title?.value`. If you DON'T know — ask the user or search by type if the user doesn't know either `Object.values(attrs).find(a => a.type === 'image')`**
1. **🚨 BEFORE writing code to access an attribute — ALWAYS check its `type`, then use the correct `value` structure for that type. DO NOT guess the structure! Type table:**
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
   - `spam` → **captcha field (Google reCAPTCHA v3 Enterprise)** — DO NOT render as `<input>`! Render the `FormReCaptcha` component. ⚠️ The type is called `'spam'`, not `'captcha'`
   - **If you don't know the attribute type — first add `console.log` to see the data, then write the code**
1. **For the "image, groupOfImages" type value is an ARRAY, use `value[0].downloadLink`, not just `value`**
1. **When fetching e.g. forms from Client Components: use Server Actions**, because the Forms API requires the server token `ONEENTRY_TOKEN`. Create `app/actions/forms.ts` with 'use server' and call from there.

### IMPORTANT: API permissions and record count limits

By default in OneEntry, the "Guests" user group has a limit of **maximum 10 objects** for entities (Pages, Products, etc.).

**Before using entity requests:**

1. Open admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
1. For each entity (Pages, Products, Forms, etc.) change permissions:
   - **Read: Yes, with restriction - with restriction on the number of records**
   - → switch to **without restrictions**
1. This allows fetching **all entities without count limits**

**Example:**

```text
https://react-native-course.oneentry.cloud/users/groups/edit-group/1?tab
→ Pages: Read → without restrictions
→ Products: Read → without restrictions
```

Without this setting `getPages()`, `getProducts()` and other methods will return a maximum of 10 records!

### Recommended

1. Handle pagination for lists
1. Pass `langCode` from context (i18n)
1. Use markers instead of IDs where possible
1. Add loading states
1. Always check results via the `isError` guard

### Working with pages

When the user asks to create a page, **ALWAYS** get content from CMS Pages, don't hardcode it. Use `getPageByUrl(url)` and `getBlocksByPageUrl(url)`. The home page usually has the URL `'home'`.

> Page pattern: `.claude/rules/nextjs-pages.md` | Skill: **`/create-page`**

### Working with calls in Client Components (Next.js)

The methods `Forms.*`, `AuthProvider.auth()`, `AuthProvider.signUp()` require a server token and will return **403 Forbidden** from a Client Component. Create a Server Action with `'use server'`.

> Server Actions rules: `.claude/rules/server-actions.md` | Skill: **`/create-server-action`**

## SDK Initialization

> **Quick initialization of a new project:** use the skill **`/setup-oneentry`** — it will create `lib/oneentry.ts`, configure `next.config.ts` and show the required environment variables.

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

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

The `lib/oneentry.ts` file contains three exports:

- **`getApi()`** — returns the current API instance. Use everywhere for public requests
- **`reDefine(refreshToken, langCode)`** — recreates the instance with the user token (call after login)
- **`makeUserApi(refreshToken)`** — one-time user-auth instance for Server Actions. ⚠️ Each call burns the token via `/refresh` — create once per function

Token handling rules are in `.claude/rules/tokens.md` (loaded automatically when working with `app/actions/**/*.ts`).

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

### ⚠️ params and searchParams in Next.js 15+/16 — they are Promises

In Next.js 15+ `params` and `searchParams` are Promises. Page rules are in `.claude/rules/nextjs-pages.md` (loaded automatically when working with `page.tsx` / `layout.tsx`).
Localization rules are in `.claude/rules/localization.md` (loaded automatically when working with `page.tsx`, `layout.tsx`, `app/actions/**/*.ts`).
In short:

```tsx
// ✅ Always await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

## Error handling

The SDK by default (`isShell: true`) returns errors as an `IError` object rather than throwing an exception. Use the `isError` guard to check:

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

// Checking error code
if (isError(result)) {
  switch (result.statusCode) {
    case 400: // Bad Request
    case 401: // Unauthorized — missing or expired token
    case 403: // Forbidden — insufficient permissions
    case 404: // Not Found — resource not found
    case 429: // Rate Limit Exceeded
    case 500: // Server Error
    case 502: // Bad Gateway
    case 503: // Service Unavailable
    case 504: // Gateway Timeout
  }
}
```

## Response structures

**Entity interfaces** can be found in `node_modules/oneentry/dist/`. Key fields of any entity: `id`, `localizeInfos`, `attributeValues`, `pageUrl`.

```typescript
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces'
```

### attributeValues — types and value access

> Detailed examples of each type: `.claude/rules/attribute-values.md`

| Type | Access to value | Note |
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
// If you know the marker — access directly (preferred):
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
page.localizeInfos?.menuTitle    // menu name
page.localizeInfos?.htmlContent  // HTML content (check this first)
page.localizeInfos?.content      // plain text
page.localizeInfos?.plainContent // text without formatting
```

## Typical scenarios

### E-commerce

```typescript
// Product list
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

// Order + payment session (via makeUserApi — one /refresh)
const { api } = makeUserApi(refreshToken)
const order = await api.Orders.createOrder('storage_marker', {
  formIdentifier, paymentAccountIdentifier, formData, products,
}) as any
if (isError(order)) return
const session = await api.Payments.createSession(order.id, 'session', false) as any
```

Use the skill **`/create-product-list`** to create a product catalog — it will create a Server Component with `getProductsByPageUrl`, URL query param filtering, pagination (load more), `FilterPanel` with price and color data from the API, and `ProductGrid` with remounting via `key`.

Use the skill **`/create-product-card`** to create a single product page — it will create a product page with `getProductById`, attribute extraction by type and marker, image gallery, price block, and related products section via `getRelatedProductsById`.

Use the skill **`/create-orders-list`** to create a user orders list — it will create a Client Component with loading through all storages (`getAllOrdersStorage` + `getAllOrdersByMarker`), one `makeUserApi` for everything, client-side pagination, and token race condition protection.

Use the skill **`/create-checkout`** to create a checkout page — it will create a form with fields from the Forms API (`getFormByMarker` by storage `formIdentifier`), `timeInterval` field handling (delivery slots), one `makeUserApi` for `createOrder` + `createSession`, and redirect to the payment page.

Use the skill **`/create-cart-manager`** to manage the cart (Redux slice + redux-persist, add/remove/quantity) — it will create `CartSlice`, a store with persistence and `StoreProvider`.

Use the skill **`/create-favorites`** for the favorites list (Redux slice + persist, stores only product IDs) — it will create `FavoritesSlice`, a button, and a page with data loading from the API.

Use the skill **`/create-filter-panel`** for the filter panel (price, color, availability + `FilterContext` + Apply/Reset).

Use the skill **`/create-subscription-events`** to subscribe to product price and stock changes — `Events.subscribeByMarker` / `unsubscribeByMarker`.

### Authentication and users

Use the skill **`/create-auth`** to create a login/registration form — it will create Server Actions and a Client Component with dynamic fields from the Forms API, correct `authData` structure, and token synchronization.

Use the skill **`/create-profile`** for the user profile page — fields from the Users API, data update, token race condition handling.

Use the skill **`/create-orders-list`** for the orders list page — loading through all storages, cancellation, retry, client-side pagination.

Use the skill **`/create-locale-switcher`** for the language switcher — loads locales via `getLocales()`, builds links to the current page with a different locale segment.

Use the skill **`/create-search`** for the search bar — 300ms debounce, Server Action, dropdown results.

### Creating pages with content from CMS

Use the skill **`/create-page`** to create Next.js pages with data from OneEntry — it will create a page file with `getPageByUrl`, `getBlocksByPageUrl`, and correct `isError` handling.

Page rules, langCode and `params` (Next.js 15+): `.claude/rules/nextjs-pages.md`.

## Content and pages

> To create a page with content from the CMS use the skill **`/create-page`**.
> Rules for `params`/`searchParams` (Next.js 15+) and working with `langCode`: `.claude/rules/nextjs-pages.md` (loaded when working with `page.tsx`/`layout.tsx`).

**⚠️ CRITICALLY IMPORTANT: pageUrl is a MARKER, not a full path!**

In OneEntry the `pageUrl` field is the **page identifier/marker**, NOT the actual URL route of the application.

```typescript
// ❌ WRONG - passing the full route path
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ CORRECT - pass only the page marker
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// Same for Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// NOT 'shop/category/ship_designer'!
```

**Rule:** The Next.js route URL (e.g. `/shop/category/ship_designer`) and `pageUrl` in OneEntry (`"ship_designer"`) are **different things**. When calling OneEntry SDK methods always use only the marker from `pageUrl`.

### Multilingual content

```typescript
// Page in Russian
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Menu in English
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

### Navigation menu with hierarchy

Use the skill **`/create-menu`** to create a navigation menu with submenu support and URL prefixes — it will correctly handle the hierarchy via `parentId`, normalize `pages`, and build URLs.

## Working with blocks and attributes

> `attributeValues` type table and access examples: `.claude/rules/attribute-values.md` (loaded when working with `*.tsx` components).

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

## Common mistakes

### Forgetting error checks

```typescript
// WRONG
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title) // Crashes if IError

// CORRECT
const product = await getApi().Products.getProductById(123)
if (isError(product)) return
console.log(product.attributeValues.title)
```

### Creating an SDK instance in a component

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
// WRONG - guessing the marker 'main' and filtering by names
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// CORRECT - ask the user for the marker and fetch directly
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
const quickLinks = !isError(quickLinksMenu) && quickLinksMenu.pages
  ? (Array.isArray(quickLinksMenu.pages) ? quickLinksMenu.pages : [quickLinksMenu.pages])
  : []
```

### Fabricating data structures and creating unnecessary transformations

```typescript
// WRONG - creating an intermediate object, fabricating structure
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // ← field 'children' does NOT exist in the API!
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

**Problem:** On 401 you need to retry with the current token from localStorage (another operation may have already updated it), and log out ONLY on a confirmed 401/403 after retry.

Full profile page pattern — skill **`/create-profile`**.
Full orders page pattern — skill **`/create-orders-list`**.

**Never do `localStorage.removeItem('refreshToken')` on a form/data loading error** — this destroys the fresh token just written by another operation.

### Showing a preloader when state changes (not just on load)

**Problem:** When adding/removing from favorites/cart, the whole list reloads with a loader.

**Solution:** cache in `useState<Record<id, Entity>>` + `useMemo` for the visible list. `useEffect` fetches only NEW ids (via `prevIdsRef`), removed ones are recalculated without a request.

> Ready-made pattern with Redux + persist — skill **`/create-favorites`**

## Common AI hallucinations (real error examples)

### Fabricated `children` field in menus

There is no `children` field in `IMenusPages` — use `parentId` (see section above).

> Skill: **`/create-menu`**

### Rendering a captcha field as a regular input

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

### Hardcoding langCode

```typescript
// ❌ HALLUCINATION - hardcoding language in components
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

## Working with real project data

**IMPORTANT:** To determine entity data structures and fields, use real project data.

### ✅ PREFERRED METHOD: skill `/inspect-api`

Use the skill **`/inspect-api`** — it automatically reads `.env.local` and executes the needed curl requests:

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

## Template for working with a new entity

**When working with a new entity (Product, Page, Block, Menu):**

### Step 1: Look at the type in the SDK

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
const title = attrs.product_title?.value  // ← know that product_title exists from steps 1-2
```

**⚠️ DO NOT skip steps 1-2! DO NOT guess the structure!**

## 🚨 FORBIDDEN: taking markers from existing code

**Existing code may have been written with errors or guessed — it is NOT the source of truth.**

```typescript
// ❌ NOT ALLOWED — you see it in code and use it without verification:
const inStock = product.statusIdentifier === 'in_stock'
// → then write: query.statusMarker = 'in_stock'  ← NOT ALLOWED!

// ❌ NOT ALLOWED — you see it in code and use it without verification:
const stockQty = attrs.units_product?.value
// → then write: { attributeMarker: 'units_product', ... }  ← NOT ALLOWED!
```

**Even if the value looks plausible — ALWAYS verify via a real API request.**

### How to verify before writing code

Use the skill **`/inspect-api`** — it automatically reads `.env.local` and returns real markers.

If `.env.local` is not found — ask the user for the project URL and token.

## Common patterns

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
- `limit?: number` — number of records (default: 30)

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

// ISR - incremental static regeneration
export const revalidate = 3600 // 1 hour
```

### user.state — arbitrary user data storage

`user.state` — an arbitrary-shape object in `IUserEntity` that can be used to store any client data: cart, favorites, settings, browsing history.

**⚠️ Critical rules:**

1. **Always spread** `{ ...user.state, newField }` — don't overwrite other fields entirely
2. **One `makeUserApi`** for getUser + updateUser — otherwise the token burns between calls
3. **`formIdentifier`** is taken from `user.formIdentifier` — don't hardcode it

```typescript
// app/actions/users.ts
'use server';

// Reading state
export async function getUserState(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
    newToken: getNewToken(),
  };
}

// Writing one field — ONE instance for getUser + updateUser
export async function saveUserFavorites(refreshToken: string, favorites: number[]) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  await api.Users.updateUser({
    formIdentifier: user.formIdentifier, // taken from user!
    state: { ...user.state, favorites }, // spread — don't overwrite cart and other fields
  });
  return { success: true, newToken: getNewToken() };
}
```

**Typical state structure:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // array of productId
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

## Extended typical scenarios

### Checkout form from the OneEntry Forms API

**The order form (delivery, address, date/time) is taken from the OneEntry Forms API**, not hardcoded.

**How it works:**

1. `getApi().Orders.getAllOrdersStorage()` returns order storages, each has a `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` returns the delivery form fields
3. Form fields are rendered dynamically by type (`string`, `date`, `timeInterval`, etc.)

**A `timeInterval` field in the order form** — this is a field with a list of available delivery slots. Its `value` contains an array of available time intervals `[[start, end], ...]` from which are determined:

- Available dates in the calendar (unique dates from start values)
- Available times for the selected date (times from start values for that date)

**⚠️ IMPORTANT:**

- The delivery form (`formIdentifier`) is tied to the order storage
- `timeInterval` in the form = list of available delivery slots, NOT entered data
- All user-auth calls in ONE instance

Use the skill **`/create-checkout`** to implement the full checkout flow.

### Product catalog with filters and pagination

Use the skill **`/create-product-list`** to create a product catalog with URL filters, infinite scroll, and Server Actions — it will create `lib/filters.ts`, `app/actions/products.ts`, a Server Page, `ShopView` and `ProductGrid` with the correct architecture.

Use the skill **`/create-filter-panel`** to create a filter panel UI with `FilterContext`, price/color/availability components and Apply/Reset buttons — complements `/create-product-list`.

### Search

Use the skill **`/create-search`** to create a search bar (dropdown or separate page).

Use the skill **`/create-locale-switcher`** for the language switcher.

### FormData — reading form submissions

`FormData.getFormsDataByMarker` allows reading form submissions — applications, contact messages.

**⚠️ Requires Server Action** — called server-side only.

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

**Status update / deletion:**

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Reviews with hierarchy** (`isNested: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

### IntegrationCollections — custom collections

IntegrationCollections — arbitrary data tables in OneEntry (FAQ, reference books, arbitrary content). Full CRUD is available without authentication.

**⚠️ Collection marker:** get via `/inspect-api` or `getICollections()` — don't guess.

**⚠️ Reviews in OneEntry are implemented via FormData, NOT via IntegrationCollections** — use the skill **`/create-reviews`**.

```typescript
// Reading rows
const rows = await getApi().IntegrationCollections.getICollectionRowsByMarker('faq');
// rows.data — array of rows, rows.total — count

// Reading one row
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
To get a catalog use `getPageByUrl()` — it finds pages of any type.
`getChildPagesByParentUrl()` also returns `catalog_page` child pages.

```typescript
// ❌ WRONG - catalog_page won't be in getRootPages/getPages results
const rootPages = await getApi().Pages.getRootPages()
// shop, category and other catalog_page WON'T be here!

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

#### 401 Unauthorized — refreshToken is burned when creating the API instance

**🚨 CRITICALLY IMPORTANT:** Every call to `defineOneEntry(url, { auth: { refreshToken } })` calls `/refresh` and **burns** the token. After the first use the token becomes invalid.

**Symptom:** The first API call succeeds, all subsequent ones return `401 Unauthorized`.

```typescript
// ❌ WRONG — every makeUserApi() calls /refresh and burns the token
const storages = await getAllOrdersStorage(refreshToken);    // token burned
const orders = await getAllOrdersByMarker(marker, refreshToken);  // 401!
```

**Rule:** Combine all user-authorized calls into **one Server Action** with **one** `makeUserApi(refreshToken)`.

> Pattern: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

#### 401 Unauthorized — token race condition

**Symptom:** User is logged in, navigates to the profile/orders page — and gets logged out.

**Cause:** A parallel operation (CartContext, FavoritesContext) already burned the same `refreshToken`. The new page reads a stale token from localStorage.

**Rule for all account pages:**

1. Server Action MUST return `statusCode` in the error object
2. On 401 — retry with `localStorage.getItem('refreshToken')` (token may have been updated)
3. Log out ONLY on 401/403 AFTER retry
4. Never do `removeItem('refreshToken')` on a data loading error

> Skill: **`/create-profile`** (profile) and **`/create-orders-list`** (orders)

#### 401 Unauthorized — invalid or expired token

Normal expired session. Redirect to `/login`.

> ⚠️ If the token expires too quickly — check the token lifetime in the OneEntry admin panel: `PROJECT_URL/users/auth-providers`.

#### 403 Forbidden

**Cause 1:** calling `Forms.*`, `AuthProvider.auth()`, `AuthProvider.signUp()` from a Client Component → `"Resource is closed"`. Create a Server Action.

**Cause 2:** insufficient permissions for the action.

**Methods requiring Server Action with `getApi()`:**

- `getApi().Forms.*` — all form methods
- `getApi().AuthProvider.auth()`, `.signUp()`, `.generateCode()`

**Methods requiring `makeUserApi(refreshToken)` in Server Action:**

- `getApi().Users.*`
- `getApi().Orders.*`
- `getApi().Payments.*`

**Methods NOT requiring user-auth (can use `getApi()` directly):**

- `getApi().AuthProvider.logout(marker, token)`
- `getApi().AuthProvider.logoutAll(marker)`

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

**`langCode` — optional parameter** for most methods. The default language is set at SDK initialization. Pass it explicitly only in multilingual applications (e.g. `getPageByUrl(url, locale)`). Find all interfaces and return types in `node_modules/oneentry/dist/`.

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

`body: IFilterParams[]` — required parameter, but defaults to `[]`. If no filters are needed, it can be omitted.

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
