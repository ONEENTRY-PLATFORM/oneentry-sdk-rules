<!-- META
type: rules
fileName: forms.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Forms & FormsData — OneEntry rules

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
      "validators": { "requiredValidator": { "strict": true } },
      "localizeInfos": { "title": "First name" },
      "additionalFields": []
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

- `attributes[]` — form fields for rendering. Sort by `position`
- `moduleFormConfigs[0].id` — this is `formModuleConfigId` for `postFormsData`
- `moduleFormConfigs[0].entityIdentifiers[0].id` — this is `moduleEntityIdentifier` for `postFormsData`

```ts
const form = await getApi().Forms.getFormByMarker('contact_us')
if (isError(form)) return

const formModuleConfig = form.moduleFormConfigs?.[0]
const formModuleConfigId = formModuleConfig?.id ?? 0
const moduleEntityIdentifier = formModuleConfig?.entityIdentifiers?.[0]?.id ?? ''
```

**Special form field types:**

- `spam` — captcha (reCAPTCHA v3). DO NOT render as `<input>`, use `<FormReCaptcha>`
- `button` — submit button. Render as `<button type="submit">`

---

## postFormsData — three required identifiers

```ts
await getApi().FormData.postFormsData({
  formIdentifier: 'contact_us',           // form marker (from form.identifier)
  formModuleConfigId: 2,                  // from form.moduleFormConfigs[0].id
  moduleEntityIdentifier: 'blog',         // from form.moduleFormConfigs[0].entityIdentifiers[0].id
  replayTo: null,                         // reply-to email or null
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

## formData — values by field type

Each formData element: `{ marker, type, value }`. `type` comes from `attributes[].type`.

### string, integer, float, number

```ts
{ marker: 'first_name', type: 'string', value: 'Ivan' }
{ marker: 'age', type: 'integer', value: 25 }
{ marker: 'price', type: 'float', value: 2.256 }
```

### date, dateTime, time

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

### text — value is an ARRAY with ONE object, only one of htmlValue/plainValue/mdValue

```ts
// ❌ WRONG — passing a string
{ marker: 'message', type: 'text', value: 'Hello' }

// ✅ CORRECT — array with one object, only one field
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

### list, radioButton — wrapped format

```ts
// ❌ WRONG — passing values directly
{ marker: 'topic', type: 'list', value: ['article'] }

// ✅ CORRECT — wrapper with marker, type, value inside
{
  marker: 'topic',
  type: 'list',
  value: [{ marker: 'list', type: 'list', value: ['article'] }]
}
```

### entity — numeric ids for pages, prefixed strings for products

```ts
// Pages — numeric ids
{ marker: 'related_page', type: 'entity', value: [25, 32, 24] }

// Products — strings with prefix 'p-[parentId]-[productId]'
{ marker: 'related_product', type: 'entity', value: ['p-1-123', 'p-2-456'] }
```

### timeInterval — array of ISO 8601 intervals

```ts
{
  marker: 'delivery_slot',
  type: 'timeInterval',
  value: [
    ['2025-02-11T16:00:00.000Z', '2025-02-11T18:00:00.000Z']
  ]
}
// value — array of arrays [startISO, endISO]
```

### image, groupOfImages — File object

```ts
// Requires a File object (not a URL string!)
const file = await getApi().FileUploading.createFileFromUrl(imageUrl, 'image.png')
{ marker: 'photo', type: 'image', value: [file] }
{ marker: 'gallery', type: 'groupOfImages', value: [file1, file2] }
```

### file — two variants depending on source

```ts
// New file from user (from <input type="file">):
// value = raw File object (NOT an array), fileQuery specifies where to save
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

## Full flow: get form → submit data

```ts
// app/actions/forms.ts
'use server'

export async function submitContactForm(formValues: Record<string, any>) {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }

  const formModuleConfig = form.moduleFormConfigs?.[0]

  // Take type from form attributes — don't guess!
  const transformedFormData = form.attributes
    .filter((attr: any) => attr.marker in formValues)
    .map((attr: any) => ({
      marker: attr.marker,
      type: attr.type,
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

  if (isError(result)) return { error: result.message }

  return { success: true, id: result.formData?.id }
}
```

---

## postFormsData response

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
