---
name: admin-upload-images
description: Upload images to OneEntry via the internal admin API with previews (LQIP) — multipart /api/admin/files with entity=images&template=1, wiring into image/groupOfImages attributes
---
# Uploading Images via Internal Admin API (with Preview/LQIP)

Use this skill for programmatically uploading images to the `image` / `groupOfImages` attributes of OneEntry pages, products, and admins. The main trap is the request parameters: without `&template=1`, the preview (`previewLink`) **will never be created**.

> Base: rule `admin-api` (login, Bearer, auto-save the entire object) and skill `/admin-fill-content` (common module `login()`).

---

## Endpoint

```text
POST /api/admin/files?type={page|admin|…}&entity=images&id={entityId}&edit=false&compress=true&template=1
```

- multipart, field `file`;
- `type` — type of the owner entity (`page` for pages/products, `admin` for admins);
- `id` — id of the entity; **the entity must exist BEFORE the upload** (the file is placed under its id);
- `entity=images` — **plural**, as sent by the UI (the file path will be `…/{type}/{id}/images/…`);
- **`template=1` is mandatory** — it enables the generation of the preview. Without it, the response comes without `previewLink`, and the preview will not appear either asynchronously or during a subsequent PUT (experimentally verified). Just `entity=images` is not enough.

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

## Documents (not images): compression, md5, limit

- **Find out the size limit before the first bulk upload**: `GET /api/admin/settings-general` → `system.common.maxUploadFileSize`. Otherwise, it will be discovered in the middle of the run.
- For documents (PDF, archives), upload **without compression** — `compress=false`: otherwise, byte-by-byte verification is impossible.
- **After uploading, download via `downloadLink` and compare md5** with the original. `200` on upload does not mean that the file was stored.
- **Build the temporary file name from the original path, not from the signature.** Signatures repeat, and one document can end up with the content of another — an error that looks like "links are mixed up."
- At the end, check **all** files, not just a sample.

## Binding Image to Place and Second Locale

- **`groupOfImages` does not know what relates to what.** A companion list is created nearby: the title — place ("Section · Title"), body — **file name in storage** (`filename`), plain text — `alt`. The original file name in the body does not work: the link does not resolve, there are no images, and no errors either.
- **The connection "file ↔ caption" — by title, not by position.** Two parallel lists diverge at the first entry without a pair. A caption without a file is data (text instead of a link), not an empty field.
- **In the second locale, the file value is copied entirely.** `downloadLink` and `previewLink` from `filename` are not displayed by the platform: the record goes through, the response is `200`, the field looks filled in the panel — but the showcase of the second language delivers the image without a preview and loads it differently. From the client's side, it appears as "in another language, the images are different." Check with a separate run: for each file field, `filename`, `downloadLink`, and `previewLink` must match in both locales.

## Audit and Re-upload

- Check which files do not have a preview: go through the entities with a GET and see if there is a `previewLink` for file objects.
- Files uploaded without `template=1` can only be fixed **by re-uploading** (repeat POST with the correct parameters + PUT of the new object in the attribute).
- No endpoint for deleting a file in the admin API has been found — old files remain on the CDN as orphans; this is expected. Re-uploading leaves an orphan, and **the old link continues to deliver the previous document** — ensure that the new object is in the attribute value.
- Before editing the file attribute, take a snapshot of the value in the file: the file itself remains in storage, but it cannot be found by UUID.

## How to Get the Exact Recipe from the UI (if something does not match)

Upload zones in the admin panel: page — `/content/edit-page/{id}?tab=3` (Attributes tab), admin — `/admins/edit-page/{id}?tab=2`; inputs — `input#image_id{N}` / `input#groupOfImages_id{N}`. Upload the file manually and intercept the request (Playwright `browser_network_requests` → `browser_network_request`) — the exact query parameters are visible there. Note: the UI for some types (e.g., `type=admin`) sends the request **without** `template` — meaning the admin panel does not create previews in those places; `template=1` still works there, always add it.

## Frontend: How to Use LQIP

`previewLink.default[0]` → `blurDataURL` + `placeholder="blur"` in `next/image`. For small avatars (≤48 px), the blur is not visible and only inflates the base64 markup — consciously do not use it there.

⚠️ The presence of LQIP ≠ permission to enable it: before editing components **ask the user** if `placeholder="blur"` is needed and where exactly (everywhere / only in hero and main photo / nowhere). If silent → only on the LCP image. Rule — `.claude/rules/performance-images.md`.
