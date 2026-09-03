---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.js"
  - "scripts/**/*.ts"
---
# Internal admin API (`/api/admin/*`) — programmatic writing to OneEntry

Public SDK (`defineOneEntry`) — **read-only**: it reads data via App Token and cannot write entities. For programmatic filling of the project (products, pages, blocks, admins, attribute sets, files), the **internal REST admin API** is used — the same requests that the admin panel itself sends.

⚠️ The API is internal and undocumented (Swagger is closed): formats are taken from real UI requests and verified on a live project. Before using it on a new project — intercept a reference UI request via Playwright (`browser_network_requests`) and compare.

> Skills-recipes: `/admin-fill-content` (filling entities), `/admin-upload-images` (uploading images with previews), `/admin-grant-permissions` (user group rights). UI navigation — rule `admin-ui`.
>
> **A custom script is not always needed.** If the MCP server of the platform is connected in the project (package `@oneentry/mcp-platform-server`, tools `mcp__<server-name>__*`), writing goes through it — it holds the login and session, knows the formats, and writes the audit log. The rule below remains the source of truth about formats and pitfalls of the platform: they are the same for both paths.

---

## Authentication

0. **Quick path — direct request, without a browser:** `POST /api/admin/auth/login` with body `{login, password}` responds with `{userId, accessToken, refreshToken}`. After that — the same `Authorization: Bearer <accessToken>`. Playwright is only needed where the action lives exclusively in the UI (rule `admin-ui`), and as a fallback if the endpoint is closed. This removes the dependency on the browser and its network stack for scripts (Chromium has its own resolver — on a machine without working IPv6, navigation fails with `ERR_CONNECTION_RESET`, while a regular HTTP client with `--dns-result-order=ipv4first` passes).
1. Login via **admin UI form** with Playwright: `{PROJECT_URL}/authentication/login`, fields `#login-username` / `#login-password`, button `button:has-text("Enter")`. Credentials — only from env (`OE_ADMIN_LOGIN` / `OE_ADMIN_PASSWORD`), do not hardcode.
2. After logging in, take the **`accessToken`** cookie (it is NOT httpOnly) and send the header `Authorization: Bearer <token>` in all REST requests.
3. The session lasts **~15 minutes** — long scripts should be able to re-login; a crash in the middle of an action = redirect to `/authentication/login`, recheck the result of the last action.
4. `page.goto` to the login page sometimes flakily fails — a retry is needed (2–3 attempts).
5. ❌ **DO NOT set a global `content-type: application/json`** in request-context — this breaks multipart file uploads. Playwright sets the type per-request (`data:` → json, `multipart:` → form-data).

---

## Save Model — "autosave the whole object"

There is no Save button in the admin panel: the UI automatically saves **the entire object** with each field change. Scripts replicate this:

```text
GET entity → mutate the necessary fields in a copy → PUT the entire object back
```

Never PUT a partial object — it will overwrite other fields.

**Locales are overwritten just like fields.** `attributesSets` is replaced entirely: a body with one locale silently erases the others and responds with `200`. Public reading returns from the cache and will not show the loss — look in `GET /api/admin/pages/{id}`.

```js
// ❌ after this Spanish layer is gone, response 200
{ ...page, attributesSets: { en_US: attrs } }

// ✅ expand existing locales
{ ...page, attributesSets: { ...page.attributesSets, en_US: attrs } }
```

After a series of edits, check with **locale counter**, not visually:

```js
const sets = (await getJson(`/api/admin/pages/${id}`)).attributesSets;
if (Object.keys(sets).length !== expectedLocales) throw new Error('locale lost');
```

## Endpoint Map (base = project URL)

| Entity | Endpoints |
| --- | --- |
| Admin | `GET /api/admin/admins?limit=100&offset=0&langCode={lc}`, `GET/PUT /api/admin/admins/{id}` |
| Product | `GET/PUT /api/admin/products/{id}` |
| Product Search | `GET /api/admin/products/quick/search?name=X&langCode={lc}` → `[{id, title, pageId}]` |
| Page | `POST /api/admin/pages`, `PUT/DELETE /api/admin/pages/{id}` |
| Block | `GET /api/admin/blocks?limit=300&offset=0&langCode={lc}`, `GET /api/admin/blocks/{id}`, `POST /api/admin/blocks`, `PUT /api/admin/blocks/{id}` |
| Attribute Set | `GET/PUT /api/admin/attributes-sets/{id}` (schema — in `.schema.attribute{N}`) |
| Form | `GET /api/admin/forms?limit=100&offset=0&langCode={lc}`, `GET/PUT /api/admin/forms/{id}` — form fields are its **attribute set** (`attributeSetId`, type of set `forForms`), values — keys `{type}_id{N}` in `attributesSets.{lc}`, and bindings to the module are directly in the form object (`formModuleConfigs`) |
| Form Records | `POST /api/admin/form-data/marker/{marker}?formModuleConfigId={id}&isExtended=0&langCode={lc}&offset=0&limit=100` — listing with filter in body (`{}` = all, `{status:['approved']}` etc.); there is no GET listing: `GET /api/admin/form-data` responds with `405`. Status — `PUT /api/admin/form-data/:id/update-status` `{status}`, deletion — `DELETE /api/admin/form-data/{id}` |
| File | `POST /api/admin/files?...` (multipart; see skill `/admin-upload-images`) |
| Group Permissions | `GET /api/admin/user-groups/{id}/permissions?...`, `PUT .../permissions/{permId}/change` (only `{state:'attach'|'detach'}` — binding, not flags), `GET/PUT /api/admin/user-permissions/{id}` — **the flags themselves** (`readAllRule`, `addRule`, `changeRule`, `deleteRule`), `POST/DELETE /api/admin/user-permissions[/{id}]` (see `/admin-grant-permissions`) |
| Orders | `GET /api/admin/orders-storage/{marker}?limit=50&offset=0&langCode={lc}` (or `/{storageId}/orders`) — listing of storage orders: any user order is visible, not just their own. There is no public equivalent — the occupancy of slots for "all clients" cannot be collected from the public SDK |
| Payment Sessions | `GET /api/admin/payments/sessions/order/{orderId}` — order sessions with statuses (`waiting`/`paid`/…) |
| Payment Accounts | `GET /api/admin/payments/accounts?langCode={lc}`, `GET /api/admin/payments/accounts/{id}` — gateway config: `successUrl`/`cancelUrl`, testMode, `stripeAccountId` (diagnosis of "session forever waiting", see rule `orders`) |
| Events | `GET /api/admin/events?limit=100&offset=0&langCode={lc}` — actual event markers (when public `Events.getAllEvents` returns 401) |
| Menu | `GET/PUT /api/admin/menus/{id}`, **`PUT /api/admin/menus/{id}/custom-items/{itemId}`** — editing a custom item (see the gotchas below) |
| Collections | `POST /api/admin/integration-collections`, `PUT /api/admin/integration-collections/{id}` (binding to form — `formId`), `DELETE /api/admin/integration-collections/marker/{marker}/rows/{id}` |
| Settings | `GET /api/admin/settings-general` → `system.common.maxUploadFileSize` — project file size limit (to be learned before the first bulk upload) |
| Journal | `GET /api/admin/journal` — who changed what; check before a series of records to avoid overlapping with someone else's run |
| Permissions Cache | `POST /api/admin/user-permissions/cache/flush` — after any rights change, otherwise changes are not picked up |

In addition to writing, the admin API is a reliable channel for **read-only diagnostics**, when public methods are unavailable or mask an error: other people's orders and their payment sessions, payment account config, event markers.

POST page (creation): `{parentId, attributeSetId, pageUrl, isVisible, generalTypeId: 17, localizeInfos: {en_US: {title, htmlContent: '', plainContent: '', menuTitle}}, attributesSets: {en_US: {}}}`.

POST content block: `{generalTypeId: 18, attributeSetId, identifier, isVisible: true, position, localizeInfos: {en_US: {title}}, attributesSets: {en_US: {}}, productPageUrls: [], templateId: null, customSettings: null}`.

⚠️ In auth providers and user groups, admin-REST **is partially absent** (`/api/admin/auth*` → 404) — providers are configured only through the UI (rule `admin-ui`).

---

## Internal field IDs — positional, read from GET

Attribute values in the admin API are located in `attributesSets.{locale}` (NOT in `attributeValues` — this is the read format of the public SDK). Keys are **positional internal IDs**: `{type}_id{N}`, where `N` is the position of the attribute in the set: `string_id1`, `image_id2`, `integer_id3`, `text_id6`, `entity_id7`, `timeInterval_id9`, `float_id7`…

- ❌ Do not guess the correspondence "marker → internal id".
- ✅ Read from the GET object of the entity or from the schema of the set (`GET /api/admin/attributes-sets/{id}` → `.schema.attribute{N}.identifier` = marker, `N` = tail of the internal id).
- An attribute in the schema of the set is an object `schema.attribute{N} = {id, type, isPrice, original, position, isVisible, identifier, localizeInfos: {{lc}: {title}}, initialValue?}`. When creating attributes via script, **include `position: N`** (as with those created through the UI) — without it, the value widget in the admin panel may not render/map values. `initialValue.{lc}.value` — the default value of the attribute (see the section "Dictionary of UI texts").

## Value formats when writing (differ from read format of SDK!)

| Type | Write-format |
| --- | --- |
| `string` | primitive string |
| `integer` | string (`"5"`) |
| `text` | `[{htmlValue: '<p>…</p>', mdValue: '', plainValue: '', params: {editorMode: 'html', isImageCompressed: true}}]` |
| `entity` → page | `[{title, value: {id: <numeric page id>, depth, isPinned: false, parentId, position, selected: true}}]` |
| `entity` → product | the same, but `value.id` — **string** `"p-{pageId}-{productId}"`, `parentId = pageId`, `depth: 3` (composed from quick-search: `id` = productId, `pageId`) |
| `list` | `[{title, value: "<id>", extended: {type: null, value: null}, position}]` |
| `timeInterval` | array of groups (one for each day of the week): `{intervalId, values: [{id, intervalId, dates: [iso, iso], intervals: [], times: [[{hours,minutes},{hours,minutes}], …], inEveryWeek: true, inEveryMonth: true, exceptions: []}]}`; UUID — `crypto.randomUUID()` |
| `image` / `groupOfImages` | file object from upload response + `params: {isImageCompressed: true}` (see `/admin-upload-images`) |

Rules common to all types:

- **`list` — a list of objects, not strings.** `["rfq"]` is accepted by the platform, and admin-GET shows the value correctly — but on the storefront, it arrives as a character map `[{"0":"r","1":"f","2":"q"}]`. Always `[{title, value}]`.
- **Do not set a key for an empty value at all**, instead of writing `''`/`null`.
- **A single file is written as a list** (`[{...uploaded[0], params}]`), otherwise public reading will return empty. The read format is different (SDK unwraps a single file into an object) — see `.claude/rules/attribute-values.md`.
- **`validators`, `listTitles`, `additionalFields` are under locale**: `validators` — as an object, the other two — as arrays.
- **System names of validators should be taken from the types package** (`node_modules/oneentry/dist/attribute-sets/attributeSetsInterfaces.d.ts`), do not invent by meaning: an unknown name is accepted silently, there will be no validation, and the field will show `undefined` in the panel.

## Publishing to the storefront — by difference, not by state

The storefront receives a value only if the platform sees a **change**. Hence, three consequences, each of which looks like "writing does not work," although the response was `200` and admin-GET shows the new value.

- **A pair of records `'' → value` collapses.** Publishing goes tick by tick and carries one difference per tick: if in one tick both a nudged and a real value are written, the nudged one will be published. A classic symptom — on the storefront `<p>&nbsp;</p>`, in the admin panel the full text.
- **A repeated run erases the published one.** A script that starts by clearing a field will remove the already published value from the storefront on the second run — and responds with `200`.
- **Confirmation can be false.** Checking immediately after writing says "values are in place," a minute later the same fields are empty: the first record of the pair has arrived.

The order that works:

1. write **the real value immediately** — the usual case passes the first time because the stored value differs from the published one;
2. read the public API in a loop until a match (pause ~5 seconds, up to ten attempts), comparing **words, not markup**: the platform normalizes HTML, and the fingerprint of the markup will never match — the loop will not end;
3. if there is no match — then there is no difference for publication: now nudged, with a value **carrying the round number and record** (a fixed nudged on a page already delivering this nudged — again not a difference, resulting in a deadlock), wait for the nudged on the storefront, then write the real value;
4. close the step **with two reads** — immediately and after a minute or two;
5. check **each locale**: they are published independently.

Idempotence is checked by public reading: a run that does not corrupt the database but erases the value from the storefront is not idempotent.

## The schema of the attribute set is written entirely

`PUT /api/admin/attributes-sets/{id}` (and `…/schema`) accepts **the entire schema**. An error in the body erases the set, along with the values of all pages and blocks referencing it.

1. `GET /api/admin/attributes-sets/{id}` → save a snapshot of the schema in a file next to the script;
2. edit only the necessary attribute in the snapshot;
3. `PUT` with the entire schema;
4. read back and compare **attribute by attribute** (by comparing serialized values), with the changed one — the new value in all locales.

While the script is running, **do not open this same set in the panel**: the panel also writes the schema entirely and will silently roll back the edit (and vice versa).

**Re-read the number of the new attribute before each run.** The key of the value depends on the number (`{type}_id{N}`), the platform does not assign the number — the script does. While work is ongoing, a neighboring session may take the same number; the check "number occupied" must be there, and the list of free numbers is taken from fresh GET, not from memory.

**Simultaneous writing = lost data.** A second agent, client application, someone else's run — all send `PUT` with the entire object, the last one wins, and both receive `200`; thus an entire locale disappears. Before a series of writes, check `GET /api/admin/journal`. **During someone else's run, do not delete anything**: code edits can be rolled back, deleted values cannot.

## Gotchas

- **`product.price` — a derived field.** The top-level price is recalculated from an attribute with the flag `isPrice: true` **asynchronously**: `GET` immediately after `PUT` returns the old value (`0`/`null`), although the write has passed. In scripts, write both places (`product.price` = number and `attributesSets.{lc}.{float_idN}` = string), and verify with the public SDK or a repeated GET after a pause (~minute).
- **The public API lags by ~30 seconds.** After PUT of a block/page, `getBlockByMarker` and other public methods may return old values — this is cache/distribution of OneEntry. Admin-GET shows everything immediately — check the completeness of the write with it.
- **Options of the entity attribute picker ≠ value.** "List options" of the picker — a curated list in `schema.attribute{N}.listTitles.{locale}` of the set; the value of the attribute can be written bypassing the picker (direct PUT of the real id) — it will be saved and rendered on the front. But the admin widget will show the selected chip only if the id is in `listTitles`; it is fixed by rebuilding `listTitles` according to the catalog tree and PUT of the set (before writing — backup the original).
- **Selecting the attribute set of an "empty" entity** (`attributeSetId: null → id`) passes **in one PUT** along with the values — a separate step is not needed.
- **A value under a non-existent key is accepted silently.** Keys are positional, and a helper returning `{setId, keys}` provokes a call `keys.body` → `undefined` → the value goes under the literal key `"undefined"`. The response is `200`, admin-GET shows the value, the panel looks normal, the storefront returns nothing, the build fails without a clear reason. The key should be taken through the real form of the helper (`keys.get('body')`); when diagnosing "the page does not return values" — grep the saved `attributesSets` for the key `"undefined"` and delete it with the next write, otherwise, it will go further.
- **The page does not inherit the attribute set from the parent.** A section may have `attributeSetId: null`, and the page created under it has nowhere to store values. The creation script specifies the set explicitly, by identifier.
- **The public list of pages returns hidden ones.** `isVisible: false` comes as a field, nothing is filtered — the build and sitemap must filter, otherwise the service container goes live as a public page.
- **Idempotence cannot be built on `sku`.** Writing a product `sku` accepts and **does not save** — the second run finds nothing and duplicates all records. Use your marker as a regular attribute (`record_marker`) + read back. Nearby: `productPages` expects `[{ pageId }]`, bare ids → `500`.
- **Custom menu items are written one by one.** `PUT /api/admin/menus/{id}` with rewritten `customItems` responds successfully and applies **part** (but with `pagesIds` in the body, it flattens the tree, raising nested items to the root). The working path is `PUT /api/admin/menus/{id}/custom-items/{itemId}`, one item per call; children hang on `parentId` and survive the parent's edit. After — read the menu and **recount children**.
- The endpoint **for deleting a file is not found** — re-uploaded files remain orphans on the CDN.
- **⚠️ Curly braces `{`/`}` in the VALUE of an attribute drop public reading.** OneEntry casts values to JSON (PostgreSQL), and a value with `{…}` (placeholder `{n}`, JSON-like text) → the public API returns **`500 invalid input syntax for type json`** when reading the ENTIRE block/set; SDK method returns an error object, `attributeValues` is empty. Admin-GET and raw REST (Postman) return data (there is no cast there) — hence in the admin panel "it looks normal," while the site is empty. Placeholders for interpolation should be made **without braces**, e.g. `%token%` (`Step %x% of %y%`), in code `.replace('%x%', …)`. Attribute labels (`localizeInfos.title`) can tolerate braces — only values break.
- **Diagnosis "public reading is empty/broken."** SDK methods (`getBlockByMarker` etc.) wrap the raw endpoint in validation/normalization and in case of server error **return an error object** (`{statusCode, message, …}`), not throw — then `res.attributeValues` is empty. Before blaming "limit by number," **dump the entire SDK response** (`JSON.stringify(res)`, check `res.statusCode`/`res.message`) and compare with raw `fetch(base + '/api/content/...', {headers:{'x-app-token': token}})`. Often the reason is one broken value (see braces above), not volume.

## Dictionary of UI texts: values in `initialValue` of the set (not in the block)

For the dictionary of UI texts (many lines, edited by the content manager, read publicly) there are **two incompatible storage places** — choose ONE, and the site must read from the same place where the admin edits. The standard option is a set **of type `system`** (it is not tied to any record) with values in `initialValue`:

- **BLOCK values** — `block.attributesSets.{lc}.string_id{N}`, read publicly `Blocks.getBlockByMarker(marker)`. But there is no convenient per-attribute editor for block values for common_block in the UI — edits are only via script.
- **`initialValue` of attributes of the SET** — `set.schema.attribute{N}.initialValue.{lc}.value`. This field is edited in the admin panel **Settings → Attributes → <set>** (attribute value) and read publicly `AttributesSets.getAttributesByMarker(setMarker, langCode)` → array `[{marker, initialValue, position, type, localizeInfos, …}]` (`initialValue` is already delocalized under langCode).

> Forms in which `initialValue` comes in different ways of reading (flat / language-keyed), and the pattern for scaling dictionaries — `.claude/rules/attribute-sets.md`, section "`initialValue`".

**Key point:** public reading of a block (`getBlockByMarker`) **does NOT** substitute `initialValue` of the set when the block value is empty (will return `""`) — the values of the block and `initialValue` of the set are independent. If a dictionary is needed, **editable from the UI**: store values in `initialValue` of the set and read them with `getAttributesByMarker`, mapping `marker → initialValue`. Then an edit in the set editor is immediately visible on the site.

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
// upload script: value in initialValue when assembling the schema of the set (PUT /api/admin/attributes-sets/{id})
schema[`attribute${id}`] = {
  id, type: 'string', isPrice: false, original: true, position: id, isVisible: true,
  initialValue: { en_US: { value } }, // ← dictionary value; WITHOUT '{'/'}' (see gotchas)
  identifier, localizeInfos: { en_US: { title } },
};
```

## Upload Script Conventions

- Scripts are idempotent: repeated runs do not duplicate data (compare the current value before PUT) and **do not erase published** (see the section on publishing).
- ❌ `.catch(() => null)` in the upload script is prohibited: swallowed errors are not resilience, but silent data corruption.
- **What we transfer — calculate before the first write**, not inside the write function. A sign of a bug: `move()`/`build()` inside `write()` — the first call moves and writes, the second recalculates from the already moved state, finds nothing, and deletes records (response `200`). Check with an invariant: there were ten — became four plus six.
- **Before editing file attributes, take a snapshot of the value in a file.** The file in storage remains, but it cannot be found by UUID — it will have to be restored by re-uploading the original.
- Maintain `DRY_RUN=1` (show diff without writing), `ONLY="Name"` (one entity), `HEADLESS=0` (visible browser for login debugging).
- **After writing — always verify**: repeated admin-GET + public SDK + visually on the dev server.
- Parse `.env`, **splitting the string at the first `=`** — App Token contains `=`.
