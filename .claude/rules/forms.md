<!-- META
type: rules
fileName: forms.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Forms & FormsData — правила OneEntry

## getFormByMarker → структура ответа

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

**Ключевые поля:**

- `attributes[]` — поля формы для рендера. Сортировать по `position`
- `moduleFormConfigs[0].id` — это `formModuleConfigId` для `postFormsData`
- `moduleFormConfigs[0].entityIdentifiers[0].id` — это `moduleEntityIdentifier` для `postFormsData`

```ts
const form = await getApi().Forms.getFormByMarker('contact_us')
if (isError(form)) return

const formModuleConfig = form.moduleFormConfigs?.[0]
const formModuleConfigId = formModuleConfig?.id ?? 0
const moduleEntityIdentifier = formModuleConfig?.entityIdentifiers?.[0]?.id ?? ''
```

**Специальные типы полей формы:**

- `spam` — капча (reCAPTCHA v3). НЕ рендерить как `<input>`, использовать `<FormReCaptcha>`
- `button` — кнопка отправки. Рендерить как `<button type="submit">`

---

## postFormsData — три обязательных идентификатора

```ts
await getApi().FormData.postFormsData({
  formIdentifier: 'contact_us',           // маркер формы (из form.identifier)
  formModuleConfigId: 2,                  // из form.moduleFormConfigs[0].id
  moduleEntityIdentifier: 'blog',         // из form.moduleFormConfigs[0].entityIdentifiers[0].id
  replayTo: null,                         // email для ответа или null
  status: 'sent',                         // 'sent' | 'draft'
  formData: [...]                         // данные полей формы
})
```

**Все три идентификатора обязательны.** Получай их из `getFormByMarker`:

```ts
const formModuleConfigId = form.moduleFormConfigs?.[0]?.id ?? 0
const moduleEntityIdentifier = form.moduleFormConfigs?.[0]?.entityIdentifiers?.[0]?.id ?? ''
```

---

## formData — значения по типам полей

Каждый элемент formData: `{ marker, type, value }`. `type` берётся из `attributes[].type`.

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

### text — value это МАССИВ с ОДНИМ объектом, только одно из htmlValue/plainValue/mdValue

```ts
// ❌ НЕПРАВИЛЬНО — передавать строку
{ marker: 'message', type: 'text', value: 'Hello' }

// ✅ ПРАВИЛЬНО — массив с одним объектом, только одно поле
{ marker: 'message', type: 'text', value: [{ plainValue: 'Hello world' }] }
{ marker: 'message', type: 'text', value: [{ htmlValue: '<p>Hello</p>', params: { editorMode: 'html' } }] }
{ marker: 'message', type: 'text', value: [{ mdValue: '**Hello**' }] }
```

### textWithHeader — то же что text + поле header

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

### list, radioButton — обёрнутый формат

```ts
// ❌ НЕПРАВИЛЬНО — передавать значения напрямую
{ marker: 'topic', type: 'list', value: ['article'] }

// ✅ ПРАВИЛЬНО — обёртка с marker, type, value внутри
{
  marker: 'topic',
  type: 'list',
  value: [{ marker: 'list', type: 'list', value: ['article'] }]
}
```

### entity — числовые id для страниц, строки с префиксом для продуктов

```ts
// Страницы — числовые id
{ marker: 'related_page', type: 'entity', value: [25, 32, 24] }

// Продукты — строки с префиксом 'p-[parentId]-[productId]'
{ marker: 'related_product', type: 'entity', value: ['p-1-123', 'p-2-456'] }
```

### timeInterval — массив интервалов в ISO 8601

```ts
{
  marker: 'delivery_slot',
  type: 'timeInterval',
  value: [
    ['2025-02-11T16:00:00.000Z', '2025-02-11T18:00:00.000Z']
  ]
}
// value — массив массивов [startISO, endISO]
```

### image, groupOfImages — File объект

```ts
// Нужен File объект (не строка URL!)
const file = await getApi().FileUploading.createFileFromUrl(imageUrl, 'image.png')
{ marker: 'photo', type: 'image', value: [file] }
{ marker: 'gallery', type: 'groupOfImages', value: [file1, file2] }
```

### file — два варианта в зависимости от источника

```ts
// Новый файл от пользователя (из <input type="file">):
// value = raw File объект (НЕ массив), fileQuery указывает куда сохранить
{
  marker: 'document',
  type: 'file',
  value: selectedFile,            // ← File объект напрямую
  fileQuery: { type: 'page', entity: 'editor', id: 4965 }
}

// Уже загруженный файл (ссылка на существующий):
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

## Полный flow: получить форму → отправить данные

```ts
// app/actions/forms.ts
'use server'

export async function submitContactForm(formValues: Record<string, any>) {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }

  const formModuleConfig = form.moduleFormConfigs?.[0]

  // Берём type из attributes формы — не угадываем!
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

## Ответ postFormsData

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

`result.formData.id` — id созданной записи.
