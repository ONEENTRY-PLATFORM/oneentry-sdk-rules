<!-- META
type: rules
fileName: tokens.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Auth Tokens — OneEntry Rules

## Token storage (Client)

```typescript
// After successful login
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
localStorage.setItem('authProviderMarker', authProviderMarker)

// After logout
localStorage.removeItem('accessToken')
localStorage.removeItem('refreshToken')
localStorage.removeItem('authProviderMarker')
```

## makeUserApi — ONE call per Server Action

Each `makeUserApi(refreshToken)` calls `/refresh` and **burns the token**. A second call with the same token → 401.

```typescript
// ❌ WRONG — token burned by first makeUserApi
export async function badAction(refreshToken: string) {
  const user = await makeUserApi(refreshToken).api.Users.getUser()   // /refresh → token burned
  const orders = await makeUserApi(refreshToken).api.Orders.getAllOrdersByMarker('storage') // 401!
}

// ✅ CORRECT — one instance for all calls
export async function goodAction(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken) // single /refresh
  const user = await api.Users.getUser()
  const orders = await api.Orders.getAllOrdersByMarker('storage')
  return { user, orders, newToken: getNewToken() }
}
```

## getNewToken() — must be returned to the client

```typescript
// ✅ Server Action returns newToken
return { data: result, newToken: getNewToken() }

// ✅ Client saves it to localStorage
if (result.newToken) {
  localStorage.setItem('refreshToken', result.newToken)
}
```

## Race condition — retry on 401

```typescript
// Client Component: another tab may have updated the token first
let result = await someUserAction(localStorage.getItem('refreshToken')!)
if ('error' in result && result.statusCode === 401) {
  const fresh = localStorage.getItem('refreshToken')!
  result = await someUserAction(fresh)
}

// Log out ONLY after confirmed 401/403
if ('error' in result && (result.statusCode === 401 || result.statusCode === 403)) {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('authProviderMarker')
  window.dispatchEvent(new Event('auth-change'))
}
```
