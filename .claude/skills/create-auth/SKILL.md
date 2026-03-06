<!-- META
type: skill
skillConfig: {"name":"create-auth"}
-->

# /create-auth - Создать форму авторизации/регистрации с OneEntry AuthProvider

---

## Шаг 1: Получи реальные маркеры из API

**НЕ угадывай маркеры.** Сначала получи список провайдеров и форм:

```bash
cat .env.local

# Провайдеры авторизации (поле identifier — маркер для auth/signUp/logout)
curl -s "https://<URL>/api/auth-providers?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool

# Список форм (поле identifier — маркер для getFormByMarker)
curl -s "https://<URL>/api/forms?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Или используй `/inspect-api auth-providers` и `/inspect-api forms`.
Что смотреть в ответе:

- `AuthProviders[].identifier` — маркер провайдера (передаётся в `auth()`, `signUp()`, `logout()`)
- `AuthProviders[].formIdentifier` — маркер формы регистрации для этого провайдера
- `Forms[].identifier` — маркер формы для `getFormByMarker()`

---

## Шаг 2: Уточни у пользователя

1. **Какие режимы нужны?** (вход / регистрация / сброс пароля)
1. **Нужна ли синхронизация корзины/избранного** после логина?
   - Если да — потребуется `getUserState` Server Action (читает `user.state`)
1. **Где показывать форму?** (модальное окно, отдельная страница, drawer?)
1. **Есть ли верстка?** — если да, копируй точно, меняй только данные

---

## Шаг 3: Создай Server Actions

> **Важно:** `auth()`, `signUp()`, `generateCode()` — вызывай **напрямую из Client Component** (не через Server Action).
> SDK передаёт fingerprint устройства пользователя — если вызвать на сервере, `deviceInfo.browser` в fingerprint будет серверным, а не реальным браузером пользователя.
> Через Server Action — только методы без fingerprint: `getAuthProviders`, `logout`, `logoutAll`.

### app/actions/auth.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

export async function getAuthProviders() {
  const providers = await getApi().AuthProvider.getAuthProviders();
  if (isError(providers)) return { error: providers.message, statusCode: providers.statusCode };
  return (providers as any[]).map((p: any) => ({
    identifier: p.identifier,
    formIdentifier: p.formIdentifier,
    title: p.localizeInfos?.title,
  }));
}

export async function logout(authProviderMarker: string, token: string) {
  const result = await getApi().AuthProvider.logout(authProviderMarker, token);
  if (isError(result)) return { error: result.message };
  return { success: true };
}
```

### app/actions/users.ts (getUserState — синхронизация после логина)

> Нужен только если приложение хранит cart/favorites и другие данные в `user.state`.
> Если синхронизация не нужна — пропусти этот файл.

```typescript
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// getUserState — ОДИН makeUserApi на оба вызова (getUser)
// Возвращает newToken — клиент ОБЯЗАН сохранить его в localStorage
export async function getUserState(refreshToken: string): Promise<
  { cart: Record<number, number>; favorites: number[]; newToken: string } | { error: string }
> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = await api.Users.getUser();
  if (isError(user)) return { error: user.message };
  return {
    cart: ((user as IUserEntity).state?.cart as Record<number, number>) || {},
    favorites: ((user as IUserEntity).state?.favorites as number[]) || [],
    newToken: getNewToken(),
  };
}
```

---

## Шаг 4: Создай компонент формы

### Ключевые принципы компонента

- Форма загружается через Server Action `getFormByMarker(formIdentifier, locale)`
- Поля рендерятся **динамически** из `form.attributes` — не хардкодить поля!
- `authData` — только `{ marker, value }`, фильтровать пустые значения
- `notificationData` — **НЕ передавать `phoneSMS`** (пустая строка → 400 ошибка)
- После логина сохранить `accessToken`, `refreshToken`, `authProviderMarker` в localStorage
- После логина вызвать `getUserState` и диспатчить `auth-state` событие (если нужна синхронизация)

### components/AuthForm.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getFormByMarker } from '@/app/actions/forms';
import { logout } from '@/app/actions/auth';
import { getApi, isError } from '@/lib/oneentry';
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces';

interface AuthFormProps {
  authProviderMarker: string;  // маркер провайдера — получи из getAuthProviders()
  formIdentifier: string;      // маркер формы — из provider.formIdentifier
  locale?: string;
  onSuccess?: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

export function AuthForm({ authProviderMarker, formIdentifier, locale = 'en_US', onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [fields, setFields] = useState<IAttributesSetsEntity[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);

  useEffect(() => {
    getFormByMarker(formIdentifier, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFields(result.attributes as IAttributesSetsEntity[]);
      setFormLoading(false);
    });
  }, [formIdentifier, locale]);

  // Показываемые поля зависят от режима
  const visibleFields = (): IAttributesSetsEntity[] => {
    if (mode === 'signup') return fields;
    // signin / reset — только login + password (или только login для reset)
    const loginField = fields.find(f =>
      f.marker.includes('email') || f.marker.includes('login') || f.marker.includes('phone')
    );
    const passwordField = fields.find(f => f.marker.includes('password'));
    if (mode === 'reset') return loginField ? [loginField] : [];
    return [loginField, passwordField].filter(Boolean) as IAttributesSetsEntity[];
  };

  // authData — только { marker, value }, только непустые
  const buildAuthData = () =>
    fields
      .filter(f => {
        if (['phonePush', 'phoneSMS'].includes(f.marker)) return false;
        const v = values[f.marker];
        return v && v.trim() !== '';
      })
      .map(f => ({ marker: f.marker, value: values[f.marker] }));

  // Email для notificationData — ищем динамически
  const getEmail = () => {
    const f = fields.find(f => f.marker.includes('email') || f.marker.includes('login'));
    return f ? values[f.marker] || '' : '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);

    try {
      if (mode === 'signin') {
        // ✅ Вызываем напрямую (fingerprint = браузер пользователя)
        const result = await getApi().AuthProvider.auth(authProviderMarker, { authData: buildAuthData() });
        if (isError(result)) { setError((result as any).message || 'Auth failed'); return; }

        localStorage.setItem('accessToken', (result as any).accessToken);
        localStorage.setItem('refreshToken', (result as any).refreshToken);
        localStorage.setItem('authProviderMarker', authProviderMarker);

        // Синхронизация user.state (cart, favorites) — если нужна
        // const stateResult = await getUserState((result as any).refreshToken);
        // if (!('error' in stateResult)) {
        //   localStorage.setItem('refreshToken', stateResult.newToken);
        //   window.dispatchEvent(new CustomEvent('auth-state', {
        //     detail: { cart: stateResult.cart, favorites: stateResult.favorites },
        //   }));
        // }

        setSuccess('Signed in!');
        setTimeout(() => onSuccess?.(), 1000);

      } else if (mode === 'signup') {
        // ✅ Вызываем напрямую (fingerprint = браузер пользователя)
        const result = await getApi().AuthProvider.signUp(authProviderMarker, {
          formIdentifier,
          authData: buildAuthData(),
          formData: [],
          // ⚠️ НЕ передавать phoneSMS — пустая строка вызывает 400
          notificationData: { email: getEmail(), phonePush: [] },
        } as any);
        if (isError(result)) { setError((result as any).message || 'Registration failed'); return; }
        setSuccess('Account created! Check your email.');
        setTimeout(() => { setMode('signin'); setSuccess(''); }, 2000);

      } else if (mode === 'reset') {
        // ✅ generateCode — тоже с fingerprint, вызываем напрямую
        const result = await getApi().AuthProvider.generateCode(authProviderMarker, getEmail(), 'password_reset');
        if (isError(result)) { setError((result as any).message || 'Reset failed'); return; }
        setSuccess('Reset code sent!');
        setTimeout(() => { setMode('signin'); setSuccess(''); }, 3000);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (formLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>
        {mode === 'signin' && 'Sign in'}
        {mode === 'signup' && 'Create account'}
        {mode === 'reset' && 'Reset password'}
      </h2>

      {/* Поля — динамически из Forms API */}
      {visibleFields().map((field) => {
        const isPassword = field.marker.includes('password');
        const isEmail = field.marker.includes('email') || field.marker.includes('login');
        return (
          <div key={field.marker}>
            <label htmlFor={field.marker}>
              {field.localizeInfos?.title || field.marker}
            </label>
            <input
              id={field.marker}
              type={isPassword ? 'password' : isEmail ? 'email' : 'text'}
              value={values[field.marker] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [field.marker]: e.target.value }))}
              required
            />
          </div>
        );
      })}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={loading}>
        {loading ? 'Loading...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send code'}
      </button>

      {/* Переключение режимов */}
      {mode === 'signin' && (
        <>
          <button type="button" onClick={() => setMode('signup')}>Create account</button>
          <button type="button" onClick={() => setMode('reset')}>Forgot password?</button>
        </>
      )}
      {mode !== 'signin' && (
        <button type="button" onClick={() => setMode('signin')}>Back to sign in</button>
      )}
    </form>
  );
}
```

### Logout (вызов из любого компонента)

```tsx
'use client';

import { logout } from '@/app/actions/auth';

async function handleLogout() {
  const marker = localStorage.getItem('authProviderMarker') || 'email';
  const token = localStorage.getItem('refreshToken') || '';

  await logout(marker, token);

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('authProviderMarker');

  // Уведомить остальные компоненты (CartContext, FavoritesContext и т.д.)
  window.dispatchEvent(new Event('auth-change'));
}
```

---

## Шаг 5: Напомни ключевые правила

> Правила хранения и обновления токенов: `.claude/rules/tokens.md`

```md
✅ Компонент создан. Ключевые правила:

1. authData — только { marker, value }, фильтровать пустые строки
1. notificationData — НЕ передавать phoneSMS (пустая строка → 400)
1. formIdentifier берётся из provider.formIdentifier, не хардкодится
1. Поля рендерятся динамически из Forms API — не хардкодить <input>
1. После логина сохранить accessToken + refreshToken + authProviderMarker в localStorage
1. getUserState сжигает refreshToken — вызывать один раз, сразу обновлять localStorage
1. Logout: сохранять authProviderMarker при логине, передавать в logout()
1. auth/signUp/generateCode — ТОЛЬКО напрямую из Client Component (fingerprint устройства!), не через Server Action
```
