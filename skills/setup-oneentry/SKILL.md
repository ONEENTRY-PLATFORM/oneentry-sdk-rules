<!-- META
type: skill
skillConfig: {"name":"setup-oneentry"}
-->

---
name: setup-oneentry
description: Initialize OneEntry SDK in a Next.js project — create lib/oneentry.ts with a singleton pattern, configure next.config.ts for images
allowed-tools: Read, Glob, Write, Edit
---

# /setup-oneentry - Setup oneentry

Initialize the OneEntry SDK in the current project. Follow the steps in order.

## Step 1: Check existing file

Check if `lib/oneentry.ts` exists. If yes — read and show the current content, then ask if it needs to be overwritten.

## Step 2: Create lib/oneentry.ts

Create `lib/oneentry.ts` with the following content:

```typescript
import { defineOneEntry } from 'oneentry';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

const saveFunction = async (refreshToken: string): Promise<void> => {
  if (!refreshToken) return;
  if (typeof window !== 'undefined') {
    localStorage.setItem('refresh-token', refreshToken);
  }
};

let apiInstance = defineOneEntry(PROJECT_URL, {
  token: APP_TOKEN,
  auth: {
    saveFunction,
  },
});

export const getApi = () => apiInstance;

export async function reDefine(refreshToken: string, langCode: string): Promise<void> {
  if (!refreshToken) return;
  apiInstance = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    langCode,
    auth: {
      refreshToken,
      saveFunction,
    },
  });
}

export function isError(result: unknown): result is { statusCode: number; message: string } {
  return (
    result !== null &&
    typeof result === 'object' &&
    'statusCode' in result
  );
}
```

## Step 3: Configure next.config.ts for images

Read `next.config.ts` (or `next.config.js`). If there is no `images.remotePatterns` block with `**.oneentry.cloud` — add it:

```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '**.oneentry.cloud',
    },
  ],
},
```

## Step 4: Check and create .env.local

Check if the file `.env.local` exists in the root of the project.

**If the file DOES NOT exist:**

Ask the user:
1. OneEntry project URL (for example: `https://your-project.oneentry.cloud`)
2. App Token (find it in the OneEntry admin panel → Settings → App Token)

After receiving the answers, create `.env.local` with the entered values:

```env
NEXT_PUBLIC_ONEENTRY_URL=<entered URL>
NEXT_PUBLIC_ONEENTRY_TOKEN=<entered token>
```

**If the file exists:**

Read it and check for the presence of `NEXT_PUBLIC_ONEENTRY_URL` and `NEXT_PUBLIC_ONEENTRY_TOKEN`. If the variables are missing — add them (asking the user for values). If they already exist — do nothing.

## Step 5: Show the result

Output the message:

```
✅ lib/oneentry.ts created
✅ .env.local configured

Find the token: in the OneEntry admin panel → Settings → App Token
```

## Step 6: Check oneentry import

Check that the `oneentry` package is installed in `package.json`. If not — inform:

```text
⚠️ Install the package: npm install oneentry
```
