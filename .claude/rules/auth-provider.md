<!-- META
type: rules
fileName: auth-provider.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# AuthProvider — OneEntry Rules

## auth — User Authorization

```ts
AuthProvider.auth(marker, body): Promise<IAuthEntity | IError>
```

**Parameters:**

- `marker` — text identifier of the authorization provider (for example `"email"`)
- `body` — object `IAuthPostBody`

**Structure of body — only `authData`:**

```ts
// ❌ INCORRECT — extra fields, empty values
const body = {
  ...formField,           // extra fields from Forms API (type, localizeInfos, etc.)
  value: values[marker] || '' // empty string → 400
}

// ✅ CORRECT — only { marker, value }, filter out empty
const body: IAuthPostBody = {
  authData: formFields
    .filter(f => values[f.marker]?.trim())
    .map(f => ({ marker: f.marker, value: values[f.marker] }))
}
```

**Example request:**

```json
{
  "authData": [
    { "marker": "login", "value": "user@example.com" },
    { "marker": "password", "value": "12345" }
  ]
}
```

**Response `IAuthEntity`:**

```json
{
  "userIdentifier": "user@example.com",
  "authProviderIdentifier": "email",
  "accessToken": "eyJ...",
  "refreshToken": "1767759348540-5a2b..."
}
```

After successful `auth` — save the tokens:

```ts
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
localStorage.setItem('authProviderMarker', marker)
```

---

## auth and signUp — ONLY from Client Component (fingerprint)

`auth()`, `signUp()`, `generateCode()`, `checkCode()`, `activateUser()`, `changePassword()` pass the **fingerprint of the user's device**. On the server, the SDK also generates a fingerprint, but in `deviceInfo.browser` it will be `"Node.js/..."` instead of the user's actual browser. On the client, the fingerprint is built from the actual characteristics of the browser and device.

```ts
// ❌ UNDESIRABLE — through Server Action (deviceInfo.browser = "Node.js/...", not the real browser)
// app/actions/auth.ts → 'use server'
export async function signIn(marker, authData) {
  return await getApi().AuthProvider.auth(marker, { authData }) // browser in fingerprint = Node.js
}

// ✅ CORRECT — directly from Client Component
// components/AuthForm.tsx → 'use client'
import { getApi, isError } from '@/lib/oneentry'

const result = await getApi().AuthProvider.auth(marker, { authData })
if (isError(result)) { /* error handling */ return }
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
```

**Can be done through Server Action (fingerprint not needed):**

- `getAuthProviders()` / `getAuthProviderByMarker(marker)`
- `logout(marker, token)` — refreshToken is passed as a parameter
- `logoutAll(marker)`

---

## signUp — Registration

```ts
AuthProvider.signUp(marker, body: ISignUpData, langCode?): Promise<ISignUpEntity | IError>
```

**Critical rules:**

- `authData` — only `{ marker, value }`, without empty strings
- `notificationData.phoneSMS` — do not pass if there is no value (empty string → 400)
- `formData` — additional profile fields (not authData!)

```ts
// ✅ Correct structure
await getApi().AuthProvider.signUp(marker, {
  formIdentifier: 'reg',
  authData: authFields.filter(f => values[f.marker]?.trim()).map(f => ({ marker: f.marker, value: values[f.marker] })),
  formData: [],
  notificationData: {
    email: userEmail,
    phonePush: [],
    // phoneSMS NOT passed — empty string will cause 400
  } as any
})
```

---

## Getting provider markers and formIdentifier

Do not guess markers (`"email"`, `"phone"`, etc.) — get the list from the API:

```ts
const providers = await getApi().AuthProvider.getAuthProviders()
// providers[0].identifier       — marker of the provider for auth()
// providers[0].formIdentifier   — marker of the form with fields for this provider
```

**Full structure of the provider response:**

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

## Dynamic fields of the authorization form — MANDATORY PATTERN

**NEVER** hardcode `<input name="email_reg">` or `<input name="password_reg">`. Always load fields through `getFormByMarker(formIdentifier)`.

**Algorithm:**

1. Get providers → take `formIdentifier` of the desired provider
2. Call `getFormByMarker(formIdentifier)` → get `attributes[]`
3. Filter fields by purpose (sign-in vs sign-up)
4. Render dynamically by `attribute.type` and `attribute.marker`

```ts
// app/actions/auth.ts — 'use server'
// getSignInFields can be done through Server Action — Forms API, fingerprint not needed

// Markers of auth fields (do not guess — get from the real API via /inspect-api)
const AUTH_FIELD_MARKERS = ['email_reg', 'password_reg']

export async function getSignInFields() {
  const form = await getApi().Forms.getFormByMarker('reg') // formIdentifier from the provider
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

// ⚠️ auth — NOT through Server Action, call directly from Client Component (fingerprint)
```

**Calling auth in Client Component:**

```ts
// 'use client'
import { getApi, isError } from '@/lib/oneentry'

// authData on submit — build from real fields, filter out empty
const result = await getApi().AuthProvider.auth('email', { authData })
if (isError(result)) return { error: result.message }
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
```

**Dynamic render in Client Component:**

```tsx
// Determine the type of <input> by marker (not by type from API — all fields have type: "string")
function getInputType(marker: string) {
  if (marker.includes('password') || marker.includes('pass')) return 'password'
  if (marker.includes('email')) return 'email'
  return 'text'
}

// Render field
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

**authData on submit — build from real fields, filter out empty:**

```ts
const authData = fields
  .map((f) => ({
    marker: f.marker,
    value: (form.elements.namedItem(f.marker) as HTMLInputElement)?.value ?? '',
  }))
  .filter((d) => d.value.trim())

const result = await getApi().AuthProvider.auth('email', { authData })
```

**Where to get `AUTH_FIELD_MARKERS`:**

- Run `/inspect-api auth-providers` → see the `formIdentifier` of the provider
- Run `/inspect-api forms` → see the fields of the form with this `identifier`
- Choose markers that are auth-credentials (email + password), not profile data (name, phone, address)

---

## logout

```ts
// marker is taken from localStorage (saved during login)
export async function logout(marker: string, token: string) {
  const result = await getApi().AuthProvider.logout(marker, token)
  if (isError(result)) return { error: result.message, statusCode: result.statusCode }
  return { success: true }
}
```
