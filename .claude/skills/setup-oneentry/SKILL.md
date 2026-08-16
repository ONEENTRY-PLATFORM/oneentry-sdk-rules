---
name: setup-oneentry
description: Setup OneEntry SDK
---
---
name: setup-oneentry
description: Initialize OneEntry SDK in a Next.js project — create src/lib/oneentry.ts with singleton pattern, configure next.config.ts for images
allowed-tools: Read, Glob, Write, Edit, Bash
---

# /setup-oneentry - Setup oneentry

Initialize the OneEntry SDK in the current project. Follow the steps in order.

## Step 1: Check for existing file

Check if `src/lib/oneentry.ts` exists. If it does — read and show the current content, then ask if it needs to be overwritten.

## Step 2: Create src/lib/oneentry.ts

Create `src/lib/oneentry.ts` with the following content:

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
  langCode: 'en_US',
  auth: {
    saveFunction,
  },
});

export const getApi = () => apiInstance;

// Current language of the instance (langCode). Always reflects the actual state of the SDK.
export function getLang(): string {
  return (
    (apiInstance.AuthProvider as unknown as { state?: { lang?: string } })?.state
      ?.lang ?? 'en_US'
  );
}

// Extracts the image URL from the OneEntry attribute value:
// object { downloadLink } (image/file with a single file — in all modules, SDK ≥ 1.0.157)
// or array [{ downloadLink }] (multiple files, groupOfImages, as well as image/file on SDK < 1.0.157).
export function getImageUrl(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v as { downloadLink?: string } | null | undefined)?.downloadLink ?? '';
}

export async function reDefine(refreshToken: string, langCode?: string): Promise<void> {
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

// ⚠️ CRITICAL: apiInstance — this is { AuthProvider, Users, ... }, it does NOT have .state!
// Check accessToken only through apiInstance.AuthProvider.state
export function hasActiveSession(): boolean {
  return !!(apiInstance.AuthProvider as unknown as { state?: { accessToken?: string } })?.state?.accessToken;
}

// Synchronizes tokens directly in the current instance.
// Use in login() INSTEAD of reDefine(): after auth() tokens are already written in the SDK state,
// and reDefine will recreate the instance without accessToken — before the first SDK request it will make
// an unnecessary /refresh, unnecessarily rotating the just issued one-time refresh token.
export function syncTokens(accessToken: string, refreshToken: string): void {
  apiInstance.AuthProvider.setAccessToken(accessToken);
  apiInstance.AuthProvider.setRefreshToken(refreshToken);
}

export function isError(result: unknown): result is { statusCode: number; message: string } {
  return (
    result !== null &&
    typeof result === 'object' &&
    'statusCode' in result
  );
}
```

> **deviceMetadata (SDK ≥ 1.0.155).** The `defineOneEntry` config also accepts `deviceMetadata` — needed only if the server issues tokens to the user (for example, server-side OAuth code exchange from `/create-google-oauth`): the server must stamp the browser fingerprint obtained on the client via `getApi().AuthProvider.getDeviceMetadata()` (the method is available on each module, not on the `getApi()` object itself; at runtime — `getApi().AuthProvider.setDeviceMetadata(browserString)`, an empty string resets the override). Otherwise, the refresh token will be tied to the server's fingerprint and will not be updated from the browser. More details — `/create-google-oauth`.

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

Check if the `.env.local` file exists in the root of the project.

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

## Step 5: Configure `.mcp.json` — with version pinning and no secrets in the file

`.mcp.json` **is committed to the repository**. This implies two requirements.

**1. Pin the server version, not `@latest`.** With `@latest`, the rules change underfoot between sessions: the behavior of last week cannot be reproduced, and without a network, the launch breaks completely.

```bash
npm view @oneentry/mcp-server version    # find out the current version
```

**2. Do not write the token in the file** — only substitution from the environment:

```json
{
  "mcpServers": {
    "oneentry": {
      "command": "npx",
      "args": ["-y", "@oneentry/mcp-server@1.0.157"],
      "env": {
        "ONEENTRY_URL": "${NEXT_PUBLIC_ONEENTRY_URL:-}",
        "ONEENTRY_TOKEN": "${NEXT_PUBLIC_ONEENTRY_TOKEN:-}"
      }
    }
  }
}
```

The syntax `${VAR:-}` — is the only supported way: the value is taken from the environment, and only the variable name goes to the repository. A hardcoded token in `.mcp.json` is a leaked token (see `.claude/rules/security.md`).

When updating the server version, change the number consciously and check the changelog: the rules may have changed.

## Step 6: Show the result

Output the message:

```
✅ src/lib/oneentry.ts created
✅ .env.local configured
✅ .mcp.json — server version pinned, token via ${VAR:-}

Find the token: in the OneEntry admin panel → Settings → App Token
```

## Step 7: Check the import of oneentry

Check that the `oneentry` package is installed in `package.json`. If not — inform:

```text
⚠️ Install the package: npm install oneentry
```

Check the installed version (`node -p "require('oneentry/package.json').version"`) — it affects the form of type imports:

- **≥ 1.0.160** — types are taken from the root: `import type { IPagesEntity } from 'oneentry'` (or `oneentry/types`). Requires Node ≥ 18.
- **exactly 1.0.159** — ⚠️ broken tarball: built from an outdated directory, `require('oneentry')` fails with `Cannot find module '../base/lazySchema'`. Fixed only by updating — `npm install oneentry@latest` (functionally the same release as 1.0.160).
- **≤ 1.0.158** — only deep paths (`oneentry/dist/pages/pagesInterfaces`). If the version is old, suggest updating: `npm install oneentry@latest` — the rules and skills are written for root import.
