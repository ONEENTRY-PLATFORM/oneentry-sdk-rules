# SDK oneentry Module Reference

```ts
const {
  Admins, AttributesSets, AuthProvider, Blocks, Discounts, Events, FileUploading,
  Filters, Forms, FormData, GeneralTypes, IntegrationCollections, Locales, Menus,
  Orders, Pages, Payments, ProductStatuses, Products, Sitemap, Subscriptions,
  System, TemplatePreviews, Templates, UserActivity, Users, WS
} = defineOneEntry('your-url', { token: 'your-app-token' });
```

**Methods requiring user authorization** (call after `reDefine(refreshToken)` on the client):
Events, Orders, Payments, Subscriptions, Users, WebSocket

**Guest mode.** Cart/wishlist (`Users.getCart/...`), activity tracking (`UserActivity`), and recommendations Blocks work for **unauthorized guests** — the SDK sends the header `x-guest-id` instead of `Authorization`. Details — `03-sdk-init.md` (section "Guest Mode").

**The `rating` field** (aggregate rating) is now available in `IProductsEntity`, `IPagesEntity`, and `IUserEntity` — use it for stars on cards. Rating forms — form type `'rating'` (see `/create-reviews`).

**`langCode` — optional parameter** for most methods. The default language is set during SDK initialization. Pass it explicitly only in multilingual applications. All interfaces and types of returned values are in `node_modules/oneentry/dist/`.

> **Rarely used modules** (`GeneralTypes`, `IntegrationCollections`, `Templates`, `TemplatePreviews`, `System`) are described at the end of the file. They are rarely needed in the regular site code: only `IntegrationCollections` supports writing, and `System` is for service use. The types of returned values are in `node_modules/oneentry/dist/*/...Interfaces.d.ts`.

**Device metadata (v1.0.155).** Each module has `setDeviceMetadata(value)` and `getDeviceMetadata()` — override the header `x-device-metadata` (the API binds refresh tokens to it); there is also the option `config.deviceMetadata`. This is needed for server-side OAuth code exchange — see `03-sdk-init.md` and `/create-google-oauth`.

## Admins

```ts
getAdminsInfo(body?: IFilterParams[], langCode?, offset?, limit?): IAdminEntity[]
```

The "team/experts" pattern: OneEntry admins with an assigned set of attributes work as content entities (masters, doctors, trainers) — photo, rating, service-`entity`, schedule-`timeInterval`. The "team member" indicator is a filled key attribute (for example, name): filter the list on your side, there is no separate flag.

- ⚠️ **Positional signature** (`body, langCode, offset, limit`) — an options object instead of positional arguments will return a 4xx envelope, not a list.
- ⚠️ **Default `limit` = 30**: a call without arguments silently returns only the first page — part of the admins "disappears" without an error (classic: "32 masters in CMS, 30 on the site"). Always pass an explicit `limit` or paginate.
- `body` — the same `IFilterParams[]` as in Products (filters by attribute values); types — `oneentry/dist/admins/adminsInterfaces`.

## AttributeSets

```ts
getAttributes(langCode?, offset?, limit?, typeId?, sortBy?): IAttributesSetsResponse
getAttributesByMarker(marker, langCode?): IAttributesSetsEntity[]   // actual response form — attributes, see note
getSingleAttributeByMarkerSet(setMarker, attributeMarker, langCode?): IAttributesSetsEntity
getAttributeSetByMarker(marker, langCode?): IAttributeSetsEntity    // SET object, not attribute
```

- Do not confuse the two types: **`IAttributesSetsEntity`** — a separate attribute (`{ marker, type, value, position, listTitles, validators, localizeInfos, additionalFields }`); **`IAttributeSetsEntity`** — a set object (`{ id, identifier, title, schema, isVisible, type: { id, type }, position }`). Starting from v1.0.155, the fields `typeId` and `properties` have been removed from the set — read the set type from `type.id` / `type.type`.
- `getAttributesByMarker` is declared in d.ts as `IAttributeSetsEntity[]` — this is a known SDK typing error: an array of **attributes** (without `id`/`identifier`/`schema`) actually comes, read the attribute fields.

## AuthProvider

```ts
signUp(marker, body: ISignUpData, langCode?): ISignUpEntity
generateCode(marker, userIdentifier, eventIdentifier): void
checkCode(marker, userIdentifier, eventIdentifier, code): boolean
activateUser(marker, userIdentifier, code): boolean
auth(marker, body: IAuthPostBody): IAuthEntity
refresh(marker, token): IAuthEntity
logout(marker, token): boolean
logoutAll(marker): boolean
changePassword(marker, userIdentifier, eventIdentifier, type, code, newPassword, repeatPassword?): boolean
getAuthProviders(langCode?, offset?, limit?): IAuthProvidersEntity[]
getAuthProviderByMarker(marker, langCode?): IAuthProvidersEntity
getActiveSessionsByMarker(marker): IActiveSession[]
oauth(marker, body: IOauthData, langCode?): IAuthEntity   // session tokens ({ accessToken, refreshToken, userIdentifier }), NOT user object
```

## Blocks

```ts
getBlocks(type?: BlockType, langCode?, offset?, limit?): IBlocksResponse
getBlockByMarker(marker, langCode?, offset?, limit?): IBlockEntity
searchBlock(name, langCode?): ISearchBlock[]

// Recommendations / personalization (signPrice? — marker of the order storage to fix the price:
// products are returned with the signed price signedPrice, which is passed in products[] of the order)
getFrequentlyOrderedProducts(productId, marker, langCode?, signPrice?): IProductsResponse
getCartComplement(marker, langCode?, signPrice?): IProductsEntity[]
getCartComplementByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getCartSimilar(marker, langCode?, signPrice?): IProductsEntity[]
getCartSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getWishlistSimilar(marker, langCode?, signPrice?): IProductsEntity[]
getWishlistSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsEntity[]
getPersonalRecommendations(marker, langCode?, signPrice?): IProductsEntity[]
getRecentlyViewed(marker, langCode?, signPrice?): IProductsEntity[]
getRepeatPurchase(marker, langCode?, signPrice?): IProductsEntity[]
getTrending(marker, langCode?, signPrice?): IProductsEntity[]

// Slider (only for slider_block): tree of slides with a flat pre-order array
getSlides(marker): IBlockSlidesResponse
```

- `...ByProductIds` — versions by explicit list: `body: IBlockProductsLookup = { productIds: number[], langCode?, limit?, signPrice? }`. Versions without `ByProductIds` take the cart/wishlist **from context** (authorized user or guest by `x-guest-id`).
- `BlockType` has been supplemented with values: `'frequently_ordered_block'`, `'trending_block'`, `'recently_viewed_block'`, `'repeat_purchase_block'`, `'slider_block'`, `'personal_recommendations_block'`, `'cart_complement_block'`, `'cart_similar_block'`, `'wishlist_similar_block'`. Get the block marker in the OneEntry admin → Blocks.

## Discounts

```ts
getAllDiscounts(langCode?, offset?, limit?, type?: 'DISCOUNT' | 'BONUS' | 'PERSONAL_DISCOUNT'): IDiscountsResponse
getDiscountByMarker(marker, langCode?): IDiscountsEntity
validateDiscountsCoupon(code): ICouponValidationResult     // { valid, coupon?, error? }
getBonusBalance(): IBonusBalanceEntity                      // ⚠️ user — { balance }
getBonusHistory(type?, dateFrom?, dateTo?, discountId?, moduleId?, isAdmin?): IBonusTransactionEntity[]  // ⚠️ user
```

- `validateDiscountsCoupon` checks the coupon without binding to the cart; to calculate the discount on a specific cart, use `Orders.previewOrder` (see `.claude/rules/orders.md`).
- Bonuses: `getBonusBalance` / `getBonusHistory` require user authorization. `IBonusTransactionType` = `'ACCRUAL' | 'USAGE' | 'REDUCE' | 'REVERSAL_ACCRUAL' | 'REVERSAL_USAGE' | 'EXPIRATION'`.

## Events ⚠️ require authorization

```ts
// Product subscriptions (availability / price)
getAllSubscriptions(offset?, limit?): ISubscriptions
subscribeByMarker(marker, productId, langCode?): boolean
unsubscribeByMarker(marker, productId, langCode?): boolean

// Form event subscriptions
subscribeToForm(marker, body: ISubscribeFormEvent): boolean      // body: { formDataId, status? }
unsubscribeFromForm(marker, body: ISubscribeFormEvent): boolean
getFormSubscriptions(offset?, limit?): IListFormSubscription[]   // [{ eventMarker, formDataId }]

getAllEvents(): IContentApiEvent[]                               // public via SDK, but see note about 401
```

> ⚠️ `getAllEvents` is public from the SDK side, but the events route must be **granted to the guest group** — it is not granted on some tenants, and the method returns `401` with the app token. Then look for event markers in the admin → Events, through the admin API (`GET /api/admin/events`, rule `admin-api`) or grant permission (`/admin-grant-permissions`). The existence of an event cannot be checked with trial `generateCode`/`checkCode` — they mask the error (see `rules/auth-provider.md`).

> Do not confuse with the **Subscriptions** module (paid subscriptions) — these are different entities. `Events.getAllSubscriptions` → product subscriptions; `Subscriptions.getAllSubscriptions` → markers of paid subscriptions.

## FileUploading

```ts
upload(file: File | Blob, fileQuery?: IUploadingQuery): IUploadingReturn[]
delete(filename, fileQuery?): boolean
createFileFromUrl(url, filename, mimeType?): Promise<File>
getFile(id, type, entity, filename, template?): Response   // raw fetch Response — extract data via .blob()/.arrayBuffer()
```

> `IUploadingReturn` now contains `contentType: string` (MIME type of the uploaded file).

## Filters

```ts
getFilterByMarker(marker, langCode?): IContentFilter            // tree of items (IContentFilterItem[])
```

Content filter — a customizable tree of nodes in the admin (pages, products, attributes, discounts, bonuses, payment methods). `IContentFilterItem.type` = `'page' | 'product' | 'admin' | 'attribute' | 'discount' | 'personal-discount' | 'bonus' | 'payment-method' | 'custom'`. Nodes are nested via `children`. Public (app-token).

## Forms

```ts
getAllForms(langCode?, offset?, limit?): IFormsResponse   // paginated: { total, items: IFormsEntity[] } — iterate over .items
getFormByMarker(marker, langCode?): IFormsEntity
```

> `IFormsEntity.type` is narrowed down to `'order' | 'sing_in_up' | 'collection' | 'data' | 'rating' | null`. `IFormConfig` (element `moduleFormConfigs`) has received the field `exceptionIds?: string[]`.

## FormData

```ts
postFormsData(body: IBodyPostFormData, langCode?): IPostFormResponse
getFormsDataByMarker(marker, formModuleConfigId, body?, isExtended?, langCode?, offset?, limit?): IFormsByMarkerDataEntity
updateFormsDataByid(id, body?): IUpdateFormsData          // ⚠️ user
updateFormsDataStatusByid(id, body?): boolean             // ⚠️ user
deleteFormsDataByid(id): boolean                          // ⚠️ user
```

Update/delete methods require user authorization (call after `reDefine(refreshToken)`); `postFormsData` and `getFormsDataByMarker` work with app-token.

> `IPostFormResponseData.fingerprint` is now `string | null` (for anonymous / app-token submissions it comes as `null`).

## Locales

```ts
getLocales(): ILocalEntity[]
```

## Menus

```ts
getMenusByMarker(marker, langCode?): IMenusEntity
```

## Orders ⚠️ require authorization

```ts
getAllOrdersStorage(langCode?, offset?, limit?): IOrdersEntity[]
getAllOrdersByMarker(marker, langCode?, offset?, limit?): IOrdersByMarkerEntity
getOrdersStorageByMarker(marker, langCode?): IOrdersEntity
getOrderByMarkerAndId(marker, id, langCode?): IOrderByMarkerEntity
previewOrder(body: ICreateOrderPreview, langCode?): IOrderPreviewResponse
createOrder(marker, body: IOrderData, langCode?): IBaseOrdersEntity
updateOrderByMarkerAndId(marker, id, body: IOrderData, langCode?): IBaseOrdersEntity
getAllStatusesByStorageMarker(marker, langCode?, offset?, limit?): IOrderStatus[]

// Refunds (refund requests) for the order
getRefunds(id): IRefundRequest[]
createRefundRequest(id, body: ICreateRefundRequest): boolean    // body: { products: Record<string, { quantity }>, note? }
cancelRefundRequest(id): boolean
```

> Bonuses and coupons: `ICreateOrderPreview` / `IOrderData` accept `couponCode`, `additionalDiscountsMarkers`, `bonusAmount`; responses (`IBaseOrdersEntity`, `IOrderPreviewResponse`) return `bonusApplied`, `totalDue`, `discountConfig`. Split payment (`IOrderSplit`) and `discountConfig` come in `getOrderByMarkerAndId`. The elements `products` in body are `{ productId, quantity, signedPrice? }`: `signedPrice` should be taken from the product received with the `signPrice` parameter (price fixation, v1.0.154). Details — `.claude/rules/orders.md`.

## Pages

```ts
getRootPages(langCode?): IPagesEntity[]
getPages(langCode?): IPagesEntity[]
getPageById(id, langCode?): IPagesEntity
getPageByUrl(url, langCode?): IPagesEntity
getChildPagesByParentUrl(url, langCode?): IPagesEntity[]
getBlocksByPageUrl(url, langCode?): IPositionBlock[]
getConfigPageByUrl(url): IPageConfig
searchPage(name, url?, langCode?): IPagesEntity[]
```

> `IPagesEntity.type` is now typed as `PageType` = `'catalog_page' | 'common_page' | 'error_page' | 'external_page'` (a subset of `BlockType`). `categoryPath` has become `string | null` (for nested pages it comes as `null`).
>
> `getBlocksByPageUrl` enriches blocks with products (v1.0.153): a block of `type: 'product_block'` gets `products?: IProductsEntity[]`, and a block of `type: 'similar_products_block'` gets `similarProducts?: IProductsResponse` (`{ total, items }`); separate requests for products of the block are not needed. When `traficLimit: true` in the SDK config, enrichment is disabled, and in case of a loading error, an empty array is placed in the field — access is only optional: `block.products ?? []`, `block.similarProducts?.items ?? []`.

## Payments ⚠️ require authorization

```ts
getSessions(offset?, limit?): ISessionsEntity
getSessionById(id): ISessionEntity
getSessionByOrderId(id): ISessionEntity | ISessionEntity[]
createSession(orderId, type: 'session'|'intent', automaticTaxEnabled?): ISessionEntity   // paymentUrl for redirect (+ clientSecret when 'intent')
getAccounts(): IAccountsEntity[]
getAccountById(id): IAccountsEntity
```

## Products

`body: IFilterParams[]` — required parameter, but defaults to `[]`. If filters are not needed, you can omit it.

```ts
getProducts(body?: IFilterParams[], langCode?, userQuery?: IProductsQueryBase): IProductsResponse
getProductsEmptyPage(body?, langCode?, userQuery?): IAggregatedProductGroup[]   // ⚠️ POST, aggregated product groups without category
getProductsByPageId(id: number, body?, langCode?, userQuery?): IProductsResponse
getProductsPriceByPageUrl(url, langCode?, userQuery?: IProductsPriceQuery): IProductsInfo
getProductsByPageUrl(url, body?, langCode?, userQuery?): IProductsResponse
getRelatedProductsById(id, langCode?, userQuery?: IProductsRelatedQuery): IProductsResponse
getProductsByIds(ids: string, langCode?, userQuery?: IProductsByIdsQuery): IProductsEntity[]   // userQuery — ONLY { signPrice? }
getProductById(id, langCode?, isNormalized?): IProductsEntity
getProductBlockById(id): IProductBlock[]
searchProduct(name, langCode?): IProductsEntity[]
getProductsByVectorSearch(body: IVectorSearchProducts, langCode?, offset?, limit?): IProductsEntity[]  // semantic (vector) search
getProductsCount(body?): IProductsCount
getProductsCountByPageId(id: string, body?): IProductsCount   // ⚠️ id — string, unlike getProductsByPageId(id: number)
getProductsCountByPageUrl(url, body?): IProductsCount
```

- Per-method query types (v1.0.154), all exported from the SDK: base `IProductsQueryBase = { offset?, limit?, sortOrder?: 'DESC'|'ASC', sortKey?: 'id'|'position'|'title'|'date'|'price', signPrice? }` — for `getProducts` / `getProductsEmptyPage` / `getProductsByPageId` / `getProductsByPageUrl`. For `getRelatedProductsById` — `IProductsRelatedQuery` (base + `statusMarker?`, `templateMarker?`); for `getProductsPriceByPageUrl` — `IProductsPriceQuery` (base **without** `sortKey`, + `statusMarker?`); for `getProductsByIds` — `IProductsByIdsQuery` (only `signPrice?`: pagination and sorting are no longer accepted by this endpoint, extra fields are a TS error). `IProductsQuery` — deprecated alias `IProductsQueryBase`, do not use in new code.
- `getProductsByVectorSearch` — `body: IVectorSearchProducts = { queryText, vectorDistanceThreshold?, maxHits?, debug? }`. Semantic search by the meaning of the query (not by substring, like `searchProduct`).
- `getProductsEmptyPage` — now **POST**, returns `IAggregatedProductGroup[]` (`{ attrValue, items, productIds, total }`), not `IProductsResponse`.

## ProductStatuses

```ts
getProductStatuses(langCode?): IProductStatusEntity[]
getProductsByStatusMarker(marker, langCode?): IProductStatusEntity
validateMarker(marker): boolean
```

## Sitemap

```ts
getSitemap(): string[]
updateSitemap(body: ISitemapQuery): string[]    // body: { baseUrls?, url?, lastmod?, changefreq?, priority? }
```

## Subscriptions ⚠️ require authorization

```ts
subscribe(body: ISubscribe): ICreatedSubscription          // body: { marker } → { id, amount, paymentUrl, status }
cancelSubscription(body: ICancelSubscription): boolean      // body: { marker }
getAllSubscriptions(): string[]                            // markers of all available subscriptions
getActiveSubscriptions(): string[]                         // markers of the user's active subscriptions
recoverSubscriptions(body: ICancelSubscription): boolean   // recovery through Stripe Billing Portal
```

Paid subscriptions. `subscribe` returns `paymentUrl` for redirect to payment (like `createSession` for orders). Skills: `/create-subscription`.

## UserActivity

```ts
trackUserActivity(body: ITrackActivity): boolean           // works for user AND guest (x-guest-id)
```

`ITrackActivity = { type: TUserActivityType, productId?, pageId?, categoryId?, query?, meta? }`. `TUserActivityType` = `'product_view' | 'page_view' | 'category_view' | 'search' | 'product_add_to_cart' | 'product_remove_from_cart' | 'product_add_to_wishlist' | 'product_remove_from_wishlist' | 'product_purchase' | 'product_rating'`. These events feed the recommendations Blocks (recently-viewed, personal-recommendations, trending).

## Users ⚠️ require authorization

```ts
getUser(langCode?): IUserEntity
updateUser(body: IUserBody, langCode?): boolean
archiveUser(): boolean
deleteUser(): boolean
addFCMToken(token): boolean
deleteFCMToken(token): boolean

// Cart — works for user OR guest (x-guest-id)
getCart(): ICartResponse                       // { items: [{ productId, qty, addedAt? }], total }
setCart(body: ICartSet): ICartResponse         // full replacement: { items }
addCartItem(body: ICartAddItem): ICartResponse // { productId, qty } — add/update qty
removeCartItem(productId): ICartResponse

// Wishlist — works for user OR guest (x-guest-id)
getWishlist(): IWishlistResponse               // { items: [{ productId, addedAt? }], total }
setWishlist(body: IWishlistSet): IWishlistResponse
addWishlistItem(body: IWishlistAddItem): IWishlistResponse  // { productId }
removeWishlistItem(productId): IWishlistResponse
```

> Cart/Wishlist are stored on the OneEntry server and synchronized between devices/sessions. For anonymous visitors, a guest id is needed (see `03-sdk-init.md`). Skills: `/create-cart-manager`, `/create-favorites`.

## WebSocket ⚠️ require authorization

```ts
connect(): Socket
```

## Templates

```ts
getAllTemplates(langCode?): Record<BlockType, ITemplateEntity[]>   // grouped by block type
getTemplateByType(type: BlockType, langCode?): ITemplateEntity[]
getTemplateByMarker(marker, langCode?): ITemplateEntity
```

Templates define the structure of entities (what attributes a page/block/product has). They are rarely needed in site code — attributes come already unpacked in `attributeValues`. Useful when you need to render a form according to a schema or know the composition of attributes before requesting data.

## TemplatePreviews

```ts
getTemplatePreviews(langCode?): ITemplatesPreviewEntity[]
getTemplatePreviewByMarker(marker, langCode?): ITemplatesPreviewEntity
```

## GeneralTypes

```ts
getAllTypes(): IGeneralTypesEntity[]
```

A reference of entity types in the project (`forPage`, `forProduct`, `forBlock`, …). Needed in admin scenarios — see `admin-api.md`.

## IntegrationCollections

```ts
// reading
getICollections(langCode?, userQuery?: ICollectionQuery): ICollectionEntity[]
getICollectionById(id, langCode?): ICollectionEntity
getICollectionRowsById(id, langCode?, userQuery?): ICollectionRowsResponce
getICollectionRowsByMarker(marker, langCode?): ICollectionRowsResponce
getICollectionRowByMarkerAndId(marker, id, langCode?): ICollectionRow

// writing
createICollectionRow(marker, body: ICollectionFormObject, langCode?): ICollectionRow
updateICollectionRow(marker, id, body: { formIdentifier, formData }, langCode?): ICollectionRow
deleteICollectionRowByMarkerAndId(marker, id): boolean

// marker validation
validateICollectionMarker(marker): ICollectionIsValid
```

The only content module with full CRUD — use it if the project stores data in OneEntry collections. The body of the record (`{ formIdentifier, formData }`) is structured like in `FormData`.

> ⚠️ `validateICollectionMarker` — the semantics are **opposite** to JSDoc: `true` = marker is FREE (does not exist), `false` = occupied. Check the existence of a collection through `getICollections()`, not this method. Details — `product-statuses.md` (an analogous case is described there).

## System

```ts
getApiStat(): unknown          // number of API requests
test404(): unknown             // error handling test — returns 404
test500(): unknown             // error handling test — returns 500
```

Service module. `test404`/`test500` — only for testing your error handling (see `error-handling.md`), they have no place in production site code.

## Top-level utilities timeInterval (v1.0.156)

Imported directly from the package, not through modules. Pure functions — without requests and mutations.

```ts
import {
  expandAttributeTimeIntervals, // (attr, { from, to }) → TimeIntervalPair[]  — the entire timeInterval attribute
  expandTimeIntervals,          // (schedule, { from, to }) → TimeIntervalPair[] — a single schedule
  isTimeIntervalAttribute,      // (attr) → attr is ITimeIntervalAttributeValue — type-guard
} from 'oneentry';
```

- `expandAttributeTimeIntervals(attr, window)` — expands the **entire** `timeInterval` attribute
  of the entity (`page.attributeValues.interval` etc.): traverses groups and schedules, merges slots.
  Non-timeInterval attribute → `[]` (safe without type checking).
- `expandTimeIntervals(schedule, window)` — expands **one** schedule. Accepts both types:
  schedules of entities (`attributeValues[marker].value[].values[]`) and **forms**
  (`attributes[].localizeInfos.intervals[]`, already typed — main case).
- `TimeIntervalPair = [startISO, endISO]` (UTC). The window `ITimeIntervalWindow = { from, to }`.
  `ITimeIntervalAttributeValue`, `ITimeIntervalGroup`,
  `ITimeIntervalEntitySchedule`, `ITimeIntervalSchedule`, `IAttributeValue` are also exported.

> ⚠️ **Breaking (v1.0.156):** the computed field `timeIntervals` is no longer added to responses
> (materialized a year of slots and inflated the cache). Public `Module._addTimeIntervalsToSchedules`
> / `_addTimeIntervalsToFormSchedules` have also been removed. Migrate to `expandAttributeTimeIntervals` / `expandTimeIntervals`
> with the required window. The raw schedule (`dates`/`range`, `times`/`intervals`, `inEveryWeek`, `inEveryMonth`)
> has not changed. See `rules/attribute-values.md`, `/create-checkout`.
