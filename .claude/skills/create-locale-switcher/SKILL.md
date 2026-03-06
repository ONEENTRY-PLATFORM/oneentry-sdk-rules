<!-- META
type: skill
skillConfig: {"name":"create-locale-switcher"}
-->

# /create-locale-switcher — Переключатель языков

Создаёт компонент для смены языка на основе данных из `Locales API`.

---

## Шаг 1: Уточни у пользователя

1. **Где размещается переключатель?** (Header, Footer, отдельный компонент)
2. **Как отображать языки?** — код (`en_US`), название (`English`), флаг?
3. **Есть ли верстка?** — если да, копируй точно

---

## Шаг 2: Создай Server Action

> Если `app/actions/locales.ts` уже существует — прочитай и дополни, не дублируй.

```typescript
// app/actions/locales.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';

export interface LocaleItem {
  code: string;
  title: string;
  shortCode: string; // первые два символа кода, напр. 'en' из 'en_US'
}

export async function getLocales(): Promise<LocaleItem[]> {
  const locales = await getApi().Locales.getLocales();
  if (isError(locales)) return [];
  return (locales as any[]).map((locale: any) => ({
    code: locale.code,                            // 'en_US', 'ru_RU'
    title: locale.localizeInfos?.title || locale.code, // 'English', 'Русский'
    shortCode: locale.code?.split('_')[0] || locale.code, // 'en', 'ru'
  }));
}
```

---

## Шаг 3: Создай компонент переключателя

### Ключевые принципы

- Текущий locale берётся из URL (сегмент `[locale]` в маршруте)
- При смене языка заменяем сегмент locale в `pathname` и навигируем туда
- `usePathname()` + `useRouter()` из `next/navigation`
- Можно делать как Server Component (получает locale как prop) или Client Component
- Локали загружаются **один раз** — либо передаются как prop от серверного родителя, либо кэшируются

### Вариант A: Серверный родитель передаёт локали как prop (предпочтительно)

```tsx
// В Header (Server Component):
import { getLocales } from '@/app/actions/locales';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export async function Header({ locale }: { locale: string }) {
  const locales = await getLocales();
  return (
    <header>
      {/* ... */}
      <LocaleSwitcher locale={locale} locales={locales} />
    </header>
  );
}
```

```tsx
// components/LocaleSwitcher.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { LocaleItem } from '@/app/actions/locales';

interface LocaleSwitcherProps {
  locale: string;
  locales: LocaleItem[];
}

export function LocaleSwitcher({ locale, locales }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;

    // Заменяем текущий locale-сегмент в URL:
    // /en_US/shop/product/123 → /ru_RU/shop/product/123
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <div>
      {locales.map((loc) => (
        <button
          key={loc.code}
          onClick={() => switchLocale(loc.code)}
          disabled={loc.code === locale}
          aria-current={loc.code === locale ? 'true' : undefined}
        >
          {loc.shortCode.toUpperCase()} {/* EN / RU */}
          {/* или loc.title для полного названия */}
        </button>
      ))}
    </div>
  );
}
```

### Вариант B: Клиентский компонент загружает локали сам

```tsx
// components/LocaleSwitcher.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getLocales } from '@/app/actions/locales';
import type { LocaleItem } from '@/app/actions/locales';

interface LocaleSwitcherProps {
  locale: string;
}

export function LocaleSwitcher({ locale }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [locales, setLocales] = useState<LocaleItem[]>([]);

  useEffect(() => {
    getLocales().then(setLocales);
  }, []);

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  if (locales.length === 0) return null;

  return (
    <div>
      {locales.map((loc) => (
        <button
          key={loc.code}
          onClick={() => switchLocale(loc.code)}
          disabled={loc.code === locale}
        >
          {loc.shortCode.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

### Вариант C: Ссылки вместо router.push (SEO-friendly)

```tsx
import Link from 'next/link';

// Заменяем locale-сегмент и делаем <Link> вместо кнопки
{locales.map((loc) => {
  const href = pathname.replace(`/${locale}`, `/${loc.code}`);
  return (
    <Link
      key={loc.code}
      href={href}
      aria-current={loc.code === locale ? 'page' : undefined}
    >
      {loc.shortCode.toUpperCase()}
    </Link>
  );
})}
```

---

## Шаг 4: Настрой routing (если ещё не настроен)

Переключатель предполагает, что приложение использует `[locale]` сегмент в маршруте:

```
app/
  [locale]/
    layout.tsx   ← получает locale из params
    page.tsx
    shop/
      page.tsx
```

В `[locale]/layout.tsx` locale передаётся дочерним компонентам:

```tsx
// app/[locale]/layout.tsx
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div>
      <Header locale={locale} />
      {children}
    </div>
  );
}
```

---

## Шаг 5: Напомни ключевые правила

```md
✅ Переключатель языков создан. Ключевые правила:

1. getLocales() возвращает code ('en_US'), title ('English'), shortCode ('en')
2. Смена locale — заменяем pathname.replace(`/${locale}`, `/${newLocale}`)
3. Серверный родитель передаёт locales как prop — лучше для производительности
4. Текущий locale определяется из params/useParams, НЕ хардкодится
5. locale.localizeInfos?.title — локализованное название языка ('Русский', 'English')
6. Для SEO-friendly: используй <Link href={newPath}> вместо router.push
```
