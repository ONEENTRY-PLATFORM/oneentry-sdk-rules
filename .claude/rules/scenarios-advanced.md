# Extended OneEntry Scenarios

## Order Form from OneEntry Forms API

**The order form (delivery, address, date/time) is taken from the OneEntry Forms API**, not hardcoded.

**How it works:**

1. `getApi().Orders.getAllOrdersStorage()` returns order storages, each with a `formIdentifier`
2. `getApi().Forms.getFormByMarker(formIdentifier, locale)` returns the fields of the delivery form
3. The form fields are rendered dynamically by type (`string`, `date`, `timeInterval`, etc.)

**The `timeInterval` field in the order form** is a field with a list of available delivery slots. You get the slots through `expandTimeIntervals(schedule, { from, to })` by `field.localizeInfos.intervals[]` (SDK ≥ 1.0.156; the computed field `timeIntervals` has been removed) — the result is `[[start, end], ...]`, from which the following are determined:

- Available dates in the calendar (unique dates from start values)
- Available times for the selected date (times from start values for that date)

**⚠️ IMPORTANT:**

- The delivery form (`formIdentifier`) is tied to the order storage
- `timeInterval` in the form = list of available delivery slots, NOT entered data
- All user-auth calls in ONE instance

To implement the full checkout flow, use the skill **`/create-checkout`**.

## Product Catalog with Filters and Pagination

To create a product catalog with URL filters, infinite scrolling, and Server Actions, use the skill **`/create-product-list`** — it will create `src/lib/filters.ts`, `src/app/actions/products.ts`, Server Page, `ShopView`, and `ProductGrid` with the correct architecture.

To create a UI filter panel with `FilterContext`, price/color/availability components, and Apply/Reset buttons, use the skill **`/create-filter-panel`** — it complements `/create-product-list`.

## Search

To create a search bar (dropdown or separate page), use the skill **`/create-search`**.

For the language switcher, use the skill **`/create-locale-switcher`**.

## FormData — Reading Data from Forms

`FormData.getFormsDataByMarker` allows reading form submissions — applications, contact messages.

**⚠️ Requires Server Action** — called only server-side.

```typescript
// src/app/actions/forms.ts
'use server';
import { getApi } from '@/lib/oneentry';

export async function getFormSubmissions(marker: string) {
  try {
    const result = await getApi().FormData.getFormsDataByMarker(marker, 0, {}, 1);
    return { data: (result as any).items || [], total: (result as any).total || 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}
```

**Response Structure:** each item contains `id`, `time`, `formData: [{ marker, value, type }]`.

**Accessing Fields:** `Object.fromEntries(submission.formData.map(f => [f.marker, f.value]))`.

⚠️ **`formData` comes wrapped in language — do not read `formData[langCode]`.** The raw API response looks like `formData: { "en_US": [ … ] }`, but the SDK unwraps it and returns an **array** for the requested `langCode`. Code written based on the response from curl or the admin panel will receive `undefined` and render an empty list without any error.

**Typed selection filter (v1.0.163)** — `body: IFormsDataFilter`:

```typescript
await getApi().FormData.getFormsDataByMarker('review', 12, {
  entityIdentifier: 'blog',      // to which entity the records relate
  parentId: 10,                  // responses to a specific record
  status: ['approved'],          // ONLY an array and only from the set below
  dateFrom: '2025-01-01',
});
```

- **API silently ignores unknown field:** `statuses` instead of `status` will return all records, including unmoderated ones — the filter "works," but moderation is not applied.
- `status` — an array of `sent | moderation | approved | banned | deleted` (`FormDataStatus`); string or other value → `400 each value in status must be a valid enum value`.
- The field `entityparentIdentifier` does not exist: for responses to a record — `parentId`.

**Updating status / deletion** (`updateFormsDataByid`, `updateFormsDataStatusByid`, `deleteFormsDataByid`):

**⚠️ Requires user authorization** — call from Client Component after `reDefine(refreshToken)`, NOT through app-token (unlike `getFormsDataByMarker`, which works with app-token).

```typescript
await getApi().FormData.updateFormsDataStatusByid(id, { statusIdentifier: 'processed' });
await getApi().FormData.deleteFormsDataByid(id);
```

**Reviews with hierarchy** (`isExtended: 1`, `entityIdentifier`, `replayTo`) — skill **`/create-reviews`**.

**⚠️ Reviews in OneEntry are implemented through FormData** — use skill **`/create-reviews`**.

## IntegrationCollections — Custom Collections

IntegrationCollections — arbitrary data tables in OneEntry (FAQ, directories, arbitrary content). Full CRUD is available without authorization.

**⚠️ Collection marker:** obtain through `/inspect-api` or `getICollections()` — do not guess.

```typescript
// Reading rows
const rows = await getApi().IntegrationCollections.getICollectionRowsByMarker('faq');
// rows.items — array of rows, rows.total — count

// Reading a single row
const row = await getApi().IntegrationCollections.getICollectionRowByMarkerAndId('faq', id);

// Creating a row — body like FormData: formIdentifier + formData[{ marker, type, value }]
await getApi().IntegrationCollections.createICollectionRow('faq', {
  formIdentifier: 'faq-form',
  formData: [
    { marker: 'question', type: 'string', value: 'How to track my order?' },
    { marker: 'answer', type: 'string', value: 'Via your profile page.' },
  ],
} as any);

// Updating
await getApi().IntegrationCollections.updateICollectionRow('faq', id, {
  formIdentifier: 'faq-form',
  formData: [{ marker: 'answer', type: 'string', value: 'Updated answer.' }],
});

// Deleting
await getApi().IntegrationCollections.deleteICollectionRowByMarkerAndId('faq', id);
```

**Response Structure** (`ICollectionRowsResponce` = `{ items, total }`; row fields are in `formData`, like in FormData):

```typescript
{
  items: [
    {
      id: 1,
      createdDate: '2025-06-06T19:08:54.616Z',
      updatedDate: '2025-06-06T19:08:54.616Z',
      formData: [ // arbitrary schema fields: { marker, type, value }
        { marker: 'question', type: 'string', value: '...' },
        { marker: 'answer', type: 'string', value: '...' },
      ],
      entityType: null,
      entityId: null,
      attributeSetIdentifier: null,
    }
  ],
  total: 42,
}
```

**Marker Check** — returns an object `{ valid: boolean }` (`ICollectionIsValid`), NOT boolean. ⚠️ Semantics — "marker **is free**": `true` = no collection with that marker exists (can be created), `false` = marker is occupied (the same semantics confirmed by a live test at the twin endpoint `ProductStatuses.validateMarker`):

```typescript
const { valid } = await getApi().IntegrationCollections.validateICollectionMarker('faq');
if (!valid) {
  /* marker is occupied — the faq collection exists */
}

// Existence check — more reliable by list:
const cols = await getApi().IntegrationCollections.getICollections(locale);
const exists = cols.some((c) => c.identifier === 'faq');
```

## Navigation by Categories

**⚠️ IMPORTANT:** `getRootPages()` and `getPages()` do NOT return `catalog_page` (product catalogs).
Pages have a `type` field (`PageType`): `common_page`, `error_page`, `catalog_page`, `external_page`.
To get a catalog, use `getPageByUrl()` — it finds pages of any type.
`getChildPagesByParentUrl()` also returns `catalog_page` child pages.

```typescript
// ❌ INCORRECT - catalog_page will not be in the results of getRootPages/getPages
const rootPages = await getApi().Pages.getRootPages()
// shop, category, and other catalog_page WILL NOT be here!

// ✅ CORRECT - getPageByUrl finds pages of ANY type
const shop = await getApi().Pages.getPageByUrl('shop', 'en_US')
if (isError(shop)) return []
console.log(shop.type) // "catalog_page"

// ✅ getChildPagesByParentUrl also returns catalog_page
const categories = await getApi().Pages.getChildPagesByParentUrl('shop', 'en_US')
if (isError(categories)) return []
// categories contains child catalogs (type: "catalog_page") and regular pages
```
