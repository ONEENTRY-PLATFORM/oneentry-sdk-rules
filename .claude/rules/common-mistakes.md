# Typical AI Mistakes and Hallucinations

## Forgetting Error Checking

```typescript
// ❌ Crashes if IError
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title)

// ✅ Type guard isError
if (isError(product)) return
console.log(product.attributeValues.title)
```

> Detailed error handling — section **Error Handling**.

## Creating SDK Instance in Component

`defineOneEntry()` in a component = new instance on every render. Use singleton via `getApi()`. Full pattern — section **SDK Initialization**.

## Guessing Menu Markers and Filtering by Titles

```typescript
// ❌ Guessed marker 'main', filtering by title
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// ✅ Ask for marker and get the desired menu directly
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
```

## Creating Intermediate Types and Mapping API to Custom Objects

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
import type { IFormsEntity, IFormAttribute } from 'oneentry'
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
'requiredValidator' in (field.validators ?? {})        // required — by the presence of the key, strict may not be set
Number(field.validators?.stringInspectionValidator?.stringMax) || undefined  // numbers come as strings, 0 = not set
field.listTitles   // full objects with title, value, extended
```

Analysis of all validators (asterisk for required field, email, mask, `customErrorText`) — `.claude/rules/forms.md`, section "Field Validators".

**Rule:** Server Action — thin proxy. The only allowed operations: `filter` (exclude types) and `sort` (by `position`). Everything else — in the component.

## Inventing API Fields and Creating Unnecessary Transformations

```typescript
// ❌ Creating an intermediate object — duplicating what already exists in the API
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // children actually exist in the API — mapping is unnecessary
}))

// ✅ API object directly. pages — root items; children in item.children (tree)
const rootItems = Array.isArray(pages) ? pages : [pages]
{rootItems.map((item) => (
  <Link href={`/${item.pageUrl}`}>{item.localizeInfos?.title}</Link>
))}
```

## Logging Out on Any Error on Account Pages

On 401 — retry with the current token from localStorage (another operation may have updated it). Log out ONLY on confirmed 401/403 after retry.

**Never do `localStorage.removeItem('refresh-token')`** on form/data loading error — this destroys the fresh token just written by another operation.

⚠️ Key — **with a hyphen**: `'refresh-token'`. This is written by `saveFunction` SDK. `'refreshToken'` — a common hallucination: `getItem` will return `null`, and retry will go without a token. Details — `.claude/rules/tokens.md`.

> Full patterns: `/create-profile`, `/create-orders-list`.

## Showing Preloader on State Change (Not Just on Loading)

When adding/removing from favorites/cart, the entire list reloads with a loader.

**Solution:** cache `useState<Record<id, Entity>>` + `useMemo` for the visible list. `useEffect` fetches only NEW ids (via `prevIdsRef`), removed ones are recalculated without a request.

> Ready pattern with Redux + persist — skill **`/create-favorites`**.

## Calling setState Synchronously Inside useEffect

Synchronous `setState`/`dispatch` in the body of `useEffect` triggers cascading re-renders.

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

`config.oauthAuthUrl` from `getAuthProviderByMarker` contains the base URL. Do not hardcode — take from the config. `oauth(marker, body)` accepts `body: IOauthData`, where `code` is one of the required fields (`client_id`, `client_secret`, `code`, `grant_type`, `redirect_uri`); `code` is only available after redirect.

```typescript
// ❌ Hardcoded URL
window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?...`

// ✅ baseUrl from OneEntry provider
const provider = await getApi().AuthProvider.getAuthProviderByMarker('google_ios')
if (isError(provider)) return
const baseUrl = (provider as any).config?.oauthAuthUrl
window.location.href = `${baseUrl}?client_id=...&redirect_uri=...`
```

**OAuth flow:** button → `getAuthProviderByMarker` → `config.oauthAuthUrl` + params → redirect → callback reads `code` → `oauth(marker, body)` via Server Action (`body` — `IOauthData`: `client_id`, `client_secret`, `code`, `grant_type`, `redirect_uri`).

> Details: `.claude/rules/auth-provider.md` (section "OAuth Providers").

### Searching for Child Menu Items via `parentId` Filter Instead of `children`

`getMenusByMarker` returns a **tree**: `pages` — only root items, children are in `item.children` (array or single object — normalize via `Array.isArray`). The `children` field EXISTS in `IMenusPages`. The filter `pages.filter(p => p.parentId === item.id)` will return empty. Skill: **`/create-menu`**.

### Rendering Captcha as a Regular Input

The captcha type in OneEntry is **`'spam'`**, not `'captcha'`. This is an invisible reCAPTCHA v3 — render `<FormReCaptcha>`, not `<input>`. Full pattern for dynamic form — skill **`/create-form`**.

### Using `getProductsByPageUrl` for the Entire Catalog

`getProductsByPageUrl` returns **only products from a specific catalog_page**. For all products in the project — `getProducts`.

```typescript
// ✅ Entire catalog
await getApi().Products.getProducts([], locale, { offset: 0, limit: 30 })
// ✅ Products of category (marker catalog_page in OneEntry)
await getApi().Products.getProductsByPageUrl('soft_toys', [], locale, { offset: 0, limit: 30 })
```

`getProducts` — global search, cart, "all products" page. `getProductsByPageUrl` — category page with the corresponding `catalog_page`. Skill **`/create-product-list`** at step 2 asks "where are the products from?" and creates both Server Actions.

### Hardcoding langCode

In Next.js 15+ `params` — Promise, `await params` is mandatory. Do not hardcode `'en_US'`. Details: `.claude/rules/localization.md`.

### Hardcoding Filter Data (Colors, Price Range)

Get from the API. Full pattern for catalog with filters — skill **`/create-product-list`**.

### Passing `filters` and `gridKey` as Server Props in ShopView

`ShopView` MUST read `activeFilters` and `gridKey` from `useSearchParams`, otherwise `loadMore` ignores filters. Full pattern — skill **`/create-product-list`**.
