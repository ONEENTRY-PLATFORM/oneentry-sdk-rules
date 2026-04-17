<!-- META
type: rules
fileName: forms.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

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

- `attributes: IFormAttribute[]` — form fields for rendering. Sort by `position`
- `localizeInfos: IFormLocalizeInfo` — form localization: `title`, as well as `titleForSite`, `successMessage`, `unsuccessMessage`, `urlAddress`, `database`, `script`
- `moduleFormConfigs[0].id` — this is `formModuleConfigId` for `postFormsData`
- `moduleFormConfigs[0].entityIdentifiers[0].id` — this is `moduleEntityIdentifier` for `postFormsData`
- `validators[name].errorMessage` — custom error message text for the validator (set in admin panel)
- `additionalFields: Record<marker, IFormAttributeAdditionalField>` — SDK normalizes the array into an object. Contains UI metadata for the field: `placeholder`, `hint`, and others

**Types for form fields — import from `oneentry/dist/forms/formsInterfaces`:**

```ts
import type {
  IFormsEntity,
  IFormAttribute,
  IFormAttributeAdditionalField,
  IFormLocalizeInfo,
} from 'oneentry/dist/forms/formsInterfaces'
```

> ⚠️ For form fields use `IFormAttribute`, not `IAttributesSetsEntity`. `IAttributesSetsEntity` is a type for AttributesSets API (`getAttributes`, `getAttributeSetByMarker`), it has a different structure and lacks form-specific flags (`isLogin`, `isSignUp`, `isNotification*`).

**Using `localizeInfos` of the form:**

```tsx
// Success/error message from form settings in the admin panel
if (result.success) {
  setMessage(form.localizeInfos?.successMessage || 'Submitted')
} else {
  setMessage(form.localizeInfos?.unsuccessMessage || 'Submission failed')
}

// Form title for the site (different from internal title)
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

On error `postFormsData` `IError.message` — an array of strings with field markers or messages. To display custom errors, build a map from the form:

```ts
import type { IFormAttribute } from 'oneentry/dist/forms/formsInterfaces'

// From form attributes, we get custom validator errors
function buildValidatorErrors(attributes: IFormAttribute[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const attr of attributes) {
    // Find the first validator with errorMessage
    const errorMessage = Object.values(attr.validators || {})
      .map((v: any) => v?.errorMessage)
      .find(Boolean)
    if (errorMessage) map[attr.marker] = errorMessage as string
  }
  return map
}

// When handling an error:
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

- `spam` — captcha (reCAPTCHA v3). DO NOT render as `<input>`, use `<FormReCaptcha>`
- `button` — submit button. Render as `<button type="submit">`

---

## postFormsData — three required identifiers

```ts
await getApi().FormData.postFormsData({
  formIdentifier: 'contact_us',           // form marker (from form.identifier)
  formModuleConfigId: 2,                  // from form.moduleFormConfigs[0].id
  moduleEntityIdentifier: 'blog',         // from form.moduleFormConfigs[0].entityIdentifiers[0].id
  replayTo: null,                         // email for reply or null
  status: 'sent',                         // 'sent' | 'draft'
  formData: [...]                         // form field data
})
```

**All three identifiers are required.** Get them from `getFormByMarker`:

```ts
const formModuleConfigId = form.moduleFormConfigs?.[0]?.id ?? 0
const moduleEntityIdentifier = form.moduleFormConfigs?.[0]?.entityIdentifiers?.[0]?.id ?? ''
```

---

## formData — values by field types

Each element of formData: `{ marker, type, value }`. `type` is taken from `attributes[].type`.

### string, integer, float, number

```ts
{ marker: 'first_name', type: 'string', value: 'Ivan' }
{ marker: 'age', type: 'integer', value: 25 }
{ marker: 'price', type: 'float', value: 2.256 }
```

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

For fields `date` / `dateTime` / `time` **always** render the corresponding native picker or library calendar. A regular text input is prohibited: the user will enter a string, it will not pass validation and will not be assembled into the correct `{ fullDate, formattedValue, formatString }`.

| `attribute.type` | Native input | Alternative |
| --- | --- | --- |
| `date` | `<input type="date">` | `react-datepicker`, `react-calendar` |
| `dateTime` | `<input type="datetime-local">` | `react-datepicker` (showTimeSelect) |
| `time` | `<input type="time">` | `react-datepicker` (showTimeSelectOnly) |

**Rules for `formatString` from the schema** (defined in the admin panel via `additionalFields.formatString` or `validators`):

- If a specific format is needed (`DD-MM-YYYY`, `DD-MM-YYYY HH:mm`) — take it from the attribute and use it when constructing `formattedValue`.
- If the format is not specified — apply the default value for the type (`DD-MM-YYYY`, `DD-MM-YYYY HH:mm`, `HH:mm`).

**Assembling value from the native input:**

```ts
// date
const input = '2024-05-07' // value from <input type="date">
const iso = new Date(input + 'T00:00:00Z').toISOString()
const formatted = iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4) // DD-MM-YYYY
const value = { fullDate: iso, formattedValue: formatted, formatString: 'DD-MM-YYYY' }

// dateTime
const input = '2024-05-07T18:30' // value from <input type="datetime-local">
const iso = new Date(input).toISOString()
// formattedValue according to formatString from the attribute schema

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

> ⚠️ Do not confuse with `timeInterval` — this is a list of available slots (see `.claude/rules/attribute-values.md`), rendered as a separate date+slot selector, not an input.

### text — value is an ARRAY with ONE object, only one of htmlValue/plainValue/mdValue

```ts
// ❌ INCORRECT — passing a string
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

### image, groupOfImages — File object

```ts
// A File object is needed (not a URL string!)
const file = await getApi().FileUploading.createFileFromUrl(imageUrl, 'image.png')
{ marker: 'photo', type: 'image', value: [file] }
{ marker: 'gallery', type: 'groupOfImages', value: [file1, file2] }
```

### file — two variants depending on the source

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

---

## Full flow: get form → send data

```ts
// app/actions/forms.ts
'use server'

// ⚠️ message from validators — an array of strings, always normalize
function normalizeError(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}

export async function submitContactForm(formValues: Record<string, any>) {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }

  const formModuleConfig = form.moduleFormConfigs?.[0]

  // Take type from form attributes — do not guess!
  const transformedFormData = (form.attributes as IFormAttribute[])
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

## Response from postFormsData

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
    "parentId": null
  },
  "actionMessage": "Message about successful data processing"
}
```

`result.formData.id` — id of the created record.
