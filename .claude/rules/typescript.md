<!-- META
type: rules
fileName: typescript.md
rulePaths: ["**/*.ts","**/*.tsx"]
paths:
  - "**/*.ts"
  - "**/*.tsx"
-->

# TypeScript — typing rules

## `any` is forbidden

`eslint: @typescript-eslint/no-explicit-any`

```typescript
// ❌ WRONG
const result = await getApi().AuthProvider.auth(marker, body) as any
(providers as any[]).map((p: any) => ...)

// ✅ CORRECT — use types from SDK
import type { IAuthEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'
import type { IAuthProvidersEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'
import type { IFormsEntity } from 'oneentry/dist/forms/formsInterfaces'
import type { IAttributes } from 'oneentry/dist/base/utils'
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces'

(providers as IAuthProvidersEntity[]).map((p) => ...)
(result as IAuthEntity).refreshToken
```

## Where to find OneEntry SDK types

All types are in `node_modules/oneentry/dist/`:

| Type needed | Import from |
| --- | --- |
| `IAuthEntity`, `IAuthProvidersEntity`, `ISignUpData`, `IAuthPostBody` | `oneentry/dist/auth-provider/authProvidersInterfaces` |
| `IFormsEntity`, `IFormConfig` | `oneentry/dist/forms/formsInterfaces` |
| `IAttributes`, `IAttributeValues`, `IError`, `ILocalizeInfo` | `oneentry/dist/base/utils` |
| `IUserEntity` | `oneentry/dist/users/usersInterfaces` |
| `IProductsEntity` | `oneentry/dist/products/productsInterfaces` |
| `IOrdersEntity` | `oneentry/dist/orders/ordersInterfaces` |
| `IMenusEntity` | `oneentry/dist/menus/menusInterfaces` |
| `IPagesEntity` | `oneentry/dist/pages/pagesInterfaces` |

Before writing code — look at the needed `.d.ts` file:
```bash
cat node_modules/oneentry/dist/<module>/<module>Interfaces.d.ts
```

## Exception — SDK type conflicts with API behavior

If an SDK type requires a field but the API returns an error when it's provided — document this explicitly:

```typescript
// ⚠️ ISignUpData requires phoneSMS: string, but an empty string causes 400
// Use Omit to avoid sending the field
const body: Omit<ISignUpData, 'notificationData'> & {
  notificationData: Omit<ISignUpData['notificationData'], 'phoneSMS'>
} = { ... }
await getApi().AuthProvider.signUp(marker, body as ISignUpData)
```

## Unused variables and imports are forbidden

`eslint: @typescript-eslint/no-unused-vars`

```typescript
// ❌ WRONG — imported but not used
import { logout } from '@/app/actions/auth'

// ✅ CORRECT — only needed imports
```
