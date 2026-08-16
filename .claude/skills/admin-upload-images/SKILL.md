---
name: admin-upload-images
description: Upload images to OneEntry via the internal admin API with previews (LQIP) — multipart /api/admin/files with entity=images&template=1, wiring into image/groupOfImages attributes
---
# Uploading Images via Internal Admin API (with Preview/LQIP)

Use this skill for programmatic image uploads to the `image` / `groupOfImages` attributes of OneEntry pages, products, and admins. The main trap is the request parameters: without `&template=1`, the preview (`previewLink`) **will never be created**.

> Base: rule `admin-api` (login, Bearer, auto-save the entire object) and skill `/admin-fill-content` (common module `login()`).

---

## Endpoint

```text
POST /api/admin/files?type={page|admin|…}&entity=images&id={entityId}&edit=false&compress=true&template=1
```

- multipart, field `file`;
- `type` — type of the owning entity (`page` for pages/products, `admin` for admins);
- `id` — id of the entity; **the entity must exist BEFORE uploading** (the file is placed under its id);
- `entity=images` — **plural**, as sent by the UI (the file path will be `…/{type}/{id}/images/…`);
- **`template=1` is mandatory** — it enables preview generation. Without it, the response comes without `previewLink`, and the preview will not appear either asynchronously or during subsequent PUT (experimentally verified). Just `entity=images` is not enough.

Response: `[{filename, downloadLink, previewLink, defaultPreview, size, contentType}]`.

- `previewLink.default[0]` — ready **base64-LQIP** (for `blurDataURL` / `placeholder="blur"` in `next/image`);
- `previewLink.default[1]` — URL of the reduced version, but this is a **~20×20 px placeholder (~1 KB)**, NOT a thumbnail. ❌ Do not use it as a display source (`previewLink ?? downloadLink` will render a 20-pixel square) — always use `downloadLink` for display.

## Writing to Attribute

The file is saved only after a PUT of the entity with the file object in the attribute value:

```js
const uploaded = await (await api.post(
  `/api/admin/files?type=page&entity=images&id=${pageId}&edit=false&compress=true&template=1`,
  { multipart: { file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer } } },
)).json();

const entity = await (await api.get(`/api/admin/pages/${pageId}`)).json();
// image — one object in the array; groupOfImages — an array of such objects
entity.attributesSets.en_US.image_id2 = [{ ...uploaded[0], params: { isImageCompressed: true } }];
await api.put(`/api/admin/pages/${pageId}`, { data: entity });
```

Put **the entire object from the upload response** (including `previewLink` and `defaultPreview`) + `params: {isImageCompressed: true}`. The internal key (`image_id{N}` / `groupOfImages_id{N}`) — from the GET entity, do not guess.

## Multipart Gotcha

❌ Do not set a global `content-type: application/json` in request-context Playwright — it will break multipart. Only pin `authorization`; Playwright will set `content-type` per-request itself.

## Audit and Re-upload

- Check which files do not have previews: go through the entities with GET and see if there is a `previewLink` for file objects.
- Files uploaded without `template=1` can only be fixed by **re-uploading** (repeat POST with correct parameters + PUT of the new object in the attribute).
- No file deletion endpoint found in the admin API — old files remain on the CDN as orphans; this is expected.

## How to Get the Exact Recipe from the UI (if something doesn't match)

Upload zones in the admin panel: page — `/content/edit-page/{id}?tab=3` (Attributes tab), admin — `/admins/edit-page/{id}?tab=2`; inputs — `input#image_id{N}` / `input#groupOfImages_id{N}`. Upload a file manually and intercept the request (Playwright `browser_network_requests` → `browser_network_request`) — the exact query parameters are visible there. Note: the UI for some types (e.g., `type=admin`) sends the request **without** `template` — meaning the admin panel does not create previews in those places; `template=1` still works there, always add it.

## Frontend: How to Use LQIP

`previewLink.default[0]` → `blurDataURL` + `placeholder="blur"` in `next/image`. For small avatars (≤48 px), the blur is not visible and only inflates the base64 markup — consciously do not use it there.

⚠️ The presence of LQIP ≠ permission to include it: before editing components **ask the user** if `placeholder="blur"` is needed and where exactly (everywhere / only in hero and main photo / nowhere). If silent → only on the LCP image. Rule — `.claude/rules/performance-images.md`.
