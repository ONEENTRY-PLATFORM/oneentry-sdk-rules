<!-- META
type: rules
fileName: attribute-sets.md
rulePaths: ["app/**/*.tsx","components/**/*.tsx"],
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Работа с attributeSets — правила OneEntry

## Что возвращают методы AttributesSets

`getAttributes`, `getAttributesByMarker`, `getAttributeSetByMarker`, `getSingleAttributeByMarkerSet` возвращают **схему атрибутов** — структуру полей (marker, type, listTitles, validators). **Это НЕ значения атрибутов сущностей.**

```ts
// ❌ НЕПРАВИЛЬНО — attributeSet не содержит реальных значений товаров/страниц
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const price = attrs[0].value // {} — пусто!

// ✅ ПРАВИЛЬНО — значения берутся из самой сущности
const product = await getApi().Products.getProductById(id)
const price = product.attributeValues.price?.value // реальное значение
```

**Исключение:** `timeInterval` — если в админке включена опция "Receive values", поле `value` будет содержать данные расписания.

---

## Структура объекта атрибута (схема)

```ts
{
  type: "string" | "text" | "image" | "list" | ..., // тип атрибута
  value: {},              // всегда пусто в схеме (кроме timeInterval с включённым Receive values)
  marker: "product_name", // уникальный идентификатор — используется в attributeValues сущности
  position: 1,            // порядок отображения
  listTitles: [...],      // варианты выбора для radioButton и list
  validators: {...},      // правила валидации
  localizeInfos: { title: "Product Name" }, // человекочитаемое название
  additionalFields: [...] // вложенные атрибуты
}
```

---

## listTitles — варианты выбора (radioButton, list)

Используй `listTitles` для отображения опций фильтра или формы:

```ts
const attrs = await getApi().AttributesSets.getAttributesByMarker('products')
const colorAttr = attrs.find((a: any) => a.marker === 'color')

// listTitles содержит варианты для radioButton и list
const options = colorAttr?.listTitles ?? []
// [{ title: "Red", value: "1", extended: { type: "string", value: "#FF0000" }, position: 1 }]

// extended — дополнительное значение (например CSS-цвет для свотча)
const swatches = options.map((opt: any) => ({
  label: opt.title,
  value: opt.value,
  color: opt.extended?.value ?? opt.value, // цвет или fallback на id
}))
```

**Важно:** `value` в listTitles — это ID опции (строка). Именно это значение хранится в `attributeValues` сущности при выборе `radioButton` или `list`.

---

## additionalFields — вложенные атрибуты

```ts
// additionalFields — массив вложенных атрибутов (например, валюта к цене)
{
  type: "float",
  marker: "price",
  additionalFields: [
    { type: "string", value: "USD", marker: "currency" }
  ]
}

// Доступ в attributeValues сущности:
const currency = product.attributeValues.price?.additionalFields?.currency?.value
```

---

## validators — структура

```ts
// requiredValidator — обязательное поле
{ requiredValidator: { strict: true } }

// defaultValueValidator — значение по умолчанию
{ defaultValueValidator: { fieldDefaultValue: "usd" } }

// checkingFilesValidator — ограничения файла
{ checkingFilesValidator: { maxUnits: "kb", maxValue: "2000", extensions: [] } }

// sizeInPixelsValidator — размер изображения
{ sizeInPixelsValidator: { maxX: "500", maxY: "500" } }
```

Используй `validators` при динамической генерации форм (например, поле обязательно если `strict: true`).

---

## Правила именования маркеров

- Только строчные буквы и `_` (нет пробелов)
- Не начинается с цифры
- Уникален в рамках проекта
- Описательный: `product_price`, а не `pp`

```ts
// ✅ Правильно
attrs.product_name?.value
attrs.main_image?.value?.[0]?.downloadLink

// ❌ Неправильно — пробелы, заглавные буквы
attrs['Product Name']?.value
attrs['2nd_price']?.value
```

---

## Когда использовать AttributesSets

| Сценарий                                       | Метод                                                  |
|------------------------------------------------|--------------------------------------------------------|
| Получить список полей для формы                | `getAttributesByMarker(setMarker)`                     |
| Получить варианты для фильтра (цвета, размеры) | `getAttributesByMarker` → `listTitles`                 |
| Получить один атрибут по маркеру               | `getSingleAttributeByMarkerSet(setMarker, attrMarker)` |
| Получить все наборы атрибутов                  | `getAttributes()`                                      |

**НЕ используй AttributesSets для получения значений товаров/страниц.** Для этого используй `Products.getProducts()`, `Pages.getPageByUrl()` и т.д. — у них есть `attributeValues` с реальными данными.
