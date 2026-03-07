<!-- META
type: skill
skillConfig: {"name":"create-server-action"}
-->

# Create Server Action

## Step 1: Identify the module and target file

Parse the argument into `Module` and `method`. Determine the file:
| Module                                  | File                      | Type                     |
|-----------------------------------------|---------------------------|-------------------------|
| `Forms`                                 | `app/actions/forms.ts`    | public (getApi)         |
| `AuthProvider`                          | `app/actions/auth.ts`     | public (getApi)         |
| `Pages`, `Products`, `Menus`, `Blocks`  | `app/actions/<module>.ts` | public (getApi)         |
| `Orders`, `Users`, `Payments`, `Events` | Client Component          | user-auth (getApi after reDefine) |

## Step 2: Read the existing file

If the file already exists — read it to avoid duplicating imports and `isError`.

## Step 3: Find the TypeScript interface in the SDK

Search in `node_modules/oneentry/dist/` to find the correct return type:

```bash
grep -r "interface I" node_modules/oneentry/dist/<module>/ --include="*.d.ts" -l
```

## Step 4: Create or extend the file

### For public methods (Forms, AuthProvider, Pages, Products, etc.)

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

### For user-authorized methods (Orders, Users, Payments, Events)

These methods are called **directly from a Client Component** via `getApi()` after `reDefine()`.

**Required auth-init pattern in the component:**

```tsx
// components/ProfileData.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { getApi, isError, reDefine, hasActiveSession } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

export function ProfileData() {
  // useRef guard — protection against double execution in React StrictMode (dev).
  // Without it, two parallel reDefine calls burn the one-time refresh token → logout.
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) return;
      // ⚠️ hasActiveSession() is required before reDefine.
      // After login the SDK is already authorized — reDefine without this check replaces
      // the working instance with a new one without an access token → first request 401 → token removed → logout.
      if (!hasActiveSession()) {
        await reDefine(refreshToken, 'en_US');
      }
      // now getApi().Users/Orders/Payments/Events work
      const user = await getApi().Users.getUser() as IUserEntity;
      if (isError(user)) return;
    };
    init();
  }, []);
}
```

## Step 5: Show usage instructions

After creating the file, show a usage example from a Client Component:

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
Required: `useRef` guard + `hasActiveSession()` check before `reDefine`. Without this, React StrictMode burns the refresh token with a double call → logout. `saveFunction` updates the token in localStorage automatically on each rotation.
