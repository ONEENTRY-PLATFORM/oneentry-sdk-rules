---
paths:
  - "app/**/*.tsx"
  - "src/app/**/*.tsx"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Working with attributeSets — OneEntry Rules

## What AttributesSets Methods Return

AttributesSets methods return **schema/metadata**, not the attribute values of entities. Distinguish between two forms of response (terminology as in `.claude/rules/sdk-modules.md`):

- **Attribute** (`IAttributesSetsEntity` = `{ marker, type, value, position, listTitles, validators, localizeInfos, additionalFields }`): `getAttributesByMarker(setMarker)` → array of attributes of the set; `getSingleAttributeByMarkerSet(setMarker, attrMarker)` → one attribute.
- **Set** (`IAttributeSetsEntity` = `{ id, identifier, title, schema, type: { id, type }, position }`): `getAttributeSetByMarker(setMarker)` → one set object; `getAttributes()` → `IAttributesSetsResponse` (`{ total, items: IAttributeSetsEntity[] }`) — paginated list of sets.

> `getAttributesByMarker` returns **attributes** (`IAttributesSetsEntity[]`) — as declared in v1.0.158; until 1.0.157 inclusive, the d.ts had `IAttributeSetsEntity[]` (set object), and the declared type could not be trusted. The type names differ by one letter — check by fields, not by name.

```ts
// ❌ INCORRECT — attributeSet does not contain actual values of products/pages
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const price = attrs[0].value // null — empty! (before v1.0.157 it came as {})

// ✅ CORRECT — values are taken from the entity itself
const product = await getApi().Products.getProductById(id)
const price = product.attributeValues.price?.value // actual value
```

**Exception:** `timeInterval` — if the "Receive values" option is enabled in the admin panel, the `value` field will contain raw schedule data. Expand the ready slots `[[startISO, endISO], ...]` using `expandAttributeTimeIntervals(attr, { from, to })` (SDK ≥ 1.0.156; the computed field `timeIntervals` from the response has been removed). See `.claude/rules/attribute-values.md`.

---

## `initialValue` — Default Value and UI String Dictionary

`value` in the schema is always empty, but **`initialValue` is not**: this is the designated place for the UI text dictionary, editable by the content manager (admin panel → **Settings → Attributes → &lt;set&gt;**). Why exactly the `initialValue` of the set, and not the value of the block — `.claude/rules/admin-api.md`, section "UI Text Dictionary".

**The form of `initialValue` depends on how you read it.** This is the main source of silent losses: half of the dictionary silently becomes empty.

| How you read | What comes in `initialValue` |
| --- | --- |
| `getAttributesByMarker(setMarker, langCode)` | flat, already localized for `langCode`: `'Share'` or `{ value: 'Share' }` |
| `getSingleAttributeByMarkerSet(...)` | the same — flat for `langCode` |
| `getAttributeSetByMarker(marker, lang)` → `schema.attributeN.initialValue` | **both forms**: language-keyed `{ en_US: { value: 'Share' } }` or already flat `{ value: 'Share' }` |
| raw REST `/attributes-sets/marker/{m}` (without SDK) | always language-keyed `{ en_US: { value: 'Share' } }` |

The reader must accept **both** forms:

```typescript
type Lang = 'en_US'
type AttrItem = {
  initialValue?: Partial<Record<Lang, { value?: string | null }>> | { value?: string | null }
}

export function readInitialValue(item: AttrItem | undefined, lang: Lang): string | null {
  const iv = item?.initialValue
  if (!iv || typeof iv !== 'object') return null
  // 1) language-keyed — set schema form
  const langKeyed = (iv as Partial<Record<Lang, { value?: string | null }>>)[lang]
  if (langKeyed && typeof langKeyed.value === 'string') return langKeyed.value
  // 2) flat — getAttributesByMarker form
  const flat = (iv as { value?: string | null }).value
  return typeof flat === 'string' ? flat : null
}
```

> ⚠️ `langCode` in `getAttributesByMarker` **is required** in a multilingual route: without it, the SDK initialization language is taken, and all locales will receive one language. The cache key must also include the locale — see `.claude/rules/localization.md`.

### Scaling: Many Dictionaries

One set = one screen (`system_header`, `system_cart`, `system_checkout`, …). Then:

- sets are loaded **in parallel** via `Promise.all`, not sequentially;
- the wrapper is React `cache()` (deduplication within a single request) **plus** process-wide TTL cache: `cache()` lives only within the HTTP request, while UI signatures change once a month, and without TTL each Server Action pulls all sets again (200–500 ms per page with signatures);
- **do not cache empty results.** A OneEntry network failure recorded in the cache for the entire TTL resets signatures across the entire site. Cache only non-empty schema — an empty one will fail to fallback and be re-requested;
- the TTL cache must have a ceiling on the number of entries (`Map` + eviction of the first key), otherwise a typo in the marker in a loop grows it endlessly in a long-lived Node process;
- provide the tree via a Context provider, with each key having a **constant fallback** in the code: the marker may not be present in the admin panel (then create an entry in `MISMATCH-LOG.md`, see `.claude/rules/mismatch-log.md`).

---

## Structure of the Attribute Object (Schema)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // attribute type
  value: null,            // always empty in the schema (v1.0.157: null instead of the previous {});
                          // exception — timeInterval with Receive values enabled
  marker: "product_name", // unique identifier — used in the attributeValues entity
  position: 1,            // display order
  listTitles: [...],      // options for radioButton and list
  validators: {...},      // validation rules
  localizeInfos: { title: "Product Name" }, // human-readable title
  additionalFields: {...} // nested attributes (Record, key = marker; array only with rawData)
}
```

**Fields of the schema element `IAttributeSchemaItem`, declared with v1.0.158** (all optional — the API does not return them for every field):

| Field | What it provides |
| --- | --- |
| `position` | order of the field within the set — sort the form by it, not by the order of object keys |
| `listTitles` (`IListTitle[]`) | options for `list` / `radioButton` / `entity`, along with `extended` and values of related entities |
| `listType` | for `entity` — how the list of options is organized (e.g. `"nested"`) |
| `moduleIdentifier` | for `entity` — from which module related entities are taken (e.g. `"catalog"`) |
| `parentId` | id of the parent field, `null` for top-level fields |
| `splitParts` (`number[] \| boolean`) | for fields with a divisible price — ids of fields it is split into; `false` if the field is not divisible |

⚠️ There, `initialValue` and `isPrice` have become **optional**: the API does not return them for some fields (`isPrice` only comes with product sets). Read using `?.`, absence is not an error.

---

## listTitles — Options (radioButton, list)

Use `listTitles` to display filter options or forms:

```ts
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const colorAttr = attrs.find((a: any) => a.marker === 'color')

// listTitles contains options for radioButton and list
const options = colorAttr?.listTitles ?? []
// [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" }, position: 1 }]

// extended — additional value (e.g., CSS color for the swatch)
const swatches = options.map((opt: any) => ({
  label: opt.title,
  value: opt.value,
  color: opt.extended?.value ?? opt.value, // color or fallback to id
}))
```

**Important:** `value` in listTitles — option identifier; type `number | string`, and for `entity` attributes — object `IListTitleEntityValue` (`{ id, depth, parentId, position, isPinned }`). For `radioButton` / `list` this is usually a string-ID, and it is stored in `attributeValues` of the entity when selected.

---

## additionalFields — Nested Attributes

`additionalFields` is configured in the admin panel for the attribute. The **raw** API returns it as an array, but the SDK normalizes it to `Record<marker, field>` **in all contexts** — both in `attributeValues` of entities (Products, Pages, Blocks), and in the schema from `getAttributesByMarker` / `getSingleAttributeByMarkerSet`, and in form attributes. The array remains only with `rawData: true` in the config.

```ts
// RAW API (rawData: true) — array:
{ type: "string", marker: "some_field", additionalFields: [
    { type: "string",  marker: "fieldA", value: "..." },
    { type: "integer", marker: "fieldB", value: 0 }
] }

// Default (rawData: false) — both in schema and entity the same Record (key = marker):
attr.additionalFields
// → { fieldA: { type: "string", value: "...", ... }, fieldB: { type: "integer", value: 0, ... } }
// Empty → {} (not [])
```

> ⚠️ Markers of `additionalFields` are defined in the admin panel and are unique to the project. **Do not guess** — inspect via `/inspect-api` or `console.log`. The form is the same in the schema and in `attributeValues` (Record); there is **no** difference between "array in schema / object in entity".

---

## validators — Structure

```ts
// requiredValidator — required field
{ requiredValidator: { strict: true } }

// defaultValueValidator — default value
{ defaultValueValidator: { fieldDefaultValue: "usd" } }

// checkingFilesValidator — file restrictions
{ checkingFilesValidator: { maxUnits: "kb", maxValue: "2000", extensions: [] } }

// sizeInPixelsValidator — image size
{ sizeInPixelsValidator: { maxX: "500", maxY: "500" } }
```

Use `validators` when dynamically generating forms (for example, a field is required if `strict: true`).

---

## Naming Rules for Markers

- Only lowercase letters and `_` (no spaces)
- Does not start with a digit
- Unique within the project
- Descriptive: `product_price`, not `pp`

```ts
// ✅ Correct
attrs.product_name?.value
attrs.main_image?.value?.downloadLink        // 1 file — object (v1.0.157)
attrs.main_image?.value?.[0]?.downloadLink   // 2+ files — array

// ❌ Incorrect — spaces, uppercase letters
attrs['Product Name']?.value
attrs['2nd_price']?.value
```

---

## When to Use AttributesSets

| Scenario                                       | Method                                                  |
|------------------------------------------------|--------------------------------------------------------|
| Get a list of fields for a form                | `getAttributesByMarker(setMarker)`                     |
| Get options for a filter (colors, sizes)       | `getAttributesByMarker` → `listTitles`                 |
| Get a single attribute by marker                | `getSingleAttributeByMarkerSet(setMarker, attrMarker)` |
| Get all attribute sets                          | `getAttributes()`                                      |

**DO NOT use AttributesSets to get values of products/pages.** For that, use `Products.getProducts()`, `Pages.getPageByUrl()` etc. — they have `attributeValues` with real data.
