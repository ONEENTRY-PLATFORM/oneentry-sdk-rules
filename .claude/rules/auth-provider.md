---
paths:
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# AuthProvider — OneEntry Rules

## auth and signUp — ONLY from Client Component (fingerprint)

`auth()`, `signUp()`, `generateCode()`, `checkCode()`, `activateUser()`, `changePassword()` transmit the **fingerprint of the user's device**. On the server, the SDK also generates a fingerprint, but in `deviceInfo.browser` it will be `"Node.js/..."` instead of the user's actual browser. On the client, the fingerprint is built from the real characteristics of the browser and device. Important: the API ties the **refresh token** to the fingerprint (header `x-device-metadata`) — a token issued with the server fingerprint will not be refreshed from the browser.

**Exception (SDK ≥ 1.0.155):** server calls to auth methods are allowed with the browser's fingerprint passed through — on the client, get the string `getApi().AuthProvider.getDeviceMetadata()`, pass it to the Server Action, and there create a **separate per-request instance** `defineOneEntry(url, { token, deviceMetadata })` before the call. DO NOT call `setDeviceMetadata()` on the common server singleton — its state is shared among all visitors. The main case is server-side OAuth code exchange (see the OAuth section below). Client calls remain the default.

```ts
// ❌ UNDESIRABLE — through Server Action without deviceMetadata (fingerprint = Node.js,
// the issued refresh token will not be updated from the browser)
// src/app/actions/auth.ts → 'use server'
export async function signIn(marker, authData) {
  return await getApi().AuthProvider.auth(marker, { authData }) // browser in fingerprint = Node.js
}

// ✅ CORRECT — directly from Client Component
// src/components/AuthForm.tsx → 'use client'
import { getApi, isError } from '@/lib/oneentry'

const result = await getApi().AuthProvider.auth(marker, { authData })
if (isError(result)) { /* error handling */ return }
// Tokens do not need to be saved manually: auth() itself places them in state and calls saveFunction,
// which writes the refresh token under the key 'refresh-token' (see .claude/rules/tokens.md)
localStorage.setItem('authProviderMarker', marker) // marker — for proactive refresh
```

**Can be done through Server Action (fingerprint not needed):**

- `getAuthProviders()` / `getAuthProviderByMarker(marker)`
- `logout(marker, token)` — refreshToken is passed as a parameter
- `logoutAll(marker)`

---

## auth — user authorization

```ts
AuthProvider.auth(marker, body): Promise<IAuthEntity | IError>
```

**Parameters:**

- `marker` — text identifier of the authorization provider (e.g., `"email"`)
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

After a successful `auth`, tokens do not need to be saved **manually** — `auth()` itself places both tokens in state and calls `saveFunction`, which writes the refresh token under the key `'refresh-token'` (see `.claude/rules/tokens.md`); `accessToken` is not stored in localStorage at all. Only save the provider marker — the SDK needs it for proactive refresh:

```ts
localStorage.setItem('authProviderMarker', marker)
```

---

## signUp — registration

```ts
AuthProvider.signUp(marker, body: ISignUpData, langCode?): Promise<ISignUpEntity | IError>
```

**Critical rules:**

- `authData` — **only login credentials** (`{ marker, value }`, without empty strings): login identifier + password. NOT all fields of the form!
- `formData` — profile fields (first name, last name, address, phone, etc.) in the format `{ marker, type, value }`
- `notificationData.email` — value of the field with the flag `isNotificationEmail: true` (or fallback to the login field)
- `notificationData.phonePush` — array with the value of the field with the flag `isNotificationPhonePush: true` (skip if empty)
- `notificationData.phoneSMS` — do not pass if there is no value (empty string → 400)

### ⚠️ Field routing — by flags, NOT "everything in authData"

Fields from `getFormByMarker()` come with flags: `isLogin`, `isPassword`, `isSignUp`, `isSignUpRequired`, `isNotificationEmail`, `isNotificationPhoneSMS`, `isNotificationPhonePush`. Each field already carries its role — **do not lump all filled fields into `authData`**, otherwise profile fields (first name, address) will be lost and only login credentials will be sent to the server.

| Field Role                       | Where to send                                                      |
|----------------------------------|-------------------------------------------------------------------|
| `isLogin: true`                  | only `authData`                                                  |
| `isPassword: true`               | only `authData`                                                  |
| `isNotificationEmail: true`      | `notificationData.email` + `formData`                            |
| `isNotificationPhoneSMS: true`   | `notificationData.phoneSMS` (skip if empty) + `formData`       |
| `isNotificationPhonePush: true`  | `notificationData.phonePush` (array, if not empty) + `formData` |
| everything else (first name, address, etc.) | `formData` (profile data)                               |

> ⚠️ **Login credentials (`isLogin`, `isPassword`) go ONLY in `authData`**, NOT in `formData`. Notification fields go IN both `notificationData` AND `formData`. All other fields — in `formData`.
> ⚠️ `isSignUp: true` and `isSignUpRequired: true` — flags **only for the registration form**, NOT for routing: `isSignUp` shows the field in the registration UI, `isSignUpRequired` marks it as mandatory. Both are independent of each other and from `isPassword` / `isLogin`. Fields with them go in `formData`, unless `isLogin: true` or `isPassword: true` is additionally set.
> ⚠️ The password is determined ONLY by the flag `isPassword: true` and is always routed to `authData`. If the password is left in `formData` — login will break. Do not use detection through `additionalFields.type.value === 'password'` — this is an outdated method.
> ⚠️ `isSignUpRequired` — this is an independent indicator of "mandatory for registration". Do not confuse with `validators.requiredValidator.strict` — the validator remains a validator of the field (format, length, etc.) and does not determine "mandatory for signup".

```ts
// Helpers (next to the form submit handler)
// IFormAttribute from oneentry/dist/forms/formsInterfaces declares all seven flags (including
// isPassword and isSignUpRequired) — no need to extend the type. But the SDK normalizes null→false
// only for isLogin / isSignUp / isNotification*, so isPassword and isSignUpRequired
// may come as null — check flags strictly through `=== true`
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

// authData — only login credentials
const authData = fields
  .filter(isLoginCredential)
  .filter((f) => values[f.marker]?.trim())
  .map((f) => ({ marker: f.marker, value: values[f.marker] }))

// formData — all fields EXCEPT login credentials (they go only in authData)
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

- **signin** — only login credentials (`isLoginCredential(f)`)
- **signup** — all fields except pure-notification, BUT fields with `isSignUp: true` OR `isSignUpRequired: true` are always shown, even if they are notification (`!isPureNotification(f) || f.isSignUp === true || f.isSignUpRequired === true`); the value of the login field is reused as a fallback for `notificationData.email`
- **required for registration** — determine by `isSignUpRequired === true` (this exact flag, not `validators.requiredValidator.strict`). Validators remain a separate mechanism for checking format/length and do not answer for "mandatory for signup"

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
  formData,       // first name, address, phone, …
  notificationData,
}
```

---

## Getting provider markers and formIdentifier

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

The user may not receive the code — **ALWAYS** add a "Resend code" button in verification mode.

- Call: `generateCode(marker, email, eventIdentifier)` — directly from Client Component (fingerprint)
- **`eventIdentifier`** — event marker from the OneEntry admin panel (Events section). **DO NOT guess** — check in the admin panel!
- Cooldown: `config.systemCodeTlsSec` seconds (get from `getAuthProviderByMarker`). By default ~80 seconds. ⚠️ This cooldown is for **resending**, not the lifetime of the code — the code lives significantly longer (observed ~14 minutes)
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

`eventIdentifier` is the event marker set up in the OneEntry admin panel (Events section). Used in:

- `generateCode(marker, email, eventIdentifier)` — generating activation/reset code
- `checkCode(marker, email, eventIdentifier, code)` — checking the code
- `changePassword(marker, email, eventIdentifier, type, code, newPassword)` — changing the password

**⚠️ DO NOT hardcode event markers without checking!** Event markers are configured in the admin panel and are unique to each project. Always check the Events section in the admin panel.

**Typical event markers (check in YOUR project):**

| Purpose                          | Typical marker        | Where used                     |
|----------------------------------|-----------------------|--------------------------------|
| Activation upon registration      | `user_registration`   | `generateCode`, `activateUser`|
| Password reset                   | `password_reset`      | `generateCode`, `changePassword`|

**How to find the real marker:**

1. Open the OneEntry admin panel
2. Go to the **Events** section
3. Find the event related to the desired action (registration, password reset)
4. Copy the `identifier` (marker) of that event

**In code — always extract into named constants with a comment:**

```ts
// Event markers from the OneEntry admin panel (Events section)
// ⚠️ DO NOT guess — get the list via Events.getAllEvents() and verify the purpose in the admin panel → Events
const EVENT_REGISTRATION = 'user_registration'
const EVENT_PASSWORD_RESET = 'password_reset'
```

> The list of events can be obtained programmatically: `getApi().Events.getAllEvents()` (SDK ≥ 1.0.150, public — user authorization is not needed) returns `IContentApiEvent[]`, where `identifier` is the marker for `generateCode`/`checkCode`/`changePassword`, and `localizeInfos` hints at the event name. But there is no indicator of the **purpose** of the event in the response — which one is responsible for registration or password reset, still check in the admin panel → Events.
>
> ⚠️ On some tenants, the events route **is not granted to the guest group** — then `getAllEvents()` returns `401` with the app token (observed on a live project with SDK 1.0.155). This is a rights configuration, not code: either grant permission for the route (skill `/admin-grant-permissions`), or check the markers in the admin panel → Events or through the admin API (`GET /api/admin/events`, rule `admin-api`).

**One event for the entire flow.** The generated code "belongs" to the event: `generateCode`, `checkCode` and `changePassword` of one flow (for example, password reset) must go with the **same** `eventIdentifier` — a code issued by one event cannot be checked by another event. Consequence for UI: if one verification form serves both registration and password reset — the "Resend code" button must select the event based on the **current action**; otherwise, when registering, resend will issue a code under the reset event, and `activateUser` will not accept it.

**⚠️ The existence of an event is NOT checked by trial calls** (verified with live API — trial calls mask errors):

- `generateCode` responds with `400 "User already has a code"` while the user has an unredeemed code — and **a non-existent event gives the same error**. A series of trial calls is order-dependent: the first wins and masks the others — do not draw conclusions from such a series.
- `checkCode` returns `false` on any `eventIdentifier`, including non-existent ones — indistinguishable from an incorrect code.
- Reliable sources: admin panel → Events, admin API (`GET /api/admin/events`) or live flow run in the browser.

---

## Dynamic fields of the authorization form — MANDATORY PATTERN

**NEVER** hardcode `<input name="email_reg">` or `<input name="password_reg">`. Always load fields via `getFormByMarker(formIdentifier)`.

**Algorithm:**

1. Get providers → take the `formIdentifier` of the desired provider
2. Call `getFormByMarker(formIdentifier)` → get `attributes[]`
3. Filter fields by purpose (sign-in vs sign-up)
4. Render dynamically by `attribute.type` and `attribute.marker`

```ts
// src/app/actions/auth.ts — 'use server'
// getSignInFields can be done through Server Action — Forms API, fingerprint not needed

export async function getSignInFields() {
  const form = await getApi().Forms.getFormByMarker('reg') // formIdentifier from provider
  if (isError(form)) return { error: form.message }

  // For signin, only login credentials are needed — filter by isLogin / isPassword flags
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

// ⚠️ auth — NOT through Server Action, call directly from Client Component (fingerprint)
```

**Calling auth in Client Component:**

```ts
// 'use client'
import { getApi, isError } from '@/lib/oneentry'

// authData on submit — build from real fields, filter out empty
const result = await getApi().AuthProvider.auth('email', { authData })
if (isError(result)) return { error: result.message }
// Tokens are saved by the SDK itself (saveFunction → key 'refresh-token', see .claude/rules/tokens.md)
localStorage.setItem('authProviderMarker', 'email') // for proactive refresh
```

**Dynamic rendering in Client Component:**

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

- Run `/inspect-api auth-providers` → see the `formIdentifier` of the provider
- Run `/inspect-api forms` → see the fields of the form with this `identifier` and their flags
- For signin, take fields with `isLogin === true` and `isPassword === true` — filter by flags, NOT by marker name and NOT by the AUTH_FIELD_MARKERS list
- Profile fields (first name, phone, address) have both flags `false` → they are NOT needed for signin

---

## OAuth providers (Google, Facebook, etc.)

### Step 1: Redirect to the provider's authorization page

Redirecting to Google (or another OAuth provider) is a **mandatory step**. Without it, it is impossible to obtain `code`. `oauth()` requires `code` — it cannot be obtained otherwise than through the provider's redirect.

The base URL for authorization is stored in `config.oauthAuthUrl` of the provider (e.g., `"https://accounts.google.com/o/oauth2/v2/auth"`). Get it through `getAuthProviderByMarker`, then add query parameters:

> Full pattern with button, callback page, and Server Action — skill **`/create-google-oauth`**

### Step 2: Exchange code for tokens (callback page)

After redirecting, Google/etc. will return `?code=...` in the URL. Exchanging the code for tokens is **only through Server Action** (`'use server'`): `client_secret` must not reach the client.

⚠️ The API ties the refresh token to the header `x-device-metadata`, so when exchanging the code on the server, the instance must stamp the **browser's** fingerprint (SDK ≥ 1.0.155): on the callback page, take the string `getApi().AuthProvider.getDeviceMetadata()`, pass it to the Server Action, there create a per-request instance `defineOneEntry(PROJECT_URL, { token: APP_TOKEN, deviceMetadata })` and call `oauth()` on it (`setDeviceMetadata()` on the common singleton — a race between concurrent requests from different users). Without passing, the refresh token will be tied to the Node fingerprint of the server and will not be updated from the browser; before 1.0.155 this required raw `fetch` to bypass the SDK.

> Full pattern — skill **`/create-google-oauth`**

---

## logout

```ts
// marker is taken from localStorage (saved at login)
export async function logout(marker: string, token: string) {
  const result = await getApi().AuthProvider.logout(marker, token)
  if (isError(result)) return { error: result.message, statusCode: result.statusCode }
  return { success: true }
}
```

> Related rules:
>
> - `.claude/rules/performance-popups.md` — authorization forms (login / signup / OTP) are usually hosted inside a `Modal` popup through `PopupRoot`; the form loader is added to `popupRegistry`, prefetch when hovering over the login button.
