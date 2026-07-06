---
name: create-server-action
description: Create a server action
---
# Creating a Server Action

## Step 1: Define the module and target file

Break down the argument into `Module` and `method`. Define the file:
| Module | File | Type |
| --- | --- | --- |
| `Forms` | `app/actions/forms.ts` | public (getApi) |
| `FormData` | `app/actions/forms-data.ts` | public (getApi) — only `postFormsData`/`getFormsDataByMarker`; `updateFormsDataByid`/`updateFormsDataStatusByid`/`deleteFormsDataByid` — user-auth (Client Component after reDefine) |
| `AuthProvider` (getAuthProviders, getAuthProviderByMarker) | `app/actions/auth.ts` | public (getApi) |
| `AuthProvider` (auth, signUp, generateCode, checkCode, logout) | Client Component directly | getApi() on the client (see `rules/server-actions.md`) |
| `Pages`, `Products`, `Menus`, `Blocks` | `app/actions/<module>.ts` | public (getApi) |
| `Orders`, `Users`, `Payments`, `Events`, `Subscriptions` | Client Component | user-auth (getApi after reDefine) |

> ⚠️ Token-generating calls `auth()`/`oauth()` in Server Action are only allowed with passing `deviceMetadata` from the browser (SDK ≥ 1.0.155): on the client `getApi().AuthProvider.getDeviceMetadata()` → on the server per-request instance `defineOneEntry(url, { token, deviceMetadata })` — see `/create-google-oauth` and `rules/auth-provider.md`.

## Step 2: Read the existing file

If the file already exists — read it to avoid duplicating imports and `isError`.

## Step 3: Find the TypeScript interface in the SDK

Search in `node_modules/oneentry/dist/` to find the correct return type:

```bash
grep -r "interface I" node_modules/oneentry/dist/<module>/ --include="*.d.ts" -l
```

## Step 4: Create or supplement the file

### For public methods (Forms, Pages, Products, etc.; AuthProvider — only getAuthProviders/getAuthProviderByMarker)

```typescript
'use server';

import { getApi } from '@/lib/oneentry';
import { isError } from '@/lib/oneentry';
import type { IFormsEntity } from 'oneentry/dist/forms/formsInterfaces';

export async function getFormByMarker(marker: string, locale?: string) {
  const result = await getApi().Forms.getFormByMarker(marker, locale) as IFormsEntity;

  if (isError(result)) {
    return { error: result.message, statusCode: result.statusCode };
  }

  return result;
}
```

### For user-authorized methods (Orders, Users, Payments, Events, Subscriptions)

These methods are called **directly from the Client Component** via `getApi()` after `reDefine()`.

**Mandatory auth-init pattern in the component:**

```tsx
// components/ProfileData.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { getApi, isError, reDefine, hasActiveSession } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

export function ProfileData() {
  // useRef guard — protection against double execution in React StrictMode (dev).
  // Eliminates an extra pair of requests (reDefine + proactive /refresh) and setState races.
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) return;
      // ⚠️ hasActiveSession() is mandatory before reDefine.
      // After login, the SDK is already authorized — reDefine without checking will recreate the working instance,
      // and the new one before the first request will make an unnecessary proactive /refresh, wasting
      // just issued token (no more spurious 401, SDK ≥ 1.0.152; see rules/tokens.md).
      if (!hasActiveSession()) {
        await reDefine(refreshToken, 'en_US');
      }
      // now getApi().Users/Orders/Payments/Events/Subscriptions work
      const user = await getApi().Users.getUser() as IUserEntity;
      if (isError(user)) return;
    };
    init();
  }, []);
}
```

## Step 5: Provide usage instructions

After creating the file, show an example of usage from the Client Component:

```typescript
// components/MyComponent.tsx
'use client';

import { getFormByMarker } from '@/app/actions/forms';

export function MyComponent() {
  useEffect(() => {
    async function load() {
      const result = await getFormByMarker('my-form', 'en_US');
      if ('error' in result) {
        console.error(result.error);
        return;
      }
      // result is IFormsEntity
    }
    load();
  }, []);
}
```

For user-auth methods, remind:

⚠️ `reDefine(refreshToken, locale)` must be called before accessing user-auth methods.
Mandatory: `useRef` guard + `hasActiveSession()` check before `reDefine`. Without them, double execution in StrictMode leads to an extra pair of requests (`reDefine` + proactive `/refresh`) and setState races (the token pattern `reDefine` + `getUser` does not burn out — both requests share one proactive refresh, SDK ≥ 1.0.152; see `rules/tokens.md`). `saveFunction` automatically updates the token in localStorage with each rotation.
