<!-- META
type: rules
fileName: typescript.md
rulePaths: ["**/*.ts","**/*.tsx"]
paths:
  - "**/*.ts"
  - "**/*.tsx"
-->

# TypeScript — Typing Rules

## Do not use `any`

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
| `IFormsEntity`, `IFormConfig`, `IFormAttribute`, `IFormAttributeAdditionalField`, `IFormLocalizeInfo` | `oneentry/dist/forms/formsInterfaces` |
| `IAttributes`, `IAttributeValues`, `IError`, `ILocalizeInfo` | `oneentry/dist/base/utils` |
| `IUserEntity` | `oneentry/dist/users/usersInterfaces` |
| `IProductsEntity` | `oneentry/dist/products/productsInterfaces` |
| `IOrdersEntity` | `oneentry/dist/orders/ordersInterfaces` |
| `IMenusEntity` | `oneentry/dist/menus/menusInterfaces` |
| `IPagesEntity` | `oneentry/dist/pages/pagesInterfaces` |

**Form types — use the correct type for the context:**

- `IFormsEntity` — the entire form (`getFormByMarker` / `getAllForms`)
- `IFormAttribute` — **form field** (element `form.attributes[]`). Use it instead of `IAttributesSetsEntity` for form fields — `IFormAttribute` has flags `isLogin`, `isSignUp`, `isNotification*`, `initialValue`, and typed `additionalFields`
- `IFormLocalizeInfo` — form localization (`form.localizeInfos`). Inherits `ILocalizeInfo` and adds `titleForSite`, `successMessage`, `unsuccessMessage`, `urlAddress`, `database`, `script`
- `IFormAttributeAdditionalField` — nested fields inside `IFormAttribute.additionalFields` (`{ marker, type, value }`)
- `IAttributesSetsEntity` — remains for AttributesSets (`getAttributes`, `getAttributeSetByMarker`), NOT for form fields

Before writing code — check the required `.d.ts` file:

```bash
cat node_modules/oneentry/dist/<module>/<module>Interfaces.d.ts
```

## Exception — SDK type conflict and API behavior

If the SDK type requires a field, but the API returns an error when passing it — document this explicitly:

```typescript
// ⚠️ ISignUpData requires phoneSMS: string, but an empty string causes a 400 error
// Use Omit to not pass the field
const body: Omit<ISignUpData, 'notificationData'> & {
  notificationData: Omit<ISignUpData['notificationData'], 'phoneSMS'>
} = { ... }
await getApi().AuthProvider.signUp(marker, body as ISignUpData)
```

## 🚫 Do not duplicate SDK types as "flat DTOs" (including in Server Actions)

A common mistake: inside a Server Action (`'use server'`), a developer writes a local `type FormField = { marker, type, title, isLogin, ... }`, flattens `IFormAttribute` into it, and returns a copy. **This is not allowed.**

Reasons:

- SDK types (`IFormAttribute`, `IProductsEntity`, `IOrderByMarkerEntity`, …) are already regular object interfaces (strings / numbers / booleans / nested records). They serialize across the Server Action boundary without issues. A DTO layer is unnecessary.
- Duplicating fields silently loses everything that was not copied (`validators`, `initialValue`, `listTitles`, `settings`, `isVisible`, `additionalFields`, index signatures). The next feature that needs one of these fields will have to pass it through your DTO — or revert to `as any`.
- When the SDK adds a field, the DTO does not see it. When the SDK renames a field, the DTO still compiles. Both bugs remain silent.
- Calculating view fields (`title`, `placeholder`) on the server is dead weight: the client already has `localizeInfos.title` and `additionalFields.placeholder.value`. It’s better to retrieve them with small helpers at the place of use.

```ts
// ❌ INCORRECT — invented DTO, flattening IFormAttribute
'use server'
export type FormField = { marker: string; type: string; title: string; isLogin: boolean; /* …partial copy… */ }
export async function getFormByMarker(marker: string) {
  const form = await getApi().Forms.getFormByMarker(marker)
  return {
    attributes: (form.attributes || []).map((a) => ({
      marker: a.marker,
      type: a.type as string,
      title: a.localizeInfos?.title ?? a.marker,  // lost: validators, listTitles, additionalFields, …
      isLogin: a.isLogin === true,
      // …
    })),
  }
}

// ✅ CORRECT — return the SDK type as is, helpers live on the client
'use server'
import type { IFormsEntity, IFormAttribute } from 'oneentry/dist/forms/formsInterfaces'
export async function getFormByMarker(marker: string) {
  const form = await getApi().Forms.getFormByMarker(marker)
  if (isError(form)) return { error: form.message, statusCode: form.statusCode }
  return {
    identifier: (form as IFormsEntity).identifier,
    attributes: ((form as IFormsEntity).attributes || []) as IFormAttribute[],
  }
}

// Client helpers — output view fields from the SDK type, do not pre-flatten on the server
const titleFor       = (f: IFormAttribute) => f.localizeInfos?.title ?? f.marker
const placeholderFor = (f: IFormAttribute) => (f.additionalFields?.placeholder?.value as string | undefined) ?? ''
```

**Rule:** if you feel tempted to write `type FooField = { …trimmed subset of IFoo… }` — stop. Import `IFoo` and move any view-specific things (labels, placeholders, css) into small helpers near the place of use. A new local type is justified only if the form truly diverges from the SDK (for example, merging two entities or adding a front-end flag like `isSelected`).

### The rule applies to any SDK entity, not just form fields

The same mistake, different entities. Flattening `IAuthProvidersEntity` into `{ identifier, title, systemCodeTlsSec }` in a Server Action, retyping `product.attributeValues` as `Record<string, { value?: unknown }>`, casting `user.formData` to `Array<{ marker: string; value: unknown }>` — all of these are the same anti-pattern.

```ts
// ❌ Provider DTO — loses config (oauthAuthUrl, accessTokenTtlSec, …), userGroupIdentifier, isActive
'use server'
return { providers: providers.map(p => ({
  identifier: p.identifier, title: p.localizeInfos?.title, systemCodeTlsSec: Number(p.config?.systemCodeTlsSec) || 80,
})) }

// ✅ Return IAuthProvidersEntity[] — the calling side reads p.config.systemCodeTlsSec and p.localizeInfos.title directly
import type { IAuthProvidersEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'
return { providers: providers as IAuthProvidersEntity[] }

// ❌ Retyping attributeValues — duplicates IAttributeValues
const attrs = (product.attributeValues || {}) as Record<string, { value?: unknown; type?: string }>

// ✅ Use IAttributeValues / IAttributeValue from the SDK
import type { IAttributeValues } from 'oneentry/dist/base/utils'
const attrs: IAttributeValues = product.attributeValues || {}

// ❌ Retyping user.formData into ad-hoc pair — duplicates FormDataType options
for (const item of user.formData as Array<{ marker: string; value: unknown }>) { … }

// ✅ Import FormDataType and narrow with a type guard (the Record<string, unknown> variant does not contain marker)
import type { FormDataType } from 'oneentry/dist/forms-data/formsDataInterfaces'
function hasMarker(i: FormDataType): i is FormDataType & { marker: string; value: unknown } {
  return typeof i === 'object' && i !== null && 'marker' in i && typeof (i as { marker?: unknown }).marker === 'string'
}
for (const item of user.formData as FormDataType[]) {
  if (!hasMarker(item)) continue
  // item.marker / item.value are available
}
```

### Narrowing `unknown` at the access point — allowed

If the SDK intentionally types a field as `unknown` (for example, `IAttributeValue.value`, because the specific form depends on `type` and admin settings), a local narrow-cast at the reading point is **not** a DTO duplicate:

```ts
// OK — narrowing from unknown to the form we actually read; limited to one helper
const pic = attrsOf(product).pic?.value as { downloadLink?: string } | undefined
const list = attrsOf(product).color?.value as Array<{ title?: string; extended?: { value?: string } }> | undefined
```

The difference: on the SDK side — `unknown`, so you are not overriding what the SDK has already described — you are choosing a view over an intentionally wrapped payload. Keep such narrows minimal (only those fields that are actually used) and at the access point, not as an exported top-level type.

## Do not declare unused variables and imports

`eslint: @typescript-eslint/no-unused-vars`

```typescript
// ❌ INCORRECT — imported but not used
import { logout } from '@/app/actions/auth'

// ✅ CORRECT — only necessary imports
```
