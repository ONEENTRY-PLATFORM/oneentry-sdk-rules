---
paths:
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Forms & FormsData — OneEntry Rules

## getFormByMarker → Response Structure

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
      "multiselect": false,
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

**Key Fields:**

- `attributes: IFormAttribute[]` — form fields for rendering. With SDK ≥ 1.0.157 **already sorted by `position`** (previously the API returned them mixed, and sorting had to be done manually); custom sorting is not needed, but it doesn't hurt.
- `localizeInfos: IFormLocalizeInfo` — form localization: `title`, as well as `titleForSite`, `successMessage`, `unsuccessMessage`, `urlAddress`, `database`, `script`.
- `moduleFormConfigs[0].id` — this is `formModuleConfigId` for `postFormsData`.
- `moduleFormConfigs[0].entityIdentifiers[0].id` — this is `moduleEntityIdentifier` for `postFormsData`.
- `validators` — field validation rules set in the admin panel (`{}` — nothing is configured). A complete breakdown is in the "Field Validators" section below; the error text is located in `validators[name].customErrorText`.
- `additionalFields: Record<marker, IFormAttributeAdditionalField>` — SDK normalizes the array into an object. Contains UI metadata for the field: `placeholder`, `hint`, and others.
- `type: 'order' | 'sing_in_up' | 'collection' | 'data' | 'rating' | null` — form type (the typo `sing_in_up` — from the API, it is as it is). Based on this, choose the behavior: `order` → checkout, `sing_in_up` → authorization/registration, `rating` → reviews/ratings.
- `moduleFormConfigs[].exceptionIds?: string[]` — list of excluded identifiers in the module config (for example, entities for which the form does not apply).

> ⚠️ **`attributes` of an empty form.** The API returns `attributes: {}` (an empty object), not `[]`. **With v1.0.158, the SDK normalizes this in `_normalizeAttr`**, so `attributes` — is always `IFormAttribute[]`, and `form.attributes.map(...)` is safe on any form.
>
> On SDK ≤ 1.0.157, the object comes as is, and direct `.map`/`.filter`/`.sort` fails with `not a function`. If the project can work on an old SDK — normalize:
>
> ```ts
> const attrs: IFormAttribute[] = Array.isArray(form.attributes)
>   ? form.attributes
>   : Object.values(form.attributes ?? {})
> ```
>
> Regardless of the version: an empty form — is a valid state of the project at the filling stage, the UI must degrade (empty field list), not crash.

**Types for form fields — import from the root of the package** (`oneentry`, SDK ≥ 1.0.160):

```ts
import type {
  IFormsEntity,
  IFormAttribute,
  IFormAttributeAdditionalField,
  IFormLocalizeInfo,
} from 'oneentry'
```

> ⚠️ For form fields, use `IFormAttribute`, not `IAttributesSetsEntity`. `IAttributesSetsEntity` — is a type for AttributesSets API (`getAttributes`, `getAttributeSetByMarker`), it has a different structure and lacks form-specific flags (`isLogin`, `isSignUp`, `isNotification*`).

**Using `localizeInfos` of the form:**

```tsx
// Success/error message from the form settings in the admin panel
if (result.success) {
  setMessage(form.localizeInfos?.successMessage || 'Submitted')
} else {
  setMessage(form.localizeInfos?.unsuccessMessage || 'Submission failed')
}

// Form title for the site (differs from the internal title)
const heading = form.localizeInfos?.titleForSite || form.localizeInfos?.title
```

**Using `additionalFields` when rendering the field:**

```tsx
// ✅ Always use placeholder from additionalFields — do not hardcode!
const placeholder = field.additionalFields?.placeholder?.value || ''
const hint = field.additionalFields?.hint?.value || ''

<input
  id={field.marker}
  type="text"
  placeholder={placeholder}  // ← from additionalFields
  {...fieldRules(field)}     // ← required/minLength/maxLength/pattern from validators, see below
/>
{hint && <span className="hint">{hint}</span>}
```

---

## Field Validators

`validators` — an object "validator name → its settings", assembled by the content manager in the admin panel (**Attributes → field → Validation rules**). An empty `{}` — means no rules. This is the only source of truth about whether the field is required, what its format is, and what length the value should be: **none of this can be hardcoded in the component** — the admin will enable validation, but the form will not know about it.

The set of validators is extensible (the type `IAttributeValidators` has an index signature) — ignore unfamiliar keys instead of crashing on them: the server-side validation will pass anyway.

| Validator | What Comes | Meaning |
| --- | --- | --- |
| `requiredValidator` | `{ strict: true }`, `{ customErrorText: 'Required field!' }`, sometimes `{}` | Field is required |
| `stringInspectionValidator` | `{ stringMin: '3', stringMax: '20', stringLength: 0 }` | String length: minimum, maximum, exact length |
| `emailInspectionValidator` | `true` **or** `{ customErrorText: 'Email incorrect' }` | Value must be an email |
| `regExpValidator` | `{ patternValue: '^[0-9+\\- ]{1,20}$', customErrorText: '…' }` | Validation by regular expression |
| `fieldMaskValidator` | `{ maskValue: '$99-99-9999-9999', hint: '+62' }` | Input mask with a non-consumable prefix |
| `trimValidator` | `true` | Trim spaces from the edges of the value |
| `defaultValueValidator` | `{ fieldDefaultValue: 'USD', fieldDefaultValue2: '' }` | Default value — the field is pre-filled with it |
| `checkingFilesValidator` | `{ maxUnits: 'kb', maxValue: '2000', extensions: [] }` | File size and extensions |
| `sizeInPixelsValidator` | `{ maxX: '500', maxY: '500' }` | Image size in pixels |

### Five Traps That Cause Validators to Read Incorrectly

1. **Numbers come as strings, and "not set" is `0` or `''`.** `stringMax: '20'`, `stringMin: '3'`, `stringLength: 0 | ''`. Passing as is gives `maxLength={0}` — the field stops accepting input, and comparison `'20' > 5` gives an incorrect result. Normalize: `const n = Number(x); n > 0 ? n : undefined`.
2. **`requiredValidator` can be without `strict`.** In real projects, `{}` and `{ customErrorText: '…' }` are encountered — the admin enabled the rule, but did not check the strict box. Checking `!!v.requiredValidator?.strict` on such a field gives `false`: no asterisks, no `required`, the form goes empty. **The sign of necessity is the presence of the key**, while `strict: true` is a sign of strict mode. Verified by requests: a field with `strict: true`, sent empty, is rejected by the server (`400 … value is missing or incorrect`); the soft variant has not been strictly tested — therefore, place the asterisk and `aria-required` based on the presence of the key, and HTML `required`, blocking submission, — only based on `strict`.
3. **`emailInspectionValidator` — is not an object, but `true`** (it becomes an object only when `customErrorText` is set). `v.emailInspectionValidator?.strict` will not work — check for the presence of the key. And this is **the only** sign of an email field: its `type` is a regular `string`, and guessing by the marker (`marker.includes('email')`) misses `login`, `contact_mail`, `user_mail_id`.
4. **Error text — `customErrorText`, not `errorMessage`.** The field is optional and lies within a specific validator: `validators.stringInspectionValidator.customErrorText`.
5. **In the schema of the set, validators are laid out by locales.** `getFormByMarker` and `getAttributesByMarker(set, langCode)` return them flat, while `getAttributeSetByMarker(...).schema.attributeN.validators` — as `{ en_US: {...}, fr_FR: {...} }`, and the set of rules in locales **differs** (in one, the field is required, in another, it is not). Details — `.claude/rules/attribute-sets.md`.

> `spam` is excluded from this: the captcha `validators` is always `{}`, settings are in `settings.captcha` (see `/create-captcha`). And `isSignUpRequired` for registration form fields is a separate flag, unrelated to `requiredValidator` (`.claude/rules/auth-provider.md`).

### Reading Validators: One Helper for the Whole Form

```ts
import type { IFormAttribute } from 'oneentry'

const positive = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Field rules in a format suitable for input props */
export function fieldRules(attr: IFormAttribute) {
  const v = (attr.validators ?? {}) as Record<string, any>
  const size = v.stringInspectionValidator
  const exact = positive(size?.stringLength)

  return {
    required: 'requiredValidator' in v,          // ← presence of the key, not strict
    strict: v.requiredValidator?.strict === true, // ← strict mode: block submit
    isEmail: 'emailInspectionValidator' in v,
    minLength: exact ?? positive(size?.stringMin),
    maxLength: exact ?? positive(size?.stringMax),
    pattern: v.regExpValidator?.patternValue as string | undefined,
    mask: v.fieldMaskValidator?.maskValue as string | undefined,
    maskPrefix: (v.fieldMaskValidator?.hint as string) ?? '',
    trim: v.trimValidator === true,
    defaultValue: v.defaultValueValidator?.fieldDefaultValue as string | undefined,
  }
}

/** Error text from the admin panel for a specific rule, with a fallback to your own */
export function errorText(attr: IFormAttribute, validator: string, fallback: string): string {
  const v = (attr.validators ?? {}) as Record<string, any>
  return v[validator]?.customErrorText || fallback
}
```

`defaultValue` — is pre-filling: place it in the initial state of the field, not in `placeholder`, otherwise the value will not go into `postFormsData`.

### Required Field: Asterisk and Accessibility

The asterisk next to the label is the standard sign of a required field, and it is drawn **only by the validator**: the list of required fields changes in the admin panel without a front release.

```tsx
const rules = fieldRules(field)
const label = field.localizeInfos?.title ?? field.marker

<label htmlFor={field.marker}>
  {label}
  {/* The symbol is decoration: it tells the screen reader about the requirement via aria-required */}
  {rules.required && <span className="text-red-500" aria-hidden="true"> *</span>}
</label>

<input
  id={field.marker}
  type={rules.isEmail ? 'email' : 'text'}
  required={rules.strict}                       // strictly block submission only when strict
  aria-required={rules.required || undefined}    // "required" — based on the presence of the validator
  aria-invalid={fieldError ? true : undefined}
  aria-describedby={fieldError ? `${field.marker}-error` : undefined}
  minLength={rules.minLength}
  maxLength={rules.maxLength}
  pattern={rules.pattern}
  value={value}
  onChange={(e) => onChange(e.target.value)}
/>
{fieldError && <p id={`${field.marker}-error`} role="alert">{fieldError}</p>}
```

Rules around the asterisk:

- once above the form — legend `* — required fields`; the asterisk itself is marked `aria-hidden`, the requirement is announced through `aria-required`/`required`;
- `required` in HTML is set based on `strict`, while the asterisk and `aria-required` — based on the presence of the validator: soft mode (`{}` / only `customErrorText`) should not block submission on the client side, the decision remains with the server;
- `checkbox` groups and radio buttons are labeled through `<fieldset><legend>` — the asterisk goes in `legend`, not in each option;
- `spam`, `button`, `textWithHeader` labels and asterisks do not receive — they are not input fields.

### Format: pattern, mask, email

```tsx
// regExpValidator → HTML pattern. The regular expression from the admin panel may be broken —
// in JS validation, always use try/catch, otherwise one typo from the content manager crashes the form
function safeRegExp(pattern?: string): RegExp | null {
  if (!pattern) return null
  try { return new RegExp(pattern) } catch { return null }
}

// In <textarea> there is no pattern attribute — check manually before submission
const re = safeRegExp(rules.pattern)
const patternOk = !re || re.test(value)
```

`fieldMaskValidator` — input mask: `#` and `9` in `maskValue` — place for a digit, other characters — separators, and `hint` (`'+62'`) — a prefix that is placed at the beginning and is not editable (the cursor and Backspace should not go behind it). The same string that the user sees goes into `formData` — with separators.

`trimValidator: true` — trim the value both before checking length and before submission: spaces at the edges otherwise consume a character from `stringMax`.

### Client-Side Validation — It's UX, the Server Makes the Decision

HTML attributes and your own validation are not needed "just in case": the server validates fields **in order and returns only the first error**, so without client-side validation, the visitor fixes the form one field at a time per submission.

What actually comes from `postFormsData` (verified against requests to a live project):

```json
{ "statusCode": 400, "message": "formData's marker 'first_nme' value is missing or incorrect" }
```

- `message` — **a string with the marker inside**, not a list of markers (the type is declared as `string | string[]`, so also parse the array);
- **missing and incorrect values are indistinguishable**: a missed required field and a string shorter than `stringMin` give the same phrase;
- `customErrorText` from the admin panel does **not come** in the response — substitute it yourself, matching the marker from the message with the form field;
- for a form with a `spam` field, submission without the spam attribute is rejected earlier in field validation: `formData doesn't have spam attribute`;
- an empty `formData` — `empty form data section`.

```ts
import type { IFormAttribute } from 'oneentry'

// marker → custom text of any of the field validators
function buildValidatorErrors(attributes: IFormAttribute[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const attr of attributes) {
    const text = Object.values(attr.validators ?? {})
      .map((v: any) => v?.customErrorText)
      .find(Boolean)
    if (text) map[attr.marker] = text as string
  }
  return map
}

if (isError(result)) {
  const messages = Array.isArray(result.message) ? result.message : [result.message]
  const text = messages
    .map((m) => {
      // The field marker is embedded in the text: formData's marker 'first_nme' value is …
      const marker = /marker '([^']+)'/.exec(m)?.[1] ?? m
      return validatorErrors[marker] || m
    })
    .join('; ')
  return { error: text }
}
```

> ⚠️ **`postFormsData` accepts only forms of type `data`.** A `sign_in_up` or `order` form sent there responds with `404 Form has incorrect type: sign_in_up`. Registration goes through AuthProvider (`.claude/rules/auth-provider.md`), orders — through Orders (`.claude/rules/orders.md`); check `form.type` before sending.

```ts
const form = await getApi().Forms.getFormByMarker('contact_us')
if (isError(form)) return

const formModuleConfig = form.moduleFormConfigs?.[0]
const formModuleConfigId = formModuleConfig?.id ?? 0
const moduleEntityIdentifier = formModuleConfig?.entityIdentifiers?.[0]?.id ?? ''
```

**Special Form Field Types:**

- `spam` — captcha (reCAPTCHA v3 Enterprise). DO NOT render as `<input>`, use `<FormReCaptcha>`.
  siteKey — in `spam.settings.captcha.key` (NOT in `validators`), value of the spam field — object
  `{ event: { token, siteKey } }` (NOT a plain string). The full verified recipe — skill `/create-captcha`.
- `button` — submit button. Render as `<button type="submit">`

---

## postFormsData — Three Required Identifiers

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

**All three identifiers are required.** Get them from `getFormByMarker`:

```ts
const formModuleConfigId = form.moduleFormConfigs?.[0]?.id ?? 0
const moduleEntityIdentifier = form.moduleFormConfigs?.[0]?.entityIdentifiers?.[0]?.id ?? ''
```

⚠️ **`formModuleConfigId` should be taken from reading the form, not from reading the page.** The page returns the same value, but with a delay — submitting with a "yesterday's" identifier receives `400 Incorrect formIdentifier`.

⚠️ **Binding the form to records is completely replaced.** Editing the form through the admin API with the `formModuleConfigs` field overwrites the set of bindings: missing a field — deletes all bindings **along with the applications received through them**, response `200`. Therefore, when making any edits, always pass the **`id` of the existing binding**, even when the set of pages does not change: without `id`, the binding is recreated, and applications to it are lost. The binding element is `{ formId, moduleId, isGlobal | entityIdentifiers }`, bind **by the page marker, not by numerical id**.

---

## formData — Values by Field Types

Each element of formData: `{ marker, type, value }`. `type` is taken from `attributes[].type`.

### string, integer, float, real

```ts
{ marker: 'first_name', type: 'string', value: 'Ivan' }
{ marker: 'age', type: 'integer', value: 25 }
{ marker: 'price', type: 'float', value: 2.256 }
```

> **Sending vs reading (v1.0.157).** You can send a number as a string — the body type is expanded to `string | number | null` (`IBodyTypeStringNumberFloat.value`). However, **when reading** the response (`getFormsDataByMarker`, fields of the sent form), the number always comes as `number` — numerical normalization is now applied to both form attributes and form-data fields that were previously skipped. An unfilled numeric field is `null`, not `0` and not `''`: comparisons like `value === '5'` and `if (!value)` need to be reviewed.
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

For `date` / `dateTime` / `time` fields, **always** render the corresponding native picker or library calendar. A regular text input — is prohibited: the user will enter a string, it will not pass validation and will not be assembled into the correct `{ fullDate, formattedValue, formatString }`.

| `attribute.type` | Native input | Alternative |
| --- | --- | --- |
| `date` | `<input type="date">` | `react-datepicker`, `react-calendar` |
| `dateTime` | `<input type="datetime-local">` | `react-datepicker` (showTimeSelect) |
| `time` | `<input type="time">` | `react-datepicker` (showTimeSelectOnly) |

**Rules for `formatString` from the schema** (defined in the admin panel via `additionalFields.formatString` or `validators`):

- If a specific format is needed (`DD-MM-YYYY`, `DD-MM-YYYY HH:mm`) — take it from the attribute and use it when building `formattedValue`.
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

**Dynamic rendering of the field in the form (pattern):**

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

// ✅ CORRECT — array with one object, only one field
{ marker: 'message', type: 'text', value: [{ plainValue: 'Hello world' }] }
{ marker: 'message', type: 'text', value: [{ htmlValue: '<p>Hello</p>', params: { editorMode: 'html' } }] }
{ marker: 'message', type: 'text', value: [{ mdValue: '**Hello**' }] }
```

### textWithHeader — the same as text + header field

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

**What to draw `list` with — is determined by `attribute.multiselect`** (declared in types with v1.0.157 in the schema set and with v1.0.164 in `IFormAttribute`; data came earlier but were read as `unknown` due to the index signature):

```tsx
// ✅ multiple options from listTitles or one
attr.multiselect ? <CheckboxGroup … /> : <RadioGroup … />
```

Ignoring the flag means placing a single choice where the question allows multiple answers (and vice versa).

### entity — numeric ids for pages, strings with prefix for products

```ts
// Pages — numeric ids
{ marker: 'related_page', type: 'entity', value: [25, 32, 24] }

// Products — strings with prefix 'p-[parentId]-[productId]'
{ marker: 'related_product', type: 'entity', value: ['p-1-123', 'p-2-456'] }
```

### timeInterval — array of intervals in ISO 8601

**Sending** the selected slot (the format has not changed):

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
// slots → [[startISO, endISO], ...] (UTC). The ready field timeIntervals is no longer in the SDK.
```

### image, groupOfImages — File object

```ts
// A File object is needed (not a URL string!)
const file = await getApi().FileUploading.createFileFromUrl(imageUrl, 'image.png')
{ marker: 'photo', type: 'image', value: [file] }
{ marker: 'gallery', type: 'groupOfImages', value: [file1, file2] }
```

⚠️ **`type` — `'groupOfImages'`, in plural.** Until v1.0.163, the type `IBodyTypeImageGroupOfImages` contained a typo `'groupOfImage'`, and the editor auto-completed it; the API rejects such a value: `400 formData's marker '…' type must be one of […]`.

⚠️ **An already uploaded file is attached in the form as `IImageValue` / `IFileValue`** (`{ filename, downloadLink, size, previewLink?, params? }`) — this is **not** what `FileUploading.upload` returns: it has `contentType`, which form-data rejects (the SDK cuts it out itself when it uploads the file for you).

### file — two variants depending on the source

```ts
// A new file from the user (from <input type="file">):
// value = raw File object (NOT an array), fileQuery indicates where to save
{
  marker: 'document',
  type: 'file',
  value: selectedFile,            // ← File object directly
  fileQuery: { type: 'page', entity: 'editor', id: 4965 }
}

// An already uploaded file (link to an existing one):
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

> **Reading the saved file field (v1.0.157):** in the response, one file comes **as an object**, not as an array of one element; the array remains when there are two or more. The body type is expanded: `IBodyTypeFile.value: IFileValue | IFileValue[]`. You can still send it as an array. Read resiliently: `const files = v ? [v].flat() : []`.

---

## Complete Flow: Get Form → Submit Data

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

  // With v1.0.158 attributes are always an array; this branch is needed only for SDK ≤ 1.0.157
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
    "parentId": null,
    "fingerprint": null
  },
  "actionMessage": "Message about successful data processing"
}
```

`result.formData.id` — id of the created record.

> ⚠️ `fingerprint` — is now `string | null`. For anonymous submissions and submissions via app-token (without user session), it comes as `null`. Do not rely on its presence — check for `null` before use.
