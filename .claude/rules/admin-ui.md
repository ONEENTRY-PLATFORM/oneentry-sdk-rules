---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.js"
  - "scripts/**/*.ts"
---
# Web UI Admin Panel OneEntry — Navigation and Automation via Playwright

Practical knowledge about the web interface of the OneEntry admin panel (`{PROJECT_URL}` — the same host as the Content API): where everything is located, which selectors are stable, how to drive the UI from Playwright. This knowledge is needed when the task cannot be solved via REST (`/api/admin/*`): auth providers and group permissions are configured **only through the UI** (their admin endpoints return 404), and intercepting real UI requests is the only way to know the format of the undocumented admin API.

> Programmatic data entry — rule `admin-api` and skills `/admin-fill-content`, `/admin-upload-images`, `/admin-grant-permissions`.

---

## Login

- Form URL: `{PROJECT_URL}/authentication/login`.
- Selectors: `#login-username`, `#login-password`, button `button:has-text("Enter")`.
- Credentials — env `OE_ADMIN_LOGIN` / `OE_ADMIN_PASSWORD` (do not hardcode).
- After logging in, a cookie `accessToken` appears (not httpOnly) — it is also used by REST scripts (`Authorization: Bearer`).
- If a session already exists, the SPA redirects past the form — check `page.url()` before filling in the fields.
- The session lasts ~15 minutes; if it expires in the middle of an action — redirect to login, the last action may not have been applied (recheck via REST).
- The version badge at the bottom of the sidebar: `v… | <login>`.

## Navigation (SPA, React Router)

Sidebar items: `<li data-testid="nav-item-/<route>">` with an inner `div#sidebar-link--<route>`.

⚠️ Clicking on `<li>` via `.click()` from `evaluate` **does not route** (the handler hangs on the child element) — use a real Playwright click: `page.locator('[data-testid="nav-item-/settings"]').click()`.

Sections (route → purpose):

| Route | Section |
| --- | --- |
| `/content` | Pages |
| `/catalog` | Catalog |
| `/menu`, `/blocks`, `/orders`, `/payments`, `/forms` | sections with the same name |
| `/administrators` | Admin users (admins; can carry a set of attributes) |
| `/users` | Users / **Authentication providers** / **Groups** (tabs) |
| `/settings` | Settings: Modules, Attributes, Templates, Preview Templates, Content languages, **App tokens** |
| `/subscriptions`, `/events`, `/discounts` | subscriptions, events, discounts; plus Import data |

- Tabs within a section: `<a class="nav-link">Text</a>`.
- Tables: rows `tr.table-item-content`; action buttons in the row — `button[data-testid="action-<edit|delete|download-cert>-<id>"]` with `title="Edit|Delete|Settings"`.
- Editing entities: page — `/content/edit-page/{id}` (tab Attributes — `?tab=3`), admin — `/admins/edit-page/{id}` (`?tab=2`).

## Driving react-select from Playwright

Selects in the admin panel — react-select:

1. Click on the container `#<name>-container` — **real** click from Playwright (not `evaluate`).
2. Options appear as `[id^="react-select"][id*="option"]` — click the desired one by text (can be done via `evaluate`).
3. The list of options can be read with the same selector.

## Intercepting Reference UI Requests

When the format of the admin API is unknown — do not guess, but capture from the live UI: open the required screen, perform the action manually/with Playwright and check the request via `browser_network_requests` / `browser_network_request` (Playwright MCP) or `page.on('request')`. This is how the formats for file uploads (`&template=1`), autosave, and permissions were established.

---

## Auth Providers (Users → Authentication providers)

- URL: `/users/auth-providers`; typical providers: Email (`email`), Google OAuth (`google`).
- Actions in the row: **Settings** (`action-download-cert-<id>` — download certificate/config), **Edit** (`action-edit-<id>`), **Delete**.
- Editing form (`/users/auth-providers/edit-page/{id}`), key fields for Google provider: `title`, marker; `configSecret` (secret for JWT), `configAccessTokenTtlSec`, `configRefreshTokenTtlMc`; `configOAuthClientId`, `configOAuthProjectId`, `configOAuthAuthUrl`, `configOAuthTokenUrl`, `configOAuthOrigins` (Origins header), `configOAuthSecret` (client secret Google); **Default User Group** — the group where new OAuth users are placed.
- ⚠️ The "redirect URL" field is **not present** here: `redirect_uri` OneEntry receives in the body of the `oauth()` request and passes to the provider during code exchange. The whitelist of redirects lives on the provider's side (Google Cloud Console), not in OneEntry.
- The public SDK `getAuthProviders()` returns only part of the config (`oauthAuthUrl`, `userGroupIdentifier`, TTL) — without client_id/secret/token_url. The full config is only visible in the UI.
- Admin-REST for providers not found (all `/api/admin/auth*` → 404) — only UI.

## User Groups and Permissions (Users → Groups)

Group URL: `/users/groups/edit-group/{id}`. Tabs: **Basic data / Permissions / Final permissions / Version History**.

- **Basic data**: Name, Marker, checkbox "Do not use permissions for this group" (completely removes permission checks — a blunt switch, not recommended).
- **Permissions** (`?tab=4`): matrix of permissions by Content API routes.
  - Buttons: Create permission, Copy permissions from another group, Grant all permissions, Revert bulk operation.
  - Filters: text search (searches by URL/description of the route — consider the wording of the description), selector **API Section** (`#user-group-permissions-api-sections-container`), checkbox **Show only unused**.
  - Permission row: description + URL + method badges **G/P/P/D** (GET/POST/PUT/DELETE).
  - ⚠️ Badge: permission changes apply **up to 5 minutes**.
- **Final permissions** — the source of truth: shows only routes actually bound to the group.
- API Sections (selector values): `pages, blocks, products, product-statuses, orders-storage, orders, discounts, payments, user-activity, forms, admins, attributes-sets, form-data, locales, system, templates, general-types, template-previews, files, events, users, users-auth-providers, user-groups, menus, filters, integration-collections, sitemap, subscriptions`.
- Access for guest requests via App Token is regulated by the permissions of the guest group — **not by the token** (see App tokens below). Granting permission is a two-step process (create definition → bind to group), detailed — skill `/admin-grant-permissions`.

Modal "Add permissions" (Create permission): API Section — `#user-permission-section-container`, Path — `#user-permission-route-container`, Name (auto), block of methods GET/POST/PUT/DELETE (the required method is auto-checked as "Required"), checkbox IP Check, Save/Close. Selects — react-select (see above).

## App Tokens (Settings → App tokens)

- URL: `/settings/tokens`. The token from the list is `NEXT_PUBLIC_ONEENTRY_TOKEN` of the frontend.
- Here only name/serial/expiry + Create/Delete. **Route permissions for the token are not configured** — access for anonymous requests is determined by the permissions of the guest group (Users → Groups), not by the token.
