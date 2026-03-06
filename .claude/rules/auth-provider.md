<!-- META
type: rules
fileName: auth-provider.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# AuthProvider — правила OneEntry

## auth — авторизация пользователя

```ts
AuthProvider.auth(marker, body): Promise<IAuthEntity | IError>
```

**Параметры:**

- `marker` — текстовый идентификатор провайдера авторизации (например `"email"`)
- `body` — объект `IAuthPostBody`

**Структура body — только `authData`:**

```ts
// ❌ НЕПРАВИЛЬНО — лишние поля, пустые значения
const body = {
  ...formField,           // лишние поля из Forms API (type, localizeInfos и т.д.)
  value: values[marker] || '' // пустая строка → 400
}

// ✅ ПРАВИЛЬНО — только { marker, value }, фильтровать пустые
const body: IAuthPostBody = {
  authData: formFields
    .filter(f => values[f.marker]?.trim())
    .map(f => ({ marker: f.marker, value: values[f.marker] }))
}
```

**Пример запроса:**

```json
{
  "authData": [
    { "marker": "login", "value": "user@example.com" },
    { "marker": "password", "value": "12345" }
  ]
}
```

**Ответ `IAuthEntity`:**

```json
{
  "userIdentifier": "user@example.com",
  "authProviderIdentifier": "email",
  "accessToken": "eyJ...",
  "refreshToken": "1767759348540-5a2b..."
}
```

После успешного `auth` — сохрани токены:

```ts
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
localStorage.setItem('authProviderMarker', marker)
```

---

## auth и signUp — ТОЛЬКО из Client Component (fingerprint)

`auth()`, `signUp()`, `generateCode()`, `checkCode()`, `activateUser()`, `changePassword()` передают **fingerprint устройства** пользователя. На сервере SDK тоже генерирует fingerprint, но в `deviceInfo.browser` будет `"Node.js/..."` вместо реального браузера пользователя. На клиенте fingerprint строится из реальных характеристик браузера и устройства.

```ts
// ❌ НЕЖЕЛАТЕЛЬНО — через Server Action (deviceInfo.browser = "Node.js/...", не реальный браузер)
// app/actions/auth.ts → 'use server'
export async function signIn(marker, authData) {
  return await getApi().AuthProvider.auth(marker, { authData }) // browser в fingerprint = Node.js
}

// ✅ ПРАВИЛЬНО — напрямую из Client Component
// components/AuthForm.tsx → 'use client'
import { getApi, isError } from '@/lib/oneentry'

const result = await getApi().AuthProvider.auth(marker, { authData })
if (isError(result)) { /* обработка ошибки */ return }
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
```

**Можно через Server Action (fingerprint не нужен):**

- `getAuthProviders()` / `getAuthProviderByMarker(marker)`
- `logout(marker, token)` — refreshToken передаётся параметром
- `logoutAll(marker)`

---

## signUp — регистрация

```ts
AuthProvider.signUp(marker, body: ISignUpData, langCode?): Promise<ISignUpEntity | IError>
```

**Критичные правила:**

- `authData` — только `{ marker, value }`, без пустых строк
- `notificationData.phoneSMS` — не передавать если нет значения (пустая строка → 400)
- `formData` — дополнительные поля профиля (не authData!)

```ts
// ✅ Правильная структура
await getApi().AuthProvider.signUp(marker, {
  formIdentifier: 'reg',
  authData: authFields.filter(f => values[f.marker]?.trim()).map(f => ({ marker: f.marker, value: values[f.marker] })),
  formData: [],
  notificationData: {
    email: userEmail,
    phonePush: [],
    // phoneSMS НЕ передаём — пустая строка вызовет 400
  } as any
})
```

---

## Получение маркеров провайдеров и formIdentifier

Не угадывай маркеры (`"email"`, `"phone"` и т.д.) — получи список из API:

```ts
const providers = await getApi().AuthProvider.getAuthProviders()
// providers[0].identifier       — маркер провайдера для auth()
// providers[0].formIdentifier   — маркер формы с полями для этого провайдера
```

**Полная структура ответа провайдера:**

```json
{
  "identifier": "email",
  "type": "email",
  "formIdentifier": "reg",
  "isCheckCode": true,
  "localizeInfos": { "en_US": { "title": "Email" } }
}
```

---

## Динамические поля формы авторизации — ОБЯЗАТЕЛЬНЫЙ ПАТТЕРН

**НИКОГДА** не хардкодь `<input name="email_reg">` или `<input name="password_reg">`. Всегда загружай поля через `getFormByMarker(formIdentifier)`.

**Алгоритм:**

1. Получи провайдеры → возьми `formIdentifier` нужного провайдера
2. Вызови `getFormByMarker(formIdentifier)` → получи `attributes[]`
3. Отфильтруй поля по назначению (sign-in vs sign-up)
4. Рендери динамически по `attribute.type` и `attribute.marker`

```ts
// app/actions/auth.ts — 'use server'
// getSignInFields можно через Server Action — Forms API, fingerprint не нужен

// Маркеры auth-полей (не угадывай — получи из реального API через /inspect-api)
const AUTH_FIELD_MARKERS = ['email_reg', 'password_reg']

export async function getSignInFields() {
  const form = await getApi().Forms.getFormByMarker('reg') // formIdentifier из провайдера
  if (isError(form)) return { error: form.message }

  const fields = (form as any).attributes
    .filter((a: any) => AUTH_FIELD_MARKERS.includes(a.marker))
    .sort((a: any, b: any) => a.position - b.position)
    .map((a: any) => ({
      marker: a.marker as string,
      type: a.type as string,
      label: (a.localizeInfos as any)?.title ?? a.marker,
      required: !!(a.validators as any)?.requiredValidator?.strict,
    }))

  return { fields }
}

// ⚠️ auth — НЕ через Server Action, вызывать напрямую из Client Component (fingerprint)
```

**Вызов auth в Client Component:**

```ts
// 'use client'
import { getApi, isError } from '@/lib/oneentry'

// authData при сабмите — строить из реальных полей, фильтровать пустые
const result = await getApi().AuthProvider.auth('email', { authData })
if (isError(result)) return { error: result.message }
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
```

**Динамический рендер в Client Component:**

```tsx
// Определение типа <input> по маркеру (не по type из API — все поля имеют type: "string")
function getInputType(marker: string) {
  if (marker.includes('password') || marker.includes('pass')) return 'password'
  if (marker.includes('email')) return 'email'
  return 'text'
}

// Рендер поля
{fields.map((field) => (
  <div key={field.marker} className="input-group">
    <label htmlFor={field.marker}>{field.label}</label>
    <input
      id={field.marker}
      name={field.marker}
      type={getInputType(field.marker)}
      required={field.required}
    />
  </div>
))}
```

**authData при сабмите — строить из реальных полей, фильтровать пустые:**

```ts
const authData = fields
  .map((f) => ({
    marker: f.marker,
    value: (form.elements.namedItem(f.marker) as HTMLInputElement)?.value ?? '',
  }))
  .filter((d) => d.value.trim())

const result = await getApi().AuthProvider.auth('email', { authData })
```

**Откуда взять `AUTH_FIELD_MARKERS`:**

- Запусти `/inspect-api auth-providers` → смотри `formIdentifier` провайдера
- Запусти `/inspect-api forms` → смотри поля формы с этим `identifier`
- Выбери маркеры, которые являются auth-credentials (email + password), а не профильными данными (имя, телефон, адрес)

---

## logout

```ts
// marker берётся из localStorage (сохранён при логине)
export async function logout(marker: string, token: string) {
  const result = await getApi().AuthProvider.logout(marker, token)
  if (isError(result)) return { error: result.message, statusCode: result.statusCode }
  return { success: true }
}
```
