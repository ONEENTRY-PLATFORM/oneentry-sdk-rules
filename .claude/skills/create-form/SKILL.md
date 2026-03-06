<!-- META
type: skill
skillConfig: {"name":"create-form"}
-->

# Создать динамическую форму из OneEntry Forms API

Аргумент: `marker` (маркер формы в OneEntry)

---

## Шаг 1: Получи маркер формы

Если маркер не передан:

```bash
/inspect-api forms
```

Смотри поле `identifier` — это маркер для `getFormByMarker()`.

Или через API напрямую:

```typescript
const forms = await getApi().Forms.getAllForms();
// forms[].identifier — маркер формы
```

**⚠️ НЕ угадывай маркер** (`contact`, `feedback` и т.д.).

---

## Шаг 2: Уточни у пользователя

1. **Куда отправляются данные?**
   - В OneEntry через `postFormsData` — стандартный сценарий
   - В другой эндпоинт — нужна другая логика
2. **Нужна ли капча?** — форма может содержать поле типа `spam` (reCAPTCHA v3)
3. **Где отображается форма?** (страница, модалка, drawer?)
4. **Есть ли верстка?** — если да, копируй точно

---

## Шаг 3: Создай Server Actions

### app/actions/forms.ts

> Если файл уже существует — прочитай и дополни, не дублируй.

```typescript
// app/actions/forms.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';

// Получение структуры формы
export async function getFormByMarker(marker: string, locale = 'en_US') {
  const form = await getApi().Forms.getFormByMarker(marker, locale);
  if (isError(form)) return { error: form.message, statusCode: form.statusCode };
  const attributes = Array.isArray((form as any).attributes)
    ? (form as any).attributes
    : Object.values((form as any).attributes || {});

  return {
    id: (form as any).id,
    identifier: (form as any).identifier,
    attributes: (attributes as any[]).map((attr: any) => ({
      marker: attr.marker,
      type: attr.type,
      localizeInfos: attr.localizeInfos,
      validators: attr.validators,
      position: attr.position,
    })),
  };
}

// Отправка данных формы
export async function submitForm(
  formIdentifier: string,
  formData: Array<{ marker: string; value: string | number | boolean }>,
) {
  const result = await getApi().FormData.postFormData({
    formIdentifier,
    formData,
  } as any);
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };
  return { success: true, result };
}
```

---

## Шаг 4: Создай компонент формы

### Ключевые принципы

- Поля рендерятся **динамически** по `field.type` — не хардкодить `<input>`
- Поле `spam` — это **невидимая капча** (reCAPTCHA v3), рендерить `<FormReCaptcha>`, НЕ `<input>`
- Тип `'spam'`, не `'captcha'` — распространённая ошибка!
- `formData` для отправки — только `{ marker, value }`, только непустые значения

### Таблица типов полей → HTML

| `field.type`                | Рендер                                            |
|-----------------------------|---------------------------------------------------|
| `string`                    | `<input type="text">`                             |
| `integer`, `real`, `float`  | `<input type="number">`                           |
| `text`                      | `<textarea>`                                      |
| `date`                      | `<input type="date">`                             |
| `dateTime`                  | `<input type="datetime-local">`                   |
| `time`                      | `<input type="time">`                             |
| `list`                      | `<select>`, `<select multiple>` или `<checkbox>`  |
| `radioButton`               | `<input type="radio">`                            |
| `file`                      | `<input type="file">`                             |
| `spam`                      | `<FormReCaptcha>` — НЕ `<input>`!                 |

#### components/DynamicForm.tsx

```tsx
// components/DynamicForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { getFormByMarker, submitForm } from '@/app/actions/forms';

interface DynamicFormProps {
  marker: string;      // маркер формы в OneEntry
  locale?: string;
  onSuccess?: () => void;
}

export function DynamicForm({ marker, locale = 'en_US', onSuccess }: DynamicFormProps) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formId, setFormId] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Состояние капчи (нужно если форма содержит поле spam)
  const [captchaToken, setCaptchaToken] = useState('');
  const [isCaptcha, setIsCaptcha] = useState(false);
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);

  useEffect(() => {
    getFormByMarker(marker, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFormId(result.identifier);
      // Сортировка полей по position
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
      .map(f => ({ marker: f.marker, value: values[f.marker] }));

    // Добавляем токен капчи если есть
    if (captchaToken) {
      formData.push({ marker: 'spam', value: captchaToken });
    }

    const result = await submitForm(formId, formData);

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

// Рендер поля по типу
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

  // ⚠️ spam = reCAPTCHA v3, НЕ input!
  if (field.type === 'spam') {
    const siteKey = field.validators?.siteKey || '';
    if (!siteKey) return null;
    // Импортируй FormReCaptcha и используй здесь:
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
    return null; // Замени на FormReCaptcha
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

  // date, dateTime, time → соответствующий type
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

### Компонент FormReCaptcha (если нужна капча)

> Копируй этот компонент в `components/FormReCaptcha.tsx` если форма содержит поле `spam`.

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

## Шаг 5: Напомни ключевые правила

```md
✅ Форма создана. Ключевые правила:

1. Тип капчи — 'spam', НЕ 'captcha'. Рендерить FormReCaptcha, НЕ <input>!
2. Поля рендерятся динамически по field.type — не хардкодить
3. formData для отправки — только { marker, value }, только непустые
4. Forms API требует Server Action — нельзя вызывать из 'use client' напрямую
5. Сортируй поля по field.position перед рендером
6. submitForm через FormData.postFormData, не через Forms API
7. Маркер формы — получать через /inspect-api forms, НЕ угадывать
```
