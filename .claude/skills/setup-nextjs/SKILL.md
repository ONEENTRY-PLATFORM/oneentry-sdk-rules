---
name: setup-nextjs
description: Initialize Next.js project
---
# Initialize Next.js Project

Creates a new Next.js project from scratch or initializes it in an empty directory. Follow the steps in order.

---

## Step 1: Check if initialization is needed

Check for the presence of `package.json` in the current directory.

- If `package.json` **exists** — ask the user: create the project on top (overwrite) or just configure the settings.
- If **not** — proceed to Step 2.

---

## Step 2: Choose the creation method

### Option A — directory is empty (or only contains `.claude/`, `.git/`, `.env.local`)

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git --yes
```

Flags:
- `--typescript` — TypeScript
- `--tailwind` — Tailwind CSS
- `--eslint` — ESLint (config `next/core-web-vitals` + `next/typescript`)
- `--app` — App Router
- `--src-dir` — files in `src/` (`@/` → `./src/*`)
- `--import-alias "@/*"` — alias for imports
- `--no-git` — do not initialize a git repository
- `--yes` — no interactive questions

> If you need to skip dependency installation: add `--skip-install`, then `npm install`.

> `create-next-app` **will fail** if there are already files in the directory (except for `.git/`, `.claude/`, `.env*`). In this case, use **Option B**.

---

### Option B — directory is not empty (already has `.claude/`, `CLAUDE.md`, etc.)

Create project files manually.

#### package.json

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16",
    "oneentry": "^1",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10",
    "eslint": "^9",
    "eslint-config-next": "^16",
    "postcss": "^8",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

> Check the current version of Next.js: `npm view next version`

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "allowImportingTsExtensions": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    },
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

#### next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.oneentry.cloud',
      },
    ],
  },
};

module.exports = nextConfig;
```

#### postcss.config.mjs

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

#### tailwind.config.ts

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

#### eslint.config.mjs

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
```

#### src/app/globals.css

```css
@import "tailwindcss";
@config "../../tailwind.config.ts";

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

#### src/app/layout.tsx

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My App',
  description: 'Next.js + OneEntry',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

#### src/app/page.tsx

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
```

After creating the files — install the dependencies:

```bash
npm install
```

> ⚠️ **IMPORTANT: `dependencies` vs `devDependencies`.**
> In `dependencies` only runtime packages: `next`, `react`, `react-dom`, `oneentry`.
> Everything else (`@types/*`, `eslint`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint-config-next`, `@tailwindcss/postcss`) — in `devDependencies`.
> Never place types, linters, and build tools in `dependencies`.

---

## Step 3: Check the structure

After creation, ensure that the structure is correct:

```
src/
  app/
    layout.tsx
    page.tsx
  components/   ← create if not present
  lib/          ← create if not present
```

If the folders `src/components/` and `src/lib/` are not created — create them (empty `.gitkeep` or the necessary files right away).

---

## Step 4: Show the result and next step

```
✅ Next.js project created
   TypeScript + Tailwind + ESLint + App Router + src/

Next step:
  /setup-oneentry  — connect OneEntry SDK
```

---

## Additional: Installing a specific version of Next.js

If a specific version is needed:

```bash
npm install next@16.0.0
```

Check the latest available versions:

```bash
npm view next versions --json
```
