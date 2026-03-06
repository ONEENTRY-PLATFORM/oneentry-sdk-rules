<!-- META
type: skill
skillConfig: {"name":"create-page"}
-->

# Создать страницу Next.js с контентом из OneEntry CMS

Аргумент: `pageMarker` (маркер страницы в OneEntry, например `about` или `home`)

---

## Шаг 1: Определи маркер страницы

Если аргумент не передан — запроси его у пользователя:
- "Какой `pageUrl` у страницы в OneEntry? (Можно узнать через `/inspect-api pages`)"

**⚠️ ВАЖНО:** `pageUrl` — это маркер (одно слово, например `"about"`), а НЕ полный путь (`"shop/about"`).

---

## Шаг 2: Проверь маркер через /inspect-api (если нужно)

Если маркер неизвестен или пользователь не уверен:

```bash
# Читаем .env.local и проверяем реальные pageUrl
cat .env.local
curl -s "https://<URL>/api/content/pages?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Смотри поле `pageUrl` в ответе — это маркер для `getPageByUrl()`.

---

## Шаг 3: Определи путь к файлу страницы

Узнай у пользователя (или определи из контекста):
- Роут страницы в Next.js, например: `app/[locale]/about/page.tsx`
- Есть ли мультиязычность (`[locale]` в пути)?
- Нужны ли блоки страницы (`getBlocksByPageUrl`)?

---

## Шаг 4: Создай файл страницы

### Базовый шаблон (только контент страницы)

```tsx
// app/[locale]/about/page.tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;  // ⚠️ Next.js 15+: params это Promise!

  const page = await getApi().Pages.getPageByUrl('about', locale);
  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>
      <div
        dangerouslySetInnerHTML={{
          __html: page.localizeInfos?.htmlContent || page.localizeInfos?.content || '',
        }}
      />
    </main>
  );
}
```

### С блоками страницы

```tsx
// app/[locale]/home/page.tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Параллельные запросы для производительности
  const [page, blocks] = await Promise.all([
    getApi().Pages.getPageByUrl('home', locale),
    getApi().Pages.getBlocksByPageUrl('home'),
  ]);

  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>

      {!isError(blocks) && Array.isArray(blocks) &&
        blocks
          .sort((a: any, b: any) => a.position - b.position)
          .map((block: any) => {
            const attrs = block.attributeValues || {};
            // Доступ по маркеру (если знаешь): attrs.title?.value
            // Для изображений: attrs.image?.value?.[0]?.downloadLink (МАССИВ!)
            // Для text: attrs.description?.value?.htmlValue
            return (
              <section key={block.id}>
                {/* рендер блока */}
              </section>
            );
          })
      }
    </main>
  );
}
```

---

## Шаг 5: Напомни ключевые правила

После создания файла выведи:

> Правила локализации (locale из params, localizeInfos, langCode): `.claude/rules/localization.md`

✅ Файл создан. Ключевые правила:

```md
1. pageUrl = маркер ("about"), НЕ путь роута ("/[locale]/about")
2. params в Next.js 15+ — это Promise, всегда await
3. localizeInfos.htmlContent — HTML контент, localizeInfos.title — заголовок
4. Для images: attrs.img?.value?.[0]?.downloadLink (value — МАССИВ!)
5. Блоки сортируй по position перед рендером
6. Маркеры атрибутов блоков — узнай через /inspect-api
```
