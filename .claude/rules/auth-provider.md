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

- `marker` — text identifier of the authorization provider (e.g. `"email"`)
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

- `authData` — **only login-credentials** (`{ marker, value }`, without empty strings): login-identifier + password. NOT all form fields!
- `formData` — profile fields (first name, last name, address, phone, etc.) in the format `{ marker, type, value }`
- `notificationData.email` — value of the field with the flag `isNotificationEmail: true` (or fallback to the login field)
- `notificationData.phonePush` — array with the value of the field with the flag `isNotificationPhonePush: true` (skip if empty)
- `notificationData.phoneSMS` — do not pass if there is no value (empty string → 400)

### ⚠️ Field Routing — by flags, NOT "everything in authData"

Fields from `getFormByMarker()` come with routing flags: `isLogin`, `isSignUp`, `isNotificationEmail`, `isNotificationPhoneSMS`, `isNotificationPhonePush`. Each field already carries its role — **do not dump all filled fields into `authData`**, otherwise profile fields (first name, address) are lost and only login-credentials are sent to the server.

| Field Role                                   | Where to send                                          |
|----------------------------------------------|-------------------------------------------------------|
| `isLogin: true`                              | `authData` (login-identifier)                         |
| `additionalFields.type.value === 'password'` | `authData` (password — determined by type, not flag) |
| `isNotificationEmail: true`                  | `notificationData.email`                               |
| `isNotificationPhoneSMS: true`               | `notificationData.phoneSMS` (skip if empty)          |
| `isNotificationPhonePush: true`              | `notificationData.phonePush` (array, if not empty)   |
| everything else (first name, address, etc.)  | `formData` (profile data)                             |

> ⚠️ `isSignUp: true` — this flag is for **visibility in UI** ("show this field in the registration form"), NOT for routing. Fields with `isSignUp: true` (e.g. `name_reg`) go into `formData`, not into `authData`, unless they also have `isLogin: true`.

> ⚠️ There is no separate flag for the password. Determine it through `additionalFields.type.value === 'password'` and always send it to `authData`. If the password is left in `formData`, the login will break.

```ts
// Helpers (next to the form submit handler)
type FormField = IAttributesSetsEntity & {
  isLogin?: boolean | null
  isSignUp?: boolean | null
  isNotificationEmail?: boolean | null
  isNotificationPhoneSMS?: boolean | null
  isNotificationPhonePush?: boolean | null
}

const isPasswordField = (f: FormField) =>
  (f.additionalFields as Record<string, { value?: string }> | undefined)?.type?.value === 'password'

const isLoginCredential = (f: FormField) => f.isLogin === true || isPasswordField(f)

const isPureNotification = (f: FormField) => {
  const isNotif =
    f.isNotificationEmail === true ||
    f.isNotificationPhoneSMS === true ||
    f.isNotificationPhonePush === true
  return isNotif && !isLoginCredential(f)
}

// authData — only login-credentials
const authData = fields
  .filter(isLoginCredential)
  .filter((f) => values[f.marker]?.trim())
  .map((f) => ({ marker: f.marker, value: values[f.marker] }))

// formData — profile fields (everything except login-credentials and pure-notification)
const formData = fields
  .filter((f) => !isLoginCredential(f) && !isPureNotification(f))
  .filter((f) => values[f.marker]?.trim())
  .map((f) => ({ marker: f.marker, type: f.type as string, value: values[f.marker] }))

// notificationData — collected by notification flags
const notifEmailField = fields.find((f) => f.isNotificationEmail === true)
const loginField = fields.find((f) => f.isLogin === true)
const email =
  (notifEmailField && values[notifEmailField.marker]?.trim()) ||
  (loginField && values[loginField.marker]?.trim()) ||
  ''

const pushField = fields.find((f) => f.isNotificationPhonePush === true)
const phonePush = pushField && values[pushField.marker]?.trim() ? [values[pushField.marker]] : []

const smsField = fields.find((f) => f.isNotificationPhoneSMS === true)
const notificationData: ISignUpData['notificationData'] = { email, phonePush }
if (smsField && values[smsField.marker]?.trim()) {
  notificationData.phoneSMS = values[smsField.marker]
}

await getApi().AuthProvider.signUp(marker, {
  formIdentifier: 'reg',
  authData,
  formData,
  notificationData,
})
```

### Field Visibility by Modes

- **signin** — only login-credentials (`isLoginCredential(f)`)
- **signup** — all fields except pure-notification (`!isPureNotification(f)`); the value of the login field is reused as a fallback for `notificationData.email`

```ts
// ❌ INCORRECT — all fields in authData, name/address/phone lost
const body = {
  formIdentifier: 'reg',
  authData: fields.filter(f => values[f.marker]?.trim()).map(f => ({ marker: f.marker, value: values[f.marker] })),
  formData: [],
  notificationData: { email: values.email_reg, phonePush: [] },
}

// ✅ CORRECT — fields are routed by their flags
const body = {
  formIdentifier: 'reg',
  authData,       // only login + password
  formData,       // name, address, phone, …
  notificationData,
}
```

---

## Getting Provider Markers and formIdentifier

Do not guess markers (`"email"`, `"phone"`, etc.) — get the list from the API:

```ts
const providers = await getApi().AuthProvider.getAuthProviders()
// providers[0].identifier       — provider marker for auth()
// providers[0].formIdentifier   — form marker with fields for this provider
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

**`isCheckCode` — for account activation, NOT for login:**

`isCheckCode: true` means that after **registration** the user must confirm the email via code (`activateUser()`). This flag does not affect the **login** process — `auth()` with email + password works normally in both cases.

- `isCheckCode: true` → after `signUp()` call `activateUser(marker, email, code)`
- `isCheckCode: false` → after `signUp()` the account is immediately active, `activateUser()` is not needed

**Resending the code (MANDATORY when `isCheckCode: true`):**

The user may not receive the code — **ALWAYS** add a "Resend Code" button in verification mode.

- Call: `generateCode(marker, email, 'user_registration')` — directly from Client Component (fingerprint)
- Cooldown: `config.systemCodeTlsSec` seconds (get from `getAuthProviderByMarker`). By default ~80 sec
- Cooldown starts immediately after `signUp()` and after each resend
- The button is disabled during the cooldown, showing a countdown

```ts
// ✅ Resending the activation code
const result = await getApi().AuthProvider.generateCode(marker, email, 'user_registration')

// ❌ INCORRECT — 'login' for standard authorization, NOT for resending
await getApi().AuthProvider.generateCode(marker, email, 'login')
```

```ts
// ❌ INCORRECT — using generateCode() for standard login
await getApi().AuthProvider.generateCode(marker, email, 'login')

// ✅ CORRECT — auth() with email + password directly
const result = await getApi().AuthProvider.auth(marker, { authData })
```

---

## Dynamic Authorization Form Fields — MANDATORY PATTERN

**NEVER** hardcode `<input name="email_reg">` or `<input name="password_reg">`. Always load fields via `getFormByMarker(formIdentifier)`.

**Algorithm:**

1. Get providers → take `formIdentifier` of the desired provider
2. Call `getFormByMarker(formIdentifier)` → get `attributes[]`
3. Filter fields by purpose (sign-in vs sign-up)
4. Render dynamically by `attribute.type` and `attribute.marker`

```ts
// app/actions/auth.ts — 'use server'
// getSignInFields can be through Server Action — Forms API, fingerprint not needed

// Markers of auth fields (do not guess — get from the real API via /inspect-api)
const AUTH_FIELD_MARKERS = ['email_reg', 'password_reg']

export async function getSignInFields() {
  const form = await getApi().Forms.getFormByMarker('reg') // formIdentifier from provider
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

**Dynamic rendering in Client Component:**

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
- Run `/inspect-api forms` → see the form fields with this `identifier`
- Choose markers that are auth-credentials (email + password), not profile data (name, phone, address)

---

## OAuth Providers (Google, Facebook, etc.)

### Step 1: Redirect to the Provider's Authorization Page

Redirecting to Google (or another OAuth provider) is a **mandatory step**. Without it, you cannot obtain the `code`. `oauth()` requires `code` — it cannot be obtained otherwise than through the provider's redirect.

The base URL for authorization is stored in `config.oauthAuthUrl` of the provider (e.g., `"https://accounts.google.com/o/oauth2/v2/auth"`). Get it via `getAuthProviderByMarker`, then add query parameters:

> Full pattern with button, callback page, and Server Action — skill **`/create-google-oauth`**

### Step 2: Exchange Code for Tokens (callback page)

After redirecting, Google/etc. will return `?code=...` in the URL. Exchanging the code for tokens is **only through Server Action** (`'use server'`): `client_secret` must not reach the client.

> Full pattern — skill **`/create-google-oauth`**

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
