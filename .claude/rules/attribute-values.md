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
|----------------------------------------|-----------------------------------------------------------|
| `string`, `integer`, `float`, `real`   | `attrs.marker?.value` (primitive)                          |
| `text`                                 | `attrs.marker?.value?.htmlValue` or `value.plainValue`   |
| `textWithHeader`                       | `attrs.marker?.value?.header`, `value.htmlValue`          |
| `image`                                | **depends on the entity** — see section below             |
| `groupOfImages`                        | `attrs.marker?.value?.[0]?.downloadLink` (always an array)  |
| `file`                                 | `attrs.marker?.value?.downloadLink` (object)              |
| `date`, `dateTime`, `time`             | `attrs.marker?.value?.fullDate` or `value.formattedValue`|
| `list`                                 | `attrs.marker?.value` (array of ids or objects with extended) |
| `radioButton`                          | `attrs.marker?.value` (string-id)                         |
| `entity`                               | `attrs.marker?.value` (array of markers)                   |
| `json`                                 | `JSON.parse(attrs.marker?.value || '{}')`                 |
| `timeInterval`                         | `attrs.marker?.value` → `[[ISO, ISO], ...]`               |
| `spam`                                 | captcha — render `<FormReCaptcha>`, NOT `<input>`         |

## ⚠️ image, groupOfImages — FIRST CHECK the actual structure via API

**ALWAYS run `/inspect-api` before the first use of the image attribute:**

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

## ⚠️ image — structure depends on the entity type (verified with real data)

> **Note:** Swagger documentation declares `image.value` as an object for all entities. The real API returns different structures — trust real data, not Swagger.

| Entity       | image valueType | Access                                 |
|--------------|-----------------|----------------------------------------|
| **Products** | OBJECT          | `attrs.pic?.value?.downloadLink`       |
| **Pages**    | ARRAY           | `attrs.icon?.value?.[0]?.downloadLink` |
| **Blocks**   | ARRAY           | `attrs.bg?.value?.[0]?.downloadLink`   |

```typescript
// Products — image is an OBJECT
const imageUrl = attrs.pic?.value?.downloadLink || '';

// Pages / Blocks — image is an ARRAY
const imageUrl = attrs.bg?.value?.[0]?.downloadLink || '';
```

> ⚠️ **ALWAYS** run `/inspect-api` or do `console.log(attrs.marker?.value)` before using — to know the exact structure in your project.

## ⚠️ groupOfImages — value is always an ARRAY

```typescript
// ❌ INCORRECT
const url = attrs.photos?.value?.downloadLink

// ✅ CORRECT
const url = attrs.photos?.value?.[0]?.downloadLink
const preview = attrs.photos?.value?.[0]?.previewLink

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

## json

```typescript
const data = JSON.parse(attrs.customData?.value || '{}')
const width = data.dimensions?.width
```

## timeInterval

```typescript
// value — array of pairs [startISO, endISO] in UTC
const intervals = attrs.workingHours?.value || []
// [[ISO, ISO], [ISO, ISO], ...]
const start = intervals[0]?.[0]  // "2026-03-15T09:00:00.000Z"
const end = intervals[0]?.[1]    // "2026-03-15T10:00:00.000Z"
```

**In the order/reservation form** — `value` contains available slots. Pattern for the calendar:

```typescript
// Slots for the selected date (UTC comparison!)
function filterIntervalsByDate(intervals: [string, string][], date: Date) {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([s, e]) => new Date(s) < endOfDay && new Date(e) > startOfDay);
}

// Time formatting — from UTC hours!
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

Occurs in two contexts:

- `attributeValues` of entities (Product, Page, Block) — values of nested fields
- `attributes` of schemas (Forms, AttributesSets) — metadata of nested fields

### SDK Normalization

The SDK automatically transforms `additionalFields` from **array** (as returned by the API) into **Record**, key — `marker` of the field.

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

### Full Record Structure

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

> ⚠️ **Markers and meaning of `additionalFields` are defined in the admin panel** — they are unique for each project and attribute. Always check the real structure via `/inspect-api` or `console.log` before use. Do not guess markers.

```typescript
const attrs = entity.attributeValues || {}

// Step 1 — see what is there (via /inspect-api or directly):
console.log(attrs.someMarker?.additionalFields)
// → { fieldA: { type: "string", value: "...", marker: "fieldA", ... },
//     fieldB: { type: "image",  value: {...}, marker: "fieldB", ... } }

// Step 2 — access by known marker:
const fieldAValue = attrs.someMarker?.additionalFields?.fieldA?.value

// Step 3 — the structure of value depends on the type of nested field (the same rules as for main attributes):
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

These are flags **on the attribute** in `attributeValues`, NOT inside `additionalFields`:

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

// ❌ INCORRECT — this is a phantom attribute, often remains in the schema
// from the old implementation (before real reviews were connected).
// Returns a hardcoded value, does not reflect real reviews.
const ratingVal = attrs.rating?.value;
```

**Link with reviews:** the values of `rating` are recalculated on the OneEntry side from FormData reviews (see [`skills/create-reviews/SKILL.md`](../skills/create-reviews/SKILL.md)). Inside a single review (FormData record), the rating field is already a marker of the form schema (e.g., `review_rating` or `rating`), this is **another** field.

| Context                               | Where it is located                          |
|---------------------------------------|----------------------------------------------|
| Final rating of the entity (aggregate) | `entity.rating?.value` (top-level)          |
| Rating inside a single review (FormData) | `formData.find(f => f.marker === '<rating-marker>')?.value` |
| ❌ `attrs.rating?.value`              | DO NOT use — phantom attribute                |

> If `attributeValues` contains `rating` — this is likely a remnant before real reviews were connected. It is not necessary to delete it from the schema (it may break existing data), but in new code, use only `entity.rating`.

## For page blocks — localizeInfos as fallback

```typescript
const attrs = block.attributeValues || {}
const title = attrs.title?.value || block.localizeInfos?.title || ''
```
