---
name: inspect-api
description: Inspect OneEntry API to get markers and data
---
---
name: inspect-api
description: Get the project URL and token, then make requests to OneEntry via SDK to retrieve real markers, attributes, and data structures before writing code
argument-hint: "pages|menus|forms|products|product-statuses|auth-providers|all"
allowed-tools: Read, Write, Bash
---

# Inspect api

> **IMPORTANT: All requests are made ONLY through the SDK, and NOT via curl.**
>
> The SDK normalizes data before returning it to the application:
> - `additionalFields` — from an array to `Record<marker, field>` (key = marker of the field)
> - `attributeValues` — normalized by locale
> - Other transformations in `_normalizeAttr()`
>
> curl returns raw data that **does NOT match** what the SDK sends to the application.
> Code written based on raw API data will contain errors.

## Step 1: Get the project URL and token

Search in the following order of priority:

### 1. MCP tool `get-project-config` (highest priority)

Call the MCP tool **`get-project-config`** — it will return the URL and token if the user has added them in `.mcp.json`:

```json
{
  "mcpServers": {
    "oneentry": {
      "command": "...",
      "env": {
        "ONEENTRY_URL": "https://my-project.oneentry.cloud",
        "ONEENTRY_TOKEN": "my-app-token"
      }
    }
  }
}
```

If `source` is `".mcp.json"` and both fields are not empty — use them.

### 2. `.env.local` / `.env`

If the tool returned empty values — read `.env.local`. If not found — try `.env`.
Look for `NEXT_PUBLIC_ONEENTRY_URL` and `NEXT_PUBLIC_ONEENTRY_TOKEN`.

### 3. Ask the user

If the data is not found in any of the sources — ask:

> Project URL and App Token not found. Please provide:
> - Project URL (e.g., `https://my-project.oneentry.cloud`)
> - App Token (Settings → App Token in OneEntry Admin Panel)

## Step 2: Create a temporary inspection script

Create a file `.claude/temp/inspect-api.mjs`, substituting the real URL and TOKEN.
The folder `.claude/temp/` is the standard place for temporary files (see project rules).

```js
// .claude/temp/inspect-api.mjs
import { defineOneEntry } from 'oneentry';

const URL   = 'https://YOUR_PROJECT.oneentry.cloud'; // ← substitute
const TOKEN = 'YOUR_TOKEN';                          // ← substitute
const LANG  = 'en_US';
const ARGS  = process.argv[2] || 'all';

const api = defineOneEntry(URL, { token: TOKEN });
const sep = (title) => console.log(`\n${'='.repeat(50)}\n${title}\n${'='.repeat(50)}`);

async function inspect() {

  // ── PAGES ──────────────────────────────────────────
  if (ARGS === 'all' || ARGS === 'pages') {
    sep('PAGES (pageUrl for getPageByUrl)');
    const pages = await api.Pages.getRootPages(LANG);
    if (Array.isArray(pages)) {
      pages.forEach(p =>
        console.log(`  "${p.pageUrl}" — ${p.localizeInfos?.[LANG]?.title ?? p.localizeInfos?.title ?? ''}`)
      );
    } else {
      console.log('  Error:', pages?.message);
    }
  }

  // ── MENUS ──────────────────────────────────────────
  if (ARGS === 'all' || ARGS === 'menus') {
    sep('MENUS (identifier for getMenusByMarker)');
    const menus = await api.Menus.getMenus(LANG);
    if (Array.isArray(menus)) {
      menus.forEach(m =>
        console.log(`  "${m.identifier}" — ${m.localizeInfos?.[LANG]?.title ?? ''}`)
      );
    } else {
      console.log('  Error:', menus?.message);
    }
  }

  // ── FORMS ──────────────────────────────────────────
  if (ARGS === 'all' || ARGS === 'forms') {
    sep('FORMS (identifier for getFormByMarker)');
    const forms = await api.Forms.getAllForms(LANG);
    if (Array.isArray(forms)) {
      forms.forEach(f => {
        console.log(`\n  "${f.identifier}" — ${f.localizeInfos?.[LANG]?.title ?? ''}`);
        if (Array.isArray(f.attributes)) {
          f.attributes.forEach(a => {
            console.log(`    attr: marker="${a.marker}" type="${a.type}" isLogin=${a.isLogin} isSignUp=${a.isSignUp}`);
            // additionalFields already normalized by SDK: Record<marker, field>
            if (a.additionalFields && Object.keys(a.additionalFields).length > 0) {
              console.log(`      additionalFields:`, JSON.stringify(a.additionalFields));
            }
          });
        }
      });
    } else {
      console.log('  Error:', forms?.message);
    }
  }

  // ── PRODUCTS ───────────────────────────────────────
  if (ARGS === 'all' || ARGS === 'products') {
    sep('PRODUCTS (attributes of the first product, normalized by SDK)');
    const result = await api.Products.getProducts([], LANG, { limit: 1, offset: 0, sortOrder: 'ASC', sortKey: 'position' });
    if (result?.items?.length > 0) {
      const p = result.items[0];
      console.log(`  id: ${p.id}`);
      console.log(`  title: ${p.localizeInfos?.[LANG]?.title ?? p.localizeInfos?.title ?? ''}`);
      console.log(`  statusIdentifier: "${p.statusIdentifier}"`);
      console.log(`  price: ${p.price}`);
      const attrs = p.attributeValues?.[LANG] ?? p.attributeValues ?? {};
      console.log('  attributeValues:');
      Object.entries(attrs).forEach(([marker, attr]) => {
        const a = attr;
        console.log(`    "${marker}" type="${a.type}" value=${JSON.stringify(a.value)?.slice(0, 80)}`);
        if (a.additionalFields && Object.keys(a.additionalFields).length > 0) {
          console.log(`      additionalFields:`, JSON.stringify(a.additionalFields));
        }
      });
    } else {
      console.log('  No products or error:', result?.message);
    }
  }

  // ── PRODUCT STATUSES ───────────────────────────────
  if (ARGS === 'all' || ARGS === 'product-statuses') {
    sep('PRODUCT STATUSES (identifier for statusMarker)');
    const statuses = await api.ProductStatuses.getProductStatuses(LANG);
    if (Array.isArray(statuses)) {
      statuses.forEach(s =>
        console.log(`  "${s.identifier}" — ${s.localizeInfos?.[LANG]?.title ?? ''}`)
      );
    } else {
      console.log('  Error:', statuses?.message);
    }
  }

  // ── AUTH PROVIDERS ─────────────────────────────────
  if (ARGS === 'all' || ARGS === 'auth-providers') {
    sep('AUTH PROVIDERS (identifier for AuthProvider.auth)');
    const providers = await api.AuthProvider.getAuthProviders(LANG);
    if (Array.isArray(providers)) {
      providers.forEach(p =>
        console.log(`  "${p.identifier}" type="${p.type}" formIdentifier="${p.formIdentifier}"`)
      );
    } else {
      console.log('  Error:', providers?.message);
    }
  }
}

inspect().catch(console.error);
```

## Step 3: Run the script

```bash
node .claude/temp/inspect-api.mjs
# or with an argument:
node .claude/temp/inspect-api.mjs products
```

## Step 4: Delete the temporary file

```bash
rm .claude/temp/inspect-api.mjs
```

## Output

After running the script, output a structured report:

```md
## Results of inspect-api

### Pages (markers for getPageByUrl)
- "home" — Home
- "about" — About Us
...

### Menus (markers for getMenusByMarker)
- "main_web" — Main Menu
...

### Forms (markers for getFormByMarker)
- "reg" — Registration
  - name_reg (string) isLogin=false isSignUp=true
  - email_reg (string) isLogin=true isSignUp=false
  - additionalFields: { placeholder: { value: "Your name" } }  ← Record, NOT an array
...

### Products (example attributes of the first product — already normalized by SDK)
statusIdentifier: "in_stock"
attributeValues:
  - "pic" type="image" — value: array of objects with downloadLink
  - "price" type="integer" — value: 45
  - "color" type="list" — value: [{ title, value, extended }]
  - "additionalFields" of attributes — Record<marker, field> (already normalized)
...

### Product Statuses (markers for statusMarker)
- "in_stock" — In Stock
- "out_of_stock" — Out of Stock
...

### Auth Providers (markers for AuthProvider.auth)
- "email" type="email" formIdentifier="reg"
...
```
