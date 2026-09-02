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

> `getAttributesByMarker` returns **attributes** (`IAttributesSetsEntity[]`) — as of v1.0.158 this is declared; until 1.0.157 inclusive, `IAttributeSetsEntity[]` (set object) was in d.ts, and the declared type could not be trusted. Type names differ by one letter — check by fields, not by name.

```ts
// ❌ INCORRECT — attributeSet does not contain real values of products/pages
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const price = attrs[0].value // null — empty! (until v1.0.157 it came as {})

// ✅ CORRECT — values are taken from the entity itself
const product = await getApi().Products.getProductById(id)
const price = product.attributeValues.price?.value // real value
```

**Exception:** `timeInterval` — if the "Receive values" option is enabled in the admin panel, the `value` field will contain raw schedule data. Expand ready slots `[[startISO, endISO], ...]` using `expandAttributeTimeIntervals(attr, { from, to })` (SDK ≥ 1.0.156; the computed field `timeIntervals` has been removed from the response). See `.claude/rules/attribute-values.md`.

---

## `initialValue` — default value and UI string dictionary

`value` in the schema is always empty, but **`initialValue` is not**: this is the designated place for the UI text dictionary, editable by the content manager (admin panel → **Settings → Attributes → &lt;set&gt;**). Why exactly the `initialValue` of the set, and not the value of the block — `.claude/rules/admin-api.md`, section "UI Text Dictionary".

⚠️ **The dictionary is created in a set of type `system`.** Such a set is not tied to any record, so the dictionary lives on its own. A set of type `forBlocks`/`forPages` would have to be attached to a specific block or page — creating an unnecessary carrier record with a foreign lifecycle, and values would be edited through its editor. One `system` set = one screen or subsystem (`header`, `footer`, `checkout_cart`, `form_messages`).

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

> ⚠️ `langCode` in `getAttributesByMarker` **is required** in a multilingual route: without it, the SDK initialization language is taken, and all locales will get one language. The cache key must also include the locale — see `.claude/rules/localization.md`.

### Scaling: multiple dictionaries

One `system` set = one screen (`system_header`, `system_cart`, `system_checkout`, …). Then:

- sets are loaded **in parallel** via `Promise.all`, not sequentially;
- the wrapper is React `cache()` (deduplication within a single request) **plus** process-wide TTL cache: `cache()` lives only within the HTTP request, while UI labels change once a month, and without TTL each Server Action pulls all sets again (200–500 ms per page with labels);
- **do not cache empty results.** A OneEntry network failure recorded in the cache for the entire TTL resets labels across the entire site. Cache only non-empty schema — an empty one will fail on fallback and be re-requested;
- the TTL cache must have a cap on the number of records (`Map` + eviction of the first key), otherwise a typo in the marker in a loop grows it endlessly in a long-lived Node process;
- distribute in the tree via Context provider, with each key having a **constant fallback** in the code: the marker may not be present in the admin panel (then create an entry in `MISMATCH-LOG.md`, see `.claude/rules/mismatch-log.md`).

---

## Structure of the attribute object (schema)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // attribute type
  value: null,            // always empty in the schema (v1.0.157: null instead of the previous {});
                          // exception — timeInterval with Receive values enabled
  marker: "product_name", // unique identifier — used in attributeValues of the entity
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
| `listType` | for `entity` — how the list of options is organized (e.g., `"nested"`) |
| `moduleIdentifier` | for `entity` — from which module related entities are taken (e.g., `"catalog"`) |
| `parentId` | id of the parent field, `null` for top-level fields |
| `splitParts` (`number[] \| boolean`) | for fields with a divisible price — ids of fields into which it is split; `false` if the field is not divisible |

⚠️ There, `initialValue` and `isPrice` became **optional**: the API does not return them for some fields (`isPrice` only comes with product sets). Read through `?.`, absence is not an error.

---

## listTitles — selection options (radioButton, list)

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

**Important:** `value` in listTitles — option identifier; type `number | string`, and for `entity` attributes — object `IListTitleEntityValue` (`{ id, depth, parentId, position, isPinned }`). For `radioButton` / `list`, this is usually a string-ID, and it is stored in `attributeValues` of the entity upon selection.

---

## additionalFields — nested attributes

`additionalFields` is configured in the admin panel on the attribute. The **raw** API returns it as an array, but the SDK normalizes it into `Record<marker, field>` **in all contexts** — both in `attributeValues` of entities (Products, Pages, Blocks), and in the schema from `getAttributesByMarker` / `getSingleAttributeByMarkerSet`, and in form attributes. The array remains only with `rawData: true` in the config.

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

## validators — structure

Validators are set in the admin panel on the field of the set (**Validation rules**) and come as an object "name → settings"; `{}` — no rules.

```ts
{ requiredValidator: { strict: true } }                                  // required field
{ requiredValidator: { customErrorText: "Required field!" } }            // also required — strict may be absent
{ stringInspectionValidator: { stringMin: "3", stringMax: "20", stringLength: 0 } } // string length; numbers as strings, 0/'' = not set
{ emailInspectionValidator: true }                                       // email; becomes an object only with customErrorText
{ regExpValidator: { patternValue: "^[0-9+\\- ]{1,20}$", customErrorText: "…" } }
{ fieldMaskValidator: { maskValue: "$99-99-9999-9999", hint: "+62" } }    // input mask and prefix
{ trimValidator: true }                                                  // trim spaces at the edges
{ defaultValueValidator: { fieldDefaultValue: "usd", fieldDefaultValue2: "" } }
{ checkingFilesValidator: { maxUnits: "kb", maxValue: "2000", extensions: [] } }
{ sizeInPixelsValidator: { maxX: "500", maxY: "500" } }
```

How to assemble field props (asterisk, `required`, `minLength`, `pattern`, mask) from this and why `!!validators.requiredValidator?.strict` — is an incorrect check for requiredness — `.claude/rules/forms.md`, section "Field Validators".

⚠️ **In the schema of the set, validators are laid out by locales, just like `initialValue`.**

```ts
// getAttributeSetByMarker(marker, lang) → schema.attributeN.validators
{ en_US: { requiredValidator: { strict: true } }, fr_FR: { emailInspectionValidator: true } }

// getAttributesByMarker(setMarker, langCode) → flat, already under langCode
{ requiredValidator: { strict: true } }
```

Sets of rules in locales **differ**: a field required in `en_US` may have no validators in `fr_FR`. The reader of the schema must expand the language — otherwise `validators.requiredValidator` on the language-keyed object will always be `undefined`, and the form silently loses all checks.

⚠️ **`defaultValueValidator.fieldDefaultValue` — the second place where UI text resides.** In sets of type `system`, the combination `initialValue: null` + `defaultValueValidator.fieldDefaultValue: "Cart is empty"` is found: the label is set by the default value, not the initial value. The dictionary reader should check both places (`initialValue`, then `fieldDefaultValue`) and only then go to the constant fallback in the code.

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

## Field Labels — in the Language of the Person Filling Them Out

Marker (`identifier`) — for code, label (`localizeInfos.{lc}.title`) — for the content manager. They are written immediately upon creating the set, not renamed at the end of the project: instructions for the client are written based on labels, and renaming devalues the already written text.

- **The label answers the question "what to enter here"**, rather than translating the field name: not "Header: video", but "Section title — background video (optional)". It is written for someone who knows nothing about the project.
- **Language — the client's editorial language**, including labels for options in `list` and `radioButton`.
- **The name of the set indicates that it is for the editor**: "Form — report a finding", not `form_report_item`.
- **Labels live in one script dictionary** (e.g., `scripts/admin/labels.mjs`), and each step of the upload takes the title from there. The schema of the set is written in full, and each step writes its own — if labels are duplicated in two places, the panel depends on which script executed last.
- **Neither `undefined` nor internal names (`string_id7`) in the panel.** An unknown system name of a validator is silently accepted by the platform, leaving `undefined` in the panel.

Checking before showing to the client — going through all sets: label with `undefined`; internal key instead of label; label is missing altogether; empty schema for the set referenced by records; trap field (value exists, but it is not displayed anywhere on the showcase). All five — empty.

---

## When to Use AttributesSets

| Scenario                                       | Method                                                  |
|------------------------------------------------|--------------------------------------------------------|
| Get a list of fields for a form                | `getAttributesByMarker(setMarker)`                     |
| Get options for a filter (colors, sizes)       | `getAttributesByMarker` → `listTitles`                 |
| Get one attribute by marker                     | `getSingleAttributeByMarkerSet(setMarker, attrMarker)` |
| Get all attribute sets                          | `getAttributes()`                                      |

**DO NOT use AttributesSets to get values of products/pages.** For that, use `Products.getProducts()`, `Pages.getPageByUrl()`, etc. — they have `attributeValues` with real data.

⚠️ **The order of arguments `getSingleAttributeByMarkerSet(setMarker, attributeMarker, langCode?)` — first the set.** Both parameters are `string`, so swapping them compiles and responds with `404 Attribute not found`, which reads as "no such attribute", not "invalid call". Until v1.0.163, the `IAttributesSets` interface declared them in reverse order — code written according to the declaration built the path `/{attributeMarker}/attributes/{setMarker}` and always got 404; in 1.0.163, the declaration was aligned with the implementation (path `/{setMarker}/attributes/{attributeMarker}`).

⚠️ **The set is created under the entity type.** In the admin panel, they are laid out by types: `forPages`, `forBlocks`, `forProducts`, `forForms`, `forUsers`, and `system`. A `forBlocks` set cannot be assigned to a product, and `forForms` — to a page. The `system` type is not tied to anything and serves as a storage for settings and UI dictionaries (`header`, `footer`, `checkout_cart`, `form_messages` — one set per screen); such sets are read through `getAttributesByMarker` for the sake of `initialValue`.

⚠️ **A set that is already in use is partially locked** — the interface shows "Editing is not available as this attribute set is being used". The composition of fields is thought out before records appear on the set; changing the schema retroactively may not always be possible.

⚠️ **`multiselect` for attributes of type `list`** (declared in `IAttributeSchemaItem` since v1.0.162, in `IFormAttribute` — since v1.0.164): `true` — multiple values are selected from `listTitles`, `false` — one. The flag affects both the control in the UI and the value form; do not assume `list` is always multiple.
