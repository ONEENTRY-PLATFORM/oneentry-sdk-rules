<!-- META
type: rules
fileName: attribute-sets.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Working with attributeSets — OneEntry Rules

## What AttributesSets Methods Return

AttributesSets methods return **schema/metadata**, not the attribute values of entities. Distinguish between two forms of response (terminology as in `pages/14-modules-reference.md`):

- **Attribute** (`IAttributesSetsEntity` = `{ marker, type, value, position, listTitles, validators, localizeInfos, additionalFields }`): `getAttributesByMarker(setMarker)` → array of attributes of the set; `getSingleAttributeByMarkerSet(setMarker, attrMarker)` → one attribute.
- **Set** (`IAttributeSetsEntity` = `{ id, identifier, title, schema, type: { id, type }, position }`): `getAttributeSetByMarker(setMarker)` → one set object; `getAttributes()` → `IAttributesSetsResponse` (`{ total, items: IAttributeSetsEntity[] }`) — paginated list of sets.

> `getAttributesByMarker` is incorrectly typed in d.ts as `IAttributeSetsEntity[]`, but actually returns **attributes** — read attribute fields.

```ts
// ❌ INCORRECT — attributeSet does not contain actual values of products/pages
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const price = attrs[0].value // {} — empty!

// ✅ CORRECT — values are taken from the entity itself
const product = await getApi().Products.getProductById(id)
const price = product.attributeValues.price?.value // actual value
```

**Exception:** `timeInterval` — if the "Receive values" option is enabled in the admin panel, the `value` field will contain schedule data.

---

## Structure of the Attribute Object (Schema)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // attribute type
  value: {},              // always empty in the schema (except timeInterval with Receive values enabled)
  marker: "product_name", // unique identifier — used in attributeValues of the entity
  position: 1,            // display order
  listTitles: [...],      // options for radioButton and list
  validators: {...},      // validation rules
  localizeInfos: { title: "Product Name" }, // human-readable title
  additionalFields: {...} // nested attributes (Record, key = marker; array only when rawData)
}
```

---

## listTitles — Options (radioButton, list)

Use `listTitles` to display filter or form options:

```ts
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const colorAttr = attrs.find((a: any) => a.marker === 'color')

// listTitles contains options for radioButton and list
const options = colorAttr?.listTitles ?? []
// [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" }, position: 1 }]

// extended — additional value (e.g., CSS color for swatch)
const swatches = options.map((opt: any) => ({
  label: opt.title,
  value: opt.value,
  color: opt.extended?.value ?? opt.value, // color or fallback to id
}))
```

**Important:** `value` in listTitles — option identifier; type `number | string`, and for `entity` attributes — object `IListTitleEntityValue` (`{ id, depth, parentId, position, isPinned }`). For `radioButton` / `list` this is usually a string-ID, and it is stored in `attributeValues` of the entity upon selection.

---

## additionalFields — Nested Attributes

`additionalFields` is configured in the admin panel on the attribute. The **Raw** API returns it as an array, but the SDK normalizes it to `Record<marker, field>` **in all contexts** — both in `attributeValues` of entities (Products, Pages, Blocks), and in the schema from `getAttributesByMarker` / `getSingleAttributeByMarkerSet`, and in form attributes. The array remains only when `rawData: true` in the config.

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

> ⚠️ Markers of `additionalFields` are defined in the admin panel and are unique to the project. **Do not guess** — inspect via `/inspect-api` or `console.log`. The form is the same in the schema and in `attributeValues` (Record); there is no difference between "array in schema / object in entity".

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
attrs.main_image?.value?.[0]?.downloadLink

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
