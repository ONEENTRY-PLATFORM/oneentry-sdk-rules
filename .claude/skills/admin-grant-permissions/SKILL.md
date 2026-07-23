---
name: admin-grant-permissions
description: "Grant a Content-API route to a OneEntry user group — fixes 403 'Permission data not found. Provide the permission for requested url'; two-step create+attach, REST verification"
---

# Granting permissions to a user group (fix for 403 "Permission data not found")

Use this skill when the public Content-API returns **`403 { message: "Permission data not found. Provide the permission for requested url" }`** — for example, `AuthProvider.oauth()` fails like this after Google login. The error means: there is **no entry for this URL** in the user group's permissions — the route has not been granted to the group.

> **Did you come here from Google OAuth?** This skill only fixes the route permission. The rest of the flow configuration (matching `redirect_uri`, the "URL for OAuth Origin issuer" field, `deviceMetadata`, provider token for refresh/logout) is in `/create-google-oauth`, where the error ladder separates this 403 from `redirect_uri_mismatch`. Typical OAuth flow routes, each with its own permission: `…/marker/{marker}/oauth`, `…/marker/{marker}/users/refresh`, logout.

The key model: access for anonymous/guest requests is regulated by **group permissions** (usually "Guest" — the one specified as Default User Group in the auth provider), and **not by the App Token**. Permissions are configured only through the admin UI (admin-REST for creating permissions exists, but the section is overall UI-centric) — navigation and selectors in the rule `admin-ui`.

---

## Step 0 — diagnosis: is it really a permission issue?

Probe: call the problematic method with a public token and deliberately fake data (for `oauth()` — a fake `code`). The error ladder shows the stage:

| Response | Means |
| --- | --- |
| `403 Permission data not found…` | permission not granted to the group (follow the steps below); comes with any parameters — this is a pre-check BEFORE processing the request |
| `400 Invalid x-device-metadata format` | permission already works, faulty fingerprint of the probe (the real format is returned by SDK `getDeviceMetadata()`) |
| `400` domain error of the method (for oauth — "We couldn't pass the oauth authentication with provided data…") | OneEntry chain completed; with real data, there will be success |

## Step 1 — create a permission definition (Add permissions modal)

UI: `/users/groups/edit-group/{groupId}` → tab **Permissions** (`?tab=4`) → **Create permission**.

1. **API Section** (`#user-permission-section-container`) — route section (e.g., `users-auth-providers`). Select — react-select: a real click on the container, then click on the option `[id^="react-select"][id*="option"]`.
2. **Path** (`#user-permission-route-container`) — route (e.g., "User registration (authorization) via OAuth", `…/marker/{marker}/oauth`). ⚠️ Text search looks for the route description — the wording may differ from what is expected (the OAuth route is named "…via OAuth", searching for the word "oauth" does not find permissions).
3. The required method (GET/POST/PUT/DELETE) is auto-checked as "Required" for the route. **Save**.

A `POST /api/admin/user-permissions` will go out → `201`, the entry will be created with **`groupId: null`**.

## Step 2 — attach the permission to the group (main pitfalls!)

Creating a definition **does not grant the permission**: the entry with `groupId: null` goes to the "**Unused permissions**" section and does not affect runtime (waiting "up to 5 minutes" is pointless).

1. In the list of permissions, expand the "Unused permissions" group (chevron in the row).
2. Find the created entry, click its **"Add"** button (`title="Add"`, to the left of the method badges G/P/P/D).
3. A `PUT /api/admin/user-groups/{groupId}/permissions/{permId}/change` will go out → `200` — the entry will get the `groupId` of the group. **Only now does the permission take effect** (application — up to 5 minutes).

## Step 3 — verification via REST, not via UI

UI tabs are capricious; the source of truth is admin-REST (Bearer from cookie `accessToken`, see rule `admin-api`):

```text
GET /api/admin/user-groups/{groupId}/permissions?offset=0&limit=30000&sections=&isUnused=0
```

The required entry's `groupId` should equal the group's id, **not `null`**. The UI also shows this in the **Final permissions** tab (only actually bound routes). Then repeat the probe from step 0 — the error should change to the next step of the ladder.

## Cleanup and alternatives

- Duplicates of definitions can be deleted: `DELETE /api/admin/user-permissions/{id} → 200`.
- Rough alternatives — "Grant all permissions" to the group or the checkbox "Do not use permissions for this group" (Basic data) — work, but expose unnecessary permissions; not recommended.
- The admin session lasts ~15 minutes — if the action fell on a stale session, the confirmation might not have applied: recheck via REST.

## Related case: limit of 10 objects for guests

If public listings (`getPages()`, `getProducts()`…) return a maximum of 10 records — this is a limitation of guest group permissions: in the same Permissions, set **Read: without restrictions** for the entity.
