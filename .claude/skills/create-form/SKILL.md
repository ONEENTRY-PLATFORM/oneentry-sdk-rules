---
name: create-form
description: Create dynamic form from OneEntry Forms API
---
# Create a dynamic form from OneEntry Forms API

Argument: `marker` (form marker in OneEntry)

---

## Step 1: Get the form marker

If the marker is not provided:

```bash
/inspect-api forms
```

Look at the `identifier` field — this is the marker for `getFormByMarker()`.

Or directly via the API:

```typescript
const res = await getApi().Forms.getAllForms();
if (isError(res)) { /* handle error: res.message, res.statusCode */ }
// res.items[].identifier — form marker (res — paginated object { total, items })
```

**⚠️ DO NOT guess the marker** (`contact`, `feedback`, etc.).

---

## Step 2: Clarify with the user

1. **Where is the data sent?**
   - To OneEntry via `postFormsData` — standard scenario
   - To another endpoint — different logic needed
2. **Is captcha needed?** — the form may contain a field of type `spam` (reCAPTCHA v3)
3. **Where is the form displayed?** (page, modal, drawer?)
4. **Is there a layout?** — if yes, copy it exactly

---

## Step 3: Create Server Actions

### app/actions/forms.ts

> If the file already exists — read and supplement, do not duplicate.

```typescript
// app/actions/forms.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IFormsEntity, IFormAttribute } from 'oneentry/dist/forms/formsInterfaces';

// ⚠️ Validators return message as string[] — markers of fields with errors
// To show custom messages, build a map from form attributes
function buildValidatorErrorMap(attributes: IFormAttribute[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const attr of attributes) {
    const msg = Object.values(attr.validators || {})
      .map((v: any) => v?.errorMessage)
      .find(Boolean);
    if (msg) map[attr.marker] = msg as string;
  }
  return map;
}

function mapErrors(message: string | string[], validatorErrors: Record<string, string>): string {
  const msgs = Array.isArray(message) ? message : [message];
  return msgs.map(m => validatorErrors[m] || m).join('; ');
}

// Getting the form structure — returning attributes as is from the API (IFormAttribute[])
export async function getFormByMarker(marker: string, locale = 'en_US') {
  const form = await getApi().Forms.getFormByMarker(marker, locale);
  if (isError(form)) return { error: String(form.message), statusCode: form.statusCode };
  const f = form as IFormsEntity;
  const config = f.moduleFormConfigs?.[0];

  return {
    identifier: f.identifier,
    localizeInfos: f.localizeInfos, // IFormLocalizeInfo — title, titleForSite, successMessage, ...
    formModuleConfigId: config?.id ?? 0,
    moduleEntityIdentifier: config?.entityIdentifiers?.[0]?.id ?? '',
    attributes: f.attributes, // IFormAttribute[] — passing as is, without mapping
  };
}

// Submitting form data
export async function submitForm(
  formIdentifier: string,
  formModuleConfigId: number,
  moduleEntityIdentifier: string,
  formData: Array<{ marker: string; type: string; value: any }>,
  attributes: IFormAttribute[],
) {
  const result = await getApi().FormData.postFormsData({
    formIdentifier,
    formModuleConfigId,
    moduleEntityIdentifier,
    replayTo: null,
    status: '', // data-form: '' (NOT 'sent') — verified with working projects
    formData,
  }) as any;
  if (isError(result)) {
    const validatorErrors = buildValidatorErrorMap(attributes);
    return { error: mapErrors(result.message, validatorErrors), statusCode: result.statusCode };
  }
  return { success: true, id: result.formData?.id };
}
```

---

## Step 4: Create the form component

### Key principles

- Fields are rendered **dynamically** by `field.type` — do not hardcode `<input>`
- The `spam` field is an **invisible captcha** (reCAPTCHA v3), render `<FormReCaptcha>`, NOT `<input>`
- Type `'spam'`, not `'captcha'` — a common mistake!
  - ⚠️ **If the form has a `spam` field — use `/create-captcha`**: this is a verified
    end-to-end recipe (siteKey from `settings.captcha.key`, `value` of the spam field — object
    `{ event: { token, siteKey } }`, `status: ''`, mandatory module config). The captcha blocks
    below are adjusted to it, but `/create-captcha` is the source of truth.
- `formData` for submission — `{ marker, type, value }`, only non-empty values (`type` is mandatory: the SDK filters button fields and triggers upload file/image/groupOfImages)
- Fields `file`/`image`/`groupOfImages` — in `value` only `File[]`, never a string: string value crashes `postFormsData` entirely (TypeError), not just skips the upload

### Field type → HTML table

| `field.type`                | Render                                            |
|-----------------------------|---------------------------------------------------|
| `string`                    | `<input type="text">`                             |
| `integer`, `real`, `float`  | `<input type="number">`                           |
| `text`                      | `<textarea>`                                      |
| `date`                      | `<input type="date">`                             |
| `dateTime`                  | `<input type="datetime-local">`                   |
| `time`                      | `<input type="time">`                             |
| `list`                      | `<select>`, `<select multiple>` or `<checkbox>`  |
| `radioButton`               | `<input type="radio">`                            |
| `file`, `image`             | `<input type="file">` — uncontrolled, in state `File[]` |
| `groupOfImages`             | `<input type="file" multiple>` — uncontrolled, in state `File[]` |
| `spam`                      | `<FormReCaptcha>` — NOT `<input>`!                 |
| `button`                    | NOT input: skip (the SDK filters button fields during submission) |
| `textWithHeader`            | decorative header/text, NOT input                  |
| `entity`, `timeInterval`    | skip — do not render as text input                 |

#### components/DynamicForm.tsx

```tsx
// components/DynamicForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { getFormByMarker, submitForm } from '@/app/actions/forms';

interface DynamicFormProps {
  marker: string;      // form marker in OneEntry
  locale?: string;
  onSuccess?: () => void;
}

export function DynamicForm({ marker, locale = 'en_US', onSuccess }: DynamicFormProps) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string | File[]>>({}); // File[] — for file/image/groupOfImages
  const [formId, setFormId] = useState('');
  const [formModuleConfigId, setFormModuleConfigId] = useState(0);
  const [moduleEntityIdentifier, setModuleEntityIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Captcha state (needed if the form contains a spam field)
  const [captchaToken, setCaptchaToken] = useState('');
  const [isCaptcha, setIsCaptcha] = useState(false);
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);

  useEffect(() => {
    getFormByMarker(marker, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFormId(result.identifier);
      setFormModuleConfigId(result.formModuleConfigId);
      setModuleEntityIdentifier(result.moduleEntityIdentifier);
      // Sorting fields by position. SDK ≥ 1.0.157 sorts attributes itself —
      // the line remains as protection for projects on older SDK versions.
      const sorted = [...result.attributes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      setFields(sorted);
      setFormLoading(false);
    });
  }, [marker, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCaptcha && !isCaptchaValid) {
      setError('Please complete captcha');
      return;
    }

    setLoading(true);
    setError('');

    // The SDK expects structured values for some types (see IBodyPostFormData in formsDataInterfaces)
    const mapValue = (f: any, v: string | File[]) => {
      if (Array.isArray(v)) return v; // File[] (file/image/groupOfImages) — the SDK will upload files itself
      if (['date', 'dateTime', 'time'].includes(f.type)) {
        // ITimeDateValue; formattedValue — string by formatString mask
        return { fullDate: new Date(v).toISOString(), formattedValue: v, formatString: 'DD-MM-YYYY HH:mm' };
      }
      if (f.type === 'text') {
        // exactly ONE of htmlValue/plainValue/mdValue
        return [{ plainValue: v, params: { isImageCompressed: true, editorMode: 'plain' } }];
      }
      // list: array of VALUES of selected options (for multiple — all selected);
      // [{ title, value, extended }] — reading format (getFormsDataByMarker), NOT sending
      if (f.type === 'list') return [v];
      return v; // string/integer/real/float/radioButton — flat string
    };

    const notEmpty = (v: string | File[] | undefined): v is string | File[] =>
      v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== '');

    const formData = fields
      .filter(f => f.type !== 'spam' && notEmpty(values[f.marker]))
      .map(f => ({ marker: f.marker, type: f.type, value: mapValue(f, values[f.marker]!) }));

    // Captcha token — in the value of the spam field itself (its marker is arbitrary, set in the admin panel).
    // ⚠️ value — OBJECT { event: { token, siteKey } }, NOT a raw string of the token!
    // Raw string → 400 "Captcha Validation Failed". Full recipe — /create-captcha.
    const spamField = fields.find(f => f.type === 'spam');
    if (captchaToken && spamField) {
      const siteKey = spamField.settings?.captcha?.key || '';
      formData.push({
        marker: spamField.marker,
        type: 'spam',
        value: { event: { token: captchaToken, siteKey } },
      });
    }

    const result = await submitForm(formId, formModuleConfigId, moduleEntityIdentifier, formData, fields);

    setLoading(false);

    if ('error' in result) {
      setError(result.error || 'Submission failed');
      return;
    }

    setSuccess('Form submitted successfully!');
    setValues({});
    onSuccess?.();
  };

  if (formLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((field) => (
        <div key={field.marker}>
          {renderField(field, values, setValues, {
            setCaptchaToken,
            setIsCaptcha,
            setIsCaptchaValid,
          })}
        </div>
      ))}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={loading || (isCaptcha && !isCaptchaValid)}>
        {loading ? 'Sending...' : 'Submit'}
      </button>
    </form>
  );
}

// Render field by type
function renderField(
  field: any,
  values: Record<string, string | File[]>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | File[]>>>,
  captchaHandlers: {
    setCaptchaToken: (t: string) => void;
    setIsCaptcha: (v: boolean) => void;
    setIsCaptchaValid: (v: boolean) => void;
  },
) {
  const label = field.localizeInfos?.title || field.marker;
  const placeholder = field.additionalFields?.placeholder?.value || '';
  const raw = values[field.marker];
  const value = typeof raw === 'string' ? raw : ''; // File[] is stored only for file/image/groupOfImages
  const required = !!field.validators?.requiredValidator?.strict;
  const onChange = (val: string | File[]) => setValues(prev => ({ ...prev, [field.marker]: val }));

  // ⚠️ spam = reCAPTCHA v3, NOT input! Full verified recipe — /create-captcha
  if (field.type === 'spam') {
    // ⚠️ siteKey and action are taken from settings.captcha, NOT from validators (spam validators === {}).
    const siteKey = field.settings?.captcha?.key || '';
    const action = field.settings?.captcha?.action || 'login';
    if (!siteKey) return null;
    // Import FormReCaptcha and use it here:
    // return (
    //   <FormReCaptcha
    //     key={field.marker}
    //     siteKey={siteKey}
    //     action={action}
    //     setToken={captchaHandlers.setCaptchaToken}
    //     setIsCaptcha={captchaHandlers.setIsCaptcha}
    //     setIsValid={captchaHandlers.setIsCaptchaValid}
    //   />
    // );
    return null; // Replace with FormReCaptcha
  }

  if (field.type === 'text') {
    return (
      <>
        <label htmlFor={field.marker}>{label}</label>
        <textarea
          id={field.marker}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  }

  if (field.type === 'list') {
    // listTitles — top-level field IFormAttribute (IListTitle[]: { title, value, position?, extended? }), NOT in localizeInfos
    const options = field.listTitles || [];
    return (
      <>
        <label htmlFor={field.marker}>{label}</label>
        <select
          id={field.marker}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Select —</option>
          {options.map((opt: any) => (
            <option key={opt.value} value={opt.value}>{opt.title}</option>
          ))}
        </select>
      </>
    );
  }

  if (field.type === 'radioButton') {
    const options = field.listTitles || [];
    return (
      <>
        <span>{label}</span>
        {options.map((opt: any) => (
          <label key={opt.value}>
            <input
              type="radio"
              name={field.marker}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.title}
          </label>
        ))}
      </>
    );
  }

  // file / image / groupOfImages: uncontrolled input WITHOUT passing value, in state we put File[].
  // Array.from is mandatory: raw FileList cannot be serialized across the Server Action boundary,
  // while an array of File can be serialized, and the SDK will upload files itself (branch Array.isArray in postFormsData)
  if (['file', 'image', 'groupOfImages'].includes(field.type)) {
    return (
      <>
        <label htmlFor={field.marker}>{label}</label>
        <input
          id={field.marker}
          type="file"
          multiple={field.type === 'groupOfImages'}
          required={required}
          onChange={(e) => onChange(e.target.files ? Array.from(e.target.files) : [])}
        />
      </>
    );
  }

  // button: DO NOT render input — if desired, take localizeInfos.title as the text for the submit button;
  // do not include in formData (the SDK filters button fields in postFormsData anyway)
  if (field.type === 'button') return null;

  // textWithHeader — decorative text block, not input
  if (field.type === 'textWithHeader') return <p>{label}</p>;

  // entity / timeInterval — specific types: skip, do not render as text input
  if (field.type === 'entity' || field.type === 'timeInterval') return null;

  // date, dateTime, time → corresponding type
  const inputType: Record<string, string> = {
    date: 'date',
    dateTime: 'datetime-local',
    time: 'time',
    integer: 'number',
    real: 'number',
    float: 'number',
  };

  return (
    <>
      <label htmlFor={field.marker}>{label}</label>
      <input
        id={field.marker}
        type={inputType[field.type] || 'text'}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
```

### FormReCaptcha component (if captcha is needed)

> Copy this component to `components/FormReCaptcha.tsx` if the form contains a `spam` field.
> ⚠️ For complete, verified captcha wrapping (reading config, form `value`, module config,
> submission, headless caveat) follow `/create-captcha` — here is just the basic component.

```tsx
// components/FormReCaptcha.tsx
'use client';

import type { Dispatch, JSX } from 'react';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, opts: { action: string }) => Promise<string>;
      };
    };
  }
}

export function FormReCaptcha({
  siteKey,
  action = 'login', // default from settings.captcha.action; see /create-captcha
  setToken,
  setIsCaptcha,
  setIsValid,
}: {
  siteKey: string;
  action?: string;
  setToken: Dispatch<string>;
  setIsCaptcha: Dispatch<boolean>;
  setIsValid: Dispatch<boolean>;
}): JSX.Element {
  const scriptLoadedRef = useRef(false);
  const executedRef = useRef(false);

  const executeRecaptcha = async () => {
    if (executedRef.current) return;
    if (typeof window === 'undefined' || !window.grecaptcha?.enterprise) return;
    window.grecaptcha.enterprise.ready(async () => {
      try {
        const token = await window.grecaptcha?.enterprise?.execute(siteKey, { action });
        if (token) { executedRef.current = true; setToken(token); }
      } catch { setIsValid(false); }
    });
  };

  useEffect(() => {
    if (scriptLoadedRef.current) return;
    setIsCaptcha(true);

    const existing = document.querySelector(`script[src*="recaptcha/enterprise.js"]`);
    if (existing) { scriptLoadedRef.current = true; executeRecaptcha(); return; }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => { scriptLoadedRef.current = true; executeRecaptcha(); };
    script.onerror = () => setIsValid(false);
    document.head.appendChild(script);

    return () => {
      document.querySelector(`script[src*="recaptcha/enterprise.js?render=${siteKey}"]`)?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <></>;
}
```

---

## Step 5: Remind key rules

```md
✅ The form has been created. Key rules:

1. The captcha type is 'spam', NOT 'captcha'. Render FormReCaptcha, NOT <input>!
2. Fields are rendered dynamically by field.type — do not hardcode
3. formData for submission — { marker, type, value }, only non-empty values
4. Forms API requires Server Action — cannot be called from 'use client' directly
5. Sort fields by field.position before rendering
6. submitForm via FormData.postFormsData, not via Forms API
7. Form marker — obtain via /inspect-api forms, DO NOT guess
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For Playwright setup — first `/setup-playwright`.

### 6.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating `DynamicForm.tsx`:

```tsx
<form data-testid="dynamic-form" onSubmit={handleSubmit}>
  {/* Inside map over fields — in renderField() wrap each field in a container with testid: */}
  <div data-testid={`form-field-${field.marker}`}>
    {/* input / textarea / select — add data-testid to the element itself: */}
    <input data-testid={`form-input-${field.marker}`} ... />
    {/* for textarea: */}
    <textarea data-testid={`form-input-${field.marker}`} ... />
    {/* for select: */}
    <select data-testid={`form-input-${field.marker}`} ... />
  </div>
  {/* captcha wrapper (to check for presence in the test): */}
  <div data-testid="form-recaptcha">{/* <FormReCaptcha ... /> */}</div>
  {error && <div data-testid="form-error" role="alert">{error}</div>}
  {success && <div data-testid="form-success" role="status">{success}</div>}
  <button data-testid="form-submit" type="submit">Submit</button>
</form>
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Form marker** — use the marker that the user provided as an argument `/create-form <marker>`. If it is not there — take it from the results of `/inspect-api forms` (Step 1) and inform: "Using marker `{identifier}` from `/inspect-api forms`. If another is needed — say so".
2. **Page path with the form** — ask: "On which URL in the application is the form rendered? (for example `/contact`, `/feedback`)".
   - If the user is silent → find it yourself via Grep for `<DynamicForm` / `marker="{marker}"` in `app/**`. Inform: "Found the form at `{path}` — using it. If incorrect, say so".
3. **Test values for fields** — read `form.attributes` from `/inspect-api forms` (already called in Step 1). For each field, generate a valid value yourself:
   - `string` / `text` → `'E2E Test value'`
   - `integer` / `number` → `'42'`
   - email field (marker contains `email`) → `'e2e@example.com'`
   - `date` → today's date in `YYYY-MM-DD` format
   - `list` / `radioButton` → first value from `listTitles`
   - `file` → skip the file upload test (`test.skip` with explanation: "file fields require a real file — skipping")
4. **Presence of the `spam` field** — check by `form.attributes`. If `spam` exists → add `E2E_SKIP_CAPTCHA=1` to `.env.local` and in the test `test.skip` block "successful submission" with explanation: "reCAPTCHA v3 Enterprise cannot be passed in headless browser without special configuration".

**Example of filling in `.env.local` (do it yourself, do not ask the user to copy):**

```bash
# e2e form — page path with the form
E2E_FORM_PATH=/contact
# If the form has a spam field (reCAPTCHA v3) — skip the successful submission test
E2E_SKIP_CAPTCHA=1
```

### 6.3 Create `e2e/form.spec.ts`

> ⚠️ Tests work with the real form from OneEntry Forms API — fields are loaded dynamically. Test values are generated based on field type.

```typescript
import { test, expect, Page } from '@playwright/test';

const FORM_PATH = process.env.E2E_FORM_PATH || '/contact';
const SKIP_CAPTCHA = process.env.E2E_SKIP_CAPTCHA === '1';

async function fillFieldsWithValidValues(page: Page) {
  // Find all form fields and fill them with valid test values
  const fields = page.locator('[data-testid^="form-field-"]');
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const testId = await field.getAttribute('data-testid');
    const marker = testId?.replace('form-field-', '') ?? '';
    const input = field.locator('[data-testid^="form-input-"]');
    if ((await input.count()) === 0) continue;
    const tag = await input.evaluate((el) => el.tagName.toLowerCase());
    const type = await input.getAttribute('type');

    if (tag === 'select') {
      const firstOption = input.locator('option').nth(1); // skip placeholder option
      const value = await firstOption.getAttribute('value');
      if (value) await input.selectOption(value);
    } else if (type === 'date') {
      await input.fill(new Date().toISOString().slice(0, 10));
    } else if (type === 'datetime-local') {
      await input.fill(new Date().toISOString().slice(0, 16));
    } else if (type === 'time') {
      await input.fill('12:00');
    } else if (type === 'number') {
      await input.fill('42');
    } else if (marker.toLowerCase().includes('email')) {
      await input.fill('e2e@example.com');
    } else if (type === 'file') {
      // Skipping file fields — a real file is required
      continue;
    } else {
      await input.fill(`E2E ${marker}`);
    }
  }
}

test.describe('Dynamic form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FORM_PATH);
    await expect(page.getByTestId('dynamic-form')).toBeVisible({ timeout: 10_000 });
  });

  test('the form renders fields from Forms API', async ({ page }) => {
    const fields = page.locator('[data-testid^="form-field-"]');
    await expect(fields.first()).toBeVisible();
    const count = await fields.count();
    expect(count).toBeGreaterThan(0);
  });

  test('empty submission — required fields block submit (HTML validation)', async ({ page }) => {
    // Check that there is at least one required field
    const requiredInputs = page.locator('[data-testid^="form-input-"][required]');
    const requiredCount = await requiredInputs.count();
    test.skip(requiredCount === 0, 'There are no required fields in the form');

    await page.getByTestId('form-submit').click();
    // After clicking, the success message does not appear (HTML validation stopped the submit)
    await expect(page.getByTestId('form-success')).not.toBeVisible();
  });

  test.skip(SKIP_CAPTCHA, 'The form contains a spam field (reCAPTCHA v3) — successful submission is not tested in headless');
  test('successful submission — postFormsData returns success', async ({ page }) => {
    await fillFieldsWithValidValues(page);
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-success')).toBeVisible({ timeout: 15_000 });
  });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/form.spec.ts created
✅ data-testid added to DynamicForm
✅ .env.local updated (E2E_FORM_PATH, E2E_SKIP_CAPTCHA if spam field is present)

Decisions made automatically (if applicable):
- Form marker: {marker} — {provided by user / taken from /inspect-api forms}
- Path to the form: {FORM_PATH} — {provided by user / found via Grep for <DynamicForm}
- Test values for fields generated automatically by field.type
- Spam field (reCAPTCHA): {exists → successful submission test skipped via test.skip, reason: v3 Enterprise cannot be passed in headless / does not exist → test runs fully}
- File fields: {exists → upload test skipped, reason: a real file is required / does not exist → no skip needed}

Run: npm run test:e2e -- form.spec.ts
```

If the form has a `spam` field — the successful submission test is skipped (`test.skip`), the rendering and validation tests work.
