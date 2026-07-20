# Internal admin API (`/api/admin/*`) — programmatic entry into OneEntry

Public SDK (`defineOneEntry`) — **read-only**: it reads data via App Token and cannot write entities. For programmatic filling of the project (products, pages, blocks, admins, attribute sets, files), the **internal REST admin API** is used — the same requests that the admin panel sends.

⚠️ The API is internal and undocumented (Swagger is closed): formats are taken from real UI requests and verified on a live project. Before using it on a new project — intercept a reference UI request via Playwright (`browser_network_requests`) and compare.

> Skills-recipes: `/admin-fill-content` (filling entities), `/admin-upload-images` (uploading images with previews), `/admin-grant-permissions` (user group rights). UI navigation — rule `admin-ui`.

---

## Authentication

1. Login via **admin UI form** with Playwright: `{PROJECT_URL}/authentication/login`, fields `#login-username` / `#login-password`, button `button:has-text("Enter")`. Credentials — only from env (`OE_ADMIN_LOGIN` / `OE_ADMIN_PASSWORD`), do not hardcode.
2. After logging in, take the cookie **`accessToken`** (it is NOT httpOnly) and send the `Authorization: Bearer <token>` header in all REST requests.
3. The session lasts **~15 minutes** — long scripts should be able to re-login; a crash in the middle of an action = redirect to `/authentication/login`, recheck the result of the last action.
4. `page.goto` to the login page sometimes fails — a retry is needed (2–3 attempts).
5. ❌ **DO NOT set a global `content-type: application/json`** in request-context — this breaks multipart file uploads. Playwright sets the type per request (`data:` → json, `multipart:` → form-data).

---

## Save Model — "autosave the entire object"

There is no Save button in the admin panel: the UI autosaves **the entire object** on every field change. Scripts replicate this:

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
| Group Rights | `GET /api/admin/user-groups/{id}/permissions?...`, `PUT .../permissions/{permId}/change`, `POST/DELETE /api/admin/user-permissions[/{id}]` (see `/admin-grant-permissions`) |

POST page (creation): `{parentId, attributeSetId, pageUrl, isVisible, generalTypeId: 17, localizeInfos: {en_US: {title, htmlContent: '', plainContent: '', menuTitle}}, attributesSets: {en_US: {}}}`.

POST content block: `{generalTypeId: 18, attributeSetId, identifier, isVisible: true, position, localizeInfos: {en_US: {title}}, attributesSets: {en_US: {}}, productPageUrls: [], templateId: null, customSettings: null}`.

⚠️ The auth providers and user groups admin-REST **are partially absent** (`/api/admin/auth*` → 404) — providers are configured only through the UI (rule `admin-ui`).

---

## Internal field IDs — positional, read from GET

Attribute values in the admin API are located in `attributesSets.{locale}` (NOT in `attributeValues` — this is the read format of the public SDK). Keys are **positional internal IDs**: `{type}_id{N}`, where `N` is the position of the attribute in the set: `string_id1`, `image_id2`, `integer_id3`, `text_id6`, `entity_id7`, `timeInterval_id9`, `float_id7`…

- ❌ Do not guess the correspondence "marker → internal ID".
- ✅ Read from the GET object of the entity or from the schema of the set (`GET /api/admin/attributes-sets/{id}` → `.schema.attribute{N}.identifier` = marker, `N` = tail of the internal ID).

## Value Formats for Writing (different from the read format of the SDK!)

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

## Gotchas

- **`product.price` — derived field.** The top-level price is recalculated from an attribute with the flag `isPrice: true` **asynchronously**: `GET` immediately after `PUT` returns the old value (`0`/`null`), even though the write was successful. In scripts, write both places (`product.price` = number and `attributesSets.{lc}.{float_idN}` = string), and verify with the public SDK or a repeated GET after a pause (~a minute).
- **The public API lags by ~30 seconds.** After PUT of a block/page, `getBlockByMarker` and other public methods may return old values — this is cache/distribution of OneEntry. Admin-GET shows everything immediately — check the completeness of the write with it.
- **Picker options for entity attributes ≠ value.** "List options" of the picker are a curated list in `schema.attribute{N}.listTitles.{locale}` of the set; the attribute value can be written bypassing the picker (direct PUT of the real ID) — it will be saved and rendered on the front end. But the admin widget will only show the selected chip if the ID is in `listTitles`; this can be fixed by rebuilding `listTitles` from the catalog tree and PUTting the set (before writing — backup the original).
- **Choosing an attribute set for an "empty" entity** (`attributeSetId: null → id`) passes **in one PUT** along with the values — a separate step is not needed.
- The endpoint **for deleting files not found** — re-uploaded files remain orphans on the CDN.

## Upload Script Conventions

- Scripts are idempotent: repeated runs do not duplicate data (compare the current value before PUT).
- Support `DRY_RUN=1` (show diff without writing), `ONLY="Name"` (one entity), `HEADLESS=0` (visible browser for debugging login).
- **After writing — always verify**: repeat admin-GET + public SDK + visually on the dev server.
- Parse `.env`, **splitting the string at the first `=`** — App Token contains `=`.
