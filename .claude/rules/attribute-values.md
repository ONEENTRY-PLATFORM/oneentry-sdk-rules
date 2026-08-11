---
paths:
  - "app/**/*.tsx"
  - "src/app/**/*.tsx"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Working with attributeValues — OneEntry Rules

## Accessing Attributes

```typescript
const attrs = entity.attributeValues || {};

// If you know the marker — access it directly (preferably):
const title = attrs.title?.value
const price = attrs.price?.value

// If you don't know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.downloadLink || ''       // image, one file — object!

const groupAttr = Object.values(attrs).find((a: any) => a?.type === 'groupOfImages')
const groupUrl = groupAttr?.value?.[0]?.downloadLink || ''  // groupOfImages — array!

// Find all groupOfImages:
const allImages = Object.values(attrs)
  .filter((a: any) => a?.type === 'groupOfImages')
  .flatMap((a: any) => a?.value || [])
  .map((img: any) => img?.downloadLink)
  .filter(Boolean)
```

## Value Types (critically important!)

| Type                                   | Accessing value                                            |
|----------------------------------------|-----------------------------------------------------------|
| `string`                               | `attrs.marker?.value` (string) or `null` if not filled   |
| `integer`, `float`, `real`             | `attrs.marker?.value` — **number** or `null` (v1.0.157, see section below) |
| `text`                                 | array **or** object — unwrap it (see section)             |
| `textWithHeader`                       | like `text`: unwrap → `header`, `htmlValue`              |
| `image`                                | 1 file → object, 2+ → array of objects — see section below |
| `file`                                 | 1 file → object, 2+ → array (like `image`, v1.0.157)     |
| `groupOfImages`                        | `attrs.marker?.value?.[0]?.downloadLink` (always an array) |
| `date`, `dateTime`, `time`             | `attrs.marker?.value?.fullDate` or `value.formattedValue`|
| `list`                                 | `attrs.marker?.value` (array of ids or objects with extended) |
| `radioButton`                          | `attrs.marker?.value` (string-id)                         |
| `entity`                               | `attrs.marker?.value` (array of markers)                  |
| `timeInterval`                         | `attrs.marker?.value` → array of groups (raw schedule); slots — via `expandAttributeTimeIntervals(attr, { from, to })` |
| `spam`                                 | captcha — render `<FormReCaptcha>`, NOT `<input>`         |

## ⚠️ Normalization of SDK values ≥ 1.0.157 — unified across all modules

Starting from v1.0.157, normalization (`_normalizeAttr`) is applied to **every** attribute of **every** response: `attributeValues` of entities, `attributes` of forms, form-data fields, nested `additionalFields`, attributes in sets. Previously, some rules only worked in products/menus/forms/attribute-sets, so the same attribute came in different forms from different modules.

| What is normalized          | Rule (v1.0.157)                                                   |
| --------------------------- | ------------------------------------------------------------------ |
| `image`, `file`            | exactly 1 file → `value` = file object; 2+ files → array          |
| `groupOfImages`            | always an array (collection by definition, does not unwrap)        |
| `integer`, `float`, `real` | `value` is converted to `number`; non-number → `null`             |
| Empty attribute (any type)  | `value === null` (previously `{}` for text types, `0` for numeric) |
| Form fields                 | `attributes` of forms are sorted by `position` (like `attributeValues`) |

**Breaking for existing code:** `value[0]` of a single `image`/`file` is now `undefined` in blocks, pages, users, orders, admins, discounts, templates, `Products.getProductsEmptyPage`, `Products.getProductBlockById`. Remove the index or unwrap universally (`Array.isArray(v) ? v[0] : v` — safe even with multiple files). Code that read the object from products/menus is unaffected.

**Breaking for emptiness checks:** an unfilled `integer`/`float` no longer comes as `0` — it comes as `null`. Checks like `if (attrs.qty?.value === 0)` and `value || 0` change meaning: use `attrs.qty?.value ?? 0`, and check "not filled" via `== null`.

## ⚠️ image, groupOfImages — FIRST CHECK the actual structure via API

**ALWAYS before the first use of an image attribute run `/inspect-api` or:**

```javascript
// .claude/temp/check-image.mjs
import { defineOneEntry } from 'oneentry';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('='))
);

const api = defineOneEntry(env.NEXT_PUBLIC_ONEENTRY_URL, { token: env.NEXT_PUBLIC_ONEENTRY_TOKEN });

// Check Products
const r = await api.Products.getProducts([], 'en_US', { limit: 1 });
const attrs = r?.items?.[0]?.attributeValues || {};
for (const [k, v] of Object.entries(attrs)) {
  if (v?.type === 'image' || v?.type === 'groupOfImages') {
    console.log(k, ':', v.type, '→', Array.isArray(v?.value) ? 'ARRAY' : 'OBJECT');
    console.log('  sample:', JSON.stringify(v?.value?.[0] ?? v?.value, null, 2)?.slice(0, 200));
  }
}
```

## ⚠️ image / file — value depends on the NUMBER of files

The SDK (`_normalizeAttr`, v1.0.157) unwraps a **single-element** array `image`/`file` into an object (`[img]` → `img`) — in all modules without exception. The form of `value` depends **only on the number of attached files**:

- exactly one file → **object** (`value.downloadLink`);
- two or more → **array of objects** (`value[0].downloadLink`).

> The entity type (Products / Pages / Blocks / Orders / Users) and the method of retrieval (top-level method or nested response) no longer affect anything. Until 1.0.157, unwrapping only worked in products, menus, forms, forms-data, attribute-sets, integration-collections, and `Pages.searchPage`, so the same attribute came either as an object or as an array. (An even older table "Products=OBJECT / Pages=ARRAY / Blocks=ARRAY" described a false correlation.)

```typescript
// ✅ Universally — unwrap both object (1 file) and array (2+):
const raw = attrs.pic?.value;
const img = Array.isArray(raw) ? raw[0] : raw;
const imageUrl = img?.downloadLink || '';

// All files of the attribute as a list (0 files → null, 1 → object, 2+ → array):
const files = attrs.pic?.value ? [attrs.pic.value].flat() : [];
```

**Structure of the image object** (`img`):

```typescript
// { downloadLink, previewLink, filename, size, contentType, defaultPreview }
const url = img?.downloadLink;                    // full-size image
// previewLink — OBJECT by presets, NOT a string-URL:
//   { default: [ "data:image/webp;base64,…" /* LQIP */, "https://…preview.default.jpeg" ] }
const preset  = img?.defaultPreview || 'default';
const blur    = img?.previewLink?.[preset]?.[0];  // ready base64 → blurDataURL (fetch not needed)
const preview = img?.previewLink?.[preset]?.[1];  // URL of compressed preview
```

> ⚠️ How many files are actually in the attribute is known only to the project content. Check via `/inspect-api` or `console.log(attrs.marker?.value)` + `Array.isArray(...)`, and in code write a form resilient to both cases: a content manager may add a second file and turn an object into an array.

### One helper for the entire project — `getImageUrl` / `getImageUrls`

`Array.isArray(v) ? v[0] : v` should not spread across components: it repeats at every image output place and breaks in its own way each time. Keep **one** pair of functions in `src/lib/oneentry.ts` (where `getApi`/`isError` are) and import only that.

Three nuances that are not in the naive version:

1. **Accept both the attribute and its `value`** — callers often confuse `attrs.pic` and `attrs.pic.value`; unwrap `{ value: … }` if it has come.
2. **Fallback to `previewLink`.** In order products (`Orders`) and form-data records, only it comes, without `downloadLink` — without the fallback, the order image is empty. Consider both forms of `previewLink`: string (orders, form-data) and object of presets (image attributes of entities, see above).
3. **Discard entries without a link** — otherwise, empty tiles from broken files appear in the gallery.

```typescript
// src/lib/oneentry.ts
export function getImageUrl(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value

  // accepted attribute instead of value — unwrap
  const unwrapped = !Array.isArray(value) && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value
  if (!unwrapped) return ''

  const first = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped
  if (!first || typeof first !== 'object') return ''

  const file = first as { downloadLink?: string; previewLink?: unknown; defaultPreview?: string }
  if (typeof file.downloadLink === 'string' && file.downloadLink) return file.downloadLink

  // fallback: string (orders, form-data) or object of presets (entity attributes)
  const p = file.previewLink
  if (typeof p === 'string') return p
  const preset = file.defaultPreview || 'default'
  const url = (p as Record<string, string[]> | undefined)?.[preset]?.[1]
  return typeof url === 'string' ? url : ''
}

/** All URLs of the attribute in storage order — for galleries and groupOfImages. */
export function getImageUrls(value: unknown): string[] {
  if (!value) return []
  const unwrapped = !Array.isArray(value) && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value
  if (!unwrapped) return []
  const list = Array.isArray(unwrapped) ? unwrapped : [unwrapped]
  return list.map(getImageUrl).filter((url) => url.length > 0)
}
```

> Do not create parallel `extractImage` in `utils/attribute-values` and `getLqip` in `utils/blur`: this is the same parsing, split across three files. LQIP is taken from the same object (`previewLink[preset][0]`) — see `.claude/rules/performance-images.md`. The helper fits perfectly for unit tests on fixtures of all forms of `value` — `.claude/rules/unit-testing.md`.

## ⚠️ groupOfImages — value is always an ARRAY

```typescript
// ❌ INCORRECT
const url = attrs.photos?.value?.downloadLink

// ✅ CORRECT
const url = attrs.photos?.value?.[0]?.downloadLink
// previewLink — object by presets; ready base64-LQIP inside:
const blur = attrs.photos?.value?.[0]?.previewLink?.default?.[0]

// Gallery
const gallery = attrs.gallery?.value || []
const urls = gallery.map((img: any) => img.downloadLink)
```

## ⚠️ text — ARRAY OR object with three formats

The API returns `text` as an **array of blocks** `[{ htmlValue, plainValue, mdValue }]`, while the SDK
(unlike `image` and `file`) does NOT unwrap a single-element array —
`_normalizeAttrValue` only unpacks file types. Therefore, direct
`value?.htmlValue` on real data returns `undefined`. Unwrap universally:

```typescript
// ✅ Universally — both array and object:
const rawText = attrs.description?.value;
const block = Array.isArray(rawText) ? rawText[0] : rawText;
const html = block?.htmlValue || ''
const plain = block?.plainValue || ''
// params.editorMode: "html" | "md" | "plain"

// Multiple blocks — render all:
const blocks = Array.isArray(rawText) ? rawText : [rawText].filter(Boolean)

// ❌ INCORRECT — value is an array, will be undefined
const html = attrs.description?.value?.htmlValue
```

> Confirmed by a live test (`npm run validate:live`, test `attribute-shapes`)
> on a real project: all `text` attributes came as an array.

## textWithHeader — header + body (same array wrapper)

```typescript
const rawSpecs = attrs.specs?.value;
const specs = Array.isArray(rawSpecs) ? rawSpecs[0] : rawSpecs;
const header = specs?.header || ''
const content = specs?.htmlValue || ''
```

## date / dateTime / time

```typescript
// fullDate — ISO string, formattedValue — formatted
const iso = attrs.releaseDate?.value?.fullDate || ''
const formatted = attrs.releaseDate?.value?.formattedValue || ''
// formatString: "DD-MM-YYYY", "DD-MM-YYYY HH:mm", "HH:mm"
```

## radioButton

```typescript
// value — string-id of the selected item from listTitles
const selectedId = attrs.color?.value || ''
// listTitles[locale]: [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" } }]
```

## list with extended data (icons, badges)

```typescript
const badges = attrs.badges?.value || []
const iconUrl = badges[0]?.extended?.value?.downloadLink || ''
const badgeTitle = badges[0]?.title || ''

// Simple list (array of string-ids):
const selectedTags = attrs.tags?.value || []  // ["1", "3", "5"]
```

## entity

```typescript
// value — array of markers of related entities
const related = attrs.relatedProducts?.value || []  // ["mouse", "cable"]
```

## json — this type of attribute DOES NOT EXIST

In `AttributeType` SDK v1.0.157, the type `json` does not exist (union: `string`, `text`, `textWithHeader`, `integer`, `real`, `float`, `date`, `dateTime`, `time`, `file`, `image`, `groupOfImages`, `list`, `radioButton`, `entity`, `button`, `spam`, `timeInterval`). If the project stores JSON — it is a regular `string`/`text` attribute, which you parse manually:

```typescript
const data = JSON.parse(attrs.customData?.value || '{}')  // customData — type string
const width = data.dimensions?.width
```

## timeInterval

> ⚠️ **SDK ≥ 1.0.156:** the computed field `timeIntervals` NO LONGER adds to the attribute
> (previously, the SDK placed slots in `value[].values[].timeIntervals`). Now slots are resolved
> **on demand** in the window `{ from, to }`, which you choose, via
> `expandAttributeTimeIntervals`. Raw schedule data (`dates`/`range`, `times`/`intervals`,
> `inEveryWeek`, `inEveryMonth`) still lies in `value` — only the ready field is removed.

```typescript
import { expandAttributeTimeIntervals, isTimeIntervalAttribute } from 'oneentry'

// Unwraps the ENTIRE timeInterval attribute into a flat list of pairs [startISO, endISO] (UTC)
// in the specified window: traverses groups and schedules, merges the result.
// Non-timeInterval attribute → empty array (safe to call without type checking).
// The function is pure: it does not mutate input and does not make requests.
const intervals = expandAttributeTimeIntervals(attrs.workingHours, {
  from: '2026-03-01',
  to: '2026-03-31',
})
// intervals → [["2026-03-15T09:00:00.000Z","2026-03-15T10:00:00.000Z"], ...]
const start = intervals[0]?.[0]
const end   = intervals[0]?.[1]

// Need access to raw schedule without casting — use type-guard:
if (isTimeIntervalAttribute(attrs.workingHours)) {
  attrs.workingHours.value[0].values[0].dates // fully typed
}
```

**For booking calendar** work with the flat list of `intervals` collected above:

```typescript
// Slots for the selected date (UTC comparison!)
function filterIntervalsByDate(intervals: [string, string][], date: Date) {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([s, e]) => new Date(s) < endOfDay && new Date(e) > startOfDay);
}

// Formatting time — from UTC hours!
const h = new Date(startISO).getUTCHours();
const m = new Date(startISO).getUTCMinutes();
const time = `${h}:${m === 0 ? '00' : m}`;   // "10:00"

// Sending the selected slot — wrap in an array:
{ marker: field.marker, type: 'timeInterval', value: [[startISO, endISO]] }
//                                                   ^^^^ not [startISO, endISO]!
```

> Full pattern with calendar picker → skill **`/create-checkout`** (Step 3).

### timeInterval as weekly working hours (not slots)

If the attribute stores **working hours** (opening hours for footer/contact page), expand functions are not needed — it renders "Mon: 10:00 – 22:00", not booking slots. Read raw groups of `value` directly:

- each entry `values[]` of the group = **one day of the week**: `dates[0]` — anchor date (midnight **UTC**, `inEveryWeek: true`) → day of the week = `new Date(dates[0]).getUTCDay()`;
- `times` — array of pairs `[{hours, minutes}, {hours, minutes}]` (opening/closing; multiple pairs = shifts — join with a comma);
- read hours/day **in UTC** (`getUTCDay`, values of pairs as they are) — not in local timezone;
- silently skip everything unparseable: a partially filled attribute degrades to existing days, a day without pairs = "Closed", empty parsing — hide the section entirely (normal degradation with an empty CMS).

```typescript
// value → [{ day: 'Monday', hours: '10:00 – 22:00' }, …], Mon-first order: [1,2,3,4,5,6,0]
for (const group of attrs.opening_time?.value ?? []) {
  for (const entry of group?.values ?? []) {
    const day = new Date(entry?.dates?.[0]).getUTCDay();          // 0 — Sunday
    const pairs = (entry?.times ?? []).map(([from, to]) =>
      `${pad(from?.hours)}:${pad(from?.minutes)} – ${pad(to?.hours)}:${pad(to?.minutes)}`);
  }
}
```

## additionalFields — nested attributes

`additionalFields` — arbitrary nested attributes that can be attached to **any** attribute in the admin panel. The content is fully defined by the developer/administrator. The only limitation is that the types of nested fields are taken from the standard set of OneEntry types (`string`, `integer`, `float`, `text`, `image`, `groupOfImages`, `date`, `list`, etc.).

It appears in two contexts:

- `attributeValues` of entities (Product, Page, Block) — values of nested fields
- `attributes` of schemas (Forms, AttributesSets) — metadata of nested fields

### SDK Normalization

The SDK automatically transforms `additionalFields` from an **array** (as returned by the API) into a **Record**, key — `marker` of the field.

```typescript
// RAW API (rawData: true in config):
{ additionalFields: [
    { marker: "unit", type: "string", value: "kg", position: 0 },
    { marker: "note", type: "text",   value: {...}, position: 1 }
  ]
}

// After SDK normalization (rawData: false — default):
{ additionalFields: {
    unit: { marker: "unit", type: "string", value: "kg",  position: 0 },
    note: { marker: "note", type: "text",   value: {...}, position: 1 }
  }
}

// If additionalFields is not configured → {}
```

### Full structure of an entry

```typescript
// Each entry in additionalFields:
{
  marker: "unit",   // identifier of the additional field
  type: "string",   // one of the standard OneEntry types
  value: "kg",      // value — structure depends on type (like in main attributes)
  position: 0,
  isIcon: false,
  isProductPreview: false,
  additionalFields: {} // nesting is rarely used
}
```

### Accessing Values

> ⚠️ **Markers and meaning of `additionalFields` are defined in the admin panel** — they are unique for each project and attribute. Always check the actual structure via `/inspect-api` or `console.log` before use. Do not guess markers.

```typescript
const attrs = entity.attributeValues || {}

// Step 1 — see what is there (via /inspect-api or directly):
console.log(attrs.someMarker?.additionalFields)
// → { fieldA: { type: "string", value: "...", marker: "fieldA", ... },
//     fieldB: { type: "image",  value: {...}, marker: "fieldB", ... } }

// Step 2 — access by known marker:
const fieldAValue = attrs.someMarker?.additionalFields?.fieldA?.value

// Step 3 — the structure of value depends on the type of the nested field (same rules as for main attributes):
// type "string"  → value — string
// type "text"    → unwrap the array → htmlValue / plainValue (see text section)
// type "image"   → 1 file: value.downloadLink; 2+: value[0].downloadLink
// type "integer" → value — number or null (not 0!)
// ... etc.

// Iteration if you need to go through all additional fields:
const extra = attrs.someMarker?.additionalFields || {}
for (const [marker, field] of Object.entries(extra as Record<string, any>)) {
  console.log(marker, field.type, field.value)
}
```

### Form Attributes (Forms / AttributesSets)

In the form schema, `additionalFields` — arbitrary UI metadata set in the admin panel for each field. Interpretation depends on the project:

```typescript
// Markers are defined by the administrator — always inspect:
console.log(field.additionalFields)
// → { placeholder: { type: "string", value: "Enter name", ... },
//     hint: { type: "string", value: "Hint", ... } }

// Access by marker:
const placeholder = field.additionalFields?.placeholder?.value || ''
const hint        = field.additionalFields?.hint?.value || ''
```

### isIcon and isProductPreview

These are flags **on the attribute** in `attributeValues`, NOT inside `additionalFields`:

```typescript
// { type: "image", value: {...}, isIcon: false, isProductPreview: true, additionalFields: {} }
const previewAttr = Object.values(attrs).find((a: any) => a?.isProductPreview === true)
const iconAttr    = Object.values(attrs).find((a: any) => a?.isIcon === true)
```

## ⚠️ Final Rating — top-level field `rating`, NOT an attribute

The aggregated rating of an entity (Products, etc.) is formed by OneEntry based on reviews (FormData) and is available in the **top-level field of the entity** `entity.rating?.value` (type `IRating`), and **not** in `attributeValues.rating`.

```typescript
// ✅ CORRECT — final rating from top-level field
const ratingVal = product.rating?.value;  // number | null
if (ratingVal != null) {
  // show star + value
} else {
  // "Rating not yet formed" — no reviews yet
}

// ❌ INCORRECT — this is a "phantom" attribute, often remains in the schema
// from the old implementation (before real reviews were connected).
// Returns a hardcoded value, does not reflect real reviews.
const ratingVal = attrs.rating?.value;
```

**Link with reviews:** the values of `rating` are recalculated on the OneEntry side from FormData reviews (see skill `/create-reviews`). Inside a single review (FormData entry), the rating field is already the marker of the form schema (e.g., `review_rating` or `rating`), this is **another** field.

| Context                              | Where it lies                                  |
|--------------------------------------|------------------------------------------------|
| Final rating of the entity (aggregate) | `entity.rating?.value` (top-level)             |
| Rating inside a single review (FormData) | `formData.find(f => f.marker === '<rating-marker>')?.value` |
| ❌ `attrs.rating?.value`             | DO NOT use — phantom attribute                  |

> If `rating` is found in `attributeValues` — this is likely a remnant before real reviews were connected. It is not necessary to delete from the schema (it may break existing data), but in new code use only `entity.rating`.

## For page blocks — localizeInfos as fallback

```typescript
const attrs = block.attributeValues || {}
const title = attrs.title?.value || block.localizeInfos?.title || ''
```

> Related rules:
>
> - `.claude/rules/performance-images.md` — `downloadLink` goes into `<Image src>`. `previewLink` — **object** `{ preset: [base64-LQIP, previewURL] }`: ready base64 for `blurDataURL` is already in `previewLink[preset][0]`, a separate `fetch` is not needed.
