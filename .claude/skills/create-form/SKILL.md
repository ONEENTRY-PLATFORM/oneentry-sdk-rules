<!-- META
type: skill
skillConfig: {"name":"create-form"}
-->

# Create dynamic form from OneEntry Forms API

Argument: `marker` (form marker in OneEntry)

---

## Step 1: Get the form marker

If the marker is not provided:

```bash
/inspect-api forms
```

Look at the `identifier` field — this is the marker for `getFormByMarker()`.

Or directly via API:

```typescript
const forms = await getApi().Forms.getAllForms();
// forms[].identifier — form marker
```

**⚠️ DON'T guess the marker** (`contact`, `feedback`, etc.).

---

## Step 2: Clarify with the user

1. **Where is the data sent?**
   - To OneEntry via `postFormsData` — standard scenario
   - To another endpoint — different logic needed
2. **Is captcha needed?** — the form may contain a field of type `spam` (reCAPTCHA v3)
3. **Where is the form displayed?** (page, modal, drawer?)
4. **Is there a layout/mockup?** — if yes, copy it exactly

---

## Step 3: Create Server Actions

### app/actions/forms.ts

> If the file already exists — read and extend it, don't duplicate.

```typescript
// app/actions/forms.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';

// ⚠️ Validators return message as string[] — field markers with errors
// To show custom messages, build a map from form attributes
function buildValidatorErrorMap(attributes: any[]): Record<string, string> {
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

// Get form structure
export async function getFormByMarker(marker: string, locale = 'en_US') {
  const form = await getApi().Forms.getFormByMarker(marker, locale);
  if (isError(form)) return { error: String(form.message), statusCode: form.statusCode };
  const f = form as any;
  const attributes = Array.isArray(f.attributes)
    ? f.attributes
    : Object.values(f.attributes || {});
  const config = f.moduleFormConfigs?.[0];

  return {
    identifier: f.identifier,
    formModuleConfigId: config?.id ?? 0,
    moduleEntityIdentifier: config?.entityIdentifiers?.[0]?.id ?? '',
    attributes: (attributes as any[]).map((attr: any) => ({
      marker: attr.marker,
      type: attr.type,
      localizeInfos: attr.localizeInfos,
      validators: attr.validators,
      additionalFields: attr.additionalFields,
      position: attr.position,
    })),
  };
}

// Submit form data
export async function submitForm(
  formIdentifier: string,
  formModuleConfigId: number,
  moduleEntityIdentifier: string,
  formData: Array<{ marker: string; type: string; value: any }>,
  attributes: any[],
) {
  const result = await getApi().FormData.postFormsData({
    formIdentifier,
    formModuleConfigId,
    moduleEntityIdentifier,
    replayTo: null,
    status: 'sent',
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

- Fields are rendered **dynamically** by `field.type` — don't hardcode `<input>`
- The `spam` field is an **invisible captcha** (reCAPTCHA v3), render `<FormReCaptcha>`, NOT `<input>`
- Type is `'spam'`, not `'captcha'` — a common mistake!
- `formData` for submission — only `{ marker, value }`, only non-empty values

### Field type → HTML mapping table

| `field.type`                | Render                                            |
|-----------------------------|---------------------------------------------------|
| `string`                    | `<input type="text">`                             |
| `integer`, `real`, `float`  | `<input type="number">`                           |
| `text`                      | `<textarea>`                                      |
| `date`                      | `<input type="date">`                             |
| `dateTime`                  | `<input type="datetime-local">`                   |
| `time`                      | `<input type="time">`                             |
| `list`                      | `<select>`, `<select multiple>` or `<checkbox>`   |
| `radioButton`               | `<input type="radio">`                            |
| `file`                      | `<input type="file">`                             |
| `spam`                      | `<FormReCaptcha>` — NOT `<input>`!                |

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [formId, setFormId] = useState('');
  const [formModuleConfigId, setFormModuleConfigId] = useState(0);
  const [moduleEntityIdentifier, setModuleEntityIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Captcha state (needed if form contains spam field)
  const [captchaToken, setCaptchaToken] = useState('');
  const [isCaptcha, setIsCaptcha] = useState(false);
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);

  useEffect(() => {
    getFormByMarker(marker, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFormId(result.identifier);
      setFormModuleConfigId(result.formModuleConfigId);
      setModuleEntityIdentifier(result.moduleEntityIdentifier);
      // Sort fields by position
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

    const formData = fields
      .filter(f => f.type !== 'spam' && values[f.marker] !== undefined && values[f.marker] !== '')
      .map(f => ({ marker: f.marker, type: f.type, value: values[f.marker] }));

    // Add captcha token if present
    if (captchaToken) {
      formData.push({ marker: 'spam', type: 'spam', value: captchaToken });
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
  values: Record<string, string>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  captchaHandlers: {
    setCaptchaToken: (t: string) => void;
    setIsCaptcha: (v: boolean) => void;
    setIsCaptchaValid: (v: boolean) => void;
  },
) {
  const label = field.localizeInfos?.title || field.marker;
  const value = values[field.marker] || '';
  const onChange = (val: string) => setValues(prev => ({ ...prev, [field.marker]: val }));

  // ⚠️ spam = reCAPTCHA v3, NOT input!
  if (field.type === 'spam') {
    const siteKey = field.validators?.siteKey || '';
    if (!siteKey) return null;
    // Import FormReCaptcha and use here:
    // return (
    //   <FormReCaptcha
    //     key={field.marker}
    //     siteKey={siteKey}
    //     action="submit"
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
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  }

  if (field.type === 'list') {
    const options = field.localizeInfos?.listTitles || [];
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
    const options = field.localizeInfos?.listTitles || [];
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

  // date, dateTime, time → corresponding type
  const inputType: Record<string, string> = {
    date: 'date',
    dateTime: 'datetime-local',
    time: 'time',
    integer: 'number',
    real: 'number',
    float: 'number',
    file: 'file',
  };

  return (
    <>
      <label htmlFor={field.marker}>{label}</label>
      <input
        id={field.marker}
        type={inputType[field.type] || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.validators?.required}
      />
    </>
  );
}
```

### FormReCaptcha component (if captcha is needed)

> Copy this component to `components/FormReCaptcha.tsx` if the form contains a `spam` field.

```tsx
// components/FormReCaptcha.tsx
'use client';

import type { Dispatch, JSX } from 'react';
import { useEffect, useRef } from 'react';
import { getApi } from '@/lib/oneentry';

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
  action = 'submit',
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
  const { System } = getApi();
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

## Step 5: Key rules reminder

```md
✅ Form created. Key rules:

1. Captcha type — 'spam', NOT 'captcha'. Render FormReCaptcha, NOT <input>!
2. Fields are rendered dynamically by field.type — don't hardcode
3. formData for submission — only { marker, value }, only non-empty
4. Forms API requires Server Action — can't call from 'use client' directly
5. Sort fields by field.position before rendering
6. submitForm via FormData.postFormData, not via Forms API
7. Form marker — get via /inspect-api forms, DON'T guess
```
