---
name: create-captcha
description: Wire up the reCAPTCHA v3 Enterprise `spam` field of a OneEntry form so postFormsData actually validates
---
# Add reCAPTCHA (the `spam` field) to a OneEntry form

Use this when a OneEntry form (from `getFormByMarker`) contains a field of
`type: 'spam'`. It is an **invisible reCAPTCHA v3 Enterprise** challenge. A form
that has a `spam` field is rejected by `postFormsData` unless the token is sent
in the exact shape below — this skill is the verified, end-to-end recipe.

> The parent skill — `/create-form` (general dynamic form). This skill —
> a precise addition specifically for the captcha: connect it as soon as
> `form.attributes` has a field `type: 'spam'`. The rule for forms — `forms` (rules).

> ⚠️ This corrects several inaccuracies in `create-form` / the `forms` rule /
> `load-context`. The details below were verified against a live OneEntry
> backend (error-by-error) — trust them over the older docs.

---

## The 5 things everyone gets wrong

| # | Claim in old docs | Reality (verified) |
| - | --- | --- |
| 1 | Site key is in `spam.validators.siteKey` | Site key is in **`spam.settings.captcha.key`** (`validators` is `{}` for `spam`). Also `settings.captcha.action` and `settings.captcha.domainNames`. |
| 2 | Load classic `api.js`, call `grecaptcha.execute` | Load **`enterprise.js`**, call **`grecaptcha.enterprise.execute`**. The backend error says `captcha type: google` — that label is misleading, it is still Enterprise. |
| 3 | `spam` value is the token string: `value: token` | `spam` value is the **object `{ event: { token, siteKey } }`**. A raw string → `400 "Captcha Validation Failed"`. |
| 4 | Any form with fields can be submitted | The form also needs a **module config** (`moduleFormConfigs[0]`). Without one, `formModuleConfigId: 0` → `400 "Incorrect formIdentifier for provided config"`. Configure it in the admin. |
| 5 | `status: 'sent'` | Use **`status: ''`** for a data form (matches working projects). |

**Backend validation order:** module config first, then captcha. So a
"Captcha Validation Failed" that appears *after* you fix the config means the
captcha assessment itself ran — see the headless caveat at the bottom.

---

## Step 1 — Read the captcha config off the form attribute

```ts
type SpamSettings = { captcha?: { key?: string; action?: string } };

const spamField = form.attributes.find((f) => f.type === 'spam');
const siteKey = (spamField?.settings as SpamSettings | undefined)?.captcha?.key ?? '';
// OneEntry stores the scoring action here; default to 'login' when absent.
const action = (spamField?.settings as SpamSettings | undefined)?.captcha?.action ?? 'login';
```

If `spamField` exists but `siteKey` is empty, the admin has not finished
configuring the captcha — the form cannot be submitted; degrade gracefully.

---

## Step 2 — Load reCAPTCHA Enterprise (a small loader component)

Loads the Enterprise script and reports readiness. It does NOT cache a token —
v3 tokens expire in ~2 min, so the token is minted fresh at submit time.

```tsx
'use client';

import type { Dispatch, JSX, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, opts: { action: string }) => Promise<string>;
      };
    };
  }
}

/** Invisible reCAPTCHA v3 Enterprise loader for a form's `spam` field. */
export function FormReCaptcha({
  siteKey,
  setIsReady,
}: {
  siteKey: string;
  setIsReady: Dispatch<SetStateAction<boolean>>;
}): JSX.Element {
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;

    const markReady = () => {
      if (typeof window === 'undefined' || !window.grecaptcha?.enterprise) return;
      window.grecaptcha.enterprise.ready(() => setIsReady(true));
    };

    const existing = document.querySelector('script[src*="recaptcha/enterprise.js"]');
    if (existing) {
      loadedRef.current = true;
      markReady();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      loadedRef.current = true;
      markReady();
    };
    script.onerror = () => setIsReady(false);
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <></>;
}
```

Render it only once a site key exists, and gate submission on readiness:

```tsx
const [captchaReady, setCaptchaReady] = useState(false);

{siteKey && <FormReCaptcha siteKey={siteKey} setIsReady={setCaptchaReady} />}

<button type="submit" disabled={loading || (!!siteKey && !captchaReady)}>Send</button>
```

---

## Step 3 — Build the `spam` answer (fresh token, object value)

Inside `handleSubmit`, after mapping the data fields, append the captcha answer:

```ts
if (spamField) {
  const token =
    siteKey && typeof window !== 'undefined' && window.grecaptcha
      ? await window.grecaptcha.enterprise.execute(siteKey, { action })
      : '';

  formData.push({
    marker: spamField.marker,
    type: 'spam',
    // ⚠️ OBJECT, not the bare token string.
    value: { event: { token, siteKey } },
  });
}
```

Other field types are mapped as usual (`text` → `[{ plainValue }]`, `list` →
`[value]`, etc.). Exclude `button`; include `spam` only via the block above.

---

## Step 4 — Submit with the form's real module config

```ts
const config = form.moduleFormConfigs?.[0]; // REQUIRED to be non-empty (see Step 5)

await getApi().FormData.postFormsData({
  formIdentifier: form.identifier,
  formData,
  formModuleConfigId: config?.id ?? 0,
  moduleEntityIdentifier: config?.entityIdentifiers?.[0]?.id ?? '',
  replayTo: null,
  status: '', // not 'sent'
});
```

`postFormsData` returns `IPostFormResponse | IError` — a failed captcha/config is
a returned value, not a throw. Check `isError(result)` before showing success.

---

## Step 5 — OneEntry admin checklist (must be done by a human)

The frontend is only half of it. In the OneEntry admin, the form needs:

1. **Captcha on the `spam` field** — a reCAPTCHA v3 **Enterprise** site key +
   its allowed domains (include `localhost` for dev and the production host).
   This populates `settings.captcha.key`.
2. **The server-side assessment credential** — Enterprise verification runs
   server-side (Google Cloud assessment API). The public site key alone is not
   enough; the project must also hold the assessment key/secret. If a real user
   still gets `Captcha Validation Failed`, this is what is missing.
3. **A module config on the form** — connect the form to a module (e.g.
   `content` → an entity like `contacts`). This populates `moduleFormConfigs`.
   Without it, `getFormByMarker().moduleFormConfigs` is `[]`, `formModuleConfigId`
   defaults to `0`, and every submit fails with
   `"Incorrect formIdentifier for provided config"`.

Verify `moduleFormConfigs` is non-empty:

```bash
curl -s "$URL/api/content/forms/marker/<marker>?langCode=en_US" \
  -H "x-app-token: $TOKEN" | jq '.moduleFormConfigs, .attributes[]|select(.type=="spam").settings'
```

---

## Headless / automated-test caveat

**reCAPTCHA v3 cannot be passed from a headless or automated browser**
(Playwright, Puppeteer): Google returns a bot-like score and OneEntry rejects
the token with `400 "Captcha Validation Failed"` — even when the token shape,
site key, module config, and secret are all correct. This is by design, not a
bug in your code. In e2e tests, `test.skip` the successful-submission assertion
for forms with a `spam` field and verify rendering/validation only. Confirm a
real submission manually in a normal browser, then check the delivered data in
the admin (the module/entity from the form's module config).
