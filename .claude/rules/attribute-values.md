<!-- META
type: rules
fileName: attribute-values.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Working with attributeValues — OneEntry Rules

## Accessing Attributes

```typescript
const attrs = entity.attributeValues || {};

// If you know the marker — access it directly (preferably):
const title = attrs.title?.value
const price = attrs.price?.value

// If you don't know the marker — search by type:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.downloadLink || ''       // image — object!

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

| Type                                   | Access to value                                            |
|---------------------------------------|-----------------------------------------------------------|
| `string`, `integer`, `float`, `real`  | `attrs.marker?.value` (primitive)                          |
| `text`                                | `attrs.marker?.value?.htmlValue` or `value.plainValue`   |
| `textWithHeader`                      | `attrs.marker?.value?.header`, `value.htmlValue`          |
| `image`                               | object **or** array of objects — see section below        |
| `groupOfImages`                       | `attrs.marker?.value?.[0]?.downloadLink` (always an array)  |
| `file`                                | `attrs.marker?.value?.downloadLink` (object)              |
| `date`, `dateTime`, `time`            | `attrs.marker?.value?.fullDate` or `value.formattedValue`|
| `list`                                | `attrs.marker?.value` (array of ids or objects with extended) |
| `radioButton`                         | `attrs.marker?.value` (string-id)                         |
| `entity`                              | `attrs.marker?.value` (array of markers)                   |
| `timeInterval`                        | `attrs.marker?.value` → array of groups (raw schedule); slots — via `expandAttributeTimeIntervals(attr, { from, to })` |
| `spam`                                | captcha — render `<FormReCaptcha>`, NOT `<input>`         |

## ⚠️ image, groupOfImages — FIRST CHECK the actual structure via API

**ALWAYS run `/inspect-api` before first using an image attribute or:**

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

## ⚠️ image — value can be an object OR an array of objects

The SDK (`_clearArray`) unwraps a **single-element** array `image` into an object (`[img]` → `img`). Therefore, the form of `value` depends **not on the entity type** (Products/Pages/Blocks), but on whether unwrapping occurred:

- a single image obtained via a "top-level" method (`getProductById`, `getPageByUrl`) → **object**;
- multiple images **or** the entity came nested (e.g., a product inside a Blocks response), where unwrapping did not occur → **array**.

> The same product with one image comes as an object from `Products.getProductById`, but as an array inside the Blocks response — the entity type does not matter. (The previous table "Products=OBJECT / Pages=ARRAY / Blocks=ARRAY" described a false correlation.)

```typescript
// ✅ Universally — we take both object and array:
const raw = attrs.pic?.value;
const img = Array.isArray(raw) ? raw[0] : raw;
const imageUrl = img?.downloadLink || '';
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

> ⚠️ **ALWAYS** check via `/inspect-api` or `console.log(attrs.marker?.value)` + `Array.isArray(...)` before use.

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

## text — object with three formats

```typescript
// value is always an object with htmlValue, plainValue, mdValue
const html = attrs.description?.value?.htmlValue || ''
const plain = attrs.description?.value?.plainValue || ''
// params.editorMode: "html" | "md" | "plain"
```

## textWithHeader — header + body

```typescript
const header = attrs.specs?.value?.header || ''
const content = attrs.specs?.value?.htmlValue || ''
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

In `AttributeType` SDK v1.0.156, the type `json` does not exist (union: `string`, `text`, `textWithHeader`, `integer`, `real`, `float`, `date`, `dateTime`, `time`, `file`, `image`, `groupOfImages`, `list`, `radioButton`, `entity`, `button`, `spam`, `timeInterval`). If the project stores JSON — it is a regular `string`/`text` attribute that you parse manually:

```typescript
const data = JSON.parse(attrs.customData?.value || '{}')  // customData — type string
const width = data.dimensions?.width
```

## timeInterval

> ⚠️ **SDK ≥ 1.0.156:** the computed field `timeIntervals` NO LONGER adds to the attribute
> (previously, the SDK placed slots in `value[].values[].timeIntervals`). Now slots are resolved
> **on demand** in the window `{ from, to }` that you choose, via
> `expandAttributeTimeIntervals`. Raw schedule data (`dates`/`range`, `times`/`intervals`,
> `inEveryWeek`, `inEveryMonth`) still lies in `value` — only the ready field has been removed.

```typescript
import { expandAttributeTimeIntervals, isTimeIntervalAttribute } from 'oneentry'

// Unwraps the ENTIRE timeInterval attribute into a flat list of pairs [startISO, endISO] (UTC)
// over the specified window: traverses groups and schedules, merges the result.
// Non-timeInterval attribute → empty array (safe to call without type checking).
// The function is pure: it does not mutate input and does not make requests.
const intervals = expandAttributeTimeIntervals(attrs.workingHours, {
  from: '2026-03-01',
  to: '2026-03-31',
})
// intervals → [["2026-03-15T09:00:00.000Z","2026-03-15T10:00:00.000Z"], ...]
const start = intervals[0]?.[0]
const end   = intervals[0]?.[1]

// Need access to raw schedule without casting — use type guard:
if (isTimeIntervalAttribute(attrs.workingHours)) {
  attrs.workingHours.value[0].values[0].dates // fully typed
}
```

**For booking calendar** work with the flat list `intervals` collected above:

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

## additionalFields — nested attributes

`additionalFields` — arbitrary nested attributes that can be attached to **any** attribute in the admin panel. The content is fully defined by the developer/administrator. The only limitation is that the types of nested fields are taken from the standard set of OneEntry types (`string`, `integer`, `float`, `text`, `image`, `groupOfImages`, `date`, `list`, etc.).

Found in two contexts:

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

// If additionalFields is not set → {}
```

### Full Structure of a Record

```typescript
// Each record in additionalFields:
{
  marker: "unit",   // identifier of the additional field
  type: "string",   // one of the standard OneEntry types
  value: "kg",      // value — structure depends on type (as in main attributes)
  position: 0,
  isIcon: false,
  isProductPreview: false,
  additionalFields: {} // nesting is rarely used
}
```

### Accessing Values

> ⚠️ **Markers and meanings of `additionalFields` are defined in the admin panel** — they are unique for each project and attribute. Always check the actual structure via `/inspect-api` or `console.log` before use. Do not guess markers.

```typescript
const attrs = entity.attributeValues || {}

// Step 1 — see what is there (via /inspect-api or directly):
console.log(attrs.someMarker?.additionalFields)
// → { fieldA: { type: "string", value: "...", marker: "fieldA", ... },
//     fieldB: { type: "image",  value: {...}, marker: "fieldB", ... } }

// Step 2 — access by known marker:
const fieldAValue = attrs.someMarker?.additionalFields?.fieldA?.value

// Step 3 — the structure of value depends on the type of the nested field (the same rules as for main attributes):
// type "string"  → value — string
// type "text"    → value.htmlValue / plainValue
// type "image"   → value.downloadLink (or value[0].downloadLink — check!)
// type "integer" → value — number
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

These are flags **on the attribute itself** in `attributeValues`, NOT inside `additionalFields`:

```typescript
// { type: "image", value: {...}, isIcon: false, isProductPreview: true, additionalFields: {} }
const previewAttr = Object.values(attrs).find((a: any) => a?.isProductPreview === true)
const iconAttr    = Object.values(attrs).find((a: any) => a?.isIcon === true)
```

## ⚠️ Final Rating — top-level field `rating`, NOT an attribute

The aggregated rating of the entity (Products and others) is formed by OneEntry based on reviews (FormData) and is available in the **top-level field of the entity** `entity.rating?.value` (type `IRating`), and **not** in `attributeValues.rating`.

```typescript
// ✅ CORRECT — final rating from top-level field
const ratingVal = product.rating?.value;  // number | null
if (ratingVal != null) {
  // show star + value
} else {
  // "Rating not yet formed" — no reviews yet
}

// ❌ INCORRECT — this is a phantom attribute, often left in the schema
// from the old implementation (before real reviews were connected).
// Returns a hardcoded value, does not reflect real reviews.
const ratingVal = attrs.rating?.value;
```

**Link with reviews:** the values of `rating` are recalculated on the OneEntry side from FormData reviews (see [`skills/create-reviews/SKILL.md`](../skills/create-reviews/SKILL.md)). Inside a single review (FormData record), the rating field is already a marker of the form schema (e.g., `review_rating` or `rating`), this is **another** field.

| Context                              | Where it is located                                  |
|---------------------------------------|-----------------------------------------------------|
| Final rating of the entity (aggregate)   | `entity.rating?.value` (top-level)                  |
| Rating inside a single review (FormData) | `formData.find(f => f.marker === '<rating-marker>')?.value` |
| ❌ `attrs.rating?.value`              | DO NOT use — phantom attribute                       |

> If `attributeValues` contains `rating` — this is likely a remnant from before real reviews were connected. It is not necessary to delete it from the schema (it may break existing data), but in new code, use only `entity.rating`.

## For page blocks — localizeInfos as fallback

```typescript
const attrs = block.attributeValues || {}
const title = attrs.title?.value || block.localizeInfos?.title || ''
```

> Related rules:
>
> - `.claude/rules/performance-images.md` — `downloadLink` goes into `<Image src>`. `previewLink` — **object** `{ preset: [base64-LQIP, previewURL] }`: ready base64 for `blurDataURL` is already in `previewLink[preset][0]`, a separate `fetch` is not needed.
