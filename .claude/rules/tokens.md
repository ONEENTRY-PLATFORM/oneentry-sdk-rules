<!-- META
type: rules
fileName: tokens.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Токены авторизации — правила OneEntry

## Хранение токенов (Client)

```typescript
// После успешного login
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
localStorage.setItem('authProviderMarker', authProviderMarker)

// После logout
localStorage.removeItem('accessToken')
localStorage.removeItem('refreshToken')
localStorage.removeItem('authProviderMarker')
```

## makeUserApi — ОДИН вызов на Server Action

Каждый `makeUserApi(refreshToken)` вызывает `/refresh` и **сжигает токен**. Второй вызов с тем же токеном → 401.

```typescript
// ❌ НЕПРАВИЛЬНО — токен сожжён первым makeUserApi
export async function badAction(refreshToken: string) {
  const user = await makeUserApi(refreshToken).api.Users.getUser()   // /refresh → токен сожжён
  const orders = await makeUserApi(refreshToken).api.Orders.getAllOrdersByMarker('storage') // 401!
}

// ✅ ПРАВИЛЬНО — один инстанс для всех вызовов
export async function goodAction(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken) // единственный /refresh
  const user = await api.Users.getUser()
  const orders = await api.Orders.getAllOrdersByMarker('storage')
  return { user, orders, newToken: getNewToken() }
}
```

## getNewToken() — обязательно возвращать клиенту

```typescript
// ✅ Server Action возвращает newToken
return { data: result, newToken: getNewToken() }

// ✅ Клиент сохраняет его в localStorage
if (result.newToken) {
  localStorage.setItem('refreshToken', result.newToken)
}
```

## Race condition — retry на 401

```typescript
// Client Component: другая вкладка могла обновить токен раньше
let result = await someUserAction(localStorage.getItem('refreshToken')!)
if ('error' in result && result.statusCode === 401) {
  const fresh = localStorage.getItem('refreshToken')!
  result = await someUserAction(fresh)
}

// Разлогинивать ТОЛЬКО после подтверждённой 401/403
if ('error' in result && (result.statusCode === 401 || result.statusCode === 403)) {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('authProviderMarker')
  window.dispatchEvent(new Event('auth-change'))
}
```
