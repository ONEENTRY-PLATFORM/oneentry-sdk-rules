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

**Guest mode.** Cart/wishlist (`Users.getCart/...`), activity tracking (`UserActivity`), and recommendations Blocks work for **unauthorized guests** — the SDK sends the header `x-guest-id` instead of `Authorization`. Details — `.claude/rules/sdk-init.md` (section "Guest mode").

**The `rating` field** (aggregate rating) is now available in `IProductsEntity`, `IPagesEntity`, and `IUserEntity` — use it for stars on cards. Rating forms — form type `'rating'` (see `/create-reviews`).

**`langCode` — optional parameter** for most methods. The default language is set during SDK initialization. Pass it explicitly only in multilingual applications. All interfaces and types of returned values are in `node_modules/oneentry/dist/`.

> **Rarely used modules** (`GeneralTypes`, `IntegrationCollections`, `Templates`, `TemplatePreviews`, `System`) are described at the end of the file. They are rarely needed in regular site code: only `IntegrationCollections` supports writing, and `System` is for service use. The types of returned values are in `node_modules/oneentry/dist/*/...Interfaces.d.ts`.

**Unified attribute normalization (v1.0.157).** Applies to **all** modules: a single `image`/`file` comes as an object (multiple files as an array), `groupOfImages` is always an array, `integer`/`float`/`real` are converted to a number, an empty attribute is always `null`, form fields `attributes` are sorted by `position`. Previously, some of this only worked in products/menus/forms/attribute-sets — code that read `value[0]` in blocks, pages, users, orders will break. Details and migration — `.claude/rules/attribute-values.md`.

**⚠️ Recommendations Blocks and vector search now return a response object (v1.0.158).** Ten recommendation methods of `Blocks` (`getCartComplement`, `getCartSimilar`, `getWishlistSimilar`, `getPersonalRecommendations`, `getRecentlyViewed`, `getRepeatPurchase`, `getTrending`, and their `...ByProductIds` versions), `Products.getProductsByVectorSearch`, and `Events.getFormSubscriptions` previously returned an array but now return `IProductsResponse` (`{ items, total, totalFound? }`) and `IFormSubscriptionsResponse` (`{ items, total }`). Code that did `.map` directly on the result or read `result[0]` will **silently receive `undefined`**. Migration — use `result.items` (and `?? []` just in case):

```typescript
// ❌ before 1.0.158
const similar = await getApi().Blocks.getCartSimilar('cart_similar_block')
similar.map(...)                     // TypeError: similar.map is not a function

// ✅ since 1.0.158
const res = await getApi().Blocks.getCartSimilar('cart_similar_block')
if (isError(res)) return []
const similar = res.items ?? []
```

**Other type clarifications (v1.0.158).** There is no breaking behavior — the API returned this before, only the declarations changed, but now they can be relied upon without casts: `ILocalizeInfo.plainContent` (plain text next to `htmlContent`); `IOrderStatus` + `axis`/`isCancelFinal`/`isFinalSuccess`/`isMapped`; `IBaseOrdersEntity.totalSum` — **number** (for `IOrderByMarkerEntity` it remains a string); a form without fields returns `attributes: []`, not `{}` (normalized in `_normalizeAttr`); flags `IFormAttribute` (`isLogin`, `isSignUp`, …) and `IFormLocalizeInfo.title` have become optional; `IAttributeSchemaItem` + `position`/`listTitles`/`listType`/`moduleIdentifier`/`parentId`/`splitParts`, while `initialValue`/`isPrice` are optional; `IProductsResponse.totalFound?`; `IContentApiEvent.module` is optional; `IDiscountsEntity.attributeSetId` and `IDiscountValue.maxAmount` — `number | null`; `ITimeIntervalRange.period` — `number | null`; `ITimeIntervalSchedule.fullMonth`/`selectedYear` are optional; `IProductBlockSimilarRule` rewritten to the actual form (`{ id, title, attributeMarker, conditionMarker, conditionValue, statusMarker, pageUrls }`).

**Device metadata (v1.0.155).** Each module has `setDeviceMetadata(value)` and `getDeviceMetadata()` — override the header `x-device-metadata` (to which the API binds refresh tokens); there is also an option `config.deviceMetadata`. This is needed for server-side OAuth code exchange — see `.claude/rules/sdk-init.md` (section "Device metadata") and `/create-google-oauth`.

## Admins

```ts
getAdminsInfo(body?: IFilterParams[], langCode?, offset?, limit?): IAdminEntity[]
```

The "command/specialists" pattern: OneEntry admins with a designated set of attributes work as content entities (masters, doctors, trainers) — photo, rating, service-`entity`, schedule-`timeInterval`. The "team member" indicator is a filled key attribute (for example, name): filter the list on your side, there is no separate flag.

- ⚠️ **Positional signature** (`body, langCode, offset, limit`) — an options object instead of positional arguments will return a 4xx envelope, not a list.
- ⚠️ **Default `limit` = 30**: calling without arguments silently returns only the first page — some admins "disappear" without an error (classic: "32 masters in CMS, 30 on the site"). Always pass an explicit `limit` or paginate.
- `body` — the same `IFilterParams[]` as in Products (filters by attribute values); types — `oneentry/dist/admins/adminsInterfaces`.

## AttributesSets

```ts
getAttributes(langCode?, offset?, limit?, typeId?, sortBy?): IAttributesSetsResponse
getAttributesByMarker(marker, langCode?): IAttributesSetsEntity[]   // actual response form — attributes, see note
getSingleAttributeByMarkerSet(setMarker, attributeMarker, langCode?): IAttributesSetsEntity
getAttributeSetByMarker(marker, langCode?): IAttributeSetsEntity    // SET object, not attribute
```

- Do not confuse the two types: **`IAttributesSetsEntity`** — a separate attribute (`{ marker, type, value, position, listTitles, validators, localizeInfos, additionalFields }`); **`IAttributeSetsEntity`** — a set object (`{ id, identifier, title, schema, isVisible, type: { id, type }, position }`). Since v1.0.155, the fields `typeId` and `properties` have been removed from the set — read the type of the set from `type.id` / `type.type`.
- `getAttributesByMarker` returns an array of **attributes** (`IAttributesSetsEntity[]`, without `id`/`identifier`/`schema`), not sets. Since v1.0.158, this is reflected in the types; until 1.0.157 inclusive, d.ts declared `IAttributeSetsEntity[]` — do not trust the declared type in the old SDK here.

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

> v1.0.157: in `ISignUpEntity` (response from `signUp`) `attributeSetId` and `attributesSets` are declared — the API returned them, but when `validation.enabled` they were cut from the response.

## Blocks

```ts
getBlocks(type?: BlockType, langCode?, offset?, limit?): IBlocksResponse
getBlockByMarker(marker, langCode?, offset?, limit?): IBlockEntity
searchBlock(name, langCode?): ISearchBlock[]

// Recommendations / personalization (signPrice? — marker of the order storage to fix the price:
// products are returned with signed price signedPrice, which is passed in products[] of the order)
getFrequentlyOrderedProducts(productId, marker, langCode?, signPrice?): IProductsResponse
getCartComplement(marker, langCode?, signPrice?): IProductsResponse
getCartComplementByProductIds(marker, body: IBlockProductsLookup): IProductsResponse
getCartSimilar(marker, langCode?, signPrice?): IProductsResponse
getCartSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsResponse
getWishlistSimilar(marker, langCode?, signPrice?): IProductsResponse
getWishlistSimilarByProductIds(marker, body: IBlockProductsLookup): IProductsResponse
getPersonalRecommendations(marker, langCode?, signPrice?): IProductsResponse
getRecentlyViewed(marker, langCode?, signPrice?): IProductsResponse
getRepeatPurchase(marker, langCode?, signPrice?): IProductsResponse
getTrending(marker, langCode?, signPrice?): IProductsResponse

// Slider (only for slider_block): tree of slides as a flat pre-order array
getSlides(marker): IBlockSlidesResponse
```

- `...ByProductIds` — versions by explicit list: `body: IBlockProductsLookup = { productIds: number[], langCode?, limit?, signPrice? }`. Versions without `ByProductIds` take the cart/wishlist **from context** (authorized user or guest by `x-guest-id`).
- `BlockType` has been supplemented with values: `'frequently_ordered_block'`, `'trending_block'`, `'recently_viewed_block'`, `'repeat_purchase_block'`, `'slider_block'`, `'personal_recommendations_block'`, `'cart_complement_block'`, `'cart_similar_block'`, `'wishlist_similar_block'`. Take the block marker in the OneEntry admin → Blocks.

## Discounts

```ts
getAllDiscounts(langCode?, offset?, limit?, type?: 'DISCOUNT' | 'BONUS' | 'PERSONAL_DISCOUNT'): IDiscountsResponse
getDiscountByMarker(marker, langCode?): IDiscountsEntity
validateDiscountsCoupon(code): ICouponValidationResult     // { valid, coupon?, error? }
getBonusBalance(): IBonusBalanceEntity                      // ⚠️ user — { balance }
getBonusHistory(type?, dateFrom?, dateTo?, discountId?, moduleId?, isAdmin?): IBonusTransactionEntity[]  // ⚠️ user
```

- `validateDiscountsCoupon` checks the coupon without binding to the cart; to calculate a discount on a specific cart, use `Orders.previewOrder` (see `.claude/rules/orders.md`).
- Bonuses: `getBonusBalance` / `getBonusHistory` require user authorization. `IBonusTransactionType` = `'ACCRUAL' | 'USAGE' | 'REDUCE' | 'REVERSAL_ACCRUAL' | 'REVERSAL_USAGE' | 'EXPIRATION'`.

## Events ⚠️ require authorization

```ts
// Subscriptions to products (availability / price)
getAllSubscriptions(offset?, limit?): ISubscriptions
subscribeByMarker(marker, productId, langCode?): boolean | IError
unsubscribeByMarker(marker, productId, langCode?): boolean | IError

// Form event subscriptions
subscribeToForm(marker, body: ISubscribeFormEvent): boolean | IError   // body: { formDataId, status? }
unsubscribeFromForm(marker, body: ISubscribeFormEvent): boolean | IError
getFormSubscriptions(offset?, limit?): IFormSubscriptionsResponse   // [{ eventMarker, formDataId }]

getAllEvents(): IContentApiEvent[]                               // public via SDK, but see note about 401
```

> ⚠️ **Breaking (v1.0.157):** `subscribeByMarker`, `unsubscribeByMarker`, `subscribeToForm`, `unsubscribeFromForm` now truly return `IError` on API refusal. Until 1.0.157, the common helper only caught exceptions, and with `isShell: true` (default) the SDK **returns** the error instead of throwing it — therefore, any refusal was reported as `true`. Check strictly: `if (result === true)`, `if (result)` will skip the error object. The same pitfalls were present in `Subscriptions.cancelSubscription` / `recoverSubscriptions`.
>
> ⚠️ `getAllEvents` is public from the SDK side, but the events route must be **granted to a group of guests** — it is not granted on some tenants, and the method returns `401` with the app token. Then view event markers in the admin → Events, via admin API (`GET /api/admin/events`, rule `admin-api`) or grant permission (`/admin-grant-permissions`). The existence of an event cannot be checked with trial `generateCode`/`checkCode` — they mask the error (see `.claude/rules/auth-provider.md`).
>
> Do not confuse with the **Subscriptions** module (paid subscriptions) — these are different entities. `Events.getAllSubscriptions` → user subscriptions to products (`ISubscriptions`); `Subscriptions.getAllSubscriptions` → available paid plans (`ISubscriptionEntity[]`, v1.0.157).

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

> `IFormsEntity.type` is narrowed to `'order' | 'sing_in_up' | 'collection' | 'data' | 'rating' | null`. `IFormConfig` (element `moduleFormConfigs`) received the field `exceptionIds?: string[]`.

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

> Bonuses and coupons: `ICreateOrderPreview` / `IOrderData` accept `couponCode`, `additionalDiscountsMarkers`, `bonusAmount`; responses (`IBaseOrdersEntity`, `IOrderPreviewResponse`) return `bonusApplied`, `totalDue`, `discountConfig`. Split payment (`IOrderSplit`) and `discountConfig` come in `getOrderByMarkerAndId`. Elements `products` in body — `{ productId, quantity, signedPrice? }`: `signedPrice` take from the product obtained with the `signPrice` parameter (price fixation, v1.0.154). Details — `.claude/rules/orders.md`.
>
> Order statuses (v1.0.157, fields declared in types — previously validation cut them out): in `IOrderByMarkerEntity` (`getOrderByMarkerAndId`, `getAllOrdersByMarker`) — `fulfillmentStatusIdentifier`, `fulfillmentStatusLocalizeInfos`, `paymentStatusIdentifier`, `paymentStatusLocalizeInfos` (each `null` until the status is assigned); in `IBaseOrdersEntity` (`createOrder`, `updateOrderByMarkerAndId`) — `statusLocalizeInfos` (localized status name). If the project included `validation.enabled`, these fields did not reach the code at all until 1.0.157.

## Pages

```ts
getRootPages(langCode?): IPagesEntity[]
getPages(langCode?): IPagesEntity[]
getPageById(id, langCode?): IPagesEntity
getPageByUrl(url, langCode?): IPagesEntity
getChildPagesByParentUrl(url, langCode?): IPagesEntity[]
getBlocksByPageUrl(url, langCode?): IPositionBlock[]
getConfigPageByUrl(url): IPageConfig
searchPage(name, url?, langCode?): IPagesEntity[] | IPageSearchResult[]   // ⚠️ form depends on traficLimit
```

> `IPagesEntity.type` is now typed as `PageType` = `'catalog_page' | 'common_page' | 'error_page' | 'external_page'` (subset of `BlockType`). `categoryPath` has become `string | null` (for nested pages it comes as `null`).
>
> `searchPage` with `traficLimit: true` returns short cards `IPageSearchResult` (`{ id, title }`) — see the Products section, there is also a type narrowing pattern. Since v1.0.157, in this mode, the useless pass for templates has been skipped (short cards do not have `templateIdentifier`).
>
> `getBlocksByPageUrl` enriches blocks with products (v1.0.153): for block `type: 'product_block'` appears `products?: IProductsEntity[]`, for `type: 'similar_products_block'` — `similarProducts?: IProductsResponse` (`{ total, items }`); separate requests for products of the block are not needed. With `traficLimit: true` in the SDK config, enrichment is disabled, in case of a loading error, an empty array is placed in the field — access is only optional: `block.products ?? []`, `block.similarProducts?.items ?? []`.

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

`body: IFilterParams[]` — required parameter, but defaults to `[]`. If filters are not needed, it can be omitted.

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
searchProduct(name, langCode?): IProductsEntity[] | IProductSearchResult[]   // ⚠️ form depends on traficLimit
getProductsByVectorSearch(body: IVectorSearchProducts, langCode?, offset?, limit?): IProductsResponse  // semantic (vector) search
getProductsCount(body?): IProductsCount
getProductsCountByPageId(id: string, body?): IProductsCount   // ⚠️ id — string, unlike getProductsByPageId(id: number)
getProductsCountByPageUrl(url, body?): IProductsCount
```

- Per-method query types (v1.0.154), all exported from the SDK: base `IProductsQueryBase = { offset?, limit?, sortOrder?: 'DESC'|'ASC', sortKey?: 'id'|'position'|'title'|'date'|'price', signPrice? }` — for `getProducts` / `getProductsEmptyPage` / `getProductsByPageId` / `getProductsByPageUrl`. For `getRelatedProductsById` — `IProductsRelatedQuery` (base + `statusMarker?`, `templateMarker?`); for `getProductsPriceByPageUrl` — `IProductsPriceQuery` (base **without** `sortKey`, + `statusMarker?`); for `getProductsByIds` — `IProductsByIdsQuery` (only `signPrice?`: pagination and sorting are no longer accepted by this endpoint, extra fields are a TS error). `IProductsQuery` — deprecated alias `IProductsQueryBase`, do not use in new code.
- `getProductsByVectorSearch` — `body: IVectorSearchProducts = { queryText, vectorDistanceThreshold?, maxHits?, debug? }`. Semantic search by the meaning of the query (not by substring, like `searchProduct`).
- `getProductsEmptyPage` — now **POST**, returns `IAggregatedProductGroup[]` (`{ attrValue, items, productIds, total }`), not `IProductsResponse`.
- **Quick search and `traficLimit` (types clarified in v1.0.157).** `searchProduct` → `IProductsEntity[] | IProductSearchResult[] | IError`, `Pages.searchPage` → `IPagesEntity[] | IPageSearchResult[] | IError`. With `traficLimit: true`, the **raw response of quick search** is returned — short card `IProductSearchResult = { id, title, pageId }` / `IPageSearchResult = { id, title }`, without `attributeValues`, `localizeInfos`, `blocks`. Runtime behavior has not changed — previously the signature just lied, and `attributeValues` in traficLimit mode silently came as `undefined`. Narrow down by config or by field:

```ts
const found = await getApi().Products.searchProduct(query);
if (!isError(found) && found.length && 'attributeValues' in found[0]) {
  // IProductsEntity[] — traficLimit is off, all entity fields are available
} else {
  // IProductSearchResult[] — only id/title/pageId; for details go to getProductsByIds
}
```

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
subscribe(body: ISubscribe): ICreatedSubscription             // body: { marker } → { id, amount, paymentUrl, status }
cancelSubscription(body: ICancelSubscription): boolean | IError  // body: { marker }
getAllSubscriptions(): ISubscriptionEntity[]                  // ⚠️ v1.0.157: objects, NOT markers
getActiveSubscriptions(): string[]                            // markers of active user subscriptions
recoverSubscriptions(body: ICancelSubscription): boolean | IError  // recovery via Stripe Billing Portal
```

Paid subscriptions. `subscribe` returns `paymentUrl` for redirect to payment (like `createSession` for orders). Skills: `/create-subscription`.

> ⚠️ **Breaking (v1.0.157):** `getAllSubscriptions` returns `ISubscriptionEntity[]`, not `string[]` — the old signature was taken from swagger and never matched the data (with `validation.enabled` the method failed with `expected string, received object`). Fields: `{ id, identifier, localizeInfos, productIds, periodInDays, paymentAccountId, isUsed }` — the plan name is taken from `localizeInfos.title`, the marker from `identifier`. Code on markers: `subs.map((s) => s.identifier)`. `getActiveSubscriptions` has not changed (`string[]`).
>
> ⚠️ **Breaking (v1.0.157):** `cancelSubscription` / `recoverSubscriptions` no longer respond `true` on API error — with `isShell: true` (default) it returns `IError`. Check only strictly with `if (result === true)`: the error object is also truthy.

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
addCartItem(body: ICartAddItem): ICartResponse // { productId, qty } — add / update qty
removeCartItem(productId): ICartResponse

// Wishlist — works for user OR guest (x-guest-id)
getWishlist(): IWishlistResponse               // { items: [{ productId, addedAt? }], total }
setWishlist(body: IWishlistSet): IWishlistResponse
addWishlistItem(body: IWishlistAddItem): IWishlistResponse  // { productId }
removeWishlistItem(productId): IWishlistResponse
```

> Cart/Wishlist are stored on the OneEntry server and synchronized between devices/sessions. For anonymous visitors, a guest id is needed (see `.claude/rules/sdk-init.md`). Skills: `/create-cart-manager`, `/create-favorites`.

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

Templates define the structure of entities (what attributes a page/block/product has). They are rarely needed in site code — attributes come already unpacked in `attributeValues`. Useful when you need to render a form by schema or know the composition of attributes before requesting data.

## TemplatePreviews

```ts
getTemplatePreviews(langCode?): ITemplatesPreviewEntity[]
getTemplatePreviewByMarker(marker, langCode?): ITemplatesPreviewEntity
```

## GeneralTypes

```ts
getAllTypes(): IGeneralTypesEntity[]
```

Reference of entity types in the project (`forPage`, `forProduct`, `forBlock`, …). Needed in admin scenarios — see `admin-api.md`.

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

// marker check
validateICollectionMarker(marker): ICollectionIsValid
```

The only content module with full CRUD — use it if the project stores data in OneEntry collections. The body of the record (`{ formIdentifier, formData }`) is structured like in `FormData`.

> v1.0.157: in `ICollectionRow` `langCode` and `formIdentifier` are declared (`formIdentifier` comes on update) — the API always returned them, but when `validation.enabled` they were cut from the response.
>
> ⚠️ `validateICollectionMarker` — the semantics are **opposite** to JSDoc: `true` = marker is FREE (does not exist), `false` = occupied. To check the existence of a collection, you need to use `getICollections()`, not this method. Details — `product-statuses.md` (an analogous case is described there).

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
  expandTimeIntervals,          // (schedule, { from, to }) → TimeIntervalPair[] — one schedule
  isTimeIntervalAttribute,      // (attr) → attr is ITimeIntervalAttributeValue — type-guard
} from 'oneentry';
```

- `expandAttributeTimeIntervals(attr, window)` — expands the **entire** `timeInterval` attribute of the entity (`page.attributeValues.interval` etc.): traverses groups and schedules, merges slots. Non-timeInterval attribute → `[]` (safe without type checking).
- `expandTimeIntervals(schedule, window)` — expands **one** schedule. Accepts both types: entity schedules (`attributeValues[marker].value[].values[]`) and **forms** (`attributes[].localizeInfos.intervals[]`, already typed — main case).
- `TimeIntervalPair = [startISO, endISO]` (UTC). The window `ITimeIntervalWindow = { from, to }`. Also exported are `ITimeIntervalAttributeValue`, `ITimeIntervalGroup`, `ITimeIntervalEntitySchedule`, `ITimeIntervalSchedule`, `IAttributeValue`.

> ⚠️ **Breaking (v1.0.156):** the computed field `timeIntervals` is no longer added to responses (materialized a year of slots and inflated the cache). Public `Module._addTimeIntervalsToSchedules` / `_addTimeIntervalsToFormSchedules` have also been removed. Migrate to `expandAttributeTimeIntervals` / `expandTimeIntervals` with the required window. The raw schedule (`dates`/`range`, `times`/`intervals`, `inEveryWeek`, `inEveryMonth`) has not changed. See `.claude/rules/attribute-values.md`, `/create-checkout`.
