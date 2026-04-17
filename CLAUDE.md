# About the Project

oneentry — OneEntry NPM package

**SDK Documentation:** <https://js-sdk.oneentry.cloud/docs/index/>

## Glossary of OneEntry SDK Terms

A quick reference guide to key concepts. If you're unsure about a term, check here.

---

### marker

A string identifier for an entity in OneEntry (pages, menus, forms, attributes, authorization providers).

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
// ❌ INCORRECT — this is a Next.js route, not pageUrl
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

> ⚠️ MUST be called before `reDefine()` — otherwise, you will destroy the active session

---

### saveFunction

Callback in the SDK config that is called **automatically** on each `refreshToken` rotation.
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

User device data that the SDK sends during authorization.
On the server, `deviceInfo.browser` will be `"Node.js/..."` — therefore:

**`auth()`, `signUp()`, `generateCode()`, `checkCode()` — only from Client Component**

> Rules: `.claude/rules/auth-provider.md`

---

### image vs groupOfImages

The `image` type returns **different structures** depending on the entity (verified with real data):

| Entity    | `image` | Access |
|-----------|---------|--------|
| **Products** | OBJECT | `attrs.pic?.value?.downloadLink` |
| **Pages**    | ARRAY  | `attrs.icon?.value?.[0]?.downloadLink` |
| **Blocks**   | ARRAY  | `attrs.bg?.value?.[0]?.downloadLink` |

`groupOfImages` — always an ARRAY: `attrs.marker?.value?.[0]?.downloadLink`

> ⚠️ **ALWAYS** run `/inspect-api` or `console.log(attrs.marker?.value)` before use.
> Details: `.claude/rules/attribute-values.md`

---

### spam (form attribute type)

The Google reCAPTCHA v3 Enterprise field. DO NOT render as `<input>`.

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
|---------|---------|---------------|
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

## Starting Each Session — Mandatory Checklist

### 🚨 BEFORE writing any code

1. Read `CLAUDE.md` **in full** (do not stop halfway)
2. `ls .claude/skills/` — check available skills
3. `ls .claude/rules/` — read **all** rule files (`cat .claude/rules/*.md`)
4. Read `eslint.config.mjs` — write code only according to the linter
5. Run the necessary skill if available (do not invent it yourself)

### Mandatory Code Requirements

- **No `any`** — use types from `node_modules/oneentry/dist/**/*.d.ts` (see `.claude/rules/typescript.md`)
- **Linter** — code must pass without errors (`next/core-web-vitals` + `next/typescript`)
- **Imports** — only used, no extras
- **`<img>`** → `next/image`, **`<a>`** → `next/link`

### Skills for Typical Tasks

| Task                  | Skill                      |
|-----------------------|----------------------------|
| Project Initialization | `/setup-oneentry`          |
| Orders Page           | `/create-orders-list`      |
| Authorization Form    | `/create-auth` (check)     |
| Page                  | `/create-page`             |
| Server Action         | `/create-server-action`    |
| Inspect API Markers   | `/inspect-api`             |

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

| Skill                        | What it creates                                          |
|------------------------------|----------------------------------------------------------|
| `/setup-nextjs`              | Create a Next.js project from scratch                    |
| `/setup-oneentry`            | Initialize SDK in an existing project                    |
| `/create-auth`               | Authorization: login, registration, logout, AuthContext  |
| `/create-google-oauth`       | Google OAuth: redirect, callback, code exchange          |
| `/create-profile`            | User profile page                                       |
| `/create-orders-list`        | Orders list page with cancellation and pagination        |
| `/create-checkout`           | Checkout: delivery form, timeInterval, payment          |
| `/create-product-list`       | Product list with filtering and pagination               |
| `/create-product-card`       | Product card                                            |
| `/create-product-page`       | Product page                                            |
| `/create-page`               | Page from CMS (Pages API)                               |
| `/create-menu`               | Navigation menu                                         |
| `/create-form`               | Form from Forms API                                     |
| `/create-cart-manager`       | Cart (CartContext / Redux)                              |
| `/create-favorites`          | Favorites                                              |
| `/create-filter-panel`       | Filter panel by attributes                               |
| `/create-locale-switcher`    | Language switcher                                       |
| `/create-search`             | Search for products / pages                             |
| `/create-reviews`            | Product reviews                                         |
| `/create-subscription-events` | Subscribe to product events (price, availability)      |
| `/create-server-action`      | Server Action for public SDK methods                    |
| `/inspect-api`               | API exploration: markers, response structures           |
| `/setup-playwright`          | E2E testing: Playwright + MCP server                    |

## Instructions for AI

### Mode of Operation — Question at the Beginning

**At the very beginning of working on the application** (the first time you are asked to write code for the project) — be sure to ask:

> **Do we need to save tokens?**

### If saving is needed (economy mode)

- ❌ Do not run the linter and do not fix linting errors
- ❌ Do not build the application for verification
- ❌ Do not add comments to the code

### If saving is NOT needed (full mode)

- ✅ Add JSDoc comments to functions and components
- ✅ Lint the code and fix errors after writing
- ✅ Build the application for correctness verification

> Ask **only once** at the beginning of the session working on the project. Remember the answer for the entire session.

**After receiving the answer — save it in **project** memory** (not global):

Use Claude Code's memory system for the current project (`~/.claude/projects/<project>/memory/`). Create a file `feedback_token_mode.md` with frontmatter:

```markdown
---
name: token-mode
description: Token saving mode for this project
type: feedback
---

Token mode: [economy / full].
**Why:** the user indicated at the beginning of the session.
**How to apply:** do not ask again, use this mode automatically.
```

**At the beginning of a new session** — check project memory. If `feedback_token_mode.md` already exists — **do not ask**, use the saved mode.

---

### Playwright E2E tests — question at the beginning

**At the very beginning of working on the application** also ask:

> **Do we need to write Playwright E2E tests along with the code?**

#### If yes

1. Run **`/setup-playwright`** — it will install dependencies, create config, connect MCP server
2. **When creating each new component/page** — immediately write a test in `e2e/`
3. Add `data-testid` to key interactive elements
4. Use MCP Playwright to inspect pages before writing tests

#### If no

- Do not write tests, do not create `e2e/`

> Ask **only once** at the beginning of the session. Remember the answer for the entire session.
> Skill: **`/setup-playwright`**

**After receiving the answer — save it in **project** memory** (not global):

Create a file `feedback_playwright.md` in project memory:

```markdown
---
name: playwright-mode
description: Do we need to write Playwright E2E tests in this project
type: feedback
---

Playwright E2E tests: [yes / no].
**Why:** the user indicated at the beginning of the session.
**How to apply:** do not ask again, use this mode automatically.
```

**At the beginning of a new session** — check project memory. If `feedback_playwright.md` already exists — **do not ask**, use the saved mode.

---

### 🗂️ Temporary files — only in `.claude/temp/`

When working on the project, AI often creates temporary scripts for API inspection, testing, debugging (`_inspect.mjs`, `test.ts`, `debug.js`, etc.).

**Rule:**

- Create all temporary files **only** in `.claude/temp/`
- The folder `.claude/temp/` exists throughout the project — files from it can be reused between sessions
- At the end of a task where the temporary file is no longer needed — delete it
- **NEVER** leave temporary files in the project root or other folders

```text
.claude/
  temp/
    inspect-api.mjs     ← API inspection scripts
    debug-blocks.mjs    ← debugging scripts
    test-auth.mjs       ← authorization tests
```

---

### 🗂️ Structure of the `components/` folder

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

When generating code with the OneEntry SDK **ALWAYS**:

### ⚠️ CRITICALLY IMPORTANT: Check types BEFORE writing code and use them

#### ALWAYS check the data structure in the SDK BEFORE writing code

`node_modules/oneentry/dist/` contains all interfaces (IProductsEntity, IBlockEntity, IAuthPostBody, etc.). Use `grep` to find interfaces BEFORE writing code.

```bash
# Find an interface
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10

# Find a method signature
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

**NEVER INVENT data STRUCTURE!** Even if examples in the documentation look different - check real TypeScript types.
**NEVER INVENT DATA! Always obtain from the API (Pages, Menus, Products, Blocks, and other entities). If you don't know where to get the data → ASK THE USER. This is CRITICALLY IMPORTANT!**

#### Import types from the SDK

(`oneentry/dist/.../...Interfaces`)

#### Check the result of each API call

### 🚫 DO NOT use `as any` and `any[]`

Instead of `as any` — always import the type from `oneentry/dist/`:

- `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`
- `import type { IProductsResponse, IProductsEntity } from 'oneentry/dist/products/productsInterfaces'`

Exception: The SDK itself declares the field as `any` (for example `ILocalizeInfo`, `IError`) — then `as any` is not needed at all.

### 📋 Composite prompts — MUST be broken down into subtasks

**🚨 CRITICALLY IMPORTANT:** When a prompt contains multiple tasks ("do X + add Y + create Z"), there is a risk of missing rules in haste. **Real case:** in the prompt "make product + profile + authorization pages" AI missed the flag `isCheckCode: true` and did not add the step `activateUser()` — the rule was in `.claude/rules/auth-provider.md`, but was not applied due to haste.

**RULE: composite prompt = stepwise or parallel execution, NOT simultaneous "in one go."**

#### Step 1. Decomposition BEFORE any code

1. Explicitly write out all subtasks from the prompt (list in the response to the user or in TodoWrite)
2. For **each** subtask, determine the mandatory skill from the trigger table
3. For **each** subtask, identify all relevant `.claude/rules/*.md`
4. A broad prompt does NOT cancel the obligation to apply skills and rules to each part

#### Step 2. Choosing the execution mode

**Option A — Sequentially (default, for related tasks):**

- Execute subtasks one by one: one subtask → all its rules → checklist verification → next subtask
- After **each** subtask — run the checklist: have all rules from `.claude/rules/*.md` been applied? Have all fields from the API been processed? Have all provider flags (`isCheckCode`, `systemCodeTlsSec`, etc.) been considered?
- Only after explicit verification — move to the next subtask

**Option B — In parallel through agents (for independent tasks):**

- If subtasks are **completely independent** (different pages, different components without shared dependencies) — run several agents in parallel through the Agent tool (`general-purpose` or `Explore`)
- Pass each agent the **full context** of its subtask: relevant skill, rules, expected result
- Parallel agents cannot be used if subtasks share state (AuthContext, common `lib/oneentry.ts` setup) — only sequentially

#### Step 3. Prohibition on "one pass through everything"

❌ **NOT ALLOWED:** read the prompt with 3 tasks → immediately write 3 components in a row in one message without a checklist between them. This is the main reason for missing rules.

✅ **NECESSARY:** after each component/file — stop, checklist, only then the next.

#### Trigger keywords for skills

| Words in the prompt | Mandatory skill |
|----------------------|-----------------|
| login, registration, authorization, personal account, auth | `/create-auth` |
| google login, oauth, login via google/facebook | `/create-google-oauth` |
| profile, user personal data | `/create-profile` |
| orders, order history | `/create-orders-list` |
| checkout, checkout | `/create-checkout` |
| product list, catalog | `/create-product-list` |
| product card (component in the list) | `/create-product-card` |
| product page (full detailed page) | `/create-product-page` |
| cart | `/create-cart-manager` |
| favorites, wishlist | `/create-favorites` |
| filters, filter panel, filtering by attributes | `/create-filter-panel` |
| search, search bar | `/create-search` |
| reviews, product ratings | `/create-reviews` |
| product subscription, notifications about price/availability | `/create-subscription-events` |
| language switcher, locale switcher, multilingualism | `/create-locale-switcher` |
| menu, navigation | `/create-menu` |
| feedback form, form from CMS | `/create-form` |
| page from CMS | `/create-page` |
| server action, server action, `'use server'` | `/create-server-action` |
| create next.js project, project initialization | `/setup-nextjs` |
| connect SDK, configure oneentry, SDK initialization | `/setup-oneentry` |
| e2e tests, playwright, end-to-end | `/setup-playwright` |

> ⚠️ Trigger word found → **first the skill**, then the code. Do not write the component manually.
> ⚠️ Multiple triggers in one prompt → **multiple skills**, each executed with its full checklist. No saving by "common pass."

---

### 🔍 Checklist before writing code

**ALWAYS check BEFORE generating code:**

1. ☑️ **Where do the data come from?**
   - Is there an API method? → Use it
   - Is there no API method? → ASK THE USER where to get the data
   - DO NOT invent the data source!
2. ☑️ **Did you check the types in the SDK?**
   - **CRITICALLY IMPORTANT:** ALWAYS check interfaces BEFORE writing code!
   - Use grep: `grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   - Check the method signature: `grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts"`
   - DO NOT rely on examples from documentation - they may be outdated!
   - DO NOT invent the data structure - check real TypeScript types!
3. ☑️ **Do you know the data structure?**
   - 1️⃣ First, look at the type in the SDK (`node_modules/oneentry/dist/`)
   - 2️⃣ Then make a real call and look at the data (`console.log`)
   - DO NOT guess object fields!
4. ☑️ **Is a marker needed?**
   - Does the method require a marker? → run **`/inspect-api`** to see real markers from the API
   - No access to Bash? → ASK THE USER what marker to use
   - DO NOT guess markers like 'main', 'header', 'footer'!
5. ☑️ **Is the langCode correct?**
   - Are there params in Next.js? → Use it (do not forget await in Next.js 15+/16!)
   - DO NOT hardcode 'en_US' in components! The default language is already set, and the langCode field is not mandatory.
   - Localization rules: `.claude/rules/localization.md`
6. ☑️ **Are you using params in Next.js 15+/16?**
   - Is the function async? → Yes, it must be!
   - Type of params: `Promise<{...}>`? → Yes, it is a Promise!
   - Awaited params? → `const { locale } = await params;`
   - DO NOT forget await - otherwise, you will get undefined!
7. ☑️ **Is data transformation needed?**
   - Are the data from the API already in the required format? → Use directly
   - DO NOT create intermediate objects unnecessarily!
8. ☑️ **Does the component require the SDK (form, authorization, data)?**
   - The user provided the layout of the form/component → IMMEDIATELY connect to the SDK, do not create a static stub first
   - A marker is needed → run **`/inspect-api`** BEFORE writing the component
   - A Server Action is needed → create it TOGETHER with the component in one step
   - **NEVER** postpone connecting to the SDK for "later"

#### 🛑 When to STOP and ASK the user

**DO NOT write code if:**

1. ❓ **The user asks to add data (form, product, attribute, page, etc.)**
   → FIRST check that the entity exists in OneEntry via `/inspect-api` or API:

   ```ts
   // Forms: getApi().Forms.getAllForms()
   // Pages: getApi().Pages.getRootPages()
   // Products: getApi().Products.getProducts()
   // Attributes: getApi().AttributesSets.getAttributes()
   ```

   → If the entity is **NOT FOUND** — respond:
   > **First create [name] in the OneEntry Admin Panel, then I will connect it in the code.**
   → **NEVER** use a marker that is not confirmed through the API — only real data!

2. ❓ **Did not check types in the SDK**
   → FIRST: `grep -r "interface I[TypeName]" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   → Example: Before using `getApi().AuthProvider.auth()` ALWAYS check the structure of IAuthPostBody
3. ❓ **Do not know the marker** for Menus, Forms, Orders, Blocks, AuthProvider, etc.
   → Run **`/inspect-api`** — it will return real markers from the API
   → No Bash access: For AuthProvider — `getApi().AuthProvider.getAuthProviders()`, for Forms — `getApi().Forms.getAllForms()`
   → Nothing helped: Ask: "What marker to use for [name]?"
4. ❓ **Getting 403 Forbidden**
   → Check: are you calling `AuthProvider.auth/signUp/generateCode` through Server Action? → move it to Client Component (fingerprint)
   → Or check user group permissions in the admin panel (`PROJECT_URL/users/groups`)
5. ❓ **Did not see the layout** but need to create a component
   → Ask: "Is there an example of the layout/design for this component?"
6. ❓ **There is a layout, but do not know the marker** to connect to the SDK
   → First run **`/inspect-api`**, get the marker — and only then create the component already connected
   → DO NOT create a static stub with the intention of "connecting later"
7. ❓ **Do not understand where to get the data**
   → Ask: "Where should the data for [component] come from?"
8. ❓ **There are several options for a solution**
   → Offer options: "We can do X or Y, which option do you prefer?"

### Mandatory

1. **🛒 "ADD TO CART" BUTTON — ALWAYS BY DEFAULT:** When creating a product card, catalog, or product page, **ALWAYS** add an "Add to Cart" button (AddToCartButton), unless the user **explicitly** says otherwise. Do not ask "is a button needed?" — it is needed. If the cart is not yet implemented — first run `/create-cart-manager`, then add the button to the card/page. The "Add to Favorites" button (FavoriteButton) is added **only at the user's request**.
2. **💰 SAVE TOKENS: Do not fix linting, formatting, minor warnings. Leave this work to the user. Focus on the main task.**
3. **🎯 WRITE CODE ACCORDING TO LINTER RULES: When writing new code, always follow the project's linter settings (ESLint, Prettier, etc.). Check the linter config in the project before writing code if you do not know the settings.**
4. **🎨 EXACTLY COPY THE LAYOUT: If the user provided the layout (HTML/JSX), copy it exactly, especially if the same framework is used (e.g., Tailwind CSS). Do not change classes, structure, and styles without explicit necessity. Only replace hardcoded values with data from the API.**
5. **🔌 IMMEDIATELY CONNECT TO SDK: If the user provided the layout of a component that should work with the SDK (authorization form, order form, data from CMS) — NEVER create a static UI stub first. Immediately: (1) run `/inspect-api` to get markers, (2) create Server Action, (3) connect the component to the SDK — all in one step.**
6. **📋 FORMS ARE ALWAYS DYNAMIC: NEVER hardcode form fields (`<input>` with hardcoded `name`/`type`). Always obtain fields via `getFormByMarker(marker)` and render them dynamically by `attribute.type` and `attribute.marker`. The user's layout only sets the visual style — fields are taken from the API.**
7. **❓ ASK FOR MARKERS:** Many API methods require a marker (Menus.getMenusByMarker, etc.), but there are no methods to "get all". DO NOT GUESS markers like 'main', 'footer', 'header'. ALWAYS ask the user what marker to use for the desired entity.
8. For AuthProvider, you can get the list of providers: `getApi().AuthProvider.getAuthProviders()` to find available markers. For Forms, you can get the list of forms: `getApi().Forms.getAllForms()` to find available markers, etc.
9. Create a type guard `isError`
10. Use async/await
11. **Extract the API instance into a separate file (singleton). Use `getApi()` to get the current instance. DO NOT create new instances `defineOneEntry()` in components — use `reDefine()` to change configuration (refreshToken, langCode)**
12. Specify correct TypeScript types
13. **When creating pages, obtain content from CMS Pages, not hardcode**
14. **When working with attributeValues: if you KNOW the marker (attribute name), access it directly `attrs.title?.value`. If you do not know - ask the user or search by type if the user also does not know `Object.values(attrs).find(a => a.type === 'image')`**
15. **🚨 BEFORE writing code to access an attribute — ALWAYS check `type`, then use the correct structure `value`. DO NOT guess! Type table: `.claude/rules/attribute-values.md`**
   - ⚠️ `image` in **Products** → `attrs.marker?.value?.downloadLink` (OBJECT)
   - ⚠️ `image` in **Pages/Blocks** → `attrs.marker?.value?.[0]?.downloadLink` (ARRAY!)
   - ⚠️ `groupOfImages` → `attrs.marker?.value?.[0]?.downloadLink` (always ARRAY)
   - ⚠️ `spam` → DO NOT render as `<input>`! Render `<FormReCaptcha>`. The type is called `'spam'`, not `'captcha'`
   - If you do not know the type — `console.log(attrs.marker)` to see the structure
16. The SDK works both on the server and on the client (`NEXT_PUBLIC_*` variables are available in both contexts). The choice between Server Component / Server Action / Client Component is a matter of **rendering strategy**, not SDK limitations. Exception: `AuthProvider.auth/signUp/generateCode` — **only client** (device fingerprint).

### IMPORTANT: API Permissions and Record Count Limits

By default, in OneEntry for the user group "Guests" there is a limit of **maximum 10 objects** for entities (Pages, Products, etc.).

**Before using entity requests:**

1. Open the admin panel: `PROJECT_URL/users/groups/edit-group/1?tab`
2. For each entity (Pages, Products, Forms, etc.) change permissions:
   - **Read: Yes, with restriction - with restriction on the number of records**
   - → switch to **without restrictions**
3. This will allow obtaining **all entities without limits** on the number

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
5. Always check the result through the `isError` guard

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
// ❌ NOT ALLOWED — see in code and use without checking:
const inStock = product.statusIdentifier === 'in_stock'
// → and immediately write: query.statusMarker = 'in_stock'  ← NOT ALLOWED!

// ❌ NOT ALLOWED — see in code and use without checking:
const stockQty = attrs.units_product?.value
// → and immediately write: { attributeMarker: 'units_product', ... }  ← NOT ALLOWED!
```

**Even if the value looks plausible — ALWAYS check through a real API request.**

### How to Check Before Writing Code

Use the skill **`/inspect-api`** — it will automatically read `.env.local` and return real markers.

If `.env.local` is not found — ask the user for the project URL and token.

## SDK Initialization

> **Quick initialization of a new project:** use the skill **`/setup-oneentry`** — it will create `lib/oneentry.ts`, configure `next.config.ts`, and show the necessary environment variables.

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

### Integration with Next.js (Singleton pattern)

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
- **`getLang()`** — returns the current SDK langCode (`'en_US'` by default). Use in Client Components for localization without `useParams`
- **`getImageUrl(value)`** — normalizes the image field (object or array) into a URL string
- **`isError(result)`** — type guard to check the SDK response for an error

**⚠️ reDefine — check hasActiveSession before calling:**

```typescript
import { reDefine, hasActiveSession } from '@/lib/oneentry'

// If immediately after login you call reDefine — you will burn the just received refreshToken
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
|----------|----------------|----------------|
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

// force-dynamic — disable static generation, data is always fresh
// Use for: product pages (availability/price changes), cart, profile, orders
export const dynamic = 'force-dynamic';
```

### user.state — storage for arbitrary user data

`user.state` is an object of arbitrary form in `IUserEntity`, which can be used to store any client data: cart, favorites, settings, browsing history.

**⚠️ Critical rules:**

1. **Always spread** `{ ...user.state, newField }` — do not overwrite other fields entirely
2. **`formIdentifier`** is taken from `user.formIdentifier` — do not hardcode
3. **Call from the client** via `getApi()` after `reDefine()` — the token is managed automatically by `saveFunction`
4. **Always get fresh data before writing** — call `getUser()` right before `updateUser()`, do not use the previously cached user object: between getting and writing, other code may have changed `state` (for example, `cart` or `favorites`)

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

// Writing a single field — always get fresh user before updateUser()!
export async function saveUserFavorites(favorites: number[]) {
  // ✅ Get FRESH data right before writing — do not use cached user
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return;
  await getApi().Users.updateUser({
    formIdentifier: user.formIdentifier,
    state: { ...user.state, favorites }, // spread current state — cart and other fields are preserved
  });
}

// ❌ INCORRECT — user may have been obtained long ago, state.cart has already changed
export async function saveUserFavoritesWrong(favorites: number[], cachedUser: IUserEntity) {
  await getApi().Users.updateUser({
    formIdentifier: cachedUser.formIdentifier,
    state: { ...cachedUser.state, favorites }, // will overwrite current changes in cart!
  });
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

**Synchronization after login:** call `getUserState()` from the client after `reDefine()`. For local storage without server synchronization — `/create-cart-manager` and `/create-favorites`.

**⚠️ Versioning pattern for one-time initialization of Redux from server state:**

Without the `version` flag, the effect will overwrite Redux on every re-render, destroying local user changes.

```typescript
// ❌ INCORRECT — overwrites Redux on every re-render
useEffect(() => { setMounted(true); }, []);

// ❌ INCORRECT — synchronous dispatch inside effect
useEffect(() => {
  if (!ids.length) { dispatch(setLoadedProducts([])); return; }
  // ...
}, [ids]);
```

**Rules:**

- Do not call `setState` / `dispatch` synchronously in the body of `useEffect` — move the initial value to `useState(initialValue)` or compute it via `useMemo`
- For checking "is the component mounted" — **do not use** `useEffect + setMounted`. Instead, use `useSyncExternalStore` or manage visibility through data
- If you need to reset state upon changing a dependency — pass the initial value directly into `useState`, not through an effect
- Asynchronous calls (fetch, dispatch after await) — are allowed inside `useEffect`

```typescript
// ✅ CORRECT — initial value right in useState
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

### Hardcoding OAuth provider URL or skipping redirect step

`config.oauthAuthUrl` in the response of `getAuthProviderByMarker` contains the base URL for the provider's authorization. **Do not hardcode the URL** — take it from the config.

`oauth()` **requires** `code`. It cannot be obtained without a redirect — this step cannot be skipped.

```typescript
// ❌ HALLUCINATION — hardcoding URL
window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?...`

// ✅ CORRECT — baseUrl from OneEntry provider
const provider = await getApi().AuthProvider.getAuthProviderByMarker('google_ios')
if (isError(provider)) return
const baseUrl = (provider as any).config?.oauthAuthUrl  // "https://accounts.google.com/o/oauth2/v2/auth"
if (!baseUrl) return
window.location.href = `${baseUrl}?client_id=...&redirect_uri=...`
```

Correct OAuth flow:

1. Button → `getAuthProviderByMarker` → `config.oauthAuthUrl` + query-params → redirect
2. Google → `redirect_uri?code=XXX`
3. Callback reads `code` → `oauth(code)` via Server Action (handles login + registration)

> Rules and examples: `.claude/rules/auth-provider.md` → section "OAuth Providers"

### Inventing `children` field in menu

The `children` field does not exist in `IMenusPages` — use `parentId` (see the section above).

> Skill: **`/create-menu`**

### Rendering captcha field as a regular input

The captcha type in OneEntry is `'spam'`, not `'captcha'`. This is **invisible** reCAPTCHA v3 — render `<FormReCaptcha>`, not `<input>`.

```tsx
// ❌ HALLUCINATION
if (field.type === 'captcha') return <input type="text" />;

// ✅ CORRECT
if (field.type === 'spam') {
  return <FormReCaptcha siteKey={field.validators?.siteKey} ... />;
}
```

The full pattern for dynamic forms — skill **`/create-form`**.

### Using `getProductsByPageUrl` for the entire catalog

`getProductsByPageUrl` returns **only products linked to a specific catalog_page** in OneEntry. To display all products in the project — use `getProducts`.

```typescript
// ❌ HALLUCINATION — getProductsByPageUrl for the entire catalog
const result = await getApi().Products.getProductsByPageUrl('catalog', [], locale, { offset: 0, limit: 30 })

// ✅ CORRECT — the entire catalog
const result = await getApi().Products.getProducts([], locale, { offset: 0, limit: 30 })

// ✅ CORRECT — products of a specific category (marker of a specific category)
const result = await getApi().Products.getProductsByPageUrl('soft_toys', [], locale, { offset: 0, limit: 30 })
```

⚠️ **Do not use `getProductsByPageUrl` to display the entire catalog** — it will only return products linked to a specific catalog_page.

For creating a product catalog page, use skill **`/create-product-list`** — it will create a Server Component with filtering through URL query params, pagination (load more), `FilterPanel` with price and color data from the API, and `ProductGrid` with remounting through `key`.

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

Get colors and price ranges from the API, do not hardcode them. The full pattern for the catalog with filters — skill **`/create-product-list`**.

### Passing filters and gridKey as server props in ShopView

`ShopView` MUST read `activeFilters` and `gridKey` from `useSearchParams`, otherwise `loadMore` ignores filters. The full pattern — skill **`/create-product-list`**.

## Working with Real Project Data

**IMPORTANT:** To determine the data structure and fields of entities, use real project data.

### ✅ PREFERRED METHOD: skill `/inspect-api`

> **IMPORTANT:** All API requests are made **only through the SDK** (not via curl).
> The SDK normalizes data before returning: removes locale wrapping from `attributeValues` and `localizeInfos`, converts `additionalFields` from an array to `Record<marker, field>`, transforms a single `image.value` from an array to an object. Curl returns raw data — code based on them will contain errors.

Use skill **`/inspect-api`** — it will automatically read `.env.local` and run the SDK script:

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

### Step 1: Look at the type in the SDK

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
