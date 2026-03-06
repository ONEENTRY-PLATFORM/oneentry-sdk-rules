<!-- META
type: skill
skillConfig: {"name":"create-profile"}
-->

# Страница профиля пользователя

Создаёт Client Component с формой профиля: поля из Users API, обновление данных, обработка токена.

---

## Шаг 1: Создай Server Actions

> Если `app/actions/users.ts` уже существует — прочитай и дополни, не дублируй.

```typescript
// app/actions/users.ts
'use server';

import { defineOneEntry } from 'oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';
import { getApi, isError } from '@/lib/oneentry';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

/**
 * ВАЖНО: каждый вызов makeUserApi потребляет refreshToken через /refresh.
 * Никогда не вызывай makeUserApi дважды с одним токеном — объединяй все вызовы
 * в одном инстансе.
 */
function makeUserApi(refreshToken: string) {
  let capturedToken = refreshToken;
  const api = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction: async (token: string) => { capturedToken = token; },
    },
    errors: { isShell: false },
  });
  return { api, getNewToken: () => capturedToken };
}

/**
 * Загружает профиль и форму в ОДНОМ /refresh вызове.
 * Возвращает newToken — клиент обязан обновить localStorage.
 */
export async function getUserProfile(
  refreshToken: string,
  locale: string = 'en_US',
): Promise<{
  formIdentifier: string;
  formData: Array<{ marker: string; type: string; value: any }>;
  formAttributes: Array<{
    marker: string;
    type: string;
    localizeInfos: any;
    validators: any;
    position: number;
  }>;
  newToken: string;
} | { error: string; statusCode?: number }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const user = (await api.Users.getUser()) as IUserEntity;

    let formAttributes: any[] = [];
    // Структура формы регистрации — поля профиля (необязательно)
    const form = await getApi().Forms.getFormByMarker(user.formIdentifier, locale);
    if (!isError(form)) {
      const attrs = Array.isArray((form as any).attributes)
        ? (form as any).attributes
        : Object.values((form as any).attributes || {});
      formAttributes = (attrs as any[]).map((attr: any) => ({
        marker: attr.marker,
        type: attr.type,
        localizeInfos: attr.localizeInfos,
        validators: attr.validators,
        position: attr.position,
      }));
    }

    return {
      formIdentifier: user.formIdentifier,
      formData: (user.formData || []) as any[],
      formAttributes,
      newToken: getNewToken(),
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to load profile', statusCode: err.statusCode };
  }
}

/**
 * Обновляет профиль. ОДИН /refresh: getUser + updateUser в одном инстансе.
 * password-поля → authData (только если заполнены)
 * остальные поля → formData
 */
export async function updateUserProfile(
  refreshToken: string,
  formData: Array<{ marker: string; type: string; value: string }>,
  authData?: Array<{ marker: string; value: string }>,
): Promise<{ success: boolean; newToken: string } | { error: string }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const user = (await api.Users.getUser()) as IUserEntity;
    await api.Users.updateUser({
      formIdentifier: user.formIdentifier,
      formData,
      ...(authData && authData.length > 0 ? { authData } : {}),
      state: user.state, // сохраняем state (корзина, избранное)
    });
    return { success: true, newToken: getNewToken() };
  } catch (err: any) {
    return { error: err.message || 'Failed to update profile' };
  }
}
```

---

## Шаг 2: Создай компонент страницы профиля

### Ключевые принципы

- `'use client'` — страница использует `localStorage` и `useParams`
- `useParams()` для `locale` — НЕ `params` как Promise (это Client Component!)
- **Token race condition:** на 401 — retry с актуальным `localStorage.getItem('refreshToken')`,
  разлогинивать ТОЛЬКО при 401/403 после retry
- **Разделение полей:** поля с `password` в имени → `authData` (только если заполнены),
  остальные → `formData`
- **newToken:** после каждого ответа обновлять `localStorage.setItem('refreshToken', newToken)`
- Сортировать поля по `position`

### Определение типа input по marker

```typescript
function getInputType(marker: string): string {
  const m = marker.toLowerCase();
  if (m.includes('password')) return 'password';
  if (m.includes('email') || m.includes('login')) return 'email';
  if (m.includes('phone')) return 'tel';
  return 'text';
}
```

### app/[locale]/(account)/profile/page.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getUserProfile, updateUserProfile } from '@/app/actions/users';

type FormAttribute = {
  marker: string;
  type: string;
  localizeInfos: any;
  validators: any;
  position: number;
};

export default function ProfilePage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formAttributes, setFormAttributes] = useState<FormAttribute[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    loadProfile(refreshToken);
  }, []);

  const loadProfile = async (token: string) => {
    setLoading(true);
    try {
      let result = await getUserProfile(token, locale);

      // Race condition: другая операция могла уже обновить токен
      if ('error' in result && result.statusCode === 401) {
        const currentToken = localStorage.getItem('refreshToken');
        if (currentToken && currentToken !== token) {
          result = await getUserProfile(currentToken, locale);
        }
      }

      if ('error' in result) {
        // Разлогинивать ТОЛЬКО при подтверждённой auth-ошибке
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setFormAttributes(result.formAttributes);

      const values: Record<string, string> = {};
      for (const field of result.formData) {
        values[field.marker] = String(field.value ?? '');
      }
      setFormValues(values);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const formData: Array<{ marker: string; type: string; value: string }> = [];
      const authData: Array<{ marker: string; value: string }> = [];

      for (const attr of formAttributes) {
        const value = formValues[attr.marker] ?? '';
        const isPasswordField = attr.marker.toLowerCase().includes('password');

        if (isPasswordField) {
          // Пароль — только если заполнен
          if (value.trim()) {
            authData.push({ marker: attr.marker, value });
          }
        } else {
          formData.push({ marker: attr.marker, type: attr.type, value });
        }
      }

      const result = await updateUserProfile(
        refreshToken,
        formData,
        authData.length ? authData : undefined,
      );

      if ('error' in result) {
        setError(result.error);
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setSuccess('Profile updated successfully');
      // Очистить поля пароля после сохранения
      setFormValues((prev) => {
        const next = { ...prev };
        for (const attr of formAttributes) {
          if (attr.marker.toLowerCase().includes('password')) {
            next[attr.marker] = '';
          }
        }
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  if (!isLoggedIn) {
    return (
      <div>
        <p>Please log in to view your profile</p>
        {/* Здесь показать AuthForm в модалке или редирект */}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {[...formAttributes]
        .sort((a, b) => a.position - b.position)
        .map((attr) => {
          const inputType = getInputType(attr.marker);
          const label = attr.localizeInfos?.title || attr.marker;
          const isPassword = inputType === 'password';

          return (
            <div key={attr.marker}>
              <label htmlFor={attr.marker}>
                {label}
                {isPassword && ' (leave blank to keep)'}
              </label>
              <input
                id={attr.marker}
                type={inputType}
                value={formValues[attr.marker] ?? ''}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, [attr.marker]: e.target.value }))
                }
                autoComplete={isPassword ? 'new-password' : attr.marker}
              />
            </div>
          );
        })}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}

function getInputType(marker: string): string {
  const m = marker.toLowerCase();
  if (m.includes('password')) return 'password';
  if (m.includes('email') || m.includes('login')) return 'email';
  if (m.includes('phone')) return 'tel';
  return 'text';
}
```

---

## Шаг 3: Напомни ключевые правила

> Правила работы с токенами (makeUserApi, getNewToken, race condition): `.claude/rules/tokens.md`

✅ Страница профиля создана. Ключевые правила:

```md
1. 'use client' + useParams() — НЕ серверный компонент с await params
2. getUserProfile и updateUserProfile — Server Actions через makeUserApi
3. ОДИН makeUserApi на функцию — все вызовы через один инстанс
4. Retry на 401 с актуальным localStorage.getItem('refreshToken')
5. Разлогинивать ТОЛЬКО при 401/403 после retry
6. password-поля → authData (только если заполнены), остальные → formData
7. Всегда обновлять localStorage.setItem('refreshToken', result.newToken)
8. Никогда не делать removeItem('refreshToken') при ошибке загрузки данных
```
