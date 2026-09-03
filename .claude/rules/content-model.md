---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.js"
  - "scripts/**/*.ts"
---
# Designing Content Structure in OneEntry — What to Create

The rule about **choosing** an entity and attribute type when you create the structure in the OneEntry project (via script through the admin API or by suggesting to the user what to create in the admin panel). How to read what has already been created — `.claude/rules/attribute-values.md`; how to write through `/api/admin/*` — `.claude/rules/admin-api.md` and the skill `/admin-fill-content`.

> Don’t guess anything: before designing, check what already exists in the project through `/inspect-api`. Half of the "needed" entities are usually already created under a different marker.

---

## Three Questions That Solve Everything

1. **Separate entry or field of an existing one?** Has its own URL, appears in lists, is iterated by the content manager — Page, Product, or a collection string. Lives only within another entry — attribute.
2. **Who enters the data?** Editor → `attributeValues` (Page, Block, Product, Admin). Visitor → `formData` (FormData, Order, User). These are different formats and different modules; user input placed in attributes can only be created later through the admin API.
3. **How many such objects?** Units and heterogeneous — blocks. Dozens-hundreds of homogeneous ones that need to be filtered and paged through — Products (catalog; this says nothing about commerce, see below). Homogeneous strings without their own showcase (FAQ, cities, pickup points) — integration collection.

## Task → Solution Matrix

| Task | Solution |
| --- | --- |
| "About Us" page, article, landing | Page `common_page` + set of attributes |
| Catalog category | Page `catalog_page` — does not enter the general page tree, opens only by its URL |
| Main of sections | Page + blocks linked to this page |
| One banner or footer on multiple pages | Block — created once, linked to all necessary pages |
| Carousel | Block `slider_block` — slides are stored separately from the block itself |
| Manual product selection | Block `product_block` — products come directly in the block |
| "People also buy", "You viewed" | Recommendation blocks + enabled user activity tracking |
| Product | Product inside `catalog_page` |
| Many homogeneous entries without commerce: photos, articles, vacancies, objects, services | The same Product inside `catalog_page` — the catalog is universal, price fields are not filled |
| Product availability, catalog entry status | ProductStatus (marker + localization), **not** an attribute |
| Options for filters (colors, sizes) | `listTitles` of the `list`/`radioButton` attribute in the set |
| Menu | Menu (an item can be a page or a custom link) |
| Dictionary of UI labels for content managers | Set of type `system`, values in `initialValue` |
| FAQ, directory, price list, vacancies | IntegrationCollection (full CRUD available from the public SDK) |
| Feedback, application | Form of type `data` → FormData |
| Reviews with ratings | Form of type `rating` + link to the entity; aggregate comes in `entity.rating` |
| Comments with threads | FormData with `parentId` |
| Registration and profile | Form of type `sign_in_up` + AuthProvider: profile fields = form fields |
| Order processing | Form of type `order`, linked to the order storage |
| Cart, favorites | Server-side cart and user wishlist — no need to create entities, they work for guests too |
| Team, masters, doctors | Admins with a designated set of attributes |
| Working hours, appointment slots | Attribute `timeInterval` |
| Promotions, coupons, bonuses | Discounts (conditions are configured in the admin panel, not in code) |

The table only answers the question "what to create". How this is later read by the SDK method — `.claude/rules/sdk-modules.md`, ready output scenarios — `.claude/rules/scenarios.md` and `.claude/rules/pages-blocks.md`.

## Catalog — Registry of Homogeneous Entries, Not Just a Store

**`Product` — an entry in the catalog, not necessarily a product.** The name of the entity is historical; the module solves the task of "many homogeneous entries by one scheme that need to be filtered, sorted, and paged through". What constitutes an entry — photo, article, vacancy, real estate object, service, document, portfolio project — is defined by the designated set of attributes `forProducts`. Therefore, `Products.getProducts` in a non-commercial project is a perfectly normal call, while `catalog_page` works as a section, not as a store showcase.

Commercial fields are optional and do not appear by themselves:

- `price` is calculated only if there is a numeric attribute in the set with the flag `isPrice`; without it, it comes as `0`/`null` — and this is not an error;
- `sku` — only with an attribute with `isSku`;
- `statusIdentifier` — only if a status is assigned; markers are created for the subject area ("archive", "open", "completed"), not reduced to `in_stock`.

From this, it follows that rendering in the card. Display the price, cart, and availability status **based on actual filling**, not because the entry came from `Products`: `if (product.price)` instead of an unconditional price block, the "Add to Cart" button — only when the project actually sells. The module should be run through `/inspect-api products` before layout: it shows which fields are actually filled in this project.

The reverse error occurs more often: a hundred homogeneous entries are created as `common_page` pages "because they are not products". Filters by attribute markers (`IFilterParams[]`), statuses, pagination with `total`, and file import — all of this has to be written by traversing the page tree, hitting the default output limit of 30 entries.

Commerce (cart, `Orders`, `Payments`) — a separate layer above the catalog, connected where needed; an order, on the contrary, can exist without a catalog at all (`.claude/rules/orders.md`). Methods for reading the catalog — `.claude/rules/sdk-modules.md` and `.claude/rules/scenarios.md`, statuses — `.claude/rules/product-statuses.md`.

## Block or Page Attribute

**Block — a reusable entity.** It exists so that content can be displayed in several places while being edited in one: footer, persistent banner, contact block. Linking a block to a page can be done from either side: on the block — the **Linked pages** tab (page tree with checkboxes), on the page — the **Blocks** tab with the **Block selection** field. When a page is assembled from blocks, the **Blocks** tab is more convenient: the entire composition of the page is visible and organized in one list.

- content belongs to one page → **page attributes**;
- content is repeated on several pages and should change at once → **block**.

A banner created with fields for each page will have to be edited as many times as there are pages. Details on output — `.claude/rules/pages-blocks.md`.

## Attribute Sets

**A set is created for the type of entry, not for the entry itself.** Five homogeneous banners should share one set — otherwise, editing the structure turns into five edits.

The type of set is chosen at creation and limits its application: `forPages`, `forBlocks`, `forProducts`, `forForms`, `forUsers`, `system`. The `system` set is not tied to anything — it is a storage for settings and UI dictionaries.

⚠️ A set that already has entries is partially **locked** for editing ("Editing is not available as this attribute set is being used") — think through the composition of fields in advance. Value forms and `initialValue` — `.claude/rules/attribute-sets.md`.

## Choosing the Attribute Type

19 types. Below — what each is responsible for; value forms when reading — `.claude/rules/attribute-values.md`.

| Type | When to use |
| --- | --- |
| `string` | Short string: title, SKU, slogan, phone, link, HEX color |
| `text` | One block of formatted text: description, article, terms |
| `textWithHeader` | **Repeater** of pairs "header → text": FAQ, specifications, accordion, steps |
| `integer` | Whole number: remainder, capacity, year, priority |
| `float` / `real` | Decimal: price, weight, dimensions, percentages (`real` — higher precision) |
| `date` | Only date: publication, expiration date, event date |
| `dateTime` | Date and time: start of broadcast, end of promotion, deadline — everything from which a timer is counted |
| `time` | Only time, repeating day by day: "delivery from 9:00" |
| `image` | One image: cover, logo, background (widget is limited to one file) |
| `groupOfImages` | Gallery, photo album — always a collection; each file has Alt and Title filled by the editor |
| `file` | Document: PDF price list, instructions, certificate, presentation |
| `radioButton` | One option from the directory: tariff, type, layout option |
| `list` | Options from the directory; multiple — only if "Allow selection of multiple values" is enabled |
| `entity` | Link to other entries: related products, services of the master, author of the article |
| `timeInterval` | Schedule as a rule: appointment and delivery slots, working hours |
| `button` | Switch for one value |
| `spam` | Captcha in the form (changes the submission flow — the front must render the captcha) |
| `json` | Arbitrary structure for the developer; in union `AttributeType` SDK 1.0.164 this type is absent |

### Confusing Pairs

- **`date` / `dateTime` / `time`.** The `date` attribute — the value remains valid in any time zone ("published on March 3"). The `dateTime` attribute — this is a moment compared to "now". The `time` attribute — time repeats every day. If time always goes with a date, it is `dateTime`, not two attributes.
- **`text` / `textWithHeader`.** As soon as there are more than one homogeneous items — it’s a repeater. You cannot create `faq_q1`, `faq_a1`, `faq_q2`: the quantity is fixed by the scheme, the editor will not add an eleventh item, and the front parses numbered markers.
- **`image` / `groupOfImages`.** The meaning of one file (cover, logo) — `image`; a set that the editor fills — `groupOfImages` (consistently an array).
- **`string` / `list`.** The final set of values — always a directory: free text filtering breaks at the first typo by the editor, while options from `listTitles` also feed the filter panel on the showcase.
- **`timeInterval` / pair `dateTime`.** The pair "start/end" does not describe repeatability — the schedule will have to be duplicated every week.

### Flags That Change Behavior

`isPrice` — a numeric attribute becomes the source of `product.price` (price in `string` breaks sorting and filtering by price). `isProductPreview` — the image is marked as a preview for catalog cards, `isIcon` — as an icon. `multiselect` — multiple selection for `list`. `previewTemplateId` — preview template that brings all uploaded images to the same proportions. `isSku` / `isUniqueKey` — by them, catalog import matches rows with existing products. `captchaKind` — captcha provider for `spam`.

## Forms: Type Defines Scenario

`data` — arbitrary data collection; `sign_in_up` — registration, which also sets profile fields; `order` — order processing (linked to storage, the `timeInterval` field in it = delivery slots); `rating` — reviews with ratings; `collection` — entry in the integration collection.

Forms **are not manually laid out** — they are rendered according to the scheme obtained from the admin panel (traversing `attributes` of the form → component for each `type`), otherwise, a field added in the admin panel will not reach the site, and a required field will not be sent and will return a validation error. Details — `.claude/rules/forms.md`, recipe — `/create-form`.

### Field Checks — Validators, Not Form Code

Mandatory, length, format (email, regex), input mask, default value, and error text are set by **validators on the field itself in the admin panel** and come in `validators` along with the schema. When designing a form, decide these questions where you create the field: what is mandatory, what is the minimum and maximum length, which field is email, where a phone mask is needed, what error text the visitor will see (`customErrorText`).

For the front, the main takeaway is: a mandatory field is marked with **an asterisk next to the label**, and the sign is taken from `validators.requiredValidator`, not from the list of markers in the code. Then the mandatory requirement enabled in the admin panel appears on the site immediately, without editing the component.

| What is needed | How it is set |
| --- | --- |
| Mandatory field (asterisk on the front) | `requiredValidator` |
| Min./max./exact length | `stringInspectionValidator` |
| Email — specifically as email, not "string with `email` in the marker" | `emailInspectionValidator` |
| Phone, TIN, contract number | `fieldMaskValidator` (mask + prefix) or `regExpValidator` |
| Pre-filled value | `defaultValueValidator` |
| Trimming spaces at the edges | `trimValidator` |
| File size and extensions, image size | `checkingFilesValidator`, `sizeInPixelsValidator` |

⚠️ Validators **are localized**: in the schema of the set, they are laid out by locales, and rules in different languages diverge. A field that is mandatory only in one locale is almost always an oversight, not an intention. Value forms and reading traps — `.claude/rules/forms.md`, section "Field Validators", and `.claude/rules/attribute-sets.md`.

## Repeated Design Errors

1. **Free text instead of a directory** — color filter dies from the first typo.
2. **`date` where `dateTime` is needed** — the timer until the end of the promotion shows incorrect hours; the reverse forces the editor to choose a meaningless time.
3. **Pair `dateTime` instead of `timeInterval`** — repeatability of the schedule is lost.
4. **`image` instead of `groupOfImages` for a gallery** — the value form starts to depend on the number of files.
5. **Price in `string`** — no connection to `product.price`, sorting and filtering by price do not work.
6. **Numbered attributes instead of a repeater** — `faq_q1`, `faq_a1`, `faq_q2`… instead of one `textWithHeader`.
7. **Attribute `rating` instead of aggregate** — the final rating comes in `entity.rating`, an attribute with such a marker is usually a legacy and returns a hardcoded value.
8. **Separate set for each entry** — editing the structure multiplies by the number of entries.
9. **Persistent banner with page attributes** — blocks exist for this.
10. **Curly braces in the attribute value** — `{name}` inside a value breaks public reading of the entire entry (`500 invalid input syntax for type json`), while in the admin panel everything looks fine; write placeholders as `%name%` (see `.claude/rules/admin-api.md`).
11. **Field checks hardcoded in form code** — mandatory, length, and format live in field validators; the list of required markers in the component diverges from the admin panel the same day the content manager enables a new rule.
12. **Discrepancy with what is actually in the admin panel** — if the structure on the front and in the CMS has diverged, create an entry in the mismatch log: `.claude/rules/mismatch-log.md`.
13. **Markup comment instead of fields by meaning** — the entire entry in one `text` attribute with HTML. It renders, and at first glance, everything seems correct; the price comes later and all at once: cannot search by field, cannot build a filter, cannot verify translation by slots, and the editor gets a rich-text window instead of a form. Comment is only permissible **for continuous prose**; everything that has a form — documents by years, contacts, schedules, numbers, people, stages — has fields by meaning, and this is resolved at the model design stage, not when the client complains.
14. **Order of entries hardcoded in code** — "let this card be first" is a data edit, not a layout: order changes in the CMS and in all locales, sorting in the component does not appear. And related values (icons, logos, photos) are searched **by the title of the entry, not by its position**: binding by position looks workable only until the first rearrangement.
15. **Catalog rejected because "this is not a store"** — a hundred homogeneous entries created as pages, and filters, statuses, pagination, and import are written manually over the page tree. And the reverse: a non-commercial catalog card displays price and "Add to Cart" because the method is called `getProducts`.
16. **Second mechanism where an existing one works** — for example, a new field for a logo when the directory already has a pair "marker + file": the front distinguishes the file type itself. Each extra mechanism must be separately known by the editor.
