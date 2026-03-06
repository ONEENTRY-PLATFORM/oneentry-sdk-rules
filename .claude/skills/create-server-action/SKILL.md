<!-- META
type: skill
skillConfig: {"name":"create-server-action"}
-->

# Create a Server Action

## Step 1: Identify the module and target file

Parse the argument into `Module` and `method`. Determine the file:
| Module                                  | File                      | Type                    |
|-----------------------------------------|---------------------------|-------------------------|
| `Forms`                                 | `app/actions/forms.ts`    | public (getApi)         |
| `AuthProvider`                          | `app/actions/auth.ts`     | public (getApi)         |
| `Pages`, `Products`, `Menus`, `Blocks`  | `app/actions/<module>.ts` | public (getApi)         |
| `Orders`, `Users`, `Payments`           | `app/actions/user.ts`     | user-auth (makeUserApi) |

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

### For user-authorized methods (Orders, Users, Payments)

```typescript
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// ⚠️ ONE makeUserApi instance for all related calls in one function!
// Each makeUserApi call burns refreshToken via /refresh
export async function getUserProfile(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);

  const user = await api.Users.getUser() as IUserEntity;

  if (isError(user)) {
    return { error: user.message, statusCode: user.statusCode };
  }

  return { ...user, newToken: getNewToken() };
}
```

## Step 5: Show usage instructions

After creating the file, show an example of usage from a Client Component:

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
      // result — this is IFormsEntity
    }
    load();
  }, []);
}
```

For user-auth methods remind:

⚠️ Save newToken back to localStorage after each call:
localStorage.setItem('refresh-token', result.newToken)
