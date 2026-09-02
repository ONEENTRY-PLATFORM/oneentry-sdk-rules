---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.js"
  - "scripts/**/*.ts"
---
# Designing Content Structure in OneEntry — What to Create and How

The rule about **choosing** an entity and attribute type when you create the structure in the OneEntry project (via script through admin API or by advising the user on what to create in the admin panel). How to read what has already been created — `.claude/rules/attribute-values.md`; how to write through `/api/admin/*` — `.claude/rules/admin-api.md` and skill `/admin-fill-content`.

> Don’t guess anything: before designing, check what already exists in the project through `/inspect-api`. Half of the "needed" entities are usually already created under a different marker.

---

## Three Questions That Solve Everything

1. **Separate entry or field of an existing one?** Has its own URL, appears in lists, is iterated by the content manager — Page, Product, or collection string. Lives only within another entry — attribute.
2. **Who enters the data?** Editor → `attributeValues` (Page, Block, Product, Admin). Visitor → `formData` (FormData, Order, User). These are different formats and different modules; user input placed in attributes can only be created later through admin API.
3. **How many such objects?** Units and heterogeneous — blocks. Dozens-hundreds of similar ones — products or pages. Similar strings without their own showcase (FAQ, cities, vacancies) — integration collection.

## Task → Solution Matrix

| Task | Solution |
| --- | --- |
| "About Us" page, article, landing | Page `common_page` + set of attributes |
| Catalog category | Page `catalog_page` (does not appear in `getRootPages`/`getPages` — only in `getPageByUrl`) |
| Main of sections | Page + set of blocks, output `getBlocksByPageUrl` |
| One banner or footer on several pages | Block — created once, linked to all necessary pages |
| Carousel | Block `slider_block` + `Blocks.getSlides` |
| Manual selection of products | Block `product_block` — products come directly in the block |
| "People also buy", "You viewed" | Recommendation blocks + tracking `UserActivity` |
| Product | Product inside `catalog_page` |
| Product availability | ProductStatus (marker + localization), **not** an attribute |
| Options for filters (colors, sizes) | `listTitles` of attribute `list`/`radioButton` in the set |
| Menu | Menu (an item can be a page and a custom link) |
| Dictionary of UI labels for the content manager | Set of type `system`, values in `initialValue` |
| FAQ, directory, price list, vacancies | IntegrationCollection (full CRUD available from the public SDK) |
| Feedback, application | Form of type `data` → FormData |
| Reviews with ratings | Form of type `rating` + binding to entity; aggregate comes in `entity.rating` |
| Comments with threads | FormData with `parentId` |
| Registration and profile | Form of type `sign_in_up` + AuthProvider: profile fields = form fields |
| Order processing | Form of type `order`, linked to the order storage |
| Cart, favorites | `Users.getCart` / `getWishlist` — server-side, work for guests too |
| Team, masters, doctors | Admins with a designated set of attributes |
| Working hours, appointment slots | Attribute `timeInterval` |
| Promotions, coupons, bonuses | Discounts (conditions are set in the admin panel, not in the code) |

## Block or Page Attribute

**Block — a reusable entity.** It exists so that content can be displayed in multiple places while being edited in one: footer, persistent banner, contact block. In the admin panel, the block is linked to pages through the **Linked pages** tab (tree of pages with checkboxes).

- content belongs to one page → **page attributes**;
- content is repeated on several pages and should change at once → **block**.

A banner created with fields for each page will have to be edited as many times as there are pages. Details of output — `.claude/rules/pages-blocks.md`.

## Sets of Attributes

**A set is created for the type of entry, not for the entry itself.** Five similar banners should share one set — otherwise, editing the structure turns into five edits.

The type of set is chosen at creation and limits application: `forPages`, `forBlocks`, `forProducts`, `forForms`, `forUsers`, `system`. The `system` set is not linked to anything — it is a storage for settings and UI dictionaries.

⚠️ A set that already has entries is partially **locked** for editing ("Editing is not available as this attribute set is being used") — think through the composition of fields in advance. Value forms and `initialValue` — `.claude/rules/attribute-sets.md`.

## Choosing Attribute Type

19 types. Below — what each one is responsible for; value forms when reading — `.claude/rules/attribute-values.md`.

| Type | When to use |
| --- | --- |
| `string` | Short string: title, SKU, slogan, phone, link, HEX color |
| `text` | One block of formatted text: description, article, terms |
| `textWithHeader` | **Repeater** of pairs "header → text": FAQ, characteristics, accordion, steps |
| `integer` | Whole number: stock, capacity, year, priority |
| `float` / `real` | Decimal: price, weight, dimensions, percentages (`real` — higher precision) |
| `date` | Only date: publication, expiration date, event date |
| `dateTime` | Date and time: start of broadcast, end of promotion, deadline — everything from which a timer is counted |
| `time` | Only time, repeating day by day: "delivery from 9:00" |
| `image` | One image: cover, logo, background (widget limited to one file) |
| `groupOfImages` | Gallery, photo album — always a collection; each file has Alt and Title filled by the editor |
| `file` | Document: PDF price list, instructions, certificate, presentation |
| `radioButton` | One option from the directory: rate, type, layout option |
| `list` | Options from the directory; multiple — only if "Allow selection of multiple values" is enabled |
| `entity` | Link to other entries: related products, services of the master, author of the article |
| `timeInterval` | Schedule as a rule: appointment and delivery slots, working hours |
| `button` | Switch for one value |
| `spam` | Captcha in the form (changes the flow of submission — the front must render the captcha) |
| `json` | Arbitrary structure for the developer; in union `AttributeType` SDK 1.0.164 this type is absent |

### Confusing Pairs

- **`date` / `dateTime` / `time`.** The `date` attribute — the value remains valid in any time zone ("published March 3"). The `dateTime` attribute — this is a moment compared to "now". The `time` attribute — time repeats every day. If time always goes with a date, it is `dateTime`, not two attributes.
- **`text` / `textWithHeader`.** As soon as there is more than one homogeneous item — a repeater. You cannot create `faq_q1`, `faq_a1`, `faq_q2`: the quantity is fixed by the schema, the editor will not add an eleventh item, and the front parses numbered markers.
- **`image` / `groupOfImages`.** The meaning of one file (cover, logo) — `image`; a set that the editor fills — `groupOfImages` (consistently an array).
- **`string` / `list`.** The final set of values — always a directory: free text filtering breaks from the first typo by the editor, while options from `listTitles` also feed the filter panel on the showcase.
- **`timeInterval` / pair `dateTime`.** The pair "start/end" does not describe repeatability — the schedule will have to be duplicated every week.

### Flags That Change Behavior

`isPrice` — numeric attribute becomes the source of `product.price` (price in `string` breaks sorting and filtering by price). `isProductPreview` — the image is marked as a preview for catalog cards, `isIcon` — as an icon. `multiselect` — multiple selection in `list`. `previewTemplateId` — preview template that brings all uploaded images to the same proportions. `isSku` / `isUniqueKey` — by them, catalog import matches rows with existing products. `captchaKind` — captcha provider in `spam`.

## Forms: Type Defines the Scenario

`data` — arbitrary data collection; `sign_in_up` — registration, which also sets profile fields; `order` — order processing (linked to storage, `timeInterval` field in it = delivery slots); `rating` — reviews with ratings; `collection` — entry in the integration collection.

Forms **are not manually coded** — they are rendered according to the schema (`getFormByMarker` → traversing `attributes` → component for each `type`), otherwise, a field added in the admin panel will not reach the site, and a required one will not be sent and will return a validation error. Details — `.claude/rules/forms.md`, recipe — `/create-form`.

## Repeated Design Errors

1. **Free text instead of a directory** — color filter dies from the first typo.
2. **`date` where `dateTime` is needed** — the timer until the end of the promotion shows incorrect hours; the opposite forces the editor to choose a meaningless time.
3. **Pair `dateTime` instead of `timeInterval`** — repeatability of the schedule is lost.
4. **`image` instead of `groupOfImages` for a gallery** — the value form starts to depend on the number of files.
5. **Price in `string`** — no connection to `product.price`, sorting and filtering by price do not work.
6. **Numbered attributes instead of a repeater** — `faq_q1`, `faq_a1`, `faq_q2`… instead of one `textWithHeader`.
7. **Attribute `rating` instead of aggregate** — the final rating comes in `entity.rating`, an attribute with such a marker is usually a legacy and returns a hardcoded value.
8. **Separate set for each entry** — editing the structure multiplies by the number of entries.
9. **Persistent banner as page attributes** — blocks exist for this.
10. **Curly braces in attribute value** — `{name}` inside a value breaks public reading of the entire entry (`500 invalid input syntax for type json`), while everything looks fine in the admin panel; write placeholders as `%name%` (see `.claude/rules/admin-api.md`).
11. **Discrepancy with what is actually in the admin panel** — if the structure on the front and in the CMS diverges, create an entry in the discrepancy log: `.claude/rules/mismatch-log.md`.
