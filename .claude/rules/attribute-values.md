<!-- META
type: rules
fileName: attribute-values.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Работа с attributeValues — правила OneEntry

## Доступ к атрибутам

```typescript
const attrs = entity.attributeValues || {};

// Если знаешь маркер — обращайся напрямую (предпочтительно):
const title = attrs.title?.value
const price = attrs.price?.value

// Если не знаешь маркер — ищи по типу:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.[0]?.downloadLink || ''

// Найти все атрибуты определённого типа:
const allImages = Object.values(attrs)
  .filter((a: any) => a?.type === 'image')
  .map((a: any) => a?.value?.[0]?.downloadLink)
  .filter(Boolean)
```

## Типы значений (критически важно!)

| Тип                                   | Доступ к value                                            |
|---------------------------------------|-----------------------------------------------------------|
| `string`, `integer`, `float`, `real`  | `attrs.marker?.value` (примитив)                          |
| `text`                                | `attrs.marker?.value?.htmlValue` или `value.plainValue`   |
| `textWithHeader`                      | `attrs.marker?.value?.header`, `value.htmlValue`          |
| `image`, `groupOfImages`              | `attrs.marker?.value?.[0]?.downloadLink` **(МАССИВ!)**    |
| `file`                                | `attrs.marker?.value?.downloadLink` (объект)              |
| `date`, `dateTime`, `time`            | `attrs.marker?.value?.fullDate` или `value.formattedValue`|
| `list`                                | `attrs.marker?.value` (массив id или объектов с extended) |
| `radioButton`                         | `attrs.marker?.value` (строка-id)                         |
| `entity`                              | `attrs.marker?.value` (массив маркеров)                   |
| `json`                                | `JSON.parse(attrs.marker?.value \|\| '{}')`               |
| `timeInterval`                        | `attrs.marker?.value` → `[[ISO, ISO], ...]`               |
| `spam`                                | капча — рендерить `<FormReCaptcha>`, НЕ `<input>`         |

## ⚠️ image, groupOfImages — value это МАССИВ

```typescript
// ❌ НЕПРАВИЛЬНО
const url = attrs.photo?.value?.downloadLink

// ✅ ПРАВИЛЬНО
const url = attrs.photo?.value?.[0]?.downloadLink
const preview = attrs.photo?.value?.[0]?.previewLink

// Галерея
const gallery = attrs.gallery?.value || []
const urls = gallery.map((img: any) => img.downloadLink)
```

## text — объект с тремя форматами

```typescript
// value всегда объект с htmlValue, plainValue, mdValue
const html = attrs.description?.value?.htmlValue || ''
const plain = attrs.description?.value?.plainValue || ''
// params.editorMode: "html" | "md" | "plain"
```

## textWithHeader — заголовок + тело

```typescript
const header = attrs.specs?.value?.header || ''
const content = attrs.specs?.value?.htmlValue || ''
```

## date / dateTime / time

```typescript
// fullDate — ISO строка, formattedValue — отформатированная
const iso = attrs.releaseDate?.value?.fullDate || ''
const formatted = attrs.releaseDate?.value?.formattedValue || ''
// formatString: "DD-MM-YYYY", "DD-MM-YYYY HH:mm", "HH:mm"
```

## radioButton

```typescript
// value — строка-id выбранного элемента из listTitles
const selectedId = attrs.color?.value || ''
// listTitles[locale]: [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" } }]
```

## list с extended данными (иконки, значки)

```typescript
const badges = attrs.badges?.value || []
const iconUrl = badges[0]?.extended?.value?.downloadLink || ''
const badgeTitle = badges[0]?.title || ''

// Простой list (массив строк-id):
const selectedTags = attrs.tags?.value || []  // ["1", "3", "5"]
```

## entity

```typescript
// value — массив маркеров связанных сущностей
const related = attrs.relatedProducts?.value || []  // ["mouse", "cable"]
```

## json

```typescript
const data = JSON.parse(attrs.customData?.value || '{}')
const width = data.dimensions?.width
```

## timeInterval

```typescript
// value — массив пар [startISO, endISO] в UTC
const intervals = attrs.workingHours?.value || []
// [[ISO, ISO], [ISO, ISO], ...]
const start = intervals[0]?.[0]  // "2026-03-15T09:00:00.000Z"
const end = intervals[0]?.[1]    // "2026-03-15T10:00:00.000Z"
```

**В форме заказа/бронирования** — `value` содержит доступные слоты. Паттерн для календаря:

```typescript
// Слоты для выбранной даты (UTC-сравнение!)
function filterIntervalsByDate(intervals: [string, string][], date: Date) {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([s, e]) => new Date(s) < endOfDay && new Date(e) > startOfDay);
}

// Форматирование времени — из UTC часов!
const h = new Date(startISO).getUTCHours();
const m = new Date(startISO).getUTCMinutes();
const time = `${h}:${m === 0 ? '00' : m}`;   // "10:00"

// Отправка выбранного слота — оборачивать в массив:
{ marker: field.marker, type: 'timeInterval', value: [[startISO, endISO]] }
//                                                   ^^^^ не [startISO, endISO]!
```

> Полный паттерн с calendar picker → skill **`/create-checkout`** (Шаг 3).

## additionalFields — вложенные атрибуты

```typescript
// Цена с валютой
// { type: "float", value: "1299.99", additionalFields: { currency: { type: "string", value: "USD" } } }
const price = attrs.price?.value
const currency = attrs.price?.additionalFields?.currency?.value || 'USD'
const oldPrice = attrs.price?.additionalFields?.oldPrice?.value
```

**Специальные флаги:**

- `isProductPreview: true` — изображение-превью товара
- `isIcon: true` — атрибут является иконкой

## Для блоков страниц — localizeInfos как fallback

```typescript
const attrs = block.attributeValues || {}
const title = attrs.title?.value || block.localizeInfos?.title || ''
```
