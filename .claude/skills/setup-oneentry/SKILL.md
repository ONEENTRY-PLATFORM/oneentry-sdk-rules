<!-- META
type: skill
skillConfig: {"name":"setup-oneentry"}
-->

---
name: setup-oneentry
description: Инициализировать OneEntry SDK в Next.js проекте — создать lib/oneentry.ts с singleton паттерном, настроить next.config.ts для изображений
allowed-tools: Read, Glob, Write, Edit
---

# /setup-oneentry - Setup oneentry

Инициализируй OneEntry SDK в текущем проекте. Выполни шаги по порядку.

## Шаг 1: Проверь существующий файл

Проверь существует ли `lib/oneentry.ts`. Если да — прочитай и покажи текущее содержимое, затем спроси нужно ли перезаписать.

## Шаг 2: Создай lib/oneentry.ts

Создай `lib/oneentry.ts` со следующим содержимым:

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
    auth: {
      refreshToken,
      saveFunction,
    },
  });
}

export function makeUserApi(refreshToken: string): {
  api: ReturnType<typeof defineOneEntry>;
  getNewToken: () => string;
} {
  let capturedToken = refreshToken;
  const api = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction: async (token: string) => {
        capturedToken = token;
      },
    },
  });
  return { api, getNewToken: () => capturedToken };
}

export function isError(result: unknown): result is { statusCode: number; message: string } {
  return (
    result !== null &&
    typeof result === 'object' &&
    'statusCode' in result
  );
}
```

## Шаг 3: Настрой next.config.ts для изображений

Прочитай `next.config.ts` (или `next.config.js`). Если нет блока `images.remotePatterns` с `**.oneentry.cloud` — добавь его:

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

## Шаг 4: Проверь и создай .env.local

Проверь существует ли файл `.env.local` в корне проекта.

**Если файл НЕ существует:**

Спроси у пользователя:
1. URL проекта OneEntry (например: `https://your-project.oneentry.cloud`)
2. App Token (найти в админке OneEntry → Settings → App Token)

После получения ответов создай `.env.local` с введёнными значениями:

```env
NEXT_PUBLIC_ONEENTRY_URL=<введённый URL>
NEXT_PUBLIC_ONEENTRY_TOKEN=<введённый токен>
```

**Если файл существует:**

Прочитай его и проверь наличие `NEXT_PUBLIC_ONEENTRY_URL` и `NEXT_PUBLIC_ONEENTRY_TOKEN`. Если переменных нет — добавь их (спросив значения у пользователя). Если уже есть — ничего не делай.

## Шаг 5: Покажи итог

Выведи сообщение:

```
✅ lib/oneentry.ts создан
✅ .env.local настроен

Найти токен: в админке OneEntry → Settings → App Token
```

## Шаг 6: Проверь импорт oneentry

Проверь что пакет `oneentry` установлен в `package.json`. Если нет — сообщи:

```text
⚠️ Установи пакет: npm install oneentry
```
