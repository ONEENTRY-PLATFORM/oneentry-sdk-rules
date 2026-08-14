---
paths:
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Forms & FormsData — OneEntry Rules

## getFormByMarker → response structure

```ts
const form = await getApi().Forms.getFormByMarker('contact_us', locale)
```

```json
{
  "id": 3,
  "identifier": "contact_us",
  "attributes": [
    {
      "type": "string",
      "marker": "first_name",
      "position": 1,
      "isVisible": true,
      "listTitles": [],
      "validators": { "requiredValidator": { "strict": true, "errorMessage": "First name is required" } },
      "localizeInfos": { "title": "First name" },
      "additionalFields": { "placeholder": { "marker": "placeholder", "type": "string", "value": "Enter first name" } }
    }
  ],
  "moduleFormConfigs": [
    {
      "id": 2,
      "moduleIdentifier": "content",
      "entityIdentifiers": [{ "id": "blog", "isNested": false }]
    }
  ]
}
```

**Key fields:**

- `attributes: IFormAttribute[]` — form fields for rendering. With SDK ≥ 1.0.157 **already sorted by `position`** (earlier the API returned them mixed and sorting had to be done manually); custom sorting is not needed, but it doesn't hurt
- `localizeInfos: IFormLocalizeInfo` — form localization: `title`, as well as `titleForSite`, `successMessage`, `unsuccessMessage`, `urlAddress`, `database`, `script`
- `moduleFormConfigs[0].id` — this is `formModuleConfigId` for `postFormsData`
- `moduleFormConfigs[0].entityIdentifiers[0].id` — this is `moduleEntityIdentifier` for `postFormsData`
- `validators[name].errorMessage` — custom error text for the validator (set in the admin panel)
- `additionalFields: Record<marker, IFormAttributeAdditionalField>` — SDK normalizes the array into an object. Contains UI metadata for the field: `placeholder`, `hint`, and others
- `type: 'order' | 'sing_in_up' | 'collection' | 'data' | 'rating' | null` — form type (the typo `sing_in_up` — from the API, it is as it is). Based on this, choose behavior: `order` → checkout, `sing_in_up` → authorization/registration, `rating` → reviews/ratings
- `moduleFormConfigs[].exceptionIds?: string[]` — list of excluded identifiers in the module config (for example, entities for which the form does not apply)

> ⚠️ **`attributes` for an empty form.** The API returns `attributes: {}` (an empty object), not `[]`. **With v1.0.158 the SDK normalizes this in `_normalizeAttr`**, so `attributes` — always `IFormAttribute[]`, and `form.attributes.map(...)` is safe on any form.
>
> On SDK ≤ 1.0.157 the object comes as is, and direct `.map`/`.filter`/`.sort` fails with `not a function`. If the project can work on an old SDK — normalize:
>
> ```ts
> const attrs: IFormAttribute[] = Array.isArray(form.attributes)
>   ? form.attributes
>   : Object.values(form.attributes ?? {})
> ```
>
> Regardless of the version: an empty form — a valid state of the project at the filling stage, the UI must degrade (empty field list), not crash.

**Types for form fields — import from the root of the package** (`oneentry`, SDK ≥ 1.0.159):

```ts
import type {
  IFormsEntity,
  IFormAttribute,
  IFormAttributeAdditionalField,
  IFormLocalizeInfo,
} from 'oneentry'
```

> ⚠️ For form fields use `IFormAttribute`, not `IAttributesSetsEntity`. `IAttributesSetsEntity` — this is the type for AttributesSets API (`getAttributes`, `getAttributeSetByMarker`), it has a different structure and lacks form-specific flags (`isLogin`, `isSignUp`, `isNotification*`).

**Using `localizeInfos` of the form:**

```tsx
// Success/error message from form settings in the admin panel
if (result.success) {
  setMessage(form.localizeInfos?.successMessage || 'Submitted')
} else {
  setMessage(form.localizeInfos?.unsuccessMessage || 'Submission failed')
}

// Form title for the site (different from the internal title)
const heading = form.localizeInfos?.titleForSite || form.localizeInfos?.title
```

**Using `additionalFields` when rendering a field:**

```tsx
// ✅ Always use placeholder from additionalFields — do not hardcode!
const placeholder = field.additionalFields?.placeholder?.value || ''
const hint = field.additionalFields?.hint?.value || ''

<input
  id={field.marker}
  type="text"
  placeholder={placeholder}  // ← from additionalFields
  required={!!field.validators?.requiredValidator?.strict}
/>
{hint && <span className="hint">{hint}</span>}
```

**Mapping validator errors:**

When an error occurs in `postFormsData`, `IError.message` — an array of strings with field markers or messages. To display custom errors, build a map from the form:

```ts
import type { IFormAttribute } from 'oneentry'

// From form attributes we get custom validator errors
function buildValidatorErrors(attributes: IFormAttribute[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const attr of attributes) {
    // Look for the first validator with errorMessage
    const errorMessage = Object.values(attr.validators || {})
      .map((v: any) => v?.errorMessage)
      .find(Boolean)
    if (errorMessage) map[attr.marker] = errorMessage as string
  }
  return map
}

// When processing an error:
if (isError(result)) {
  const messages = Array.isArray(result.message) ? result.message : [result.message]
  // Replace marker with custom message if available
  const text = messages.map(m => validatorErrors[m] || m).join('; ')
  return { error: text }
}
```

```ts
const form = await getApi().Forms.getFormByMarker('contact_us')
if (isError(form)) return

const formModuleConfig = form.moduleFormConfigs?.[0]
const formModuleConfigId = formModuleConfig?.id ?? 0
const moduleEntityIdentifier = formModuleConfig?.entityIdentifiers?.[0]?.id ?? ''
```

**Special types of form fields:**

- `spam` — captcha (reCAPTCHA v3 Enterprise). DO NOT render as `<input>`, use `<FormReCaptcha>`.
  siteKey — in `spam.settings.captcha.key` (NOT in `validators`), value of the spam field — object
  `{ event: { token, siteKey } }` (NOT a plain string). The complete verified recipe — skill `/create-captcha`.
- `button` — submit button. Render as `<button type="submit">`

---

## postFormsData — three mandatory identifiers

```ts
await getApi().FormData.postFormsData({
  formIdentifier: 'contact_us',           // form marker (from form.identifier)
  formModuleConfigId: 2,                  // from form.moduleFormConfigs[0].id
  moduleEntityIdentifier: 'blog',         // from form.moduleFormConfigs[0].entityIdentifiers[0].id
  replayTo: null,                         // email for reply or null
  status: '',                             // data-form: '' (verified with working projects)
  formData: [...]                         // form field data
})
```

**All three identifiers are mandatory.** Get them from `getFormByMarker`:

```ts
const formModuleConfigId = form.moduleFormConfigs?.[0]?.id ?? 0
const moduleEntityIdentifier = form.moduleFormConfigs?.[0]?.entityIdentifiers?.[0]?.id ?? ''
```

---

## formData — values by field types

Each element of formData: `{ marker, type, value }`. `type` is taken from `attributes[].type`.

### string, integer, float, real

```ts
{ marker: 'first_name', type: 'string', value: 'Ivan' }
{ marker: 'age', type: 'integer', value: 25 }
{ marker: 'price', type: 'float', value: 2.256 }
```

> **Sending vs reading (v1.0.157).** You can send a number as a string — the body type has been expanded to `string | number | null` (`IBodyTypeStringNumberFloat.value`). However, **when reading** the response (`getFormsDataByMarker`, fields of the sent form), the number always comes as `number` — numerical normalization is now applied to both form attributes and form-data fields that were previously skipped. An unfilled numeric field is `null`, not `0` and not `''`: comparisons like `value === '5'` and `if (!value)` should be reconsidered.
>
> File fields in form-data follow the same rule as entity attributes: one file → object, multiple → array (`IBodyTypeFile.value: IFileValue | IFileValue[]`).

### date, dateTime, time

**Value format (what is sent in postFormsData / createOrder):**

```ts
{
  marker: 'delivery_date',
  type: 'date',
  value: {
    fullDate: '2024-05-07T21:02:00.000Z',
    formattedValue: '08-05-2024 00:02',
    formatString: 'DD-MM-YYYY HH:mm'
  }
}
```

**⚠️ UI — NOT a regular `<input type="text">`**

For `date` / `dateTime` / `time` fields, **always** render the corresponding native picker or library calendar. A regular text input is prohibited: the user will enter a string, it will not pass validation and will not be assembled into the correct `{ fullDate, formattedValue, formatString }`.

| `attribute.type` | Native input | Alternative |
| --- | --- | --- |
| `date` | `<input type="date">` | `react-datepicker`, `react-calendar` |
| `dateTime` | `<input type="datetime-local">` | `react-datepicker` (showTimeSelect) |
| `time` | `<input type="time">` | `react-datepicker` (showTimeSelectOnly) |

**Rules for `formatString` from the schema** (defined in the admin panel via `additionalFields.formatString` or `validators`):

- If a specific format is needed (`DD-MM-YYYY`, `DD-MM-YYYY HH:mm`) — take it from the attribute and use it when building `formattedValue`.
- If no format is specified — apply the default value for the type (`DD-MM-YYYY`, `DD-MM-YYYY HH:mm`, `HH:mm`).

**Assembling value from native input:**

```ts
// date
const input = '2024-05-07' // value from <input type="date">
const iso = new Date(input + 'T00:00:00Z').toISOString()
const formatted = iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4) // DD-MM-YYYY
const value = { fullDate: iso, formattedValue: formatted, formatString: 'DD-MM-YYYY' }

// dateTime
const input = '2024-05-07T18:30' // value from <input type="datetime-local">
const iso = new Date(input).toISOString()
// formattedValue by formatString from the attribute schema

// time — sent with a reference date (usually today)
const input = '14:30' // value from <input type="time">
const [h, m] = input.split(':').map(Number)
const d = new Date(); d.setUTCHours(h, m, 0, 0)
const value = { fullDate: d.toISOString(), formattedValue: input, formatString: 'HH:mm' }
```

**Dynamic rendering of a field in the form (pattern):**

```tsx
if (attr.type === 'date') {
  return <input type="date" id={attr.marker} value={dateStr} onChange={...} />
}
if (attr.type === 'dateTime') {
  return <input type="datetime-local" id={attr.marker} value={dtStr} onChange={...} />
}
if (attr.type === 'time') {
  return <input type="time" id={attr.marker} value={timeStr} onChange={...} />
}
```

> ⚠️ Do not confuse with `timeInterval` — this is a list of available slots (see `.claude/rules/attribute-values.md`), rendered as a separate date+slot selector, not an input. Available slots **are read** via `expandTimeIntervals(schedule, { from, to })` by `field.localizeInfos.intervals[]` (SDK ≥ 1.0.156; the computed field `timeIntervals` has been removed).

### text — value is an ARRAY with ONE object, only one of htmlValue/plainValue/mdValue

```ts
// ❌ INCORRECT — sending a string
{ marker: 'message', type: 'text', value: 'Hello' }

// ✅ CORRECT — an array with one object, only one field
{ marker: 'message', type: 'text', value: [{ plainValue: 'Hello world' }] }
{ marker: 'message', type: 'text', value: [{ htmlValue: '<p>Hello</p>', params: { editorMode: 'html' } }] }
{ marker: 'message', type: 'text', value: [{ mdValue: '**Hello**' }] }
```

### textWithHeader — same as text + header field

```ts
{
  marker: 'content',
  type: 'textWithHeader',
  value: [{
    header: 'Title',
    htmlValue: '<p>Body text</p>',
    params: { isImageCompressed: true, editorMode: 'html' }
  }]
}
```

### list, radioButton — simple format

```ts
// ✅ CORRECT — value is an array of values directly
{ marker: 'topic', type: 'list', value: ['article'] }
{ marker: 'color', type: 'radioButton', value: ['red'] }
```

### entity — numeric ids for pages, strings with prefix for products

```ts
// Pages — numeric ids
{ marker: 'related_page', type: 'entity', value: [25, 32, 24] }

// Products — strings with prefix 'p-[parentId]-[productId]'
{ marker: 'related_product', type: 'entity', value: ['p-1-123', 'p-2-456'] }
```

### timeInterval — array of intervals in ISO 8601

**Sending** the selected slot (format has not changed):

```ts
{
  marker: 'delivery_slot',
  type: 'timeInterval',
  value: [
    ['2025-02-11T16:00:00.000Z', '2025-02-11T18:00:00.000Z']
  ]
}
// value — an array of arrays [startISO, endISO]
```

**Reading** available slots (SDK ≥ 1.0.156) — `expandTimeIntervals` by the field schedules:

```ts
import { expandTimeIntervals } from 'oneentry';

const field = form.attributes.find((a) => a.marker === 'delivery_slot');
const slots = (field?.localizeInfos.intervals ?? []).flatMap((schedule) =>
  expandTimeIntervals(schedule, { from: '2025-02-01', to: '2025-02-28' }),
);
// slots → [[startISO, endISO], ...] (UTC). The ready-made field timeIntervals is no longer available in the SDK.
```

### image, groupOfImages — File object

```ts
// A File object is needed (not a URL string!)
const file = await getApi().FileUploading.createFileFromUrl(imageUrl, 'image.png')
{ marker: 'photo', type: 'image', value: [file] }
{ marker: 'gallery', type: 'groupOfImages', value: [file1, file2] }
```

### file — two options depending on the source

```ts
// New file from user (from <input type="file">):
// value = raw File object (NOT an array), fileQuery indicates where to save
{
  marker: 'document',
  type: 'file',
  value: selectedFile,            // ← File object directly
  fileQuery: { type: 'page', entity: 'editor', id: 4965 }
}

// Already uploaded file (link to existing):
{
  marker: 'document',
  type: 'file',
  value: [{
    filename: 'files/project/page/10/image/doc.pdf',
    downloadLink: 'https://cdn.example.com/files/doc.pdf',
    size: 392585
  }]
}
```

> **Reading saved file field (v1.0.157):** in the response, one file comes as **an object**, not an array with one element; the array remains for two or more. The body type has been expanded: `IBodyTypeFile.value: IFileValue | IFileValue[]`. You can still send it as an array. Read it robustly: `const files = v ? [v].flat() : []`.

---

## Complete flow: get form → send data

```ts
// src/app/actions/forms.ts
'use server'

// ⚠️ message from validators — an array of strings, always normalize
function normalizeError(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}

export async function submitContactForm(formValues: Record<string, any>) {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }

  const formModuleConfig = form.moduleFormConfigs?.[0]

  // With v1.0.158 attributes are always an array; this branch is only needed for SDK ≤ 1.0.157
  const attrs: IFormAttribute[] = Array.isArray(form.attributes)
    ? form.attributes
    : Object.values(form.attributes ?? {})

  // Take type from the form attributes — do not guess!
  const transformedFormData = attrs
    .filter((attr) => attr.marker in formValues)
    .map((attr) => ({
      marker: attr.marker,
      type: attr.type as string,
      value: formValues[attr.marker],
    }))

  const result = await getApi().FormData.postFormsData({
    formIdentifier: form.identifier,
    formModuleConfigId: formModuleConfig?.id ?? 0,
    moduleEntityIdentifier: formModuleConfig?.entityIdentifiers?.[0]?.id ?? '',
    replayTo: null,
    status: 'sent',
    formData: transformedFormData,
  }) as any

  if (isError(result)) return { error: normalizeError(result.message) }

  return { success: true, id: result.formData?.id }
}
```

---

## Response postFormsData

```json
{
  "formData": {
    "id": 3504,
    "formIdentifier": "contact_us",
    "time": "2026-01-28T16:02:04.200Z",
    "entityIdentifier": "blog",
    "formData": [...],
    "isUserAdmin": false,
    "formModuleId": 2,
    "userIdentifier": null,
    "parentId": null,
    "fingerprint": null
  },
  "actionMessage": "Message about successful data processing"
}
```

`result.formData.id` — id of the created record.

> ⚠️ `fingerprint` — now `string | null`. For anonymous submissions and submissions via app-token (without user session) it comes as `null`. Do not rely on its presence — check for `null` before use.
