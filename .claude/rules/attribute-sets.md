<!-- META
type: rules
fileName: attribute-sets.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Working with attributeSets — OneEntry Rules

## What the AttributesSets methods return

`getAttributes`, `getAttributesByMarker`, `getAttributeSetByMarker`, `getSingleAttributeByMarkerSet` return a **schema of attributes** — a structure of fields (marker, type, listTitles, validators). **These are NOT the values of entity attributes.**

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

## Structure of the attribute object (schema)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // attribute type
  value: {},              // always empty in the schema (except for timeInterval with Receive values enabled)
  marker: "product_name", // unique identifier — used in the attributeValues of the entity
  position: 1,            // display order
  listTitles: [...],      // options for radioButton and list
  validators: {...},      // validation rules
  localizeInfos: { title: "Product Name" }, // human-readable name
  additionalFields: [...] // nested attributes
}
```

---

## listTitles — options (radioButton, list)

Use `listTitles` to display filter or form options:

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

**Important:** `value` in listTitles — this is the ID of the option (string). This value is stored in the `attributeValues` of the entity when selecting `radioButton` or `list`.

---

## additionalFields — nested attributes

```ts
// additionalFields — array of nested attributes (e.g., currency for price)
{
  type: "float",
  marker: "price",
  additionalFields: [
    { type: "string", value: "USD", marker: "currency" }
  ]
}

// Access in the attributeValues of the entity:
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

Use `validators` when dynamically generating forms (for example, a field is required if `strict: true`).

---

## Naming rules for markers

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

## When to use AttributesSets

| Scenario                                       | Method                                                  |
|------------------------------------------------|--------------------------------------------------------|
| Get a list of fields for a form                | `getAttributesByMarker(setMarker)`                     |
| Get options for a filter (colors, sizes)       | `getAttributesByMarker` → `listTitles`                 |
| Get a single attribute by marker                | `getSingleAttributeByMarkerSet(setMarker, attrMarker)` |
| Get all attribute sets                          | `getAttributes()`                                      |

**DO NOT use AttributesSets to get values of products/pages.** For that, use `Products.getProducts()`, `Pages.getPageByUrl()`, etc. — they have `attributeValues` with actual data.
