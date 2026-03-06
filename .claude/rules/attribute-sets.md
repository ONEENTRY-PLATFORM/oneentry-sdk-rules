<!-- META
type: rules
fileName: attribute-sets.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Working with attributeSets — OneEntry rules

## What AttributesSets methods return

`getAttributes`, `getAttributesByMarker`, `getAttributeSetByMarker`, `getSingleAttributeByMarkerSet` return the **attribute schema** — the structure of fields (marker, type, listTitles, validators). **This is NOT the attribute values of entities.**

```ts
// ❌ WRONG — attributeSet does not contain real values of products/pages
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const price = attrs[0].value // {} — empty!

// ✅ CORRECT — values come from the entity itself
const product = await getApi().Products.getProductById(id)
const price = product.attributeValues.price?.value // real value
```

**Exception:** `timeInterval` — if the "Receive values" option is enabled in the admin panel, the `value` field will contain schedule data.

---

## Attribute object structure (schema)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // attribute type
  value: {},              // always empty in schema (except timeInterval with Receive values enabled)
  marker: "product_name", // unique identifier — used in entity's attributeValues
  position: 1,            // display order
  listTitles: [...],      // options for radioButton and list
  validators: {...},      // validation rules
  localizeInfos: { title: "Product Name" }, // human-readable label
  additionalFields: [...] // nested attributes
}
```

---

## listTitles — selection options (radioButton, list)

Use `listTitles` to render filter or form options:

```ts
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const colorAttr = attrs.find((a: any) => a.marker === 'color')

// listTitles contains options for radioButton and list
const options = colorAttr?.listTitles ?? []
// [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" }, position: 1 }]

// extended — additional value (e.g. CSS color for a swatch)
const swatches = options.map((opt: any) => ({
  label: opt.title,
  value: opt.value,
  color: opt.extended?.value ?? opt.value, // color or fallback to id
}))
```

**Important:** `value` in listTitles is the option ID (string). This is exactly the value stored in entity's `attributeValues` when `radioButton` or `list` is selected.

---

## additionalFields — nested attributes

```ts
// additionalFields — array of nested attributes (e.g. currency for price)
{
  type: "float",
  marker: "price",
  additionalFields: [
    { type: "string", value: "USD", marker: "currency" }
  ]
}

// Access in entity's attributeValues:
const currency = product.attributeValues.price?.additionalFields?.currency?.value
```

---

## validators — structure

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

Use `validators` when dynamically generating forms (e.g. a field is required if `strict: true`).

---

## Marker naming rules

- Lowercase letters and `_` only (no spaces)
- Must not start with a digit
- Unique within the project
- Descriptive: `product_price`, not `pp`

```ts
// ✅ Correct
attrs.product_name?.value
attrs.main_image?.value?.[0]?.downloadLink

// ❌ Wrong — spaces, uppercase letters
attrs['Product Name']?.value
attrs['2nd_price']?.value
```

---

## When to use AttributesSets

| Scenario                                    | Method                                                 |
|---------------------------------------------|--------------------------------------------------------|
| Get list of fields for a form               | `getAttributesByMarker(setMarker)`                     |
| Get options for a filter (colors, sizes)    | `getAttributesByMarker` → `listTitles`                 |
| Get one attribute by marker                 | `getSingleAttributeByMarkerSet(setMarker, attrMarker)` |
| Get all attribute sets                      | `getAttributes()`                                      |

**DO NOT use AttributesSets to get product/page values.** Use `Products.getProducts()`, `Pages.getPageByUrl()`, etc. — they have `attributeValues` with real data.
