# О проекте

oneentry — OneEntry NPM package

**Документация SDK:** https://js-sdk.oneentry.cloud/docs/index/

## Контекст проекта

**Что такое OneEntry:**
OneEntry — headless CMS для e-commerce и контент-проектов.

**SDK позволяет:**

- Управлять каталогом товаров, категориями
- Создавать и обрабатывать заказы
- Работать с авторизацией и профилями
- Интегрировать платежные системы
- Управлять многоязычным контентом
- Работать с формами, меню, страницами и множеством других сущностей

## Инструкции для AI

### 🗂️ Временные файлы — только в `.claude/temp/`

При работе над проектом AI часто создаёт временные скрипты для инспекции API, тестирования, отладки (`_inspect.mjs`, `test.ts`, `debug.js` и т.д.).

**Правило:**

- Все временные файлы создавать **только** в `.claude/temp/`
- Папка `.claude/temp/` существует на протяжении всего проекта — файлы из неё можно переиспользовать между сессиями
- По окончании задачи, где временный файл больше не нужен — удалять его
- **НИКОГДА** не оставлять временные файлы в корне проекта или других папках

```text
.claude/
  temp/
    inspect-api.mjs     ← скрипты инспекции API
    debug-blocks.mjs    ← отладочные скрипты
    test-auth.mjs       ← тесты авторизации
```

---

### 🗂️ Структура папки `components/`

**НИКОГДА** не складывай компоненты в плоскую папку `components/`. Всегда раскладывай по логическим группам:

```text
components/
  layout/       ← Navbar, Footer, NavLoader, NavbarSkeleton
  product/      ← ProductCard, ProductCardSkeleton, ProductGallery, RelatedProductsSlider
  catalog/      ← CatalogSection, FilterPanel, InfiniteProductGrid, Pagination
  cart/         ← CartDrawer, AddToCartButton, AddBundleToCartButton
  favorites/    ← FavoriteButton
  search/       ← SearchBar
  user/         ← UserStateSync, ProfileForm
  ui/           ← переиспользуемые примитивы (Button, Modal, Skeleton и т.д.)
```

**Правила:**

- При создании нового компонента — сразу определи к какой группе он относится
- Если компонент не вписывается ни в одну группу — создай новую с понятным названием
- `ui/` — только для универсальных переиспользуемых примитивов без бизнес-логики

---

При генерации кода с OneEntry SDK **ВСЕГДА**:

### ⚠️ КРИТИЧЕСКИ ВАЖНО: Проверка типов ПЕРЕД написанием кода и их использование

#### ВСЕГДА проверяй структуру данных в SDK ПЕРЕД написанием кода

`node_modules/oneentry/dist/` содержит все интерфейсы (IProductsEntity, IBlockEntity, IAuthPostBody и т.д.). Используй `grep` для поиска интерфейсов ПЕРЕД написанием кода.

```bash
# Найти интерфейс
grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10

# Найти сигнатуру метода
grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts" -A 5
```

**НИКОГДА НЕ ВЫДУМЫВАЙ структуру ДАННЫХ!** Даже если примеры в документации выглядят по-другому - проверяй реальные типы TypeScript.
**НИКОГДА НЕ ВЫДУМЫВАЙ ДАННЫЕ! Всегда получай из API (Pages, Menus, Products, Blocks и другие сущности). Не знаешь откуда взять данные → СПРОСИ У ПОЛЬЗОВАТЕЛЯ. Это КРИТИЧЕСКИ ВАЖНО!**

#### Импортируй типы из SDK

(`oneentry/dist/.../...Interfaces`)

#### Проверяй результат каждого API вызова

### 🚫 ЗАПРЕЩЕНО использовать `as any` и `any[]`

Вместо `as any` — всегда импортируй тип из `oneentry/dist/`:

- `import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces'`
- `import type { IProductsResponse, IProductsEntity } from 'oneentry/dist/products/productsInterfaces'`

Исключение: SDK сам объявляет поле как `any` (например `ILocalizeInfo`, `IError`) — тогда `as any` не нужен вообще.

### 🔍 Чек-лист перед написанием кода

**ВСЕГДА проверяй ДО генерации кода:**

1. ☑️ **Откуда данные?**
   - Есть API метод? → Используй его
   - Нет API метода? → СПРОСИ У ПОЛЬЗОВАТЕЛЯ откуда взять данные
   - НЕ выдумывай источник данных!
1. ☑️ **Проверил ли типы в SDK?**
   - **КРИТИЧЕСКИ ВАЖНО:** ВСЕГДА проверяй интерфейсы ПЕРЕД написанием кода!
   - Используй grep: `grep -r "interface IAuthPostBody" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   - Проверь сигнатуру метода: `grep -r "auth(marker" node_modules/oneentry/dist --include="*.d.ts"`
   - НЕ полагайся на примеры из документации - они могут быть устаревшими!
   - НЕ выдумывай структуру данных - проверяй реальные типы TypeScript!
1. ☑️ **Знаешь ли структуру данных?**
   - 1️⃣ Сначала смотри тип в SDK (`node_modules/oneentry/dist/`)
   - 2️⃣ Затем делай реальный вызов и смотри данные (`console.log`)
   - НЕ угадывай поля объектов!
1. ☑️ **Нужен ли marker?**
   - Метод требует marker? → запусти **`/inspect-api`** чтобы увидеть реальные маркеры из API
   - Нет доступа к Bash? → СПРОСИ У ПОЛЬЗОВАТЕЛЯ какой маркер
   - НЕ угадывай маркеры типа 'main', 'header', 'footer'!
1. ☑️ **Правильный ли langCode?**
   - Есть params в Next.js? → Используй его (не забудь await в Next.js 15+/16!)
   - НЕ хардкодь 'en_US' в компонентах! Язык по умолчанию и так установлен и поле langCode не обязательное.
   - Правила локализации: `.claude/rules/localization.md`
1. ☑️ **Используешь params в Next.js 15+/16?**
   - Функция async? → Да, обязательно!
   - Тип params: `Promise<{...}>`? → Да, это Promise!
   - Awaited params? → `const { locale } = await params;`
   - НЕ забывай await - иначе получишь undefined!
1. ☑️ **Нужна ли трансформация данных?**
   - Данные из API уже в нужном формате? → Используй напрямую
   - НЕ создавай промежуточные объекты без необходимости!
1. ☑️ **Компонент требует SDK (форма, авторизация, данные)?**
   - Пользователь дал верстку формы/компонента → СРАЗУ подключай к SDK, не создавай сначала статическую заглушку
   - Нужен маркер → запусти **`/inspect-api`** ДО написания компонента
   - Нужен Server Action → создай его ВМЕСТЕ с компонентом в одном шаге
   - **НИКОГДА** не откладывай подключение к SDK на «потом»

#### 🛑 Когда ОСТАНОВИТЬСЯ и СПРОСИТЬ у пользователя

**НЕ пиши код если:**

1. ❓ **Не проверил типы в SDK**
   → СНАЧАЛА: `grep -r "interface I[ИмяТипа]" node_modules/oneentry/dist --include="*.d.ts" -A 10`
   → Пример: Перед использованием `getApi().AuthProvider.auth()` ОБЯЗАТЕЛЬНО проверь структуру IAuthPostBody
1. ❓ **Не знаешь маркер** для Menus, Forms, Orders, Blocks, AuthProvider и так далее
   → Запусти **`/inspect-api`** — вернёт реальные маркеры из API
   → Нет Bash доступа: Для AuthProvider — `getApi().AuthProvider.getAuthProviders()`, для Forms — `getApi().Forms.getAllForms()`
   → Ничего не помогло: Спроси: "Какой маркер использовать для [название]?"
1. ❓ **Получаешь 403 Forbidden**
   → Проверь: вызываешь ли `AuthProvider.auth/signUp/generateCode` через Server Action? → перенеси в Client Component (fingerprint)
   → Или проверь права группы пользователей в админке (`PROJECT_URL/users/groups`)
1. ❓ **Не видел верстку** но нужно создать компонент
   → Спроси: "Есть ли пример верстки/дизайна для этого компонента?"
1. ❓ **Есть верстка, но не знаешь маркер** для подключения к SDK
   → Сначала запусти **`/inspect-api`**, получи маркер — и только потом создавай компонент уже подключённым
   → НЕ создавай статическую заглушку с намерением «подключить позже»
1. ❓ **Не понимаешь откуда брать данные**
   → Спроси: "Откуда должны браться данные для [компонент]?"
1. ❓ **Есть несколько вариантов решения**
   → Предложи варианты: "Можно сделать X или Y, какой вариант предпочитаешь?"

### Обязательно

1. **💰 ЭКОНОМЬ ТОКЕНЫ: Не исправляй линтинг, форматирование, мелкие warning'и. Оставь эту работу пользователю. Фокусируйся на главной задаче.**
1. **🎯 ПИШИ КОД ПО ПРАВИЛАМ ЛИНТЕРА: При написании нового кода всегда соблюдай настройки линтера проекта (ESLint, Prettier и т.д.). Проверяй конфиг линтера в проекте перед написанием кода, если не знаешь настройки.**
1. **🎨 ТОЧНО КОПИРУЙ ВЕРСТКУ: Если пользователь предоставил верстку (HTML/JSX), копируй её точно, особенно если используется тот же фреймворк (например Tailwind CSS). Не изменяй классы, структуру и стили без явной необходимости. Только заменяй хардкод данными из API.**
1. **🔌 СРАЗУ ПОДКЛЮЧАЙ К SDK: Если пользователь предоставил верстку компонента, который должен работать с SDK (форма авторизации, форма заказа, данные из CMS) — НИКОГДА не создавай сначала статическую UI-заглушку. Сразу: (1) запусти `/inspect-api` чтобы получить маркеры, (2) создай Server Action, (3) подключи компонент к SDK — всё в одном шаге.**
1. **📋 ФОРМЫ ВСЕГДА ДИНАМИЧЕСКИЕ: НИКОГДА не хардкодь поля формы (`<input>` с захардкоженным `name`/`type`). Всегда получай поля через `getFormByMarker(marker)` и рендери их динамически по `attribute.type` и `attribute.marker`. Верстка пользователя задаёт только визуальный стиль — поля берутся из API.**
1. **❓ СПРАШИВАЙ МАРКЕРЫ:** Многие методы API требуют marker (Menus.getMenusByMarker и т.д.), но нет методов "получить все". НЕ УГАДЫВАЙ маркеры типа 'main', 'footer', 'header'. ВСЕГДА спрашивай у пользователя какой marker использовать для нужной сущности.
1. Для AuthProvider можно получить список провайдеров: `getApi().AuthProvider.getAuthProviders()` чтобы узнать доступные маркеры. Для Forms можно получить список форм: `getApi().Forms.getAllForms()` чтобы узнать доступные маркеры. и т.д.
1. Создать type guard `isError`
1. Использовать async/await
1. **Выносить api инстанс в отдельный файл (singleton). Использовать `getApi()` для получения текущего экземпляра. НЕ создавать новые инстансы `defineOneEntry()` в компонентах — использовать `reDefine()` для изменения конфигурации (refreshToken, langCode)**
1. **🚨 ОДИН API инстанс на группу user-authorized вызовов: Каждый вызов `defineOneEntry(url, { auth: { refreshToken } })` вызывает `/refresh` и сжигает токен. НИКОГДА не вызывай `makeUserApi(refreshToken)` несколько раз с одним токеном. Объединяй все связанные вызовы в ОДНУ Server Action с ОДНИМ инстансом:**

   ```typescript
   // ❌ НЕПРАВИЛЬНО — токен сожжён первой функцией, вторая получает 401
   const storages = await getAllOrdersStorage(refreshToken);
   const orders = await getAllOrdersByMarker(marker, refreshToken); // 401!

   // ✅ ПРАВИЛЬНО — один инстанс для всех вызовов
   export async function loadAllOrders(refreshToken: string) {
     const { api } = makeUserApi(refreshToken); // единственный /refresh
     const storages = await api.Orders.getAllOrdersStorage(); // ← используем api, не getApi()!
     const orders = await api.Orders.getAllOrdersByMarker(marker); // ← используем api, не getApi()!
     return orders;
   }
   ```

1. Указывать правильные TypeScript типы
1. **При создании страниц получать контент из CMS Pages, а не хардкодить**
1. **При работе с attributeValues: если ЗНАЕШЬ marker (имя атрибута), обращайся напрямую `attrs.title?.value`. Если НЕ знаешь - спроси у пользователя или ищи по типу если пользователь тоже не знает `Object.values(attrs).find(a => a.type === 'image')`**
1. **🚨 ПЕРЕД написанием кода доступа к атрибуту — ВСЕГДА проверяй его `type`, затем используй правильную структуру `value` для этого типа. НЕ угадывай структуру! Таблица типов:**
   - `string`, `integer`, `real`, `float` → `attrs.marker?.value` (примитив)
   - `text` → `attrs.marker?.value?.htmlValue` или `value.plainValue` (объект с полями)
   - `textWithHeader` → `attrs.marker?.value?.header`, `value.htmlValue`
   - `image`, `groupOfImages` → `attrs.marker?.value?.[0]?.downloadLink` (МАССИВ!)
   - `file` → `attrs.marker?.value?.downloadLink` (объект)
   - `date`, `dateTime`, `time` → `attrs.marker?.value?.fullDate` или `value.formattedValue`
   - `radioButton` → `attrs.marker?.value` (строка-id)
   - `list` → `attrs.marker?.value` (массив id или объектов с extended)
   - `entity` → `attrs.marker?.value` (массив маркеров)
   - `json` → `JSON.parse(attrs.marker?.value || '{}')`
   - `spam` → **поле капчи (Google reCAPTCHA v3 Enterprise)** — НЕ рендерить как `<input>`! Рендерить компонент `FormReCaptcha`. ⚠️ Тип называется `'spam'`, не `'captcha'`
   - **Если не знаешь тип атрибута — сначала добавь `console.log` чтобы увидеть данные, и только потом пиши код**
1. **Для типа "image, groupOfImages" value это МАССИВ, брать `value[0].downloadLink`, а не просто `value`**
1. SDK работает как на сервере, так и на клиенте (`NEXT_PUBLIC_*` переменные доступны в обоих контекстах). Выбор между Server Component / Server Action / Client Component — вопрос **стратегии рендеринга**, а не ограничений SDK. Исключение: `AuthProvider.auth/signUp/generateCode` — **только клиент** (fingerprint устройства).

### ВАЖНО: Разрешения API и ограничения количества записей

По умолчанию в OneEntry для группы пользователей "Гости" установлено ограничение **максимум 10 объектов** для сущностей (Pages, Products и т.д.).

**Перед использованием запросов сущностей:**

1. Открой админку: `PROJECT_URL/users/groups/edit-group/1?tab`
1. Для каждой сущности (Pages, Products, Forms и т.д.) измени разрешения:
   - **Read: Yes, with restriction - with restriction on the number of records**
   - → переключи на **without restrictions**
1. Это позволит получать **все сущности без ограничений** по количеству

**Пример:**

```text
https://react-native-course.oneentry.cloud/users/groups/edit-group/1?tab
→ Pages: Read → without restrictions
→ Products: Read → without restrictions
```

Без этой настройки `getPages()`, `getProducts()` и другие методы вернут максимум 10 записей!

### Рекомендуется

1. Обрабатывать пагинацию для списков
1. Передавать `langCode` из контекста (i18n)
1. Использовать маркеры вместо ID где возможно
1. Добавлять loading состояния
1. Всегда проверять результат через `isError` guard

### Работа со страницами

Когда пользователь просит создать страницу, **ВСЕГДА** получать контент из CMS Pages, а не хардкодить. Использовать `getPageByUrl(url)` и `getBlocksByPageUrl(url)`. Главная страница обычно имеет URL `'home'`.

> Паттерн страницы: `.claude/rules/nextjs-pages.md` | Skill: **`/create-page`**

### Контексты вызова SDK (Next.js)

SDK изоморфный — работает и на сервере, и на клиенте. Выбор контекста зависит от стратегии рендеринга:

- **SSR/SSG/ISR** → Server Component / `generateStaticParams` / `revalidate`
- **Мутации, серверная логика** → Server Action (`'use server'`)
- **CSR, динамика, поиск** → Client Component (`'use client'`) напрямую через `getApi()`
- **Пользовательские данные** (Orders, Users, Payments) → Server Action с `makeUserApi()` или Client с `reDefine()`

**Единственное жёсткое ограничение:** `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **только из Client Component** (на сервере `deviceInfo.browser` в fingerprint будет серверным, а не реальным браузером пользователя).

> Правила Server Actions: `.claude/rules/server-actions.md` | Правила авторизации: `.claude/rules/auth-provider.md`

## Инициализация SDK

> **Быстрая инициализация нового проекта:** используй skill **`/setup-oneentry`** — создаст `lib/oneentry.ts`, настроит `next.config.ts` и покажет нужные переменные окружения.

### Минимальная настройка

```typescript
const api = defineOneEntry('https://your-project.oneentry.cloud', {
  token: 'your-api-token'
})
```

### Рекомендуемая настройка (production)

```typescript
const api = defineOneEntry(process.env.ONEENTRY_URL, {
  token: process.env.ONEENTRY_TOKEN,
  langCode: 'en_US',
  validation: {
    enabled: process.env.NODE_ENV === 'development',
    strictMode: false,
    logErrors: true,
  }
})
```

### Интеграция с Next.js (Singleton паттерн)

**Настройка `.env.local`:**

Если файл `.env.local` не существует — создай его и спроси у пользователя URL проекта и App Token (Settings → App Token в админке OneEntry).

```env
NEXT_PUBLIC_ONEENTRY_URL=https://your-project.oneentry.cloud
NEXT_PUBLIC_ONEENTRY_TOKEN=your-app-token
```

> `NEXT_PUBLIC_` — переменные доступны и на сервере, и на клиенте. Это позволяет использовать SDK в обоих контекстах.

Файл `lib/oneentry.ts` содержит три экспорта:

- **`getApi()`** — возвращает текущий API инстанс. Используй везде для публичных запросов (работает и на сервере, и на клиенте)
- **`reDefine(refreshToken, langCode)`** — пересоздаёт инстанс с пользовательским токеном (вызывать после логина **на клиенте**)
- **`makeUserApi(refreshToken)`** — одноразовый user-auth инстанс для Server Actions. ⚠️ Каждый вызов сжигает токен через `/refresh` — создавай один раз на функцию

Правила работы с токенами вынесены в `.claude/rules/tokens.md` (загружается автоматически при работе с `app/actions/**/*.ts`).

**⚠️ ОДИН `makeUserApi` на всю Server Action:**

```typescript
// ❌ НЕПРАВИЛЬНО — токен сожжён первым вызовом, второй → 401
const storages = await getAllOrdersStorage(refreshToken);
const orders = await getAllOrdersByMarker(marker, refreshToken);

// ✅ ПРАВИЛЬНО — один инстанс, все запросы через него
export async function loadAllOrders(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const storages = await api.Orders.getAllOrdersStorage();
  const orders = await api.Orders.getAllOrdersByMarker(marker);
  return { orders, newToken: getNewToken() };
}
```

**ВАЖНО: `next.config.ts` — добавь `remotePatterns` для изображений `*.oneentry.cloud`, иначе `next/image` выдаст ошибку.**

### Контексты выполнения SDK (Server vs Client)

SDK работает **как на сервере, так и на клиенте** — переменные окружения `NEXT_PUBLIC_*` доступны в обоих контекстах. Выбор контекста зависит от стратегии рендеринга Next.js и типа операции.

| Стратегия | Где выполняется | Пример использования |
|---|---|---|
| **SSR** (Server Component) | Сервер | Каталог, страницы, меню, блоки |
| **SSG** (`generateStaticParams`) | Сервер (build-time) | Генерация статических маршрутов продуктов |
| **ISR** (`revalidate`) | Сервер (периодически) | Контент с редким обновлением |
| **CSR** (Client Component) | Клиент (браузер) | Авторизация, динамические данные, поиск |
| **Server Action** (`'use server'`) | Сервер | Мутации, отправка форм, user-authorized данные |

```tsx
// SSR — Server Component
export default async function CatalogPage({ params }) {
  const { locale } = await params;
  const products = await getApi().Products.getProducts({ langCode: locale });
  // ...
}

// SSG — генерация статических путей
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 });
  if (isError(products)) return [];
  return products.map(p => ({ id: String(p.id) }));
}

// ISR — инкрементальная регенерация
export const revalidate = 3600; // обновлять раз в час

// CSR — Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const results = await getApi().Products.searchProducts({ name: query });
```

### ⚠️ Авторизация — ТОЛЬКО на клиенте (fingerprint)

SDK при авторизации передаёт **fingerprint устройства** пользователя. На сервере SDK тоже генерирует fingerprint, но в `deviceInfo.browser` будет `"Node.js/..."` вместо реального браузера пользователя. Поэтому `auth()` / `signUp()` лучше вызывать с клиента.

```tsx
// ❌ НЕЖЕЛАТЕЛЬНО — auth через Server Action (deviceInfo.browser = "Node.js/...", не реальный браузер)
// app/actions/auth.ts
'use server';
export async function signIn(authData) {
  return await getApi().AuthProvider.auth('email', { authData }); // browser в fingerprint = Node.js
}

// ✅ ПРАВИЛЬНО — auth напрямую из Client Component (fingerprint = браузер пользователя)
// components/AuthForm.tsx
'use client';
import { getApi, isError } from '@/lib/oneentry';

async function handleSignIn(authData) {
  const result = await getApi().AuthProvider.auth('email', { authData });
  if (isError(result)) { /* обработка ошибки */ return; }
  localStorage.setItem('accessToken', result.accessToken);
  localStorage.setItem('refreshToken', result.refreshToken);
}
```

> Подробные правила авторизации: `.claude/rules/auth-provider.md`

### Сводка: что где вызывать

| Операция | Контекст | Почему |
|---|---|---|
| Публичные данные (Pages, Products, Menus, Blocks) | Server Component / Server Action / Client Component | Нет ограничений — зависит от стратегии рендеринга |
| Авторизация (auth, signUp, generateCode) | **Только Client Component** | Fingerprint устройства |
| Пользовательские данные (Orders, Users, Payments) | Server Action (`makeUserApi`) или Client (`reDefine`) | Зависит от архитектуры |
| Формы и отправка данных | Server Action или Client Component | Зависит от стратегии |

### ⚠️ params и searchParams в Next.js 15+/16 — это Promise

В Next.js 15+ `params` и `searchParams` являются Promise. Правила для страниц вынесены в `.claude/rules/nextjs-pages.md` (загружается автоматически при работе с `page.tsx` / `layout.tsx`).
Правила локализации вынесены в `.claude/rules/localization.md` (загружается автоматически при работе с `page.tsx`, `layout.tsx`, `app/actions/**/*.ts`).
Кратко:

```tsx
// ✅ Всегда await params
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

## Обработка ошибок

SDK по умолчанию (`isShell: true`) возвращает ошибки как объект `IError`, а не выбрасывает исключение. Используй `isError` guard для проверки.

Если SDK инициализирован с `isShell: false` — он выбрасывает исключения, используй `try/catch`.

```typescript
function isError(result: any): result is IError {
  return result !== null && typeof result === 'object' && 'statusCode' in result
}

async function getProduct(id: number) {
  const product = await getApi().Products.getProductById(id)

  if (isError(product)) {
    console.error(`Error ${product.statusCode}: ${product.message}`)
    return null
  }

  return product
}
```

### Структура IError (из SDK)

```typescript
// oneentry/dist/errors/errorsInterfaces
interface IError {
  statusCode: number
  message: string
  error?: string
}

// Проверка кода ошибки
if (isError(result)) {
  switch (result.statusCode) {
    case 400: // Bad Request
    case 401: // Unauthorized — нет или истёк токен
    case 403: // Forbidden — нет прав
    case 404: // Not Found — ресурс не найден
    case 429: // Rate Limit Exceeded
    case 500: // Server Error
    case 502: // Bad Gateway
    case 503: // Service Unavailable
    case 504: // Gateway Timeout
  }
}
```

## Response структуры

**Интерфейсы сущностей** ищи в `node_modules/oneentry/dist/`. Ключевые поля любой entity: `id`, `localizeInfos`, `attributeValues`, `pageUrl`.

```typescript
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces'
```

### attributeValues — типы и доступ к value

> Подробные примеры каждого типа: `.claude/rules/attribute-values.md`

| Тип | Доступ к value | Примечание |
| --- | --- | --- |
| `string`, `integer`, `real`, `float` | `attrs.marker?.value` | примитив |
| `text` | `attrs.marker?.value?.htmlValue` | или `plainValue`, `mdValue` |
| `textWithHeader` | `attrs.marker?.value?.header`, `.htmlValue` | |
| `image`, `groupOfImages` | `attrs.marker?.value?.[0]?.downloadLink` | **МАССИВ!** |
| `file` | `attrs.marker?.value?.downloadLink` | объект |
| `date`, `dateTime`, `time` | `attrs.marker?.value?.fullDate` | или `formattedValue` |
| `radioButton` | `attrs.marker?.value` | строка-id |
| `list` | `attrs.marker?.value` | массив id или объектов с `extended` |
| `entity` | `attrs.marker?.value` | массив маркеров |
| `json` | `JSON.parse(attrs.marker?.value \|\| '{}')` | |
| `timeInterval` | `attrs.marker?.value` | `[[ISO, ISO], ...]` |
| `spam` | — | капча reCAPTCHA v3 → `<FormReCaptcha>` |

```typescript
// Если знаешь маркер — напрямую (предпочтительно):
const title = attrs.title?.value
const img = attrs.photo?.value?.[0]?.downloadLink   // image — МАССИВ!
const badges = attrs.badges?.value || []
const icon = badges[0]?.extended?.value?.downloadLink

// Если не знаешь маркер — поиск по типу:
const imgAttr = Object.values(attrs).find((a: any) => a?.type === 'image')
const imgUrl = imgAttr?.value?.[0]?.downloadLink || ''
```

### Фильтрация по attributeValues

| Оператор | Описание | Пример |
| --- | --- | --- |
| `in` | Значение в списке | `"red,blue,green"` |
| `nin` | НЕ в списке | `"red,blue"` |
| `eq` | Равно | `100` |
| `neq` | Не равно | `0` |
| `mth` | Больше (more than) | `50` |
| `lth` | Меньше (less than) | `1000` |
| `exs` | Существует | — |
| `nexs` | Не существует | — |
| `pat` | Содержит подстроку | `"Pro"` |
| `same` | Точное совпадение | `"Headphones"` |

Спецзначения: `today` (для date/dateTime), `now` (для time/dateTime).

```typescript
const filters = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 },
]
const products = await getApi().Products.getProducts(filters)
```

### localizeInfos

Содержит данные для языка запроса. Прямой доступ к полям (без вложенности по языку!):

```typescript
page.localizeInfos?.title        // заголовок
page.localizeInfos?.menuTitle    // название в меню
page.localizeInfos?.htmlContent  // HTML контент (проверять первым)
page.localizeInfos?.content      // простой текст
page.localizeInfos?.plainContent // текст без форматирования
```

## Типичные сценарии

### E-commerce

```typescript
// Список товаров
const products = await getApi().Products.getProducts()

// Товар по ID
const product = await getApi().Products.getProductById(65)

// Фильтрация: цена 100-500
const filtered = await getApi().Products.getProducts(
  [
    { attributeMarker: 'price', conditionMarker: 'mth', conditionValue: 100 },
    { attributeMarker: 'price', conditionMarker: 'lth', conditionValue: 500 },
  ]
)

// Заказ + платёжная сессия (через makeUserApi — один /refresh)
const { api } = makeUserApi(refreshToken)
const order = await api.Orders.createOrder('storage_marker', {
  formIdentifier, paymentAccountIdentifier, formData, products,
}) as any
if (isError(order)) return
const session = await api.Payments.createSession(order.id, 'session', false) as any
```

Для создания каталога товаров используй skill **`/create-product-list`** — он создаст Server Component с `getProductsByPageUrl`, фильтрацией через URL query params, пагинацией (load more), `FilterPanel` с данными цен и цветов из API и `ProductGrid` с ремаунтом через `key`.

Для создания страницы одного товара используй skill **`/create-product-card`** — он создаст страницу товара с `getProductById`, извлечением атрибутов по типу и маркеру, галереей изображений, блоком цены и секцией связанных товаров через `getRelatedProductsById`.

Для создания списка заказов пользователей используй skill **`/create-orders-list`** — он создаст Client Component с загрузкой через все хранилища (`getAllOrdersStorage` + `getAllOrdersByMarker`), один `makeUserApi` на всё, клиентскую пагинацию и защиту от token race condition.

Для создания страницы оформления заказа используй skill **`/create-checkout`** — он создаст форму с полями из Forms API (`getFormByMarker` по `formIdentifier` хранилища), обработкой поля типа `timeInterval` (слоты доставки), один `makeUserApi` для `createOrder` + `createSession` и редиректом на платёжную страницу.

Для управления корзиной (Redux slice + redux-persist, add/remove/quantity) используй skill **`/create-cart-manager`** — создаст `CartSlice`, store с персистентностью и `StoreProvider`.

Для списка избранного (Redux slice + persist, хранит только ID товаров) используй skill **`/create-favorites`** — создаст `FavoritesSlice`, кнопку и страницу с загрузкой данных из API.

Для панели фильтров (цена, цвет, наличие + `FilterContext` + Apply/Reset) используй skill **`/create-filter-panel`**.

Для подписки на изменение цены и наличия товара используй skill **`/create-subscription-events`** — `Events.subscribeByMarker` / `unsubscribeByMarker`.

### Авторизация и пользователи

Для создания формы авторизации/регистрации используй skill **`/create-auth`** — он создаст Client Component с прямыми вызовами SDK (fingerprint!) и Server Actions только для `getAuthProviders`/`logout`. Поля динамические из Forms API, правильная структура `authData`, синхронизация токенов.

Для страницы профиля пользователя используй skill **`/create-profile`** — поля из Users API, обновление данных, обработка token race condition.

Для страницы списка заказов используй skill **`/create-orders-list`** — загрузка через все хранилища, отмена, повтор, клиентская пагинация.

Для переключателя языков используй skill **`/create-locale-switcher`** — загружает локали через `getLocales()`, строит ссылки на текущую страницу с другим locale-сегментом.

Для строки поиска используй skill **`/create-search`** — дебаунс 300ms, Server Action, dropdown результатов.

### Создание страниц с контентом из CMS

Для создания Next.js страниц с данными из OneEntry используй skill **`/create-page`** — он создаст файл страницы с `getPageByUrl`, `getBlocksByPageUrl` и правильной обработкой `isError`.

Правила работы со страницами, langCode и `params` (Next.js 15+): `.claude/rules/nextjs-pages.md`.

## Контент и страницы

> Для создания страницы с контентом из CMS используй skill **`/create-page`**.
> Правила для `params`/`searchParams` (Next.js 15+) и работы с `langCode`: `.claude/rules/nextjs-pages.md` (загружается при работе с `page.tsx`/`layout.tsx`).

**⚠️ КРИТИЧЕСКИ ВАЖНО: pageUrl это МАРКЕР, не полный путь!**

В OneEntry поле `pageUrl` - это **идентификатор/маркер страницы**, а НЕ реальный URL маршрута приложения.

```typescript
// ❌ НЕПРАВИЛЬНО - передавать полный путь роута
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ ПРАВИЛЬНО - передавать только маркер страницы
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// То же для Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// НЕ 'shop/category/ship_designer'!
```

**Правило:** URL роута в Next.js (например `/shop/category/ship_designer`) и `pageUrl` в OneEntry (`"ship_designer"`) - это **разные вещи**. При вызове методов SDK OneEntry всегда используй только маркер из `pageUrl`.

### Многоязычный контент

```typescript
// Страница на русском
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Меню на английском
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

### Навигационное меню с иерархией

Для создания навигационного меню с поддержкой подменю и URL-префиксов используй skill **`/create-menu`** — он правильно обработает иерархию через `parentId`, нормализует `pages` и построит URL.

## Работа с блоками и атрибутами

> Таблица типов `attributeValues` и примеры доступа: `.claude/rules/attribute-values.md` (загружается при работе с `*.tsx`-компонентами).

### Работа с Blocks

```typescript
// Получение блока по маркеру
const block = await getApi().Blocks.getBlockByMarker('hero_section', 'en_US')
if (isError(block)) return null

const attrs = block.attributeValues || {}

// Извлечение атрибутов
const title = attrs.title?.value || block.localizeInfos?.title || ''
const description = attrs.description?.value || ''
const bgImage = attrs.bg?.value?.[0]?.downloadLink || ''

// Фильтрация блоков страницы
const blocks = await getApi().Pages.getBlocksByPageUrl('home')
if (!isError(blocks)) {
  // Исключить определенные блоки по identifier
  const filteredBlocks = blocks.filter(
    (block: any) => block.identifier !== 'home_badges'
  )

  // Сортировка по position
  const sortedBlocks = [...blocks].sort(
    (a: any, b: any) => a.position - b.position
  )
}
```

## Типичные ошибки

### Забывать проверку на ошибки

```typescript
// НЕПРАВИЛЬНО
const product = await getApi().Products.getProductById(123)
console.log(product.attributeValues.title) // Крашится если IError

// ПРАВИЛЬНО
const product = await getApi().Products.getProductById(123)
if (isError(product)) return
console.log(product.attributeValues.title)
```

### Создавать SDK инстанс в компоненте

```typescript
// ❌ НЕПРАВИЛЬНО - новый инстанс при каждом рендере
function ProductList() {
  const api = defineOneEntry(url, config)
}

// ✅ ПРАВИЛЬНО - singleton через getApi()
const products = await getApi().Products.getProducts()
```

> Полный singleton паттерн: раздел **Инициализация SDK**

### Угадывать маркеры меню и фильтровать по названиям

```typescript
// НЕПРАВИЛЬНО - угадываю маркер 'main' и фильтрую по названиям
const menu = await getApi().Menus.getMenusByMarker('main', 'en_US')
const quickLinks = menu.pages.filter(p =>
  ['Shop', 'Contact us'].includes(p.localizeInfos?.title)
)

// ПРАВИЛЬНО - спросить маркер у пользователя и получить напрямую
const quickLinksMenu = await getApi().Menus.getMenusByMarker('quick_links', 'en_US')
const quickLinks = !isError(quickLinksMenu) && quickLinksMenu.pages
  ? (Array.isArray(quickLinksMenu.pages) ? quickLinksMenu.pages : [quickLinksMenu.pages])
  : []
```

### Создавать промежуточные типы и маппить данные API в кастомные объекты

**НИКОГДА** не создавай промежуточный `type`/`interface` для обёртки данных из API и не маппи их в Server Actions. Компоненты должны работать напрямую с тем что вернул API.

```typescript
// ❌ НЕПРАВИЛЬНО — создаю кастомный тип и маплю attributes в него
type FeedbackField = { marker: string; title: string; required: boolean; ... }

export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  return {
    fields: form.attributes.map((a: any) => ({
      marker: a.marker,
      title: a.localizeInfos?.title,                        // ← уже есть в a.localizeInfos.title!
      required: !!a.validators?.requiredValidator?.strict,  // ← уже есть в a.validators!
      listOptions: a.listTitles.map((t: any) => t.value),  // ← теряем title, extended!
    }))
  }
}

// ✅ ПРАВИЛЬНО — возвращаю attributes как есть
export async function getFormFields() {
  const form = await getApi().Forms.getFormByMarker('contact_us') as any
  if (isError(form)) return { error: form.message }
  return {
    attributes: (form.attributes || [])
      .filter((a: any) => a.type !== 'spam' && a.type !== 'button')
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
  }
}

// В компоненте обращаюсь к полям напрямую:
field.localizeInfos?.title
field.validators?.requiredValidator?.strict
field.validators?.stringInspectionValidator?.stringMax
field.listTitles   // полные объекты с title, value, extended
```

**Правило:** Server Action — это тонкий прокси. Единственно допустимые операции над данными API: `filter` (исключить типы) и `sort` (по `position`). Всё остальное — в компоненте.

### Выдумывать структуры данных и создавать ненужные трансформации

```typescript
// НЕПРАВИЛЬНО - создаю промежуточный объект, выдумываю структуру
const navItems = pages.map(item => ({
  id: item.id,
  title: item.localizeInfos?.title || '',
  url: item.pageUrl || '#',
  children: item.children || []  // ← поля children НЕТ в API!
}))

// ПРАВИЛЬНО - использую данные из API напрямую как есть
const navItems = pages.filter((p: any) => !p.parentId)

// В JSX обращаюсь к полям API напрямую
{navItems.map((item: any) => (
  <Link href={`/${item.pageUrl}`}>
    {item.localizeInfos?.title}
  </Link>
))}
```

### Разлогинивать пользователя на любой ошибке в account-страницах

**Проблема:** При 401 нужно делать retry с актуальным токеном из localStorage (другая операция могла уже его обновить), и разлогинивать ТОЛЬКО при подтверждённой 401/403 после retry.

Полный паттерн profile-страницы — skill **`/create-profile`**.
Полный паттерн orders-страницы — skill **`/create-orders-list`**.

**Никогда не делай `localStorage.removeItem('refreshToken')` при ошибке загрузки форм/данных** — это уничтожает свежий токен, который только что записала другая операция.

### Показывать прелоадер при изменении состояния (не только при загрузке)

**Проблема:** При добавлении/удалении из избранного/корзины весь список перезагружается с лоадером.

**Решение:** кэш в `useState<Record<id, Entity>>` + `useMemo` для видимого списка. `useEffect` фетчит только НОВЫЕ id (через `prevIdsRef`), удалённые пересчитываются без запроса.

> Готовый паттерн с Redux + persist — skill **`/create-favorites`**

### Вызывать setState синхронно внутри useEffect

**Проблема:** Синхронный `setState` / `dispatch` в теле `useEffect` вызывает каскадные ре-рендеры.

```typescript
// ❌ НЕПРАВИЛЬНО — синхронный setState в useEffect
useEffect(() => { setMounted(true); }, []);

// ❌ НЕПРАВИЛЬНО — синхронный dispatch внутри эффекта
useEffect(() => {
  if (!ids.length) { dispatch(setLoadedProducts([])); return; }
  // ...
}, [ids]);
```

**Правила:**

- Не вызывай `setState` / `dispatch` синхронно в теле `useEffect` — выноси начальное значение в `useState(initialValue)` или вычисляй через `useMemo`
- Для проверки "смонтирован ли компонент" — **не используй** `useEffect + setMounted`. Вместо этого используй `useSyncExternalStore` или управляй видимостью через данные
- Если нужно сбросить состояние при изменении зависимости — передавай начальное значение прямо в `useState`, а не через эффект
- Асинхронные вызовы (fetch, dispatch после await) — допустимы внутри `useEffect`

```typescript
// ✅ ПРАВИЛЬНО — начальное значение сразу в useState
const [items, setItems] = useState<Item[]>(() => computeInitial());

// ✅ ПРАВИЛЬНО — dispatch только после async операции
useEffect(() => {
  if (!ids.length) return; // просто return, не dispatch
  fetchProductsByIds(ids).then((loaded) => {
    dispatch(setLoadedProducts(loaded)); // ← после await — ок
  });
}, [ids]);

// ✅ ПРАВИЛЬНО — mounted через useSyncExternalStore
import { useSyncExternalStore } from 'react';
const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false  // serverSnapshot
);
```

## Частые галлюцинации AI (реальные примеры ошибок)

### Выдуманное поле `children` в меню

Поля `children` нет в `IMenusPages` — используй `parentId` (см. раздел выше).

> Skill: **`/create-menu`**

### Рендерить поле капчи как обычный input

Тип капчи в OneEntry — `'spam'`, не `'captcha'`. Это **невидимая** reCAPTCHA v3 — рендерить `<FormReCaptcha>`, не `<input>`.

```tsx
// ❌ ГАЛЛЮЦИНАЦИЯ
if (field.type === 'captcha') return <input type="text" />;

// ✅ ПРАВИЛЬНО
if (field.type === 'spam') {
  return <FormReCaptcha siteKey={field.validators?.siteKey} ... />;
}
```

Полный паттерн динамической формы — skill **`/create-form`**.

### Хардкод langCode

```typescript
// ❌ ГАЛЛЮЦИНАЦИЯ - хардкод языка в компонентах
const page = await getApi().Pages.getPageByUrl('home', 'en_US')

// ✅ ПРАВИЛЬНО — await params в Next.js 15+!
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const page = await getApi().Pages.getPageByUrl('home', locale)
}
```

### Хардкодить данные фильтров (цвета, диапазон цен)

Цвета и диапазон цен получай из API, не хардкодь. Полный паттерн каталога с фильтрами — skill **`/create-product-list`**.

### Передавать filters и gridKey как server props в ShopView

`ShopView` ОБЯЗАН читать `activeFilters` и `gridKey` из `useSearchParams`, иначе `loadMore` игнорирует фильтры. Полный паттерн — skill **`/create-product-list`**.

## Работа с реальными данными проекта

**ВАЖНО:** Для определения структуры данных и полей сущностей используй реальные данные проекта.

### ✅ ПРЕДПОЧТИТЕЛЬНЫЙ СПОСОБ: skill `/inspect-api`

Используй skill **`/inspect-api`** — он автоматически прочитает `.env.local` и выполнит нужные curl-запросы:

```
/inspect-api             # все данные сразу
/inspect-api pages       # маркеры страниц
/inspect-api menus       # маркеры меню
/inspect-api products    # атрибуты товаров
/inspect-api forms       # маркеры форм
/inspect-api auth-providers
/inspect-api product-statuses
```

Результат: структурированный отчёт с реальными маркерами, типами атрибутов и `statusIdentifier`.

**Что анализировать в ответе:**

- `items[0].statusIdentifier` — реальный статус товара
- `items[0].attributeValues` — все атрибуты с `marker`, `type`, `value`
- `identifier` — реальный маркер для меню/форм/провайдеров
- `pageUrl` — реальный маркер для страниц

## Шаблон работы с новой сущностью

**Когда работаешь с новой сущностью (Product, Page, Block, Menu):**

### Шаг 1: Посмотреть тип в SDK

```typescript
// node_modules/oneentry/dist/products/productsInterfaces.ts
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces'
```

### Шаг 2: Сделать реальный вызов и посмотреть данные

```typescript
// Получить 1 объект и проверить реальную структуру
const testData = await getApi().Products.getProducts({ limit: 1 })
console.log('Структура:', testData[0])
console.log('Атрибуты:', testData[0]?.attributeValues)
```

### Шаг 3: Написать код на основе реальной структуры

```typescript
// Использовать РЕАЛЬНЫЕ поля из шагов 1-2
const attrs = product.attributeValues || {}
const title = attrs.product_title?.value  // ← знаю что product_title существует из шагов 1-2
```

**⚠️ НЕ пропускай шаги 1-2! НЕ угадывай структуру!**

## 🚨 ЗАПРЕЩЕНО: брать маркеры из существующего кода

**Существующий код мог быть написан с ошибкой или угадан — он НЕ является источником истины.**

```typescript
// ❌ НЕЛЬЗЯ — видишь в коде и используешь без проверки:
const inStock = product.statusIdentifier === 'in_stock'
// → и сразу пишешь: query.statusMarker = 'in_stock'  ← НЕЛЬЗЯ!

// ❌ НЕЛЬЗЯ — видишь в коде и используешь без проверки:
const stockQty = attrs.units_product?.value
// → и сразу пишешь: { attributeMarker: 'units_product', ... }  ← НЕЛЬЗЯ!
```

**Даже если значение выглядит правдоподобно — ВСЕГДА проверяй через реальный API запрос.**

### Как проверить перед написанием кода

Используй skill **`/inspect-api`** — он автоматически прочитает `.env.local` и вернёт реальные маркеры.

Если `.env.local` не найден — запроси у пользователя URL проекта и токен.

## Общие паттерны

### Работа с маркерами

```typescript
// По ID
const product = await getApi().Products.getProductById(123)
// По маркеру/URL
const product = await getApi().Products.getProductByUrl('/catalog/sneakers')
```

### Локализация

- `langCode?: string` — код языка (default: "en_US")

```typescript
const productEN = await getApi().Products.getProductById(123, 'en_US')
const productRU = await getApi().Products.getProductById(123, 'ru_RU')
```

### Пагинация

- `offset?: number` — смещение (default: 0)
- `limit?: number` — количество записей (default: 30)

```typescript
// Страница 1
const page1 = await getApi().Products.getProducts({ offset: 0, limit: 20 })
// Страница 2
const page2 = await getApi().Products.getProducts({ offset: 20, limit: 20 })
```

### Фильтрация (AttributeType[])

```typescript
interface AttributeType {
  attributeMarker: string  // имя атрибута
  conditionMarker: string  // оператор: "eq", "mth", "lth", "in", "nin"
  conditionValue: any      // значение
}

// Пример: цена 100-500
const filters: AttributeType[] = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 }
]
const products = await getApi().Products.getProducts({ body: filters })
```

### SSR/SSG стратегии (Next.js)

```tsx
// SSG - статическая генерация
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts({ limit: 100 })
  if (isError(products)) return []
  return products.map(p => ({ id: String(p.id) }))
}

export default async function ProductPage({ params }) {
  const product = await getApi().Products.getProductById(Number(params.id))
  if (isError(product)) notFound()
  return <ProductView product={product} />
}

// ISR - инкрементальная регенерация
export const revalidate = 3600 // 1 час
```

### user.state — хранилище произвольных данных пользователя

`user.state` — это объект произвольной формы в `IUserEntity`, который можно использовать для хранения любых клиентских данных: корзина, избранное, настройки, история просмотров.

**⚠️ Критические правила:**

1. **Всегда спредить** `{ ...user.state, newField }` — не затирать другие поля целиком
2. **Один `makeUserApi`** на getUser + updateUser — иначе токен сгорит между вызовами
3. **`formIdentifier`** берётся из `user.formIdentifier` — не хардкодить

```typescript
// app/actions/users.ts
'use server';

// Чтение state
export async function getUserState(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
    newToken: getNewToken(),
  };
}

// Запись одного поля — ОДИН инстанс для getUser + updateUser
export async function saveUserFavorites(refreshToken: string, favorites: number[]) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = (await api.Users.getUser()) as IUserEntity;
  await api.Users.updateUser({
    formIdentifier: user.formIdentifier, // берём из user!
    state: { ...user.state, favorites }, // спредим — не затираем cart и другие поля
  });
  return { success: true, newToken: getNewToken() };
}
```

**Типичная структура state:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // массив productId
  // любые другие поля...
}
```

**Синхронизация после логина:** один `makeUserApi` на загрузку всего state. Для локального хранения без серверной синхронизации — `/create-cart-manager` и `/create-favorites`.

### Параллельные запросы

```typescript
async function loadPageData(productId: number) {
  const [product, relatedProducts, reviews] = await Promise.all([
    getApi().Products.getProductById(productId),
    getApi().Products.getRelatedProductsById(productId),
    getApi().FormData.getFormsDataByMarker("reviews", productId, {}, 1)
  ])

  // Проверка ошибок
  if (isError(product)) throw new Error("Product not found")

  return {
    product,
    relatedProducts: isError(relatedProducts) ? [] : relatedProducts,
    reviews: isError(reviews) ? [] : reviews
  }
}
```

## Частые сценарии (расширенные)

### Форма оформления заказа из OneEntry Forms API

**Форма для оформления заказа (доставка, адрес, дата/время) берётся из OneEntry Forms API**, а не хардкодится.

**Как это работает:**

1. `getApi().Orders.getAllOrdersStorage()` возвращает хранилища заказов, у каждого есть `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` возвращает поля формы доставки
3. Поля формы рендерятся динамически по типу (`string`, `date`, `timeInterval` и т.д.)

**Поле типа `timeInterval` в форме заказа** — это поле со списком доступных слотов доставки. Его `value` содержит массив доступных временных интервалов `[[start, end], ...]`, из которых определяются:

- Доступные даты в календаре (уникальные даты из start-значений)
- Доступное время для выбранной даты (время из start-значений для этой даты)

**⚠️ ВАЖНО:**

- Форма доставки (`formIdentifier`) привязана к хранилищу заказов
- `timeInterval` в форме = список доступных слотов доставки, НЕ введённые данные
- Все user-auth вызовы в ОДНОМ инстансе

Для реализации полного checkout flow используй skill **`/create-checkout`**.

### Каталог товаров с фильтрами и пагинацией

Для создания каталога товаров с URL-фильтрами, бесконечной прокруткой и Server Actions используй skill **`/create-product-list`** — он создаст `lib/filters.ts`, `app/actions/products.ts`, Server Page, `ShopView` и `ProductGrid` с правильной архитектурой.

Для создания UI панели фильтров с `FilterContext`, price/color/availability компонентами и кнопками Apply/Reset используй skill **`/create-filter-panel`** — дополняет `/create-product-list`.

### Поиск

Для создания строки поиска (dropdown или отдельная страница) используй skill **`/create-search`**.

Для переключателя языков используй skill **`/create-locale-switcher`**.

### FormData — чтение данных из форм

`FormData.getFormsDataByMarker` позволяет читать сабмишены форм — заявки, контактные сообщения.

**⚠️ Требует Server Action** — вызывается только серверно.

```typescript
// app/actions/forms.ts
'use server';
import { getApi } from '@/lib/oneentry';

export async function getFormSubmissions(marker: string) {
  try {
    const result = await getApi().FormData.getFormsDataByMarker(marker, 0, {}, 1);
    return { data: (result as any).data || [], total: (result as any).total || 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}
```

**Структура ответа:** каждый элемент содержит `id`, `time`, `formData: [{ marker, value, type }]`.

**Доступ к полям:** `Object.fromEntries(submission.formData.map(f => [f.marker, f.value]))`.

**Обновление статуса / удаление:**

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Отзывы с иерархией** (`isNested: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

**⚠️ Отзывы в OneEntry реализуются через FormData** — используй skill **`/create-reviews`**.

### IntegrationCollections — кастомные коллекции

IntegrationCollections — произвольные таблицы данных в OneEntry (FAQ, справочники, произвольный контент). Полный CRUD доступен без авторизации.

**⚠️ Маркер коллекции:** получай через `/inspect-api` или `getICollections()` — не угадывай.

```typescript
// Чтение строк
const rows = await getApi().IntegrationCollections.getICollectionRowsByMarker('faq');
// rows.data — массив строк, rows.total — количество

// Чтение одной строки
const row = await getApi().IntegrationCollections.getICollectionRowByMarkerAndId('faq', id);

// Создание строки
await getApi().IntegrationCollections.createICollectionRow('faq', {
  data: { question: 'How to track my order?', answer: 'Via your profile page.' },
} as any);

// Обновление
await getApi().IntegrationCollections.updateICollectionRow('faq', id, {
  data: { answer: 'Updated answer.' },
});

// Удаление
await getApi().IntegrationCollections.deleteICollectionRowByMarkerAndId('faq', id);
```

**Структура ответа:**

```typescript
{
  data: [
    {
      id: 1,
      collectionIdentifier: 'faq',
      data: { question: '...', answer: '...' }, // произвольные поля схемы
      position: 1,
    }
  ],
  total: 42,
}
```

**Проверка маркера:**

```typescript
const isValid = await getApi().IntegrationCollections.validateICollectionMarker('faq');
```

### Навигация по категориям

**⚠️ ВАЖНО:** `getRootPages()` и `getPages()` НЕ возвращают `catalog_page` (каталоги товаров).
Страницы имеют поле `type`: `common_page`, `error_page`, `catalog_page`.
Для получения каталога используй `getPageByUrl()` — он находит страницы любого типа.
`getChildPagesByParentUrl()` тоже возвращает `catalog_page` дочерние страницы.

```typescript
// ❌ НЕПРАВИЛЬНО - catalog_page не будет в результатах getRootPages/getPages
const rootPages = await getApi().Pages.getRootPages()
// shop, category и другие catalog_page НЕ будут здесь!

// ✅ ПРАВИЛЬНО - getPageByUrl находит страницы ЛЮБОГО типа
const shop = await getApi().Pages.getPageByUrl('shop', 'en_US')
if (isError(shop)) return []
console.log(shop.type) // "catalog_page"

// ✅ getChildPagesByParentUrl тоже возвращает catalog_page
const categories = await getApi().Pages.getChildPagesByParentUrl('shop', 'en_US')
if (isError(categories)) return []
// categories содержит дочерние каталоги (type: "catalog_page") и обычные страницы
```

## Troubleshooting

### Ошибки запросов

#### 401 Unauthorized — refreshToken сжигается при создании API инстанса

**🚨 КРИТИЧЕСКИ ВАЖНО:** Каждый вызов `defineOneEntry(url, { auth: { refreshToken } })` вызывает `/refresh` и **сжигает** токен. После первого использования токен становится недействительным.

**Симптом:** Первый API вызов проходит успешно, все последующие возвращают `401 Unauthorized`.

```typescript
// ❌ НЕПРАВИЛЬНО — каждый makeUserApi() вызывает /refresh и сжигает токен
const storages = await getAllOrdersStorage(refreshToken);    // токен сожжён
const orders = await getAllOrdersByMarker(marker, refreshToken);  // 401!
```

**Правило:** Объединяй все user-authorized вызовы в **одну Server Action** с **одним** `makeUserApi(refreshToken)`.

> Паттерн: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

#### 401 Unauthorized — гонка токенов (token race condition)

**Симптом:** Пользователь залогинен, переходит на страницу профиля/заказов — и оказывается разлогинен.

**Причина:** Параллельная операция (CartContext, FavoritesContext) уже сожгла тот же `refreshToken`. Новая страница читает устаревший токен из localStorage.

**Правило для всех account-страниц:**

1. Server Action ОБЯЗАН возвращать `statusCode` в объекте ошибки
2. На 401 — retry с `localStorage.getItem('refreshToken')` (токен мог обновиться)
3. Разлогинивать ТОЛЬКО при 401/403 ПОСЛЕ retry
4. Никогда не делать `removeItem('refreshToken')` при ошибке загрузки данных

> Skill: **`/create-profile`** (profile) и **`/create-orders-list`** (orders)

#### 401 Unauthorized — неверный или истекший токен

Обычная просроченная сессия. Перенаправляй на `/login`.

> ⚠️ Если токен протухает слишком быстро — проверь срок жизни токена в админке OneEntry: `PROJECT_URL/users/auth-providers`.

#### 403 Forbidden

**Причина 1:** недостаточно прав для действия (настройки групп пользователей в админке).

**Причина 2:** вызов `AuthProvider.auth/signUp/generateCode` через Server Action → `deviceInfo.browser` в fingerprint будет серверным, не реальным браузером пользователя. Переноси вызов в Client Component.

**Распределение методов по контексту:**

- Публичные (Pages, Products, Menus, Forms) — любой контекст (server или client)
- `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **только Client Component** (fingerprint)
- `AuthProvider.logout()`, `.logoutAll()`, `.getAuthProviders()` — любой контекст
- `Users.*`, `Orders.*`, `Payments.*` — Server Action с `makeUserApi()` или Client с `reDefine()`

#### 400 Bad Request — `notificationData.phoneSMS` is not allowed to be empty

Пустая строка `''` отклоняется валидатором. **Не передавай `phoneSMS` вовсе** если у пользователя нет телефона — используй `as any` чтобы обойти TypeScript.

> Полный паттерн signUp: `.claude/rules/auth-provider.md`

#### 400 Bad Request — `authData` с лишними полями или пустыми значениями

`authData` должен содержать **только** `{ marker, value }`, без метаданных из Forms API. Фильтруй пустые значения перед отправкой.

```typescript
// ✅ ПРАВИЛЬНО
const authData = formFields
  .filter(f => formValues[f.marker]?.trim())
  .map(f => ({ marker: f.marker, value: formValues[f.marker] }))
```

> Полный паттерн auth: `.claude/rules/auth-provider.md` | Skill: **`/create-auth`**

#### 404 Not Found

```typescript
const product = await getApi().Products.getProductById(id)
if (isError(product) && product.statusCode === 404) return <NotFound />
```

#### 500 Server Error

**Причина:** вызов `Users.*`, `Orders.*`, `Payments.*` через `getApi()` без пользовательского токена. Эти методы требуют user accessToken.

```typescript
// ❌ НЕПРАВИЛЬНО — getApi() не имеет user accessToken
const user = await getApi().Users.getUser();  // 500!

// ✅ ПРАВИЛЬНО
const { api } = makeUserApi(refreshToken);
const user = await api.Users.getUser();
```

### Дебаг запросов

Включить логирование: `validation: { enabled: true, logErrors: true }` в конфиге `defineOneEntry`.

## Модули SDK

```ts
const {
  Admins, AttributesSets, AuthProvider, Blocks, Events, FileUploading,
  Forms, FormData, GeneralTypes, IntegrationCollections, Locales, Menus,
  Orders, Pages, Payments, ProductStatuses, Products, System,
  Templates, TemplatePreviews, Users, WS
} = defineOneEntry('your-url', { token: 'your-app-token' });
```

**Методы, требующие `makeUserApi(refreshToken)` вместо `getApi()`:**
Events, Orders, Payments, Users, WebSocket

**`langCode` — необязательный параметр** большинства методов. Язык по умолчанию задаётся при инициализации SDK. Передавай явно только в мультиязычных приложениях (например `getPageByUrl(url, locale)`). Все интерфейсы и типы возвращаемых значений ищи в `node_modules/oneentry/dist/`.

### Admins

```ts
getAdminsInfo(body?: AttributeType[], langCode?: string, offset?: number, limit?: number): IAdminEntity[]
```

### AttributeSets

```ts
getAttributes(langCode?: string, offset?: number, limit?: number, typeId?: any, sortBy?: string): IAttributesSetsResponse
getAttributesByMarker(marker, langCode?): IAttributeSetsEntity[]
getSingleAttributeByMarkerSet(setMarker, attributeMarker, langCode?): IAttributesSetsEntity
getAttributeSetByMarker(marker, langCode?): IAttributesSetsEntity
```

### AuthProvider

```ts
signUp(marker, body: ISignUpData, langCode?): ISignUpEntity
generateCode(marker, userIdentifier, eventIdentifier): void
checkCode(marker, userIdentifier, eventIdentifier, code): boolean
activateUser(marker, userIdentifier, code): boolean
auth(marker, body: IAuthPostBody): IAuthEntity
refresh(marker, token): IAuthEntity
logout(marker, token): boolean
logoutAll(marker): boolean
changePassword(marker, userIdentifier, eventIdentifier, type, code, newPassword, repeatPassword?): boolean
getAuthProviders(langCode?, offset?, limit?): IAuthProvidersEntity[]
getAuthProviderByMarker(marker, langCode?): IAuthProvidersEntity
getActiveSessionsByMarker(marker): IActiveSession[]
oauth(marker, body: IOauthData, langCode?): ISignUpEntity
```

### Blocks

```ts
getBlocks(type?: BlockType, langCode?, offset?, limit?): IBlocksResponse
getBlockByMarker(marker, langCode?, offset?, limit?): IBlockEntity
searchBlock(name, langCode?): ISearchBlock[]
```

### Events ⚠️ makeUserApi

```ts
getAllSubscriptions(offset?, limit?): ISubscriptions
subscribeByMarker(marker, productId, langCode?): boolean
unsubscribeByMarker(marker, productId, langCode?): any
```

### FileUploading

```ts
upload(file: File | Blob, fileQuery?: IUploadingQuery): IUploadingReturn[]
delete(filename, fileQuery?): any
createFileFromUrl(url, filename, mimeType?): Promise<File>
getFile(id, type, entity, filename, template?): any
```

### Forms

```ts
getAllForms(langCode?, offset?, limit?): IFormsEntity[]
getFormByMarker(marker, langCode?): IFormsEntity
```

### FormData

```ts
postFormsData(body: IBodyPostFormData, langCode?): IPostFormResponse
getFormsDataByMarker(marker, formModuleConfigId, body?, isExtended?, langCode?, offset?, limit?): IFormsByMarkerDataEntity
updateFormsDataByid(id, body?): IUpdateFormsData
updateFormsDataStatusByid(id, body?): boolean
deleteFormsDataByid(id): boolean
```

### GeneralTypes

```ts
getAllTypes(): IGeneralTypesEntity[]
```

### IntegrationCollections

```ts
getICollections(langCode?, userQuery?): ICollectionEntity[]
getICollectionById(id, langCode?): ICollectionEntity
getICollectionRowsById(id, langCode?, userQuery?): ICollectionRowsResponce
validateICollectionMarker(marker): ICollectionIsValid
getICollectionRowsByMarker(marker, langCode?): ICollectionRowsResponce
getICollectionRowByMarkerAndId(marker, id, langCode?): ICollectionRow
createICollectionRow(marker, body, langCode?): ICollectionRow
updateICollectionRow(marker, id, body, langCode?): ICollectionRow
deleteICollectionRowByMarkerAndId(marker, id): boolean
```

### Locales

```ts
getLocales(): ILocalEntity[]
```

### Menus

```ts
getMenusByMarker(marker, langCode?): IMenusEntity
```

### Orders ⚠️ makeUserApi

```ts
getAllOrdersStorage(langCode?, offset?, limit?): IOrdersEntity[]
getAllOrdersByMarker(marker, langCode?, offset?, limit?): IOrdersByMarkerEntity
getOrderByMarker(marker, langCode?): IOrdersEntity
getOrderByMarkerAndId(marker, id, langCode?): IOrderByMarkerEntity
createOrder(marker, body: IOrderData, langCode?): IBaseOrdersEntity
updateOrderByMarkerAndId(marker, id, body: IOrderData, langCode?): IBaseOrdersEntity
```

### Pages

```ts
getRootPages(langCode?): IPagesEntity[]
getPages(langCode?): IPagesEntity[]
getPageById(id, langCode?): IPagesEntity
getPageByUrl(url, langCode?): IPagesEntity
getChildPagesByParentUrl(url, langCode?): IPagesEntity[]
getBlocksByPageUrl(url, langCode?): IPositionBlock[]
getConfigPageByUrl(url): IPageConfig
searchPage(name, url?, langCode?): IPagesEntity[]
```

### Payments ⚠️ makeUserApi

```ts
getSessions(offset?, limit?): ISessionsEntity
getSessionById(id): ISessionEntity
getSessionByOrderId(id): IAccountsEntity
createSession(orderId, type: 'session'|'intent', automaticTaxEnabled?): ICreateSessionEntity
getAccounts(): IAccountsEntity
getAccountById(id): IAccountsEntity
```

### Products

`body: IFilterParams[]` — обязательный параметр, но по умолчанию `[]`. Если фильтры не нужны, можно не передавать.

```ts
getProducts(body?: IFilterParams[], langCode?, userQuery?: IProductsQuery): IProductsResponse
getProductsEmptyPage(langCode?, userQuery?): IProductsResponse
getProductsByPageId(id, body?, langCode?, userQuery?): IProductsResponse
getProductsPriceByPageUrl(url, langCode?, userQuery?): IProductsInfo
getProductsByPageUrl(url, body?, langCode?, userQuery?): IProductsResponse
getRelatedProductsById(id, langCode?, userQuery?): IProductsResponse
getProductsByIds(ids: string, langCode?, userQuery?): IProductsEntity[]
getProductById(id, langCode?): IProductsEntity
getProductBlockById(id): IProductBlock
searchProduct(name, langCode?): IProductsEntity[]
getProductsCount(body?): IProductsCount
getProductsCountByPageId(id, body?): IProductsCount
getProductsCountByPageUrl(url, body?): IProductsCount
```

### ProductStatuses

```ts
getProductStatuses(langCode?): IProductStatusEntity[]
getProductsByStatusMarker(marker, langCode?): IProductStatusEntity
validateMarker(marker): boolean
```

### System

```ts
validateCapcha(): any
getApiStat(): any
```

### Templates

```ts
getAllTemplates(langCode?): Record<Types, ITemplateEntity[]>
getTemplateByType(type, langCode?): ITemplateEntity[]
getTemplateByMarker(marker, langCode?): ITemplateEntity
```

### TemplatesPreview

```ts
getTemplatePreviews(langCode?): ITemplatesPreviewEntity[]
getTemplatePreviewByMarker(marker, langCode?): ITemplatesPreviewEntity
```

### Users ⚠️ makeUserApi

```ts
getUser(langCode?): IUserEntity
updateUser(body: IUserBody, langCode?): boolean
archiveUser(): boolean
deleteUser(): boolean
addFCMToken(token): boolean
deleteFCMToken(token): boolean
```

### WebSocket ⚠️ makeUserApi

```ts
connect(): Socket
```
