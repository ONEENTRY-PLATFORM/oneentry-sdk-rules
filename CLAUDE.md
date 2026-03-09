# About the Project

oneentry — OneEntry NPM package

**SDK Documentation:** https://js-sdk.oneentry.cloud/docs/index/

## Glossary of OneEntry SDK Terms

A quick reference for key concepts. If you're unsure about a term — check here.

---

### marker

A string identifier for an entity in OneEntry (page, menu, form, attribute, authorization provider).

- **DO NOT guess markers** — always obtain them through `/inspect-api` or the API
- `pageUrl` for pages — this is also a marker, not a Next.js route URL
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

Get the current SDK instance. Singleton — **do not create new instances** through `defineOneEntry()` in components.

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

> ⚠️ MUST be called before `reDefine()` — otherwise, you will destroy the working session

---

### saveFunction

Callback in the SDK config that is called **automatically** on every `refreshToken` rotation.
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

Google reCAPTCHA v3 Enterprise captcha field. DO NOT render as `<input>`.

```typescript
if (attr.type === 'spam') {
  return <FormReCaptcha key={attr.marker} />
}
```

> ⚠️ The type is called `'spam'`, not `'captcha'`

---

### moduleFormConfigs / formModuleConfigId

Mandatory parameters for submitting a form via `postFormsData`. Obtain from `getFormByMarker()`.

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

## Project Context

**What is OneEntry:**
OneEntry is a headless CMS for e-commerce and content projects.

**The SDK allows:**

- Manage product catalogs, categories
- Create and process orders
- Work with authorization and profiles
- Integrate payment systems
- Manage multilingual content
- Work with forms, menus, pages, and many other entities

## Start of Each Session — Mandatory Checklist

### 🚨 BEFORE writing any code

1. Read `CLAUDE.md` **in full** (do not stop halfway)
2. `ls .claude/skills/` — check available skills
3. `ls .claude/rules/` — read **all** rules files (`cat .claude/rules/*.md`)
4. Read `eslint.config.mjs` — write code only in accordance with the linter
5. Run the necessary skill if available (do not invent it yourself)

### Mandatory Code Requirements

- **No `any`** — use types from `node_modules/oneentry/dist/**/*.d.ts` (see `.claude/rules/typescript.md`)
- **Linter** — code must pass without errors (`next/core-web-vitals` + `next/typescript`)
- **Imports** — only used, no extras
- **`<img>`** → `next/image`, **`<a>`** → `next/link`

### Skills for Typical Tasks

| Task                | Skill                      |
|---------------------|----------------------------|
| Project Initialization | `/setup-oneentry`          |
| Orders Page         | `/create-orders-list`      |
| Authorization Form   | `/create-auth` (check)     |
| Page                | `/create-page`             |
| Server Action       | `/create-server-action`    |
| Inspect API Markers | `/inspect-api`             |

### Before Each New Component

- Is there a skill? → run the skill
- Is there a rules file (`.claude/rules/`)? → read it
- Are SDK types checked via `grep -r "interface I..." node_modules/oneentry/dist --include="*.d.ts"`?

### Architectural Decisions of the Project

- **Tokens**: store in `localStorage` with the key `'refresh-token'`
- **`lib/oneentry.ts`**: the only file with `getApi`, `reDefine`, `makeUserApi`, `isError` — do not duplicate `isError` in other files
- **`makeUserApi`** returns `{ api, getNewToken }` — not just api
- **Orders Page**: Client Component (`'use client'`) + `useEffect` + localStorage
- **Server Actions for Orders**: `app/actions/orders.ts` with local `makeUserApi`
- **AuthProvider.auth/signUp/generateCode**: only from Client Component (fingerprint)
- **`next.config.ts`**: `remotePatterns` with `*.oneentry.cloud` for `next/image`

## Available Skills

| Skill                          | What it creates                                          |
|-------------------------------|------------------------------------------------------|
| `/setup-nextjs`               | Create a Next.js project from scratch                        |
| `/setup-oneentry`             | Initialize SDK in an existing project             |
| `/create-auth`                | Authorization: login, registration, logout, AuthContext |
| `/create-profile`             | User profile page                        |
| `/create-orders-list`         | Orders list page with cancellation and pagination       |
| `/create-checkout`            | Checkout: delivery form, timeInterval, payment       |
| `/create-product-list`        | Product list with filtering and pagination            |
| `/create-product-card`        | Product card                                      |
| `/create-product-page`        | Product page                                      |
| `/create-page`                | Page from CMS (Pages API)                          |
| `/create-menu`                | Navigation menu                                   |
| `/create-form`                | Form from Forms API                                   |
| `/create-cart-manager`        | Cart (CartContext / Redux)                        |
| `/create-favorites`           | Favorites                                            |
| `/create-filter-panel`        | Attribute filter panel                         |
| `/create-locale-switcher`     | Language switcher                                  |
| `/create-search`              | Search for products / pages                         |
| `/create-reviews`             | Product reviews                                      |
| `/create-subscription-events` | Subscribe to product events (price, availability)           |
| `/create-server-action`       | Server Action for public SDK methods              |
| `/inspect-api`                | API exploration: markers, response structure         |
| `/setup-playwright`           | E2E testing: Playwright + MCP server            |

## Instructions for AI

### Working Mode — Question at the Beginning

**At the very beginning of working on the application** (the first time you are asked to write code for the project) — ALWAYS ask:

> **Do we need to save tokens?**

### If saving is needed (economy mode)

- ❌ Do not run the linter and do not fix linting errors
- ❌ Do not build the application for verification
- ❌ Do not add comments to the code

### If saving is NOT needed (full mode)

- ✅ Add JSDoc comments to functions and components
- ✅ Lint the code and fix errors after writing
- ✅ Build the application for correctness

> Ask **only once** at the beginning of the session working on the project. Remember the answer for the entire session.

---

### Playwright E2E Tests — Question at the Beginning

**At the very beginning of working on the application** also ask:

> **Do we need to write Playwright E2E tests along with the code?**

#### If yes

1. Run **`/setup-playwright`** — it will install dependencies, create config, connect MCP server
2. **When creating each new component/page** — write the test in `e2e/` immediately
3. Add `data-testid` to key interactive elements
4. Use MCP Playwright to inspect pages before writing tests

#### If no

- Do not write tests, do not create `e2e/`

> Ask **only once** at the beginning of the session. Remember the answer for the entire session.
> Skill: **`/setup-playwright`**

---

### 🗂️ Temporary Files — Only in `.claude/temp/`

When working on the project, AI often creates temporary scripts for API inspection, testing, debugging (`_inspect.mjs`, `test.ts`, `debug.js`, etc.).

**Rule:**

- All temporary files should be created **only** in `.claude/temp/`
- The folder `.claude/temp/` exists throughout the project — files from it can be reused between sessions
- At the end of the task, where the temporary file is no longer needed — delete it
- **NEVER** leave temporary files in the root of the project or other folders

```text
.claude/
  temp/
    inspect-api.mjs     ← API inspection scripts
    debug-blocks.mjs    ← debugging scripts
    test-auth.mjs       ← authorization tests
```

---

### 🗂️ Structure of the `components/` Folder

**NEVER** place components in a flat `components/` folder. Always organize them into logical groups:

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

- When creating a new component — immediately determine which group it belongs to
- If the component does not fit into any group — create a new one with a clear name
- `ui/` — only for universal reusable primitives without business logic

---

When generating code with OneEntry SDK **ALWAYS**:

### ⚠️ CRITICALLY IMPORTANT: Check types BEFORE writing code and use them

#### ALWAYS check the data structure in the SDK BEFORE writing code

`node_modules/oneentry/dist/` contains all interfaces (IProductsEntity, IBlockEntity, IAuthPostBody, etc.). Use `grep` to search for interfaces BEFORE writing code.

```bash
# Find an interface
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10

# Find a method signature
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

**NEVER INVENT the data structure!** Even if examples in the documentation look different - check the real TypeScript types.
**NEVER INVENT DATA! Always obtain from the API (Pages, Menus, Products, Blocks, and other entities). Don't know where to get the data → ASK THE USER. This is CRITICALLY IMPORTANT!**

#### Import types from the SDK

(`oneentry/dist/.../...Interfaces`)

#### Check the result of each API call

### 🚫 FORBIDDEN to use `as any` and `any[]`

Instead of `as any` — always import the type from `oneentry/dist/`:

- `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`
- `import type { IProductsResponse, IProductsEntity } from 'oneentry/dist/products/productsInterfaces'`

Exception: The SDK itself declares the field as `any` (for example `ILocalizeInfo`, `IError`) — then `as any` is not needed at all.

### 🔍 Checklist Before Writing Code

**ALWAYS check BEFORE generating code:**

1. ☑️ **Where is the data from?**
   - Is there an API method? → Use it
   - Is there no API method? → ASK THE USER where to get the data
   - DO NOT invent the data source!
2. ☑️ **Have you checked the types in the SDK?**
   - **CRITICALLY IMPORTANT:** ALWAYS check interfaces BEFORE writing code!
   - Use grep: `grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   - Check the method signature: `grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts"`
   - DO NOT rely on examples from the documentation - they may be outdated!
   - DO NOT invent the data structure - check real TypeScript types!
3. ☑️ **Do you know the data structure?**
   - 1️⃣ First look at the type in the SDK (`node_modules/oneentry/dist/`)
   - 2️⃣ Then make a real call and look at the data (`console.log`)
   - DO NOT guess object fields!
4. ☑️ **Is a marker needed?**
   - Does the method require a marker? → run **`/inspect-api`** to see real markers from the API
   - No access to Bash? → ASK THE USER what marker to use
   - DO NOT guess markers like 'main', 'header', 'footer'!
5. ☑️ **Is the langCode correct?**
   - Are there params in Next.js? → Use it (don't forget await in Next.js 15+/16!)
   - DO NOT hardcode 'en_US' in components! The default language is already set, and the langCode field is not mandatory.
   - Localization rules: `.claude/rules/localization.md`
6. ☑️ **Are you using params in Next.js 15+/16?**
   - Is the function async? → Yes, definitely!
   - Type of params: `Promise<{...}>`? → Yes, it's a Promise!
   - Awaited params? → `const { locale } = await params;`
   - DO NOT forget await - otherwise you will get undefined!
7. ☑️ **Is data transformation needed?**
   - Is the data from the API already in the required format? → Use it directly
   - DO NOT create intermediate objects unnecessarily!
8. ☑️ **Does the component require the SDK (form, authorization, data)?**
   - The user provided the layout of the form/component → IMMEDIATELY connect to the SDK, do not create a static stub first
   - Is a marker needed → run **`/inspect-api`** BEFORE writing the component
   - Is a Server Action needed → create it TOGETHER with the component in one step
   - **NEVER** postpone connecting to the SDK for "later"

#### 🛑 When to STOP and ASK the User

**DO NOT write code if:**

1. ❓ **The user asks to add data (form, product, attribute, page, etc.)**
   → FIRST check if the entity exists in OneEntry through `/inspect-api` or the API:

   ```ts
   // Forms: getApi().Forms.getAllForms()
   // Pages: getApi().Pages.getRootPages()
   // Products: getApi().Products.getProducts()
   // Attributes: getApi().AttributesSets.getAttributes()
   ```

   → If the entity is **NOT FOUND** — respond:
   > **First create [name] in the OneEntry Admin Panel, then I will connect it in the code.**
   → **NEVER** use a marker that is not confirmed through the API — only real data!

2. ❓ **You have not checked the types in the SDK**
   → FIRST: `grep -r "interface I[TypeName]" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   → Example: Before using `getApi().AuthProvider.auth()` ALWAYS check the structure of IAuthPostBody
3. ❓ **You do not know the marker** for Menus, Forms, Orders, Blocks, AuthProvider, etc.
   → Run **`/inspect-api`** — it will return real markers from the API
   → No Bash access: For AuthProvider — `getApi().AuthProvider.getAuthProviders()`, for Forms — `getApi().Forms.getAllForms()`
   → Nothing helped: Ask: "What marker to use for [name]?"
4. ❓ **You get 403 Forbidden**
   → Check: are you calling `AuthProvider.auth/signUp/generateCode` through Server Action? → move it to Client Component (fingerprint)
   → Or check user group rights in the admin panel (`PROJECT_URL/users/groups`)
5. ❓ **You have not seen the layout** but need to create a component
   → Ask: "Is there an example layout/design for this component?"
6. ❓ **There is a layout, but you do not know the marker** to connect to the SDK
   → First run **`/inspect-api`**, get the marker — and only then create the component already connected
   → DO NOT create a static stub with the intention of "connecting later"
7. ❓ **You do not understand where to get the data**
   → Ask: "Where should the data for [component] come from?"
8. ❓ **There are several options for solutions**
   → Offer options: "We can do X or Y, which option do you prefer?"

### Mandatory

1. **💰 SAVE TOKENS: Do not fix linting, formatting, minor warnings. Leave this work to the user. Focus on the main task.**
2. **🎯 WRITE CODE ACCORDING TO LINTER RULES: When writing new code, always follow the project's linter settings (ESLint, Prettier, etc.). Check the linter config in the project before writing code if you do not know the settings.**
3. **🎨 EXACTLY COPY THE LAYOUT: If the user provided the layout (HTML/JSX), copy it exactly, especially if the same framework is used (e.g., Tailwind CSS). Do not change classes, structure, and styles without explicit necessity. Only replace hardcoded data with data from the API.**
4. **🔌 IMMEDIATELY CONNECT TO THE SDK: If the user provided the layout of a component that should work with the SDK (authorization form, order form, data from CMS) — NEVER create a static UI stub first. Immediately: (1) run `/inspect-api` to get markers, (2) create Server Action, (3) connect the component to the SDK — all in one step.**
5. **📋 FORMS ARE ALWAYS DYNAMIC: NEVER hardcode form fields (`<input>` with hardcoded `name`/`type`). Always obtain fields through `getFormByMarker(marker)` and render them dynamically by `attribute.type` and `attribute.marker`. The user's layout only sets the visual style — fields are taken from the API.**
6. **❓ ASK FOR MARKERS:** Many API methods require a marker (Menus.getMenusByMarker, etc.), but there are no methods to "get all". DO NOT GUESS markers like 'main', 'footer', 'header'. ALWAYS ask the user what marker to use for the desired entity.
7. For AuthProvider you can get the list of providers: `getApi().AuthProvider.getAuthProviders()` to know available markers. For Forms you can get the list of forms: `getApi().Forms.getAllForms()` to know available markers, etc.
8. Create a type guard `isError`
9. Use async/await
10. **Extract the API instance into a separate file (singleton). Use `getApi()` to get the current instance. DO NOT create new instances `defineOneEntry()` in components — use `reDefine()` to change configuration (refreshToken, langCode)**
11. Specify correct TypeScript types
12. **When creating pages, obtain content from CMS Pages, not hardcoded**
13. **When working with attributeValues: if you KNOW the marker (attribute name), refer directly to `attrs.title?.value`. If you do not know - ask the user or search by type if the user also does not know `Object.values(attrs).find(a => a.type === 'image')`**
14. **🚨 BEFORE writing code to access an attribute — ALWAYS check `type`, then use the correct structure of `value`. DO NOT guess! Type table: `.claude/rules/attribute-values.md`**
   - ⚠️ `image` in **Products** → `attrs.marker?.value?.downloadLink` (OBJECT)
   - ⚠️ `image` in **Pages/Blocks** → `attrs.marker?.value?.[0]?.downloadLink` (ARRAY!)
   - ⚠️ `groupOfImages` → `attrs.marker?.value?.[0]?.downloadLink` (always ARRAY)
   - ⚠️ `spam` → DO NOT render as `<input>`! Render `<FormReCaptcha>`. The type is called `'spam'`, not `'captcha'`
   - If you do not know the type — `console.log(attrs.marker)` to see the structure
15. The SDK works both on the server and on the client (`NEXT_PUBLIC_*` variables are available in both contexts). The choice between Server Component / Server Action / Client Component is a matter of **rendering strategy**, not SDK limitations. Exception: `AuthProvider.auth/signUp/generateCode` — **only client** (device fingerprint).

### IMPORTANT: API Permissions and Record Count Limits

By default, in OneEntry for the user group "Guests" there is a limit of **maximum 10 objects** for entities (Pages, Products, etc.).

**Before using entity requests:**

1. Open the admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
2. For each entity (Pages, Products, Forms, etc.) change permissions:
   - **Read: Yes, with restriction - with restriction on the number of records**
   - → switch to **without restrictions**
3. This will allow you to receive **all entities without limits** on the number

**Example:**

```text
https://react-native-course.oneentry.cloud/users/groups/edit-group/1?tab
→ Pages: Read → without restrictions
→ Products: Read → without restrictions
```

Without this setting, `getPages()`, `getProducts()` and other methods will return a maximum of 10 records!

### Recommended

1. Handle pagination for lists
2. Pass `langCode` from context (i18n)
3. Use markers instead of IDs where possible
4. Add loading states
5. Always check the result through `isError` guard

### Working with Pages

When the user asks to create a page, **ALWAYS** obtain content from CMS Pages, not hardcode it. Use `getPageByUrl(url)` and `getBlocksByPageUrl(url)`. The main page usually has the URL `'home'`.

> Page pattern: `.claude/rules/nextjs-pages.md` | Skill: **`/create-page`**

### SDK Call Contexts (Next.js)

The SDK is isomorphic — it works both on the server and on the client. The choice of context depends on the rendering strategy:

- **SSR/SSG/ISR** → Server Component / `generateStaticParams` / `revalidate`
- **Mutations, server logic** → Server Action (`'use server'`)
- **CSR, dynamics, search** → Client Component (`'use client'`) directly through `getApi()`
- **User data** (Orders, Users, Payments) → Client Component through `getApi()` after `reDefine()`

**The only strict limitation:** `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **only from Client Component** (on the server, `deviceInfo.browser` in fingerprint will be server-side, not the user's real browser).

> Server Actions rules: `.claude/rules/server-actions.md` | Authorization rules: `.claude/rules/auth-provider.md`

## 🚨 FORBIDDEN: take markers from existing code

**Existing code may have been written incorrectly or guessed — it is NOT a source of truth.**

```typescript
// ❌ CANNOT — see in code and use without checking:
const inStock = product.statusIdentifier === 'in_stock'
// → and immediately write: query.statusMarker = 'in_stock'  ← CANNOT!

// ❌ CANNOT — see in code and use without checking:
const stockQty = attrs.units_product?.value
// → and immediately write: { attributeMarker: 'units_product', ... }  ← CANNOT!
```

**Even if the value looks plausible — ALWAYS check through a real API request.**

### How to Check Before Writing Code

Use skill **`/inspect-api`** — it will automatically read `.env.local` and return real markers.

If `.env.local` is not found — ask the user for the project URL and token.

## SDK Initialization

> **Quick initialization of a new project:** use skill **`/setup-oneentry`** — it will create `lib/oneentry.ts`, configure `next.config.ts`, and show the necessary environment variables.

### Minimal Setup

```typescript
const api = defineOneEntry('https://your-project.oneentry.cloud', {
  token: 'your-api-token'
})
```

### Recommended Setup (production)

```typescript
import { defineOneEntry } from 'oneentry';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

// saveFunction — called by the SDK automatically on every refreshToken rotation
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
 * This function used to update api config
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
      saveFunction, // ← SDK calls this on rotation, token is saved automatically
    },
  });
}
```

### Integration with Next.js (Singleton Pattern)

**Setting up `.env.local`:**

If the `.env.local` file does not exist — create it and ask the user for the project URL and App Token (Settings → App Token in the OneEntry admin panel).

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

> `NEXT_PUBLIC_` — variables are available both on the server and on the client. This allows using the SDK in both contexts.

The `lib/oneentry.ts` file contains exports:

- **`getApi()`** — returns the current API instance. Use everywhere (works both on the server and on the client). After `reDefine()` — works with user authorization
- **`reDefine(refreshToken, langCode)`** — recreates the instance with the user token (call after login **on the client**). ⚠️ Each `reDefine` calls `/refresh` — check `hasActiveSession` to avoid burning the token again
- **`hasActiveSession()`** — returns `true` if the current instance has an accessToken
- **`getLang()`** — returns the current langCode of the SDK (`'en_US'` by default). Use in Client Components for localization without `useParams`
- **`getImageUrl(value)`** — normalizes the image field (object or array) into a URL string
- **`isError(result)`** — type guard to check the SDK response for an error

**⚠️ reDefine — check hasActiveSession before calling:**

```typescript
import { reDefine, hasActiveSession } from '@/lib/oneentry'

// If reDefine is called immediately after login — you will burn the just received refreshToken
// ❌ INCORRECT — blind reDefine without checking
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
  const products = await getApi().Products.getProducts({ langCode: locale });
  // ...
}

// SSG — static generation
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

### Summary: What to Call Where

| Operation | Context | Why |
| --- | --- | --- |
| Public data (Pages, Products, Menus, Blocks) | Server Component / Server Action / Client Component | No restrictions — depends on rendering strategy |
| Authorization (auth, signUp, generateCode) | **Only Client Component** | Device fingerprint |
| User data (Orders, Users, Payments) | Client Component through `getApi()` after `reDefine()` | Token is managed by `saveFunction` automatically |
| Forms and data submission | Server Action or Client Component | Depends on strategy |

### ⚠️ params and searchParams in Next.js 15+/16 — these are Promises

In Next.js 15+ `params` and `searchParams` are Promises. Rules for pages are outlined in `.claude/rules/nextjs-pages.md` (automatically loaded when working with `page.tsx` / `layout.tsx`).
Localization rules are outlined in `.claude/rules/localization.md` (automatically loaded when working with `page.tsx`, `layout.tsx`, `app/actions/**/*.ts`).
In brief:

```tsx
// ✅ Always await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

## Error Handling

The SDK by default (`isShell: true`) returns errors as an `IError` object, not throwing an exception. Use the `isError` guard to check.

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
  message: string | string[]  // ⚠️ In case of form validator errors — ARRAY of strings!
  pageData: any
  timestamp: string
  [key: string]: any
}

// ⚠️ Normalize message — always! Especially for postFormsData (validators return string[]):
function normalizeErrorMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}
// Usage: return { error: normalizeErrorMessage(result.message) }

// Checking error code
if (isError(result)) {
  switch (result.statusCode) {
    case 400: // Bad Request
    case 401: // Unauthorized — no or expired token
    case 403: // Forbidden — no rights
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
| `json` | `JSON.parse(attrs.marker?.value || '{}')` | |
| `timeInterval` | `attrs.marker?.value` | `[[ISO, ISO], ...]` |
| `spam` | — | reCAPTCHA v3 captcha → `<FormReCaptcha>` |

```typescript
// If you know the marker — directly (preferably):
const title = attrs.title?.value
const img = attrs.photo?.value?.downloadLink         // image — object
const imgs = attrs.photos?.value?.[0]?.downloadLink  // groupOfImages — array
const badges = attrs.badges?.value || []
const icon = badges[0]?.extended?.value?.downloadLink

// If you do not know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.[0]?.downloadLink || ''
```

### Filtering by attributeValues

| Operator | Description | Example |
| --- | --- | --- |
| `in` | Value in the list | `"red,blue,green"` |
| `nin` | NOT in the list | `"red,blue"` |
| `eq` | Equals | `100` |
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

Contains data for the requested language. Direct access to fields (without nesting by language!):

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.menuTitle    // name in the menu
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

To create a product catalog, use skill **`/create-product-list`** — it will create a Server Component with `getProductsByPageUrl`, filtering through URL query params, pagination (load more), `FilterPanel` with price and color data from the API, and `ProductGrid` with remounting through `key`.

To create a single product page, use skill **`/create-product-card`** — it will create a product page with `getProductById`, extracting attributes by type and marker, an image gallery, a price block, and a section for related products through `getRelatedProductsById`.

To create a user orders list page, use skill **`/create-orders-list`** — it will create a Client Component loading through all storages (`getAllOrdersStorage` + `getAllOrdersByMarker`), direct calls to `getApi()` from the client, client-side pagination.

To create a checkout page, use skill **`/create-checkout`** — it will create a form with fields from Forms API (`getFormByMarker` by `formIdentifier` of the storage), handling the `timeInterval` type field (delivery slots), direct calls to `getApi()` for `createOrder` + `createSession`, and redirecting to the payment page.

To manage the cart (Redux slice + redux-persist, add/remove/quantity), use skill **`/create-cart-manager`** — it will create `CartSlice`, store with persistence, and `StoreProvider`.

For the favorites list (Redux slice + persist, stores only product IDs), use skill **`/create-favorites`** — it will create `FavoritesSlice`, a button, and a page loading data from the API.

For the filter panel (price, color, availability + `FilterContext` + Apply/Reset buttons), use skill **`/create-filter-panel`**.

To subscribe to product price and availability changes, use skill **`/create-subscription-events`** — `Events.subscribeByMarker` / `unsubscribeByMarker`.

### Authorization and Users

To create an authorization/registration form, use skill **`/create-auth`** — it will create a Client Component with direct SDK calls (fingerprint!) and Server Actions only for `getAuthProviders`/`logout`. Fields are dynamic from Forms API, correct `authData` structure, token synchronization.

To create a user profile page, use skill **`/create-profile`** — fields from Users API, updating data, handling token race condition.

To create a user orders list page, use skill **`/create-orders-list`** — loading through all storages, cancellation, repeat, client-side pagination.

To create a language switcher, use skill **`/create-locale-switcher`** — loads locales through `getLocales()`, builds links to the current page with a different locale segment.

To create a search bar, use skill **`/create-search`** — debounce 300ms, Server Action, dropdown results.

### Creating Pages with Content from CMS

To create Next.js pages with data from OneEntry, use skill **`/create-page`** — it will create a page file with `getPageByUrl`, `getBlocksByPageUrl`, and proper `isError` handling.

Rules for `params`/`searchParams` (Next.js 15+) and working with `langCode`: `.claude/rules/nextjs-pages.md` (automatically loaded when working with `page.tsx`/`layout.tsx`).

**⚠️ CRITICALLY IMPORTANT: pageUrl is a MARKER, not a full path!**

In OneEntry, the `pageUrl` field is an **identifier/marker for the page**, NOT the actual URL of the application's route.

```typescript
// ❌ INCORRECT - passing the full route path
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ CORRECT - passing only the page marker
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// The same for Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// NOT 'shop/category/ship_designer'!
```

**Rule:** The route URL in Next.js (e.g., `/shop/category/ship_designer`) and `pageUrl` in OneEntry (`"ship_designer"`) are **different things**. When calling OneEntry SDK methods, always use only the marker from `pageUrl`.

### Multilingual Content

```typescript
// Page in Russian
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Menu in English
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

### Navigation Menu with Hierarchy

To create a navigation menu with support for submenus and URL prefixes, use skill **`/create-menu`** — it will correctly handle the hierarchy through `parentId`, normalize `pages`, and build URLs.

## Working with Blocks and Attributes

> Type table for `attributeValues` and examples of access: `.claude/rules/attribute-values.md` (automatically loaded when working with `*.tsx` components).

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

// Filtering blocks of the page
const blocks = await getApi().Pages.getBlocksByPageUrl('home')
if (!isError(blocks)) {
  // Exclude certain blocks by identifier
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

### Forgetting Error Checking

```typescript
// INCORRECT
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title) // Crashes if IError

// CORRECT
const product = await getApi().Products.getProductById(123)
if (isError(product)) return
console.log(product.attributeValues.title)
```

### Creating SDK Instance in Component

```typescript
// ❌ INCORRECT - new instance on every render
function ProductList() {
  const api = defineOneEntry(url, config)
}

// ✅ CORRECT - singleton through getApi()
const products = await getApi().Products.getProducts()
```

> Full singleton pattern: see **SDK Initialization** section

### Guessing Menu Markers and Filtering by Names

```typescript
// INCORRECT - guessing marker 'main' and filtering by names
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// CORRECT - ask the user for the marker and get it directly
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
const quickLinks = !isError(quickLinksMenu) && quickLinksMenu.pages
  ? (Array.isArray(quickLinksMenu.pages) ? quickLinksMenu.pages : [quickLinksMenu.pages])
  : []
```

### Creating Intermediate Types and Mapping API Data into Custom Objects

**NEVER** create an intermediate `type`/`interface` to wrap data from the API and do not map it in Server Actions. Components should work directly with what the API returned.

```typescript
// ❌ INCORRECT — creating a custom type and mapping attributes into it
type FeedbackField = { marker: string; title: string; required: boolean; ... }

export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  return {
    fields: form.attributes.map((a: any) => ({
      marker: a.marker,
      title: a.localizeInfos?.title,                        // ← already exists in a.localizeInfos.title!
      required: !!a.validators?.requiredValidator?.strict,  // ← already exists in a.validators!
      listOptions: a.listTitles.map((t: any) => t.value),  // ← losing title, extended!
    }))
  }
}

// ✅ CORRECT — returning attributes as they are
export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }
  return {
    attributes: (form.attributes || [])
      .filter((a: any) => a.type !== 'spam' && a.type !== 'button')
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
  }
}

// In the component, refer to fields directly:
field.localizeInfos?.title
field.validators?.requiredValidator?.strict
field.validators?.stringInspectionValidator?.stringMax
field.listTitles   // full objects with title, value, extended
```

**Rule:** Server Action is a thin proxy. The only permissible operations on API data: `filter` (exclude types) and `sort` (by `position`). Everything else — in the component.

### Inventing Data Structures and Creating Unnecessary Transformations

```typescript
// INCORRECT - creating an intermediate object, inventing structure
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // ← field children is NOT in the API!
}))

// CORRECT - using data from the API directly as is
const navItems = pages.filter((p: any) => !p.parentId)

// In JSX, refer to API fields directly
{navItems.map((item: any) => (
  <Link href={`/${item.pageUrl}`}>
    {item.localizeInfos?.title}
  </Link>
))}
```

### Logging Out the User on Any Error on Account Pages

**Problem:** On 401 you need to retry with the current token from localStorage (another operation might have already updated it), and log out ONLY on confirmed 401/403 after retry.

The full pattern for profile pages — skill **`/create-profile`**.
The full pattern for orders pages — skill **`/create-orders-list`**.

**Never do `localStorage.removeItem('refreshToken')` on form/data loading error** — this destroys the fresh token that another operation just wrote.

### Showing Preloader on State Change (not just on loading)

**Problem:** When adding/removing from favorites/cart, the entire list reloads with a loader.

**Solution:** cache in `useState<Record<id, Entity>>` + `useMemo` for the visible list. `useEffect` fetches only NEW ids (through `prevIdsRef`), removed ones are recalculated without a request.

> Ready pattern with Redux + persist — skill **`/create-favorites`**

### Calling setState Synchronously Inside useEffect

**Problem:** Synchronous `setState` / `dispatch` in the body of `useEffect` causes cascading re-renders.

```typescript
// ❌ INCORRECT — synchronous setState in useEffect
useEffect(() => { setMounted(true); }, []);

// ❌ INCORRECT — synchronous dispatch inside effect
useEffect(() => {
  if (!ids.length) { dispatch(setLoadedProducts([])); return; }
  // ...
}, [ids]);
```

**Rules:**

- Do not call `setState` / `dispatch` synchronously in the body of `useEffect` — move the initial value to `useState(initialValue)` or compute it through `useMemo`
- For checking "is the component mounted" — **do not use** `useEffect + setMounted`. Instead, use `useSyncExternalStore` or manage visibility through data
- If you need to reset state on dependency change — pass the initial value directly to `useState`, not through effect
- Asynchronous calls (fetch, dispatch after await) — are allowed inside `useEffect`

```typescript
// ✅ CORRECT — initial value immediately in useState
const [items, setItems] = useState<Item[]>(() => computeInitial());

// ✅ CORRECT — dispatch only after async operation
useEffect(() => {
  if (!ids.length) return; // just return, do not dispatch
  fetchProductsByIds(ids).then((loaded) => {
    dispatch(setLoadedProducts(loaded)); // ← after await — ok
  });
}, [ids]);

// ✅ CORRECT — mounted through useSyncExternalStore
import { useSyncExternalStore } from 'react';
const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false  // serverSnapshot
);
```

## Frequent AI Hallucinations (real examples of errors)

### Invented `children` Field in Menu

The `children` field is not in `IMenusPages` — use `parentId` (see the section above).

> Skill: **`/create-menu`**

### Rendering Captcha Field as Regular Input

The captcha type in OneEntry is `'spam'`, not `'captcha'`. This is an **invisible** reCAPTCHA v3 — render `<FormReCaptcha>`, not `<input>`.

```tsx
// ❌ HALLUCINATION
if (field.type === 'captcha') return <input type="text" />;

// ✅ CORRECT
if (field.type === 'spam') {
  return <FormReCaptcha siteKey={field.validators?.siteKey} ... />;
}
```

The full pattern for dynamic forms — skill **`/create-form`**.

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

### Hardcoding Filter Data (Colors, Price Range)

Obtain colors and price ranges from the API, do not hardcode them. The full pattern for the catalog with filters — skill **`/create-product-list`**.

### Passing filters and gridKey as server props in ShopView

`ShopView` MUST read `activeFilters` and `gridKey` from `useSearchParams`, otherwise `loadMore` ignores filters. The full pattern — skill **`/create-product-list`**.

## Working with Real Project Data

**IMPORTANT:** To determine the data structure and fields of entities, use real project data.

### ✅ PREFERRED METHOD: skill `/inspect-api`

Use skill **`/inspect-api`** — it will automatically read `.env.local` and perform the necessary curl requests:

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

- `items[0].statusIdentifier` — real product status
- `items[0].attributeValues` — all attributes with `marker`, `type`, `value`
- `identifier` — real marker for menus/forms/providers
- `pageUrl` — real marker for pages

## Template for Working with a New Entity

**When working with a new entity (Product, Page, Block, Menu):**

### Step 1: Look at the type in the SDK

```typescript
// node_modules/oneentry/dist/products/productsInterfaces.ts
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
```

### Step 2: Make a real call and look at the data

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

### SSR/SSG Strategies (Next.js)

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

// force-dynamic — disable static generation, data is always fresh
// Use for: product pages (availability/price changes), cart, profile, orders
export const dynamic = 'force-dynamic'
```

### user.state — storage for arbitrary user data

`user.state` is an object of arbitrary form in `IUserEntity` that can be used to store any client data: cart, favorites, settings, browsing history.

**⚠️ Critical rules:**

1. **Always spread** `{ ...user.state, newField }` — do not overwrite other fields entirely
2. **`formIdentifier`** is taken from `user.formIdentifier` — do not hardcode
3. **Call from the client** through `getApi()` after `reDefine()` — the token is managed by `saveFunction`

```typescript
// lib/userState.ts — client utilities
import { getApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// Reading state
export async function getUserState() {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return { error: (user as any).message };
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
  };
}

// Writing a single field
export async function saveUserFavorites(favorites: number[]) {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return;
  await getApi().Users.updateUser({
    formIdentifier: user.formIdentifier, // take from user!
    state: { ...user.state, favorites }, // spread — do not overwrite cart and other fields
  });
}
```

**Typical structure of state:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // array of productId
  // any other fields...
}
```

**Synchronization after login:** call `getUserState()` from the client after `reDefine()`. For local storage without server synchronization — `/create-cart-manager` and `/create-favorites`.

**⚠️ Versioning pattern for one-time initialization of Redux from server state:**

Without the `version` flag, the effect will overwrite Redux on every re-render, destroying local user changes.

```typescript
// ❌ INCORRECT — overwrites Redux on every re-render
useEffect(() => {
  if (!user?.state.cart) return
  dispatch(setCart(user.state.cart)) // ← will destroy local changes!
}, [user])

// ✅ CORRECT — one-time initialization through version flag
const [cartVersion, setCartVersion] = useState(0)
const [favoritesVersion, setFavoritesVersion] = useState(0)

useEffect(() => {
  if (!user?.state.cart || cartVersion > 0) return // already initialized
  user.state.cart.forEach((p: any) => dispatch(addToCart(p)))
  setCartVersion(1) // ← no longer reload from server
}, [user, cartVersion])

useEffect(() => {
  if (!user?.state.favorites || favoritesVersion > 0) return
  dispatch(setFavorites(user.state.favorites))
  setFavoritesVersion(1)
}, [user, favoritesVersion])
```

**Two-way synchronization of Redux → server on change:**

```typescript
// AuthContext.tsx — synchronize cart/favorites on the server on every change
useEffect(() => {
  if (!isAuth || !user) return
  // cartVersion > 0 ensures that sync runs only after initialization
  if (cartVersion === 0 && favoritesVersion === 0) return

  updateUserState({ cart: productsInCart, favorites: favoritesIds, user })
}, [isAuth, user, productsInCart, favoritesIds])
```

### RTK Query for Caching Read Requests

Use RTK Query when the same data is needed by multiple Client Components — automatic deduplication of requests and caching.

**When to use RTK Query instead of direct calls:**

| Scenario                                          | Approach                       |
|---------------------------------------------------|------------------------------|
| Server Component, one-time request                  | Direct call `getApi()`      |
| One Client Component, one-time request             | Direct call `getApi()`      |
| Multiple Client Components read the same data      | RTK Query (deduplication)     |
| Polling (updating user state in real-time)        | RTK Query with `pollingInterval`|

```typescript
// app/api/RTKApi.ts
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

export const oneEntryApi = createApi({
  reducerPath: 'oneEntryApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (build) => ({
    // Read request with caching
    getBlockByMarker: build.query<IBlockEntity, { marker: string; lang: string }>({
      queryFn: async ({ marker, lang }) => {
        const result = await getApi().Blocks.getBlockByMarker(marker, lang)
        if (isError(result)) return { error: result }
        return { data: result as IBlockEntity }
      },
    }),

    // Polling — keep user data up to date
    getMe: build.query<IUserEntity, void>({
      queryFn: async () => {
        const result = await getApi().Users.getUser()
        if (isError(result)) return { error: result }
        return { data: result as IUserEntity }
      },
    }),
  }),
})

export const { useGetBlockByMarkerQuery, useLazyGetMeQuery } = oneEntryApi
```

**Polling for auth state (update every 3 seconds):**

```typescript
// AuthContext.tsx — keep user data up to date
const [triggerGetMe] = useLazyGetMeQuery({
  pollingInterval: isAuth ? 3000 : 0, // poll only when authorized
})

// When fresh data is received — synchronize Redux
const { data: freshUser } = useGetMeQuery(undefined, {
  skip: !isAuth,
  pollingInterval: isAuth ? 3000 : 0,
})
```

### Parallel Requests

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

## Extended Typical Scenarios

### Checkout Form from OneEntry Forms API

**The checkout form (delivery, address, date/time) is obtained from OneEntry Forms API**, not hardcoded.

**How it works:**

1. `getApi().Orders.getAllOrdersStorage()` returns order storages, each has a `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` returns the fields of the delivery form
3. The form fields are rendered dynamically by type (`string`, `date`, `timeInterval`, etc.)

**The `timeInterval` type field in the checkout form** is a field with a list of available delivery slots. Its `value` contains an array of available time intervals `[[start, end], ...]`, from which are determined:

- Available dates in the calendar (unique dates from start values)
- Available times for the selected date (times from start values for that date)

**⚠️ IMPORTANT:**

- The delivery form (`formIdentifier`) is tied to the order storage
- `timeInterval` in the form = list of available delivery slots, NOT user-entered data
- All user-auth calls in ONE instance

To implement the full checkout flow, use skill **`/create-checkout`**.

### Product Catalog with Filters and Pagination

To create a product catalog with URL filters, infinite scrolling, and Server Actions, use skill **`/create-product-list`** — it will create `lib/filters.ts`, `app/actions/products.ts`, Server Page, `ShopView`, and `ProductGrid` with the correct architecture.

To create a UI filter panel with `FilterContext`, price/color/availability components, and Apply/Reset buttons, use skill **`/create-filter-panel`** — it complements `/create-product-list`.

### Search

To create a search bar (dropdown or separate page), use skill **`/create-search`**.

To create a language switcher, use skill **`/create-locale-switcher`**.

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

**Response Structure:** each item contains `id`, `time`, `formData: [{ marker, value, type }]`.

**Accessing Fields:** `Object.fromEntries(submission.formData.map(f => [f.marker, f.value]))`.

**Updating Status / Deleting:**

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Reviews with Hierarchy** (`isNested: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

**⚠️ Reviews in OneEntry are implemented through FormData** — use skill **`/create-reviews`**.

### IntegrationCollections — Custom Collections

IntegrationCollections are arbitrary data tables in OneEntry (FAQs, directories, arbitrary content). Full CRUD access is available without authorization.

**⚠️ Collection Marker:** obtain through `/inspect-api` or `getICollections()` — do not guess.

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

// Updating a row
await getApi().IntegrationCollections.updateICollectionRow('faq', id, {
  data: { answer: 'Updated answer.' },
});

// Deleting a row
await getApi().IntegrationCollections.deleteICollectionRowByMarkerAndId('faq', id);
```

**Response Structure:**

```typescript
{
  data: [
    {
      id: 1,
      collectionIdentifier: 'faq',
      data: { question: '...', answer: '...' }, // arbitrary fields of the schema
      position: 1,
    }
  ],
  total: 42,
}
```

**Checking Marker:**

```typescript
const isValid = await getApi().IntegrationCollections.validateICollectionMarker('faq');
```

### Category Navigation

**⚠️ IMPORTANT:** `getRootPages()` and `getPages()` do NOT return `catalog_page` (product catalogs).
Pages have a `type` field: `common_page`, `error_page`, `catalog_page`.
To obtain a catalog, use `getPageByUrl()` — it finds pages of ANY type.
`getChildPagesByParentUrl()` also returns `catalog_page` child pages.

```typescript
// ❌ INCORRECT - catalog_page will not be in the results of getRootPages/getPages
const rootPages = await getApi().Pages.getRootPages()
// shop, category, and other catalog_page WILL NOT be here!

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

**Solution:** Ensure that `reDefine(refreshToken, locale)` is called during initialization (e.g., in AuthContext) before any user-auth calls. `saveFunction` updates the token in localStorage automatically on each rotation.

> Pattern: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

#### 401 Unauthorized — token race condition

**Symptom:** The user is logged in, goes to the profile/orders page — and finds themselves logged out.

**Cause:** A parallel operation (CartContext, FavoritesContext) has already burned the same `refreshToken`. The new page reads the stale token from localStorage.

**Rule for all account pages:**

1. Server Action MUST return `statusCode` in the error object
2. On
