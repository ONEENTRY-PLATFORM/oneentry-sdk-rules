---
name: admin-fill-content
description: Programmatically fill OneEntry content (products, pages, blocks, admins) via the internal admin API — Playwright login, GET→mutate→PUT autosave replay, verification
---

# Programmatic Filling of OneEntry via Internal Admin API

Use this skill when you need to **massively create or fill** OneEntry entities (products, pages, blocks, admins, attribute sets) with a script, rather than manually in the admin panel. The public SDK for writing is not suitable (read-only) — the script replicates the autosave requests of the admin panel itself.

> Be sure to read the rule `admin-api` (endpoints, positional ids, write formats, gotchas). Images are a separate skill `/admin-upload-images`. Group permissions — `/admin-grant-permissions`.

Requirements: `@playwright/test` in devDependencies (`npx playwright install chromium`), env `OE_ADMIN_LOGIN` / `OE_ADMIN_PASSWORD`, project URL in `.env` (`NEXT_PUBLIC_ONEENTRY_URL`).

---

## Step 1 — Common Module: Login + Bearer Context

Create `scripts/admin/common.mjs` (or `.claude/temp/admin-common.mjs` for a one-time task) — all fill scripts import it:

```js
import { chromium, request as pwRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** .env, splitting the string by the FIRST '=' — App Token contains '='. */
export const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

export const BASE = (env.NEXT_PUBLIC_ONEENTRY_URL || '').replace(/\/$/, '');
const ADMIN_LOGIN = process.env.OE_ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.OE_ADMIN_PASSWORD;

/** Login via admin UI → authorized API context (Bearer). */
export async function login({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  // goto login page fails — retry
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${BASE}/authentication/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
  // with an active session, SPA redirects past the form
  if (page.url().includes('/authentication/login')) {
    await page.locator('#login-username').fill(ADMIN_LOGIN);
    await page.locator('#login-password').fill(ADMIN_PASSWORD);
    await page.locator('button:has-text("Enter")').click();
    await page.waitForURL((u) => !u.pathname.includes('/authentication/login'), { timeout: 30000 });
  }
  const token = (await context.cookies()).find((c) => c.name === 'accessToken')?.value;
  if (!token) throw new Error('Login failed — no accessToken cookie');
  // ONLY authorization: global content-type would break multipart file upload
  const api = await pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  });
  return { api, token, close: async () => { await api.dispose(); await browser.close(); } };
}
```

The session lasts ~15 minutes — in long scripts, re-login (recreate context) on a timer or on the first 401.

## Step 2 — Discover Internal Field IDs (Do Not Guess)

Values are located in `attributesSets.{locale}` under **positional** keys `{type}_id{N}`. Take the correspondence "marker → key" from the set schema:

```js
const set = await (await api.get(`/api/admin/attributes-sets/${setId}`)).json();
// set.schema.attribute{N}.identifier === '<marker>'  →  value key = `${type}_id${N}`
const byMarker = Object.fromEntries(
  Object.entries(set.schema).map(([k, a]) => [a.identifier, `${a.type}_${k.replace('attribute', 'id')}`]),
);
```

## Step 3 — GET → Mutate → PUT (Whole Object)

```js
const { api, close } = await login();
const product = await (await api.get(`/api/admin/products/${id}`)).json();
product.attributesSets.en_US.string_id1 = 'New Value';          // string — primitive
product.attributesSets.en_US.text_id6 = [{                            // text — Jodit object
  htmlValue: '<p>Description…</p>', mdValue: '', plainValue: '',
  params: { editorMode: 'html', isImageCompressed: true },
}];
const res = await api.put(`/api/admin/products/${id}`, { data: product });
if (!res.ok()) console.error(await res.text());
await close();
```

Similarly, `admins/{id}`, `pages/{id}`, `blocks/{id}`, `attributes-sets/{id}` are updated. Full write formats for all types (`entity`, `list`, `timeInterval`, …) are in the `admin-api` rule. Key points:

- entity → page: `[{title, value: {id, depth, isPinned: false, parentId, position, selected: true}}]`;
- entity → product: `value.id` = string `"p-{pageId}-{productId}"`, `parentId = pageId`, `depth: 3`; find the product via `GET /api/admin/products/quick/search?name=X&langCode=en_US`;
- selecting an attribute set for an "empty" entity (`attributeSetId: null → id`) is done with one PUT along with the values.

Creation: `POST /api/admin/pages` / `POST /api/admin/blocks` (bodies — in the `admin-api` rule), then PUT with values. Deleting a page — `DELETE /api/admin/pages/{id}`.

## Step 4 — Script Conventions

- **Idempotence**: before PUT, compare the current value — a repeated run should not duplicate/overwrite.
- Flags: `DRY_RUN=1` (show plan without writing), `ONLY="Name"` (one entity), `HEADLESS=0` (visible browser for login debugging).
- Keep the dataset (what you are uploading) in the common module — one source of truth for all task scripts.

## Step 5 — Verification (Mandatory)

1. **Admin-GET immediately after PUT** — check that the value has been recorded (admin API shows fresh data immediately).
2. **Public SDK after ~30 seconds** — the public API lags behind (cache/distribution); immediately after writing, it may return old data.
3. ⚠️ **`product.price` — derived**: recalculated from `isPrice` attribute asynchronously; GET immediately after PUT will return `0`/`null`, even though everything has been recorded. Write both fields (top `price` as a number + attribute as a string), check with a pause.
4. Visual check on the dev server of the frontend.

## If the Format is Unknown — Capture a Reference from the UI

Do not invent the field format: fill one entity manually in the admin panel, capture it with admin-GET and use it as a reference; or intercept the PUT from the panel itself (Playwright `browser_network_requests`). Navigation through the UI — rule `admin-ui`.
