---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.js"
  - "scripts/**/*.ts"
---
# Internal admin API (`/api/admin/*`) — programmatic entry into OneEntry

Public SDK (`defineOneEntry`) — **read-only**: it reads data via App Token and cannot write entities. For programmatic filling of the project (products, pages, blocks, admins, attribute sets, files), the **internal REST admin API** is used — the same requests that the admin panel itself sends.

⚠️ The API is internal and undocumented (Swagger is closed): formats are taken from real UI requests and verified on a live project. Before using it on a new project — intercept a reference UI request via Playwright (`browser_network_requests`) and compare.

> Skills-recipes: `/admin-fill-content` (filling entities), `/admin-upload-images` (uploading images with previews), `/admin-grant-permissions` (user group permissions). UI navigation — rule `admin-ui`.

---

## Authentication

1. Login via **admin UI form** using Playwright: `{PROJECT_URL}/authentication/login`, fields `#login-username` / `#login-password`, button `button:has-text("Enter")`. Credentials — only from env (`OE_ADMIN_LOGIN` / `OE_ADMIN_PASSWORD`), do not hardcode.
2. After logging in, take the cookie **`accessToken`** (it is NOT httpOnly) and send the header `Authorization: Bearer <token>` in all REST requests.
3. The session lasts **~15 minutes** — long scripts should be able to re-login; a crash in the middle of an action = redirect to `/authentication/login`, verify the result of the last action.
4. `page.goto` to the login page sometimes flakily fails — a retry is needed (2–3 attempts).
5. ❌ **DO NOT set global `content-type: application/json`** in request-context — this breaks multipart file uploads. Playwright sets the type per request (`data:` → json, `multipart:` → form-data).

---

## Save Model — "auto-save the entire object"

There is no Save button in the admin panel: the UI auto-saves the **entire object** on every field change. Scripts replicate this:

```text
GET entity → mutate necessary fields in a copy → PUT the entire object back
```

Never PUT a partial object — it will overwrite the other fields.

## Endpoint Map (base = project URL)

| Entity | Endpoints |
| --- | --- |
| Admin | `GET /api/admin/admins?limit=100&offset=0&langCode={lc}`, `GET/PUT /api/admin/admins/{id}` |
| Product | `GET/PUT /api/admin/products/{id}` |
| Product Search | `GET /api/admin/products/quick/search?name=X&langCode={lc}` → `[{id, title, pageId}]` |
| Page | `POST /api/admin/pages`, `PUT/DELETE /api/admin/pages/{id}` |
| Block | `GET /api/admin/blocks?limit=300&offset=0&langCode={lc}`, `GET /api/admin/blocks/{id}`, `POST /api/admin/blocks`, `PUT /api/admin/blocks/{id}` |
| Attribute Set | `GET/PUT /api/admin/attributes-sets/{id}` (schema — in `.schema.attribute{N}`) |
| File | `POST /api/admin/files?...` (multipart; see skill `/admin-upload-images`) |
| Group Permissions | `GET /api/admin/user-groups/{id}/permissions?...`, `PUT .../permissions/{permId}/change`, `POST/DELETE /api/admin/user-permissions[/{id}]` (see `/admin-grant-permissions`) |
| Orders | `GET /api/admin/orders-storage/{marker}?limit=50&offset=0&langCode={lc}` — listing of storage orders (any user order is visible, not just their own) |
| Payment Sessions | `GET /api/admin/payments/sessions/order/{orderId}` — order sessions with statuses (`waiting`/`paid`/…) |
| Payment Accounts | `GET /api/admin/payments/accounts?langCode={lc}`, `GET /api/admin/payments/accounts/{id}` — gateway config: `successUrl`/`cancelUrl`, testMode, `stripeAccountId` (diagnostics for "session eternally waiting", see rule `orders`) |
| Events | `GET /api/admin/events?limit=100&offset=0&langCode={lc}` — actual event markers (when public `Events.getAllEvents` returns 401) |

In addition to writing, the admin API is a reliable channel for **read-only diagnostics**, when public methods are unavailable or mask an error: other users' orders and their payment sessions, payment account config, event markers.

POST page (creation): `{parentId, attributeSetId, pageUrl, isVisible, generalTypeId: 17, localizeInfos: {en_US: {title, htmlContent: '', plainContent: '', menuTitle}}, attributesSets: {en_US: {}}}`.

POST content block: `{generalTypeId: 18, attributeSetId, identifier, isVisible: true, position, localizeInfos: {en_US: {title}}, attributesSets: {en_US: {}}, productPageUrls: [], templateId: null, customSettings: null}`.

⚠️ For auth providers and user groups, admin REST is **partially unavailable** (`/api/admin/auth*` → 404) — providers are configured only through the UI (rule `admin-ui`).

---

## Internal field IDs — positional, read from GET

Attribute values in the admin API are located in `attributesSets.{locale}` (NOT in `attributeValues` — this is the read format of the public SDK). Keys are **positional internal IDs**: `{type}_id{N}`, where `N` is the position of the attribute in the set: `string_id1`, `image_id2`, `integer_id3`, `text_id6`, `entity_id7`, `timeInterval_id9`, `float_id7`…

- ❌ Do not guess the correspondence "marker → internal ID".
- ✅ Read from the GET object of the entity or from the schema of the set (`GET /api/admin/attributes-sets/{id}` → `.schema.attribute{N}.identifier` = marker, `N` = tail of the internal ID).
- An attribute in the schema of the set is an object `schema.attribute{N} = {id, type, isPrice, original, position, isVisible, identifier, localizeInfos: {{lc}: {title}}, initialValue?}`. When creating attributes via script, **include `position: N`** (as for those created via UI) — without it, the value widget in the admin panel may not render/map values. `initialValue.{lc}.value` — the default value of the attribute (see the section "Dictionary of UI texts").

## Value Formats for Writing (different from read format of SDK!)

| Type | Write Format |
| --- | --- |
| `string` | primitive string |
| `integer` | string (`"5"`) |
| `text` | `[{htmlValue: '<p>…</p>', mdValue: '', plainValue: '', params: {editorMode: 'html', isImageCompressed: true}}]` |
| `entity` → page | `[{title, value: {id: <numeric page id>, depth, isPinned: false, parentId, position, selected: true}}]` |
| `entity` → product | the same, but `value.id` — **string** `"p-{pageId}-{productId}"`, `parentId = pageId`, `depth: 3` (composed from quick-search: `id` = productId, `pageId`) |
| `list` | `[{title, value: "<id>", extended: {type: null, value: null}, position}]` |
| `timeInterval` | array of groups (one for each day of the week): `{intervalId, values: [{id, intervalId, dates: [iso, iso], intervals: [], times: [[{hours,minutes},{hours,minutes}], …], inEveryWeek: true, inEveryMonth: true, exceptions: []}]}`; UUID — `crypto.randomUUID()` |
| `image` / `groupOfImages` | file object from upload response + `params: {isImageCompressed: true}` (see `/admin-upload-images`) |

## Gotchas

- **`product.price` — derived field.** The top-level price is recalculated from an attribute with the flag `isPrice: true` **asynchronously**: `GET` immediately after `PUT` returns the old value (`0`/`null`), even though the write has gone through. In scripts, write both places (`product.price` = number and `attributesSets.{lc}.{float_idN}` = string), and verify with the public SDK or a repeated GET after a pause (~a minute).
- **Public API lags by ~30 seconds.** After PUT of a block/page, `getBlockByMarker` and other public methods may return old values — this is cache/distribution of OneEntry. Admin-GET shows everything immediately — check the completeness of the write with it.
- **Picker options for entity attribute ≠ value.** "List options" of the picker are a curated list in `schema.attribute{N}.listTitles.{locale}` of the set; the attribute value can be written bypassing the picker (direct PUT of the real id) — it will be saved and rendered on the front end. But the admin widget will show the selected chip only if the id is in `listTitles`; it can be fixed by rebuilding `listTitles` according to the catalog tree and PUTting the set (before writing — backup the original).
- **Selecting the attribute set of an "empty" entity** (`attributeSetId: null → id`) passes **in one PUT** along with the values — a separate step is not needed.
- The endpoint **for deleting files not found** — re-uploaded files remain orphans on the CDN.
- **⚠️ Curly braces `{`/`}` in ATTRIBUTE value drop public reading.** OneEntry casts values to JSON (PostgreSQL), and a value with `{…}` (placeholder `{n}`, JSON-like text) → the public API returns **`500 invalid input syntax for type json`** on reading the ENTIRE block/set; SDK method returns an error object, `attributeValues` is empty. Admin-GET and raw REST (Postman) return data (there is no cast there) — hence it "looks normal" in the admin panel, while the site is empty. Placeholders for interpolation should be done **without braces**, e.g. `%token%` (`Step %x% of %y%`), in code `.replace('%x%', …)`. Attribute labels (`localizeInfos.title`) can tolerate braces — only values break.
- **Diagnostics for "public reading is empty/broken".** SDK methods (`getBlockByMarker` etc.) wrap the raw endpoint in validation/normalization and in case of server error **return an error object** (`{statusCode, message, …}`), rather than throwing — then `res.attributeValues` is empty. Before blaming "limit by quantity", **dump the entire SDK response** (`JSON.stringify(res)`, check `res.statusCode`/`res.message`) and compare with raw `fetch(base + '/api/content/...', {headers:{'x-app-token': token}})`. Often the reason is one broken value (see braces above), not volume.

## Dictionary of UI texts: values in `initialValue` of the set (not in the block)

For the dictionary of UI texts (many lines, edited by the content manager, read publicly), there are **two incompatible storage places** — choose ONE, and the site must read from the same place where the admin edits:

- **BLOCK Values** — `block.attributesSets.{lc}.string_id{N}`, read publicly `Blocks.getBlockByMarker(marker)`. But there is actually no convenient per-attribute value editor for common_block in the UI — edits are only via script.
- **`initialValue` of SET attributes** — `set.schema.attribute{N}.initialValue.{lc}.value`. This field is edited in the admin panel **Settings → Attributes → <set>** (attribute value) and read publicly `AttributesSets.getAttributesByMarker(setMarker, langCode)` → array `[{marker, initialValue, position, type, localizeInfos, …}]` (`initialValue` is already delocalized under langCode).

> Forms in which `initialValue` comes when read in different ways (flat / language-keyed), and the pattern for scaling dictionaries — `.claude/rules/attribute-sets.md`, section "`initialValue`".

**Key:** public reading of the block (`getBlockByMarker`) **does NOT** substitute `initialValue` of the set when the block value is empty (will return `""`) — block values and `initialValue` of the set are independent. If a dictionary is needed, **editable from UI**: store values in `initialValue` of the set and read them with `getAttributesByMarker`, mapping `marker → initialValue`. Then edits in the set editor are immediately visible on the site.

```ts
// front: source of the dictionary from initialValue of the set
const attrs = await getApi().AttributesSets.getAttributesByMarker('system_content');
const dict = Object.fromEntries(
  (Array.isArray(attrs) ? attrs : [])
    .filter((a) => a?.marker)
    .map((a) => [a.marker, { value: a.initialValue ?? undefined }]),
);
```

```js
// upload script: value in initialValue when building the schema of the set (PUT /api/admin/attributes-sets/{id})
schema[`attribute${id}`] = {
  id, type: 'string', isPrice: false, original: true, position: id, isVisible: true,
  initialValue: { en_US: { value } }, // ← dictionary value; WITHOUT '{'/'}' (see gotcha)
  identifier, localizeInfos: { en_US: { title } },
};
```

## Conventions for Upload Scripts

- Scripts are idempotent: repeated runs do not duplicate data (compare current value before PUT).
- Maintain `DRY_RUN=1` (show diff without writing), `ONLY="Name"` (one entity), `HEADLESS=0` (visible browser for login debugging).
- **After writing — always verify**: repeat admin-GET + public SDK + visually on the dev server.
- Parse `.env`, **splitting the string at the first `=`** — App Token contains `=`.
