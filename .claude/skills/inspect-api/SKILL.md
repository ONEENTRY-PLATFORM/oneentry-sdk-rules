<!-- META
type: skill
skillConfig: {"name":"inspect-api"}
-->

---
name: inspect-api
description: Прочитать .env.local и выполнить curl-запросы к OneEntry API для получения реальных маркеров, атрибутов и структур данных перед написанием кода
argument-hint: "pages|menus|forms|products|product-statuses|auth-providers|all"
allowed-tools: Read, Bash
---

# Inspect api

Прочитай `.env.local` чтобы найти `NEXT_PUBLIC_ONEENTRY_URL` и `NEXT_PUBLIC_ONEENTRY_TOKEN`. Если файл не найден — попробуй `.env`.

Затем выполни curl-запросы в зависимости от аргумента `$ARGUMENTS`.
Если аргумент не указан или `all` — выполни все запросы ниже.

## Запросы

**pages** — маркеры страниц для `getPageByUrl()`:
```bash
curl -s "https://YOUR_URL/api/content/pages?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Смотри поле `pageUrl` у каждой страницы.

**menus** — маркеры меню для `getMenusByMarker()`:
```bash
curl -s "https://YOUR_URL/api/content/menus?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Смотри поле `identifier`.

**forms** — маркеры форм для `getFormByMarker()`:
```bash
curl -s "https://YOUR_URL/api/content/forms?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Смотри поле `identifier`.

**products** — структура товара, `statusIdentifier`, атрибуты:
```bash
curl -s -X POST \
  "https://YOUR_URL/api/content/products/all?langCode=en_US&limit=1" \
  -H "x-app-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[]" | python -m json.tool
```
Смотри `items[0].statusIdentifier` и `items[0].attributeValues` (все маркеры и типы атрибутов).

**product-statuses** — маркеры статусов для фильтрации по `statusMarker`:
```bash
curl -s "https://YOUR_URL/api/content/product-statuses?langCode=en_US" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Смотри поле `identifier`.

**auth-providers** — маркеры провайдеров для `AuthProvider.auth()`:
```bash
curl -s "https://YOUR_URL/api/auth-providers" \
  -H "x-app-token: YOUR_TOKEN" | python -m json.tool
```
Смотри поле `identifier`.

## Вывод

После выполнения запросов выведи структурированный отчёт:

```md
## Результаты inspect-api

### Pages (маркеры для getPageByUrl)
- "home" — Главная
- "about" — О нас
...

### Menus (маркеры для getMenusByMarker)
- "main_web" — Основное меню
...

### Forms (маркеры для getFormByMarker)
- "reg" — Регистрация
- "login" — Вход
...

### Products (пример атрибутов первого товара)
statusIdentifier: "in_stock"
attributeValues:
  - title (string)
  - price (float)
  - image (image) ← value это МАССИВ, использовать value[0].downloadLink
...

### Product Statuses (маркеры для statusMarker)
- "in_stock"
- "out_of_stock"
...

### Auth Providers (маркеры для AuthProvider.auth)
- "email"
...
```

Если `python` недоступен — используй `python3 -m json.tool` или просто вывести raw JSON.
