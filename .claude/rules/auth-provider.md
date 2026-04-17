<!-- META
type: rules
fileName: auth-provider.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# AuthProvider — OneEntry Rules

## auth and signUp — ONLY from Client Component (fingerprint)

`auth()`, `signUp()`, `generateCode()`, `checkCode()`, `activateUser()`, `changePassword()` transmit the **fingerprint of the user's device**. On the server, the SDK also generates a fingerprint, but in `deviceInfo.browser` it will be `"Node.js/..."` instead of the user's actual browser. On the client, the fingerprint is built from the real characteristics of the browser and device.

```ts
// ❌ UNDESIRABLE — via Server Action (deviceInfo.browser = "Node.js/...", not the real browser)
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

**Can be done via Server Action (fingerprint not needed):**

- `getAuthProviders()` / `getAuthProviderByMarker(marker)`
- `logout(marker, token)` — refreshToken is passed as a parameter
- `logoutAll(marker)`

---

## auth — user authorization

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

After a successful `auth` — save the tokens:

```ts
localStorage.setItem('accessToken', result.accessToken)
localStorage.setItem('refreshToken', result.refreshToken)
localStorage.setItem('authProviderMarker', marker)
```

---

## signUp — registration

```ts
AuthProvider.signUp(marker, body: ISignUpData, langCode?): Promise<ISignUpEntity | IError>
```

**Critical rules:**

- `authData` — **only login-credentials** (`{ marker, value }`, without empty strings): login identifier + password. NOT all form fields!
- `formData` — profile fields (name, surname, address, phone, etc.) in the format `{ marker, type, value }`
- `notificationData.email` — value of the field with the flag `isNotificationEmail: true` (or fallback to the login field)
- `notificationData.phonePush` — array with the value of the field with the flag `isNotificationPhonePush: true` (skip if empty)
- `notificationData.phoneSMS` — do not send if there is no value (empty string → 400)

### ⚠️ Field routing — by flags, NOT "everything in authData"

Fields from `getFormByMarker()` come with flags: `isLogin`, `isPassword`, `isSignUp`, `isSignUpRequired`, `isNotificationEmail`, `isNotificationPhoneSMS`, `isNotificationPhonePush`. Each field already carries its role — **do not dump all filled fields into `authData`**, otherwise profile fields (name, address) are lost and only login credentials are sent to the server.

| Field Role                       | Where to send                                                   |
|-----------------------------------|----------------------------------------------------------------|
| `isLogin: true`                   | only `authData`                                               |
| `isPassword: true`                | only `authData`                                               |
| `isNotificationEmail: true`       | `notificationData.email` + `formData`                         |
| `isNotificationPhoneSMS: true`    | `notificationData.phoneSMS` (skip if empty) + `formData`     |
| `isNotificationPhonePush: true`   | `notificationData.phonePush` (array, if not empty) + `formData` |
| everything else (name, address, etc.) | `formData` (profile data)                                   |

> ⚠️ **Login-credentials (`isLogin`, `isPassword`) go ONLY in `authData`**, NOT in `formData`. Notification fields go IN both `notificationData` AND `formData`. All other fields — in `formData`.
> ⚠️ `isSignUp: true` and `isSignUpRequired: true` — flags **only for the registration form**, NOT for routing: `isSignUp` shows the field in the registration UI, `isSignUpRequired` marks it as mandatory. Both are independent of each other and from `isPassword` / `isLogin`. Fields with them go in `formData`, unless `isLogin: true` or `isPassword: true` is additionally set.
> ⚠️ The password is determined ONLY by the flag `isPassword: true` and is always routed to `authData`. If the password is left in `formData` — login will break. Do not use detection via `additionalFields.type.value === 'password'` — this is an outdated method.
> ⚠️ `isSignUpRequired` — this is an independent indicator of "mandatory during registration". Do not confuse with `validators.requiredValidator.strict` — the validator remains a validator of the field (format, length, etc.) and does not determine "mandatory for signup".

```ts
// Helpers (next to the form submit handler)
// IFormAttribute already contains isLogin, isSignUp, isNotification*; extending with two new flags,
// which the API returns, but the SDK interface does not declare yet
import type { IFormAttribute } from 'oneentry/dist/forms/formsInterfaces'

const isLoginCredential = (f: IFormAttribute) => f.isLogin === true || f.isPassword === true

const isPureNotification = (f: IFormAttribute) => {
  const isNotif =
    f.isNotificationEmail === true ||
    f.isNotificationPhoneSMS === true ||
    f.isNotificationPhonePush === true
  // isSignUp / isSignUpRequired → the field is visible in the registration UI, so it is NOT "pure notification"
  return (
    isNotif &&
    !isLoginCredential(f) &&
    f.isSignUp !== true &&
    f.isSignUpRequired !== true
  )
}

// authData — only login-credentials
const authData = fields
  .filter(isLoginCredential)
  .filter((f) => values[f.marker]?.trim())
  .map((f) => ({ marker: f.marker, value: values[f.marker] }))

// formData — all fields EXCEPT login-credentials (they go only in authData)
// Notification fields (phone, email_notifications) ARE INCLUDED in formData
const formData = fields
  .filter((f) => !isLoginCredential(f))
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

### Field visibility by modes

- **signin** — only login-credentials (`isLoginCredential(f)`)
- **signup** — all fields except pure-notification, BUT fields with `isSignUp: true` OR `isSignUpRequired: true` are always shown, even if they are notification (`!isPureNotification(f) || f.isSignUp === true || f.isSignUpRequired === true`); the value of the login field is reused as a fallback for `notificationData.email`
- **required during registration** — determine by `isSignUpRequired === true` (this flag specifically, not `validators.requiredValidator.strict`). Validators remain a separate mechanism for checking format/length and do not account for "mandatory for signup".

> ⚠️ `isSignUp: true` and `isSignUpRequired: true` override `isPureNotification` for **visibility**. Example: `phone_reg` has `isNotificationPhonePush: true` AND `isSignUpRequired: true` — it MUST be displayed in the registration form and marked as mandatory. Its value is routed IN both `formData` (profile) AND `notificationData.phonePush` (push notifications).

```ts
// ❌ INCORRECT — all fields in authData, name/address/phone are lost
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

## Getting provider markers and formIdentifier

Do not guess markers (`"email"`, `"phone"` etc.) — get the list from the API:

```ts
const providers = await getApi().AuthProvider.getAuthProviders()
// providers[0].identifier       — provider marker for auth()
// providers[0].formIdentifier   — form marker with fields for this provider
```

**Full structure of the provider's response:**

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

`isCheckCode: true` means that after **registration**, the user must confirm the email via a code (`activateUser()`). This flag does not affect the **login** process — `auth()` with email + password works normally in both cases.

- `isCheckCode: true` → after `signUp()` call `activateUser(marker, email, code)`
- `isCheckCode: false` → after `signUp()` the account is immediately active, `activateUser()` is not needed

**Resending the code (MANDATORY when `isCheckCode: true`):**

The user may not receive the code — **ALWAYS** add a "Resend code" button in the verification mode.

- Call: `generateCode(marker, email, eventIdentifier)` — directly from Client Component (fingerprint)
- **`eventIdentifier`** — event marker from the OneEntry admin panel (Events section). **DO NOT guess** — check in the admin panel!
- Cooldown: `config.systemCodeTlsSec` seconds (get from `getAuthProviderByMarker`). By default ~80 seconds
- The cooldown starts immediately after `signUp()` and after each resend
- The button is disabled during the cooldown, showing a countdown

```ts
// ⚠️ Event markers — get from the admin panel (Events section), DO NOT hardcode without checking!
const EVENT_REGISTRATION = 'user_registration'   // ← check in the admin panel!
const EVENT_PASSWORD_RESET = 'password_reset'     // ← check in the admin panel!

// ✅ Resending the activation code
const result = await getApi().AuthProvider.generateCode(marker, email, EVENT_REGISTRATION)

// ❌ INCORRECT — guessing event markers without checking in the admin panel
await getApi().AuthProvider.generateCode(marker, email, 'login')
```

```ts
// ❌ INCORRECT — using generateCode() for standard login
await getApi().AuthProvider.generateCode(marker, email, 'login')

// ✅ CORRECT — auth() with email + password directly
const result = await getApi().AuthProvider.auth(marker, { authData })
```

---

## eventIdentifier — event markers for generateCode / checkCode / changePassword

`eventIdentifier` is the event marker configured in the OneEntry admin panel (Events section). Used in:

- `generateCode(marker, email, eventIdentifier)` — generating activation/reset code
- `checkCode(marker, email, eventIdentifier, code)` — checking the code
- `changePassword(marker, email, eventIdentifier, type, code, newPassword)` — changing the password

**⚠️ DO NOT hardcode event markers without checking!** Event markers are configured in the admin panel and are unique for each project. Always check the Events section in the admin panel.

**Typical event markers (check in YOUR project):**

| Purpose | Typical marker | Where used |
| --- | --- | --- |
| Activation upon registration | `user_registration` | `generateCode`, `activateUser` |
| Password reset | `password_reset` | `generateCode`, `changePassword` |

**How to find the real marker:**

1. Open the OneEntry admin panel
2. Go to the **Events** section
3. Find the event related to the desired action (registration, password reset)
4. Copy the `identifier` (marker) of that event

**In code — always extract into named constants with a comment:**

```ts
// Event markers from the OneEntry admin panel (Events section)
// ⚠️ DO NOT guess — check in the admin panel → Events
const EVENT_REGISTRATION = 'user_registration'
const EVENT_PASSWORD_RESET = 'password_reset'
```

> The SDK does not have a method for programmatically obtaining the list of events. The source of truth is the admin panel.

---

## Dynamic fields of the authorization form — MANDATORY PATTERN

**NEVER** hardcode `<input name="email_reg">` or `<input name="password_reg">`. Always load fields via `getFormByMarker(formIdentifier)`.

**Algorithm:**

1. Get providers → take the `formIdentifier` of the desired provider
2. Call `getFormByMarker(formIdentifier)` → get `attributes[]`
3. Filter fields by purpose (sign-in vs sign-up)
4. Render dynamically by `attribute.type` and `attribute.marker`

```ts
// app/actions/auth.ts — 'use server'
// getSignInFields can be done via Server Action — Forms API, fingerprint not needed

export async function getSignInFields() {
  const form = await getApi().Forms.getFormByMarker('reg') // formIdentifier from the provider
  if (isError(form)) return { error: form.message }

  // For signin, only login-credentials are needed — filter by isLogin / isPassword flags
  // (not by marker name, not by AUTH_FIELD_MARKERS)
  const fields = (form as any).attributes
    .filter((a: any) => a.isLogin === true || a.isPassword === true)
    .sort((a: any, b: any) => a.position - b.position)
    .map((a: any) => ({
      marker: a.marker as string,
      type: a.type as string,
      label: (a.localizeInfos as any)?.title ?? a.marker,
      isLogin: a.isLogin === true,
      isPassword: a.isPassword === true,
      // In signin, login and password are always required
      required: true,
    }))

  return { fields }
}

// ⚠️ auth — NOT via Server Action, call directly from Client Component (fingerprint)
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
// Determine the type of <input> by field flags (type from API — always "string", do not rely on it)
function getInputType(f: {
  marker: string
  isPassword?: boolean | null
  isLogin?: boolean | null
  isNotificationEmail?: boolean | null
  isNotificationPhoneSMS?: boolean | null
  isNotificationPhonePush?: boolean | null
}) {
  if (f.isPassword === true) return 'password'
  if (f.isNotificationEmail === true || f.isLogin === true) return 'email'
  if (f.isNotificationPhoneSMS === true || f.isNotificationPhonePush === true) return 'tel'
  // Last fallback — by marker name (when flags are not set)
  const m = f.marker.toLowerCase()
  if (m.includes('email') || m.includes('login')) return 'email'
  return 'text'
}

// Render field (required — by isSignUpRequired in registration mode, by isLogin/isPassword in signin)
{fields.map((field) => (
  <div key={field.marker} className="input-group">
    <label htmlFor={field.marker}>{field.label}</label>
    <input
      id={field.marker}
      name={field.marker}
      type={getInputType(field)}
      required={field.isSignUpRequired === true || field.isLogin === true || field.isPassword === true}
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

**How to find login and password fields in the form:**

- Run `/inspect-api auth-providers` → check the `formIdentifier` of the provider
- Run `/inspect-api forms` → check the form fields with this `identifier` and their flags
- For signin, take fields with `isLogin === true` and `isPassword === true` — filter by flags, NOT by marker name and NOT by the list of AUTH_FIELD_MARKERS
- Profile fields (name, phone, address) have both flags `false` → they are NOT needed for signin

---

## OAuth providers (Google, Facebook, etc.)

### Step 1: Redirect to the provider's authorization page

Redirecting to Google (or another OAuth provider) is a **mandatory step**. Without it, it is impossible to obtain the `code`. `oauth()` requires `code` — it cannot be obtained otherwise than through the provider's redirect.

The base URL for authorization is stored in `config.oauthAuthUrl` of the provider (e.g., `"https://accounts.google.com/o/oauth2/v2/auth"`). Get it via `getAuthProviderByMarker`, then add query parameters:

> Full pattern with button, callback page, and Server Action — skill **`/create-google-oauth`**

### Step 2: Exchange code for tokens (callback page)

After the redirect, Google/etc. will return `?code=...` in the URL. Exchanging the code for tokens is **only through Server Action** (`'use server'`): `client_secret` must not reach the client.

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
