---
name: create-content-filter
description: Render a content filter tree from Filters API — getFilterByMarker, recursive nodes by type (page/product/discount/...)
---
# Create a content filter renderer (Filters API)

Loads a content filter by marker (`Filters.getFilterByMarker`) and renders its node tree. A content filter is a customizable structure in the admin panel that combines heterogeneous entities: pages, products, attributes, discounts, bonuses, payment methods. It is convenient for promo panels, navigation trees, and "collections".

> ⚠️ These are NOT catalog filters (`IFilterParams[]` in `Products.getProducts`). The content filter is a separate tree from the admin panel. The method is public (app-token), no authorization is needed — it can be used from a Server Component.

> ⚠️ Before using the marker, check its existence via `/inspect-api`. If the filter is not in the admin panel — create an entry in `MISMATCH-LOG.md` (rule `.claude/rules/mismatch-log.md`).

---

## Step 1: Learn the structure (node types)

`getFilterByMarker` returns `IContentFilter`:

```ts
interface IContentFilter {
  localizeInfos: { title: string };       // filter title
  items?: IContentFilterItem[];           // node tree
}

interface IContentFilterItem {
  type:
    | 'page' | 'product' | 'admin' | 'attribute'
    | 'discount' | 'personal-discount' | 'bonus'
    | 'payment-method' | 'custom';
  marker?: string | null;                 // null for type='page'
  url?: string | null;                    // only for type='page'
  localizeInfos?: { title: string };
  value?: string | null;                  // unified value (discount value, attribute title, etc.)
  position?: number;
  children?: IContentFilterItem[];        // nested nodes
}
```

> ⚠️ A node is identified by `type`. `page` → go to `url`; `product` → by `marker`; `discount`/`bonus`/`payment-method` → informational nodes (render `localizeInfos.title` + `value`). Always sort children by `position`.

---

## Step 2: Server Action for loading

File: `src/app/actions/filters.ts`

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IContentFilter } from 'oneentry';

export async function getContentFilter(
  marker: string,
  locale: string,
): Promise<IContentFilter | null> {
  const result = await getApi().Filters.getFilterByMarker(marker, locale);
  if (isError(result)) {
    console.error('getFilterByMarker:', result.message);
    return null;   // graceful fallback — do not crash the page
  }
  return result;
}
```

---

## Step 3: Recursive render of the tree

File: `src/app/components/ContentFilterTree.tsx`

```tsx
import Link from 'next/link';
import type { IContentFilterItem } from 'oneentry';

function FilterNode({ node }: { node: IContentFilterItem }) {
  const title = node.localizeInfos?.title ?? node.marker ?? '';
  const children = [...(node.children ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  // Render "leaf" by type
  const label = (() => {
    switch (node.type) {
      case 'page':
        return node.url ? <Link href={`/${node.url}`}>{title}</Link> : <span>{title}</span>;
      case 'product':
        return node.marker ? <Link href={`/product/${node.marker}`}>{title}</Link> : <span>{title}</span>;
      case 'discount':
      case 'personal-discount':
        return <span>🏷️ {title}{node.value ? ` — ${node.value}` : ''}</span>;
      case 'bonus':
        return <span>⭐ {title}{node.value ? ` — ${node.value}` : ''}</span>;
      case 'payment-method':
        return <span>💳 {title}</span>;
      case 'attribute':
        return <span>{title}{node.value ? `: ${node.value}` : ''}</span>;
      default: // 'admin' | 'custom' and others
        return <span>{title}</span>;
    }
  })();

  return (
    <li data-filter-type={node.type} data-marker={node.marker ?? undefined}>
      {label}
      {children.length > 0 && (
        <ul>
          {children.map((child, i) => (
            <FilterNode key={`${child.type}-${child.marker ?? i}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ContentFilterTree({ items }: { items: IContentFilterItem[] }) {
  const roots = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    <ul data-testid="content-filter-tree">
      {roots.map((node, i) => (
        <FilterNode key={`${node.type}-${node.marker ?? i}`} node={node} />
      ))}
    </ul>
  );
}
```

---

## Step 4: Usage on the page

```tsx
// src/app/[locale]/promo/page.tsx — Server Component
import { getContentFilter } from '@/app/actions/filters';
import { ContentFilterTree } from '@/app/components/ContentFilterTree';

export default async function PromoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const filter = await getContentFilter('promo_filter', locale);  // ← marker from the admin panel

  if (!filter?.items?.length) return <p>The collection is empty</p>;

  return (
    <section>
      <h1>{filter.localizeInfos?.title}</h1>
      <ContentFilterTree items={filter.items} />
    </section>
  );
}
```

---

## Important details

```md
✅ Created a content filter renderer (Filters API). Key rules:

1. Filters.getFilterByMarker — public (app-token), load from Server Component
2. A node is identified by item.type — render differently (page→url, product→marker, discount/bonus→value)
3. The tree is recursive (children) — always sort by position
4. localizeInfos.title — the main title of the node; value — unified value (discount/attribute)
5. graceful fallback on IError — return null, do not crash the page
6. Do not confuse with catalog filters IFilterParams[] (Products.getProducts)
```
