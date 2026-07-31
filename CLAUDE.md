# About the Project

oneentry — OneEntry NPM package

**SDK Documentation:** <https://js-sdk.oneentry.cloud/docs/index/>

This file is the core context: only what is always needed. Reference materials (SDK modules, glossary, scenarios, troubleshooting, patterns) are moved to the rules `.claude/rules/*.md` and loaded on demand — see "Context Map".

## Project Context

OneEntry is a headless CMS for e-commerce and content projects. The `oneentry` SDK provides access to catalogs and categories, orders and payments, authentication and profiles, multilingual content, forms, menus, and pages.

The SDK is isomorphic: it works both on the server and on the client. Public methods are read-only; programmatic content writing goes through the internal admin API (`admin-api.md`).

## Start of Each Session — Mandatory Checklist

### 🚨 BEFORE writing any code

1. Read this file **in full** (do not stop halfway)
2. `ls .claude/skills/` — check available skills
3. `ls .claude/rules/` — view the list of rules; read not all at once, but according to the "Rules Map" below
4. Read `eslint.config.mjs` — write code only in accordance with the linter
5. Run the necessary skill if available (do not invent it yourself)

### Two Mandatory Questions (once per session)

Ask them at the beginning of your work and save the answers in **project** memory (`~/.claude/projects/<project>/memory/`):

1. **"Do we need to save tokens?"** — **save**: do not run linter/build, do not write comments; **full**: JSDoc + lint + build after writing. Save as `feedback_token_mode.md`
2. **"Do we need to write Playwright E2E tests?"** — **yes**: run `/setup-playwright`, write a test in `e2e/` for each new component, add `data-testid`; **no**: do not create `e2e/`. Save as `feedback_playwright.md`

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

The file already exists — **do not ask**.

### Mandatory Code Requirements

- **No `any`** — types from `node_modules/oneentry/dist/**/*.d.ts` (see `typescript.md`). Exception — fields that the SDK itself declares as `any` (`ILocalizeInfo`, `IError`)
- **Linter** — the code must pass without errors and without post-factum auto-formatting (`next/core-web-vitals` + `next/typescript`)
- **Imports** — only used ones
- **`<img>`** → `next/image`, **`<a>`** → `next/link`
- **Temporary files** (inspection, debugging scripts) — **only** in `.claude/temp/`, this folder survives sessions
- **Structure of `components/`** — never flat: organize into groups (`layout/`, `product/`, `catalog/`, `cart/`, `favorites/`, `search/`, `user/`, `ui/` — primitives without business logic). If it doesn’t fit — create a new group

### Architectural Decisions of the Project

- **Tokens**: `localStorage`, key `'refresh-token'`; rotation is automatically handled by `saveFunction` (`tokens.md`)
- **`lib/oneentry.ts`**: the only file with `getApi`, `reDefine`, `hasActiveSession`, `syncTokens`, `isError`, `getLang`, `getImageUrl` — do not duplicate `isError` in other files
- **User Authentication**: user-auth methods (Orders, Users, Payments, Events, Subscriptions) are called from Client Component via `getApi()` after `reDefine(refreshToken, langCode)` — the SDK itself performs proactive refresh and token rotation
- **AuthProvider.auth/signUp/generateCode**: only from Client Component (fingerprint); server call — only with passing `deviceMetadata` of the browser (SDK ≥ 1.0.155)
- **`next.config.ts`**: `remotePatterns` with `*.oneentry.cloud` for `next/image`

## Context Map — what to load and when

This file is a navigator. It is intentionally thin: details are in the rules and skills and are loaded **on demand**, rather than hanging in the context for the entire session.

**How to load:** rule — `.claude/rules/<name>.md` in the project or MCP tool `get-rule <name>`; skill — command `/<name>` or `get-skill <name>`.

### Skills

Keyword from the prompt found → **first skill, then code**. Multiple triggers → multiple skills, each with its own checklist.

| Skill | Triggers in the prompt | What it creates |
| --- | --- | --- |
| `/setup-nextjs` | create next.js project | Next.js project from scratch |
| `/setup-oneentry` | connect SDK, set up oneentry | `lib/oneentry.ts`, `next.config.ts`, environment variables |
| `/inspect-api` | markers, response structure, what pages/forms/products are available | report with real markers and attribute types |
| `/create-auth` | login, registration, authorization, personal account, auth | login, registration, logout, AuthContext |
| `/create-google-oauth` | google login, oauth, login via google/facebook | redirect, callback, code exchange |
| `/create-profile` | profile, user personal data | profile page |
| `/create-orders-list` | orders, order history | list of orders with cancellation and pagination |
| `/create-checkout` | checkout, order processing | delivery form, timeInterval, payment |
| `/create-product-list` | product list, catalog | catalog with filtering and pagination |
| `/create-product-card` | product card (in the list) | product card |
| `/create-product-page` | product page (detailed) | product page |
| `/create-page` | page from CMS | page on Pages API |
| `/create-menu` | menu, navigation | navigation menu |
| `/create-form` | feedback form, form from CMS | dynamic form from Forms API |
| `/create-captcha` | captcha, recaptcha | reCAPTCHA v3 in the form |
| `/create-cart-manager` | cart | cart on server-side cart API |
| `/create-favorites` | favorites, wishlist | favorites on server-side wishlist API |
| `/create-filter-panel` | filters, filter panel | filter panel by attributes |
| `/create-content-filter` | content filter, filter tree | content filter tree |
| `/create-search` | search, search bar | search for products / pages |
| `/create-reviews` | reviews, reviews | reviews with hierarchy |
| `/create-subscription-events` | product subscription, price/availability notifications | subscription to product events |
| `/create-subscription` | paid subscriptions, rates | subscriptions + Stripe |
| `/create-locale-switcher` | language switcher, locale switcher | language switcher |
| `/create-server-action` | server action, server action | Server Action for public SDK methods |
| `/setup-playwright` | e2e tests, playwright | Playwright + MCP server |
| `/admin-fill-content` | fill admin with a script, upload content programmatically | content entry via internal admin API |
| `/admin-upload-images` | upload images to CMS with a script, preview/LQIP not created | image upload with preview |
| `/admin-grant-permissions` | 403 Permission data not found, group rights | granting route to a user group |

### Rules — reference, on demand

| Rule | When needed |
| --- | --- |
| `sdk-modules.md` | need SDK method signature or list of module methods |
| `glossary.md` | unclear term: marker, pageUrl, attributeSets, fingerprint, guestId, bonus, … |
| `sdk-init.md` | guest mode, `deviceMetadata`, `traficLimit`, complete summary of call contexts |
| `error-handling.md` | centralized `ApiError`/`handleApiError`, "Resource is closed" |
| `troubleshooting.md` | specific error 400/401/403/404/500 or build/environment issue |
| `common-mistakes.md` | before reviewing your code — what AI usually makes up |
| `common-patterns.md` | pagination, filtering, SSR/SSG strategies, `user.state`, RTK Query, parallel requests |
| `scenarios.md` | typical scenarios for e-commerce, authorization, CMS pages in full |
| `scenarios-advanced.md` | FormData, IntegrationCollections, catalog with filters, category navigation |
| `pages-blocks.md` | Pages/Blocks API, multilingual content, products in blocks |
| `mismatch-log.md` | entity not in admin — recording the discrepancy |

### Rules — auto-connected by project files

| Rule | "Fingerprint" files |
| --- | --- |
| `linting.md`, `typescript.md` | `**/*.ts`, `**/*.tsx` |
| `nextjs-pages.md`, `localization.md` | `app/**/page.tsx`, `app/**/layout.tsx` |
| `server-actions.md`, `tokens.md` | `app/actions/**/*.ts` |
| `attribute-values.md`, `attribute-sets.md` | `app/**/*.tsx`, `components/**/*.tsx` |
| `auth-provider.md` | auth components and actions |
| `forms.md`, `orders.md`, `product-statuses.md` | corresponding features |
| `performance*.md` | see "Performance" section |
| `playwright-e2e.md` | `e2e/**` |
| `jsdoc.md` | projects with strict JSDoc standard |
| `admin-api.md`, `admin-ui.md` | scripts for writing to admin |

## Main Rule: Check Types and Markers BEFORE Code

Applies to **every** subtask.

### 1. Types — from SDK, not from examples

`node_modules/oneentry/dist/` — the only source of truth. Documentation and existing code may be outdated.

```bash
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

Import types: `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`. Method signatures by modules — `sdk-modules.md`.

### 2. Markers — from API via `/inspect-api`, not from memory

Markers `'main'`, `'header'`, `'footer'` — hallucination. Run `/inspect-api` — it will read `.env.local` and return real markers (Pages, Forms, Menus, AuthProvider, …). If no `.env.local` — ask for URL and token.

**🚨 Existing code is NOT the source of truth:**

```typescript
// ❌ If you see it in code — DO NOT repeat without verification:
const inStock = product.statusIdentifier === 'in_stock'
const stockQty = attrs.units_product?.value
// Confirm these markers through `/inspect-api` before use.
```

### 3. Entities must exist in OneEntry before connection

If asked "add form X" / "connect product Y" — first confirm existence via API (`Forms.getAllForms()`, `Pages.getRootPages()`, `Products.getProducts()`, `AttributesSets.getAttributes()`).

If not found → respond: **“First create [name] in OneEntry Admin Panel, then I will connect it in the code.”**

### 4. SDK binding immediately, without static stub

If the user provided the layout of a component that should work with SDK — NEVER create a static UI stub. One step: (1) `/inspect-api` → markers → (2) Server Action → (3) connected component.

### 5. Forms — ALWAYS dynamic

Never hardcode `<input name="..." type="...">`. Get fields via `getFormByMarker(marker)`, render dynamically by `attribute.type` and `attribute.marker`. The layout defines the style — fields come from the API.

### 6. langCode — from `params`, not hardcoded

In Next.js 15+ `params` — is `Promise<{locale: string}>`, need to `await params`. Do not hardcode `'en_US'` — the parameter is optional, the default is taken from SDK initialization. Details: `localization.md`.

### 7. attributeValues — by `type`, not randomly

| Context | Access to value |
| --- | --- |
| **image / file, 1 file** | `attrs.marker?.value?.downloadLink` (OBJECT — in any module, v1.0.157) |
| **image / file, 2+ files** | `attrs.marker?.value?.[0]?.downloadLink` (ARRAY) |
| **groupOfImages** | `attrs.marker?.value?.[0]?.downloadLink` (always ARRAY) |
| **integer / float / real** | `attrs.marker?.value` — number or `null` (not `0`!) |
| **spam** (reCAPTCHA) | Render `<FormReCaptcha>`, NOT `<input>` |

The file `value` form depends only on **the number of files**, not on the module (Products/Pages/Blocks/Orders — the same). Stable access: `const v = attrs.marker?.value; const f = Array.isArray(v) ? v[0] : v;`. If you don't know the type — `console.log(attrs.marker)`. Full table: `attribute-values.md`.

### 8. "Add to Cart" button — by default, without question

For card / catalog / product page `AddToCartButton` is added automatically. If the cart is not implemented — first `/create-cart-manager`. The "Add to Favorites" button (`FavoriteButton`) — **only on request**.

### 9. `isError` + singleton SDK + exact types

Check each API call through type guard `isError`. One instance of SDK in `lib/oneentry.ts`, use via `getApi()`. For changing configuration (`refreshToken`, `langCode`) — `reDefine()`, **not** a new `defineOneEntry()`.

### 10. Server Action — thin proxy

Do not create intermediate types and do not map API responses to custom objects. Only `filter` and `sort` are allowed; everything else — in the component. Breakdown with examples: `common-mistakes.md`.

## 📋 Composite Prompt = Step-by-Step Execution

“Do X + add Y + create Z” — this is **not** a single pass. Real case: skipping the flag `isCheckCode: true` in the auth flow due to “general pass”.

**Step 1. Decomposition in TodoWrite:** for each subtask define the required skill (see “Context Map”) and relevant rules.

**Step 2. Execution mode:**

- **Sequentially** (default) — one subtask → its rules → checklist → next.
- **In parallel** — only for completely independent tasks without common dependencies (different pages/components without shared AuthContext/`lib/oneentry.ts`). Through Agent tool, each with full context.

**Step 3. Checklist after each subtask:** have all rules been applied, have all API fields been processed, have all flags (`isCheckCode`, `systemCodeTlsSec`, …) been considered.

❌ **NOT ALLOWED:** read the prompt with 3 tasks → immediately write 3 components in one message without a checklist in between.

## When to Stop and Ask the User

- **Don’t know the marker** → `/inspect-api`; no Bash — ask.
- **403 Forbidden** → check: is `AuthProvider.auth/signUp/generateCode` called via Server Action? Move to Client Component (fingerprint). Or check group permissions in the admin panel.
- **No layout** → “Is there an example of layout/design?”
- **Don’t understand the data source** → “Where should the data for [component] come from?”
- **Multiple solution options** → “X or Y, which do you prefer?”

## API Permissions for the "Guests" Group

By default, the "Guests" group has a limit of **10 objects** per entity. Before requests:

1. Open the admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
2. For each entity (Pages, Products, Forms, …): **Read: Yes, with restriction → without restrictions**
3. Without this, `getPages()`, `getProducts()`, etc. will return a maximum of 10 records.

Error `403 “Permission data not found. Provide the permission for requested url”` = route not granted to the group — skill `/admin-grant-permissions`. Programmatic content writing (public SDK — read-only) — internal admin API: `admin-api.md`, skills `/admin-fill-content` and `/admin-upload-images`; web UI of the admin panel — `admin-ui.md`.

## Miscellaneous

- **Pages — from CMS** (`getPageByUrl` + `getBlocksByPageUrl`), not hardcoded. The main one is usually `'home'`. Skill: `/create-page`.
- **Exactly copy the user's layout** (Tailwind/JSX) — change only hardcoded data to API data.
- **Linter:** write code according to the project's linter config. Do not fix someone else's linting/formatting — that’s the user's job.
- **Pagination, loading states, markers instead of IDs** — recommended by default.

## SDK Initialization

> **Quick initialization of a new project:** skill **`/setup-oneentry`** — will create `lib/oneentry.ts`, configure `next.config.ts`, and show the required environment variables.

**`.env.local`** (if the file does not exist — create it and ask the user for the project URL and App Token, Settings → App Token in the admin panel):

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

`NEXT_PUBLIC_` — variables are available on both the server and the client, so the SDK works in both contexts.

### Singleton `lib/oneentry.ts` — canonical pattern

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
      saveFunction, // ← SDK calls on rotation, token is saved automatically
    },
  });
}
```

**IMPORTANT:** in `next.config.ts` add `remotePatterns` for `*.oneentry.cloud`, otherwise `next/image` will throw an error.

Token handling rules — `tokens.md` (auto-loaded in `app/actions/**/*.ts`). Full list of exports from `lib/oneentry.ts`, guest mode, `deviceMetadata`, `traficLimit` — `sdk-init.md`.

### SDK Call Contexts (Next.js)

Choosing a context = rendering strategy:

- **SSR/SSG/ISR** → Server Component / `generateStaticParams` / `revalidate`
- **Mutations, server logic** → Server Action (`'use server'`)
- **CSR, dynamics, search** → Client Component via `getApi()`
- **User data** (Orders, Users, Payments) → Client Component via `getApi()` after `reDefine()`

**Strict limitation:** `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **only from Client Component** (on the server, the fingerprint is incorrect). Exception with SDK ≥ 1.0.155 — passing `deviceMetadata` from the browser, main case `/create-google-oauth`.

> Rules: `server-actions.md`, `auth-provider.md`, `nextjs-pages.md`

### ⚠️ params and searchParams in Next.js 15+/16 — are Promises

```tsx
// ✅ Always await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

For details — `nextjs-pages.md` and `localization.md`.

## Error Handling

The SDK by default (`isShell: true`) does not throw exceptions — errors are returned as values: HTTP error responses come as an `IError` object (with `statusCode`), while network / parsing / unexpected errors come as a raw `Error` (without `statusCode`, so `isError` does NOT catch it). Check the result with the `isError` guard. When `isShell: false`, the SDK throws all of this as an exception — a `try/catch` is needed.

> **Initialization (`defineOneEntry`, SDK ≥ 1.0.154):** input is validated synchronously — when `url` or `config.token` is empty/missing, a regular `Error` is thrown (NOT `IError`, it does not depend on `isShell`). Empty/whitespace values (unfilled `.env`) are considered missing. Catch it with a regular `try/catch` during initialization.

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

### Structure of IError

```typescript
// oneentry/dist/base/utils
interface IError {
  message: string
  pageData: unknown
  statusCode: number
  timestamp: string
  localizeMessage?: string      // filled in case of response validation failure (Zod)
  validationErrors?: unknown[]  // Zod issues in case of response validation failure
}
```

⚠️ The type declares `message: string`, but in case of form validator errors (`postFormsData`), the API actually sends **an array of strings** — normalize it before displaying.

⚠️ `403` + `"Resource is closed"` — is not an authorization error, but "the admin has not yet configured the resource." Handle it as an empty result and log it in `mismatch-log.md`.

Centralized `ApiError`/`handleApiError`, normalization of `message`, code table — `error-handling.md`. Analysis of specific API errors and builds — `troubleshooting.md`.

## API Response Structure

**Entity interfaces** can be found in `node_modules/oneentry/dist/`. Key fields of any entity: `id`, `localizeInfos`, `attributeValues`, `pageUrl`.

```typescript
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
```

### attributeValues — access to value by type

| Type | Access to value |
| --- | --- |
| `string` | `attrs.marker?.value` — string or `null` |
| `integer`, `real`, `float` | `attrs.marker?.value` — **number** or `null` (v1.0.157, not `0`) |
| `text`, `textWithHeader` | `(Array.isArray(v) ? v[0] : v)?.htmlValue` (`v = attrs.marker?.value`) |
| `image`, `file` | 1 file → object (`value.downloadLink`), 2+ → array — v1.0.157, same in all modules |
| `groupOfImages` | `attrs.marker?.value?.[0]?.downloadLink` — **ARRAY** |
| `date`, `dateTime`, `time` | `attrs.marker?.value?.fullDate` |
| `radioButton` | `attrs.marker?.value` — string-id |
| `list` | `attrs.marker?.value` — array of ids or objects with `extended` |
| `entity` | `attrs.marker?.value` — array of markers |
| `timeInterval` | `expandAttributeTimeIntervals(attr, { from, to })` → `[[ISO, ISO], ...]` |
| `spam` | reCAPTCHA v3 captcha → `<FormReCaptcha>` |

```typescript
const title = attrs.title?.value
const img = attrs.photo?.value?.downloadLink         // image, 1 file — object
const imgs = attrs.photos?.value?.[0]?.downloadLink  // groupOfImages — array

// Resilient to 1 and 2+ files (the content manager can add a second):
const v = attrs.photo?.value
const first = (Array.isArray(v) ? v[0] : v)?.downloadLink

// If you don't know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
```

Examples for each type, `plainValue`/`mdValue`, `extended` — `attribute-values.md`.

### Filtering by attributeValues

| Operator | Description | Example |
| --- | --- | --- |
| `in` / `nin` | in list / not in list | `"red,blue,green"` |
| `eq` / `neq` | equal / not equal | `100` |
| `mth` / `lth` | greater / less | `50` |
| `exs` / `nexs` | exists / does not exist | — |

Special values: `today` (date/dateTime), `now` (time/dateTime).

```typescript
const filters = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 },
]
const products = await getApi().Products.getProducts(filters)
```

### localizeInfos

Contains data for the request language. Direct access to fields, **without nesting by language**:

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.menuTitle    // menu title
page.localizeInfos?.htmlContent  // HTML content (check first)
// plainContent is in the API response, but not in the ILocalizeInfo type — in strict TS you need a cast:
(page.localizeInfos as any)?.plainContent
```

### Page Blocks (`getBlocksByPageUrl` → `IPositionBlock[]`)

With SDK ≥ 1.0.153, blocks already contain products — additional requests to `Products` are not needed:

```typescript
const products = block.products ?? []                // product_block → IProductsEntity[]
const similar  = block.similarProducts?.items ?? []   // similar_products_block → IProductsResponse
```

Fields are not available when `traficLimit: true` — access only through `?? []`. For details — `pages-blocks.md`.

## Working with Real Project Data

Define the data structure and entity fields based on real project data, not from memory.

**All API requests — only through the SDK** (not via curl). The SDK normalizes the data before returning: it removes the locale wrapper from `attributeValues` and `localizeInfos`, converts `additionalFields` from an array to `Record<marker, field>`, transforms a single `image.value` from an array to an object. Curl returns raw data — the code based on it will contain errors.

### Skill `/inspect-api` — preferred method

The skill will read `.env.local` and run the SDK script:

```text
/inspect-api             # all data at once
/inspect-api pages       # page markers
/inspect-api menus       # menu markers
/inspect-api products    # product attributes
/inspect-api forms       # form markers
/inspect-api auth-providers
/inspect-api product-statuses
```

**What to analyze in the response:**

- `items[0].statusIdentifier` — actual product status
- `items[0].attributeValues` — all attributes with `marker`, `type`, `value`
- `identifier` — actual marker for menus/forms/providers
- `pageUrl` — actual marker for pages

### Template for Working with a New Entity

For each new entity (Product, Page, Block, Menu):

1. **Check the type in the SDK** — `node_modules/oneentry/dist/products/productsInterfaces.ts`
2. **Make a real call** and check the data:

   ```typescript
   const testData = await getApi().Products.getProducts({ limit: 1 })
   console.log('Attributes:', testData[0]?.attributeValues)
   ```

3. **Write code** based on the real structure — using markers confirmed in steps 1–2

**⚠️ DO NOT skip steps 1-2. DO NOT guess the structure.**

## Performance — SSR caching, lazy, parallelism

The complete rules are in the `performance*.md` family. The universal entry point `performance.md` is loaded on any matching file; the other six auto-load only if there are corresponding "fingerprint" files in the project, so projects without RTK Query / GSAP / popups do not receive unnecessary context.

| Rule | When it applies | rulePaths (auto-load fingerprint) |
| --- | --- | --- |
| `performance.md` | Any Next.js + OneEntry project | `app/**/page.tsx`, `app/**/layout.tsx`, `app/api/**/*.ts`, `components/**/*.tsx` |
| `performance-popups.md` | There is a system of curtains / popups | `components/**/*Popup*.tsx`, `components/**/*Modal*.tsx`, `components/**/*Drawer*.tsx` |
| `performance-rtk.md` | RTK Query is used | `**/RTKApi.ts`, `store/**/*.ts`, `app/store/**/*.ts` |
| `performance-gsap.md` | There are GSAP animations | `**/animations/**/*.tsx`, `**/*Animation*.tsx`, `**/RegisterGSAP*.tsx` |
| `performance-images.md` | `next/image` with OneEntry CDN | `next.config.{ts,js,mjs}`, `**/*Image*.tsx`, `components/**/*.tsx` |
| `performance-streaming.md` | Streaming through `loading.tsx` / `<Suspense>` | `app/**/loading.tsx`, `app/**/page.tsx`, `app/**/layout.tsx` |
| `performance-bundle.md` | Bundle size audit, code-splitting | `next.config.{ts,js,mjs}`, `package.json`, `app/**/page.tsx` |

### The minimum that always applies

- Content pages — `export const dynamic = 'force-static'; export const revalidate = 300;`. Never `force-dynamic` without justification.
- Each `useSearchParams()` in the page tree — in `<Suspense>`, otherwise ISR is silently disabled.
- Server fetcher = `unstable_cache(impl, [keyParts], { revalidate, tags })` wrapped in React `cache()`. This is composition, not an alternative.
- In one server component, independent fetches — `Promise.all`. No for-await waterfalls.
- SDK `oneentry` in `'use client'` files — only for client flows (auth/cart/user through `getApi()` after `reDefine()`); load SSR data on the server and pass it as props.
