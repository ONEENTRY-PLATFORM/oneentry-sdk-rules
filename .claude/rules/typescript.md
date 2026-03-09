<!-- META
type: rules
fileName: typescript.md
rulePaths: ["**/*.ts","**/*.tsx"]
paths:
  - "**/*.ts"
  - "**/*.tsx"
-->

# TypeScript — Typing Rules

## Using `any` is prohibited

`eslint: @typescript-eslint/no-explicit-any`

```typescript
// ❌ INCORRECT
const result = await getApi().AuthProvider.auth(marker, body) as any
(providers as any[]).map((p: any) => ...)

// ✅ CORRECT — use types from the SDK
import type { IAuthEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'
import type { IAuthProvidersEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'
import type { IFormsEntity } from 'oneentry/dist/forms/formsInterfaces'
import type { IAttributes } from 'oneentry/dist/base/utils'
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces'

(providers as IAuthProvidersEntity[]).map((p) => ...)
(result as IAuthEntity).refreshToken
```

## Where to find OneEntry SDK types

All types are located in `node_modules/oneentry/dist/`:

| Required Type | Import From |
| --- | --- |
| `IAuthEntity`, `IAuthProvidersEntity`, `ISignUpData`, `IAuthPostBody` | `oneentry/dist/auth-provider/authProvidersInterfaces` |
| `IFormsEntity`, `IFormConfig` | `oneentry/dist/forms/formsInterfaces` |
| `IAttributes`, `IAttributeValues`, `IError`, `ILocalizeInfo` | `oneentry/dist/base/utils` |
| `IUserEntity` | `oneentry/dist/users/usersInterfaces` |
| `IProductsEntity` | `oneentry/dist/products/productsInterfaces` |
| `IOrdersEntity` | `oneentry/dist/orders/ordersInterfaces` |
| `IMenusEntity` | `oneentry/dist/menus/menusInterfaces` |
| `IPagesEntity` | `oneentry/dist/pages/pagesInterfaces` |

Before writing code — check the required `.d.ts` file:

```bash
cat node_modules/oneentry/dist/<module>/<module>Interfaces.d.ts
```

## Exception — SDK type conflict and API behavior

If the SDK type requires a field, but the API returns an error when passing it — document this explicitly:

```typescript
// ⚠️ ISignUpData requires phoneSMS: string, but an empty string causes a 400 error
// Use Omit to avoid passing the field
const body: Omit<ISignUpData, 'notificationData'> & {
  notificationData: Omit<ISignUpData['notificationData'], 'phoneSMS'>
} = { ... }
await getApi().AuthProvider.signUp(marker, body as ISignUpData)
```

## Declaring unused variables and imports is prohibited

`eslint: @typescript-eslint/no-unused-vars`

```typescript
// ❌ INCORRECT — importing but not using
import { logout } from '@/app/actions/auth'

// ✅ CORRECT — only necessary imports
```
