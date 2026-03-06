<!-- META
type: skill
skillConfig: {"name":"inspect-api"}
-->

---
name: inspect-api
description: Read .env.local and execute curl requests to OneEntry API to get real markers, attributes, and data structures before writing code
argument-hint: "pages|menus|forms|products|product-statuses|auth-providers|all"
allowed-tools: Read, Bash
---

# Inspect API

Read `.env.local` to find `NEXT_PUBLIC_ONEENTRY_URL` and `NEXT_PUBLIC_ONEENTRY_TOKEN`. If the file is not found — try `.env`.

Then execute curl requests depending on the `$ARGUMENTS` argument.
If no argument is specified or `all` — execute all requests below.

## Requests

**pages** — page markers for `getPageByUrl()`:
```bash
curl -s "https://YOUR_URL/api/content/pages?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Look at the `pageUrl` field of each page.

**menus** — menu markers for `getMenusByMarker()`:
```bash
curl -s "https://YOUR_URL/api/content/menus?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Look at the `identifier` field.

**forms** — form markers for `getFormByMarker()`:
```bash
curl -s "https://YOUR_URL/api/content/forms?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Look at the `identifier` field.

**products** — product structure, `statusIdentifier`, attributes:
```bash
curl -s -X POST \
  "https://YOUR_URL/api/content/products/all?langCode=en_US&limit=1" \
  -H "x-app-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[]" | python -m json.tool
```
Look at `items[0].statusIdentifier` and `items[0].attributeValues` (all attribute markers and types).

**product-statuses** — status markers for filtering by `statusMarker`:
```bash
curl -s "https://YOUR_URL/api/content/product-statuses?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Look at the `identifier` field.

**auth-providers** — provider markers for `AuthProvider.auth()`:
```bash
curl -s "https://YOUR_URL/api/auth-providers" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Look at the `identifier` field.

## Output

After executing the requests, output a structured report:

```md
## inspect-api Results

### Pages (markers for getPageByUrl)
- "home" — Home
- "about" — About Us
...

### Menus (markers for getMenusByMarker)
- "main_web" — Main Menu
...

### Forms (markers for getFormByMarker)
- "reg" — Registration
- "login" — Login
...

### Products (first product attribute example)
statusIdentifier: "in_stock"
attributeValues:
  - title (string)
  - price (float)
  - image (image) ← value is an ARRAY, use value[0].downloadLink
...

### Product Statuses (markers for statusMarker)
- "in_stock"
- "out_of_stock"
...

### Auth Providers (markers for AuthProvider.auth)
- "email"
...
```

If `python` is unavailable — use `python3 -m json.tool` or just output raw JSON.
