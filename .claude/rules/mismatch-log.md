<!-- META
type: rules
fileName: mismatch-log.md
rulePaths: ["MISMATCH-LOG.md","app/**/*.{ts,tsx}","components/**/*.{ts,tsx}"]
paths:
  - "MISMATCH-LOG.md"
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
-->

# MISMATCH-LOG.md — log of discrepancies between front ↔ OneEntry admin

`MISMATCH-LOG.md` in the root of the project is a **single abstract registry** of what needs to be synchronized between the front (Next.js application) and the back (OneEntry admin panel). The file lives alongside `CLAUDE.md` and helps **both the AI companion and the user** maintain a clear picture:

- which entities (pages, forms, products, attributes, events, OAuth providers) still **need to be created in the admin panel** for the feature to work on the front;
- which questions the **user/client** needs to resolve (discrepancy between the layout and the specifications, ambiguous behavior, choice of implementation);
- which technical discrepancies with the standard (layout, specifications) have been **deferred** and are waiting for separate correction.

Without this file, agreements get lost in correspondence: the AI silently places a fallback mock, the user forgets to create a page in the admin panel, and two days later no one remembers what is left to do. MISMATCH-LOG turns “loose ends” into a checklist.

> The file is **optional**, but **recommended** for any project on OneEntry SDK that is more complex than a single page. If a feature is hindered by the absence of an entity in the admin panel, an ambiguous requirement, or someone else's layer of work — record it here, not just in the chat.

---

## When to create MISMATCH-LOG.md

Create the file in the root of the project at the first occurrence of any trigger:

- **Missing OneEntry entity** for feature implementation (page with the required `pageUrl`, form with the required `identifier`, attribute, OAuth provider, event for `generateCode`, order status, payment method, etc.).
- **User provided contradictory or incomplete requirements** — the layout says one thing, the specifications say another, the code suggests a simpler third option.
- **User delegated part of the work** to another party (admin panel, designer, backend team), and without this part, the front does not align.

If none of this applies — the file is not needed.

---

## What NOT to include in MISMATCH-LOG

To prevent the file from turning into a dump, **do not** record the following:

- Steps of the current task that the AI will complete in one turn — this is TodoWrite / a plan, not MISMATCH-LOG.
- Personal reminders like “later tidy up imports” — a `// TODO` comment in the code or a separate ticket.
- Bugs not related to OneEntry entities and not deferred for the user — a regular ticket in PM.
- Cleaning up code debt (`any` casts, arbitrary `[Npx]`, unused imports) — this is a separate mass PR with ESLint/grep, not a mismatch log.

Only what **requires action beyond the current code** goes into MISMATCH-LOG: correction in the admin panel, response from the user/client, deferred agreement with the standard.

---

## File structure

The minimal template that the AI automatically creates at the first mismatch. Subsections and examples are added as topics arise, empty ones are removed.

```markdown
# MISMATCH-LOG — discrepancies and gaps

A single log of what needs to be synchronized between the front and OneEntry admin.
Filled out by the AI companion and the user during work. Rules — see `rules/mismatch-log.md`.

---

## Severity (for section B)

- **P0** — feature is broken (missing block, button not working, form not submitting).
- **P1** — noticeable visual/behavioral discrepancy, but the feature works.
- **P2** — minor issues (margins, tokens, hover effects).
- **P3** — code hygiene (commented out, inline SVG, duplicates).

Section C goes **without P-mark** — these are tasks on the admin side, status: `open` or `✅`.

---

## Summary

| Section | Open | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| B. Manual verification (if there is a standard) | 0 | 0 | 0 | 0 | 0 |
| C. OneEntry Admin Setup | 0 | — | — | — | — |

---

## Section B. Manual verification against the standard (optional)

Apply **only if there is a standard**: HTML layout in `static-html/`, Figma layout, screenshots, specifications document. If there is no standard — the section is not needed, delete it.

Items like `B.{section}.{n}` with a link to the front file and the standard.

---

## Section C. OneEntry Admin Setup

Gaps in OneEntry data — what needs to be created or corrected in the admin panel. Formulate **actionable** (see formatting rules).

### C.1. Forms
### C.2. Pages
### C.3. Products / Categories
### C.4. Attributes / AttributesSets (including `static_content` dictionary)
### C.5. Auth providers (email, OAuth)
### C.6. Events (markers for `generateCode`, subscriptions)
### C.7. Orders (storage, payment accounts, statuses)
### C.8. Other
```

Add subsections within C as topics arise — remove empty ones.

---

## Formatting rules for items

### Identifier format

`{Section}.{subsection}.{n}` — for example `C.1.3`, `B.2.4`. The identifier is assigned upon creating the item and **is not reused** even if the item is deleted (to allow referencing from commits and PRs). Add the creation date to the identifier in the format `YYYY-MM-DD` — this is needed for mechanically catching stuck items (see “When to read and review”):

```markdown
**C.1.3** (2026-05-13) — Create form `contact_us` ...
```

### Fields of attributes/forms — only in a table

When you need to list the fields of an entity (form, attribute set, product type, order form) — **only markdown table** with mandatory columns `marker | type | title`. If necessary — `required`, `default`, `notes`, `isLogin`, `isPassword`, `isNotification*`, `isSignUpRequired`.

```markdown
| marker     | type    | title       | required | notes              |
|------------|---------|-------------|----------|--------------------|
| `email`    | email   | Your email  | true     | isLogin            |
| `password` | string  | Password    | true     | isPassword         |
```

Text like “fields name, email, message are needed” — is not allowed. The table is machine-readable and can be edited in one go — this is important for the user's speed in the admin panel.

`type` — the actual type in OneEntry (`string`, `text`, `email`, `password`, `integer`, `float`, `date`, `dateTime`, `time`, `list`, `radioButton`, `entity`, `image`, `groupOfImages`, `file`, `timeInterval`, `spam`, `button`). See `rules/forms.md`.

### Actionable formulations

```markdown
✅ Create a page in Pages with `pageUrl: "menu"`, type `Category`, locales `ru_RU` / `en_US`, parent `root`.
❌ Add a menu.

✅ In Forms add the flag `isNotificationPhoneSMS: true` to the `phone` field of the `reg` form — otherwise, SMS notifications about the order will not be sent.
❌ Something with the phone in registration.

✅ Create Event `user_registration` to send the activation code after signUp. Use the marker in `generateCode(method, email, 'user_registration')`.
❌ Set up events.
```

Principle: the item should be executable by the user in the admin panel without returning to the AI for clarifications.

### Links to code and standard

Attach to each item:

- **Front file** where the entity is used (or will be used) — `[components/AuthForm.tsx](components/AuthForm.tsx)`.
- If there is a **standard** — a link to Figma / static-html / specifications.
- If there is a temporary **fallback/mock** — indicate “temporarily: mock in `mockX.ts`”, so it is clear that the replacement is trivial.

### Questions for the user/client — next to the item

If during the work a question arises that needs to be resolved by the **user or client** (discrepancy between the layout and the specifications, ambiguous behavior, choice of implementation) — fix it in **the same item** with a prefix:

```markdown
> ❓ **Clarify with the user:** in the layout, the "Order" button leads to `/checkout`, in the specifications — opens a popup. Currently in the code — a popup (`CheckoutPopup.tsx`). Which option should be kept?
```

Do not keep such questions only in the chat — they get lost. After receiving an answer — update the item and mark it `✅` or delete it.

### Item states

Three states, without intermediates:

- **open** — by default, requires action.
- **✅** — closed (the user completed it in the admin panel / answered the question / discrepancy accepted). The AI checks via MCP / `/inspect-api` if it concerns a OneEntry entity.
- **deleted** — in the next PR after `✅`. Between `✅` and deletion, there should be one PR — the user has time to see the closure as a visual signal of progress.

Severity (P0…P3) — only for section B. Section C uses only `open` / `✅`.

If it is decided **not to do** the item — mark it `~~strike~~` + explanation (`~~C.2.3~~ — feature canceled, see PR #123`), delete it in the next PR. No silent deletions.

---

## When to update MISMATCH-LOG.md

The AI companion updates the file proactively — without an explicit request from the user, in these cases:

1. **While writing code, the absence of a OneEntry entity is discovered.** A fallback/mock/TODO is placed in the code + an item is added to section C.
2. **The user provided an ambiguous requirement.** A temporary solution is accepted in the code + an item is added with `> ❓ Clarify with the user:` next to the relevant task.
3. **A discrepancy with the standard is found** (if there is a standard), which is not fixed right now — an item in section B.
4. **The user reported** that they closed item C.x in the admin panel → the AI checks via MCP / `/inspect-api` and marks `✅`, or asks for clarification.

---

## When to read and review MISMATCH-LOG

To prevent the file from turning into a repository of one-off entries, the AI **opens it** in these situations:

- **At the beginning of work on a feature** — check if there is an item `B.x` / `C.x` hanging on this topic. Otherwise, you might propose something that is already deferred or waiting for the user.
- **Before committing** — go through the checklist at the end of the rules (see below).
- **Once every N weeks** (or when the user asks to “clean up MISMATCH-LOG”) — go through the items by creation date:
  - item without movement > 4 weeks and outdated → `~~strike~~` + delete in the next PR;
  - item for which the user accepted “not doing” → `wontfix` + close.

The creation date in the identifier (`C.1.3 (2026-05-13)`) makes the stale check mechanical: `grep` by dates older than N weeks.

---

## Connection with other rules

- **Always** before using a new marker (forms, pages, events, attributes, OAuth providers) — `/inspect-api` to check for actual existence in OneEntry. If it is not in the admin panel — add it to section C, place a fallback in the code. See skill [`inspect-api`](../skills/inspect-api/SKILL.md).
- **Do not guess markers** — especially `eventIdentifier` for `generateCode`/`checkCode`/`changePassword`. See [`rules/auth-provider.md`](auth-provider.md) (section “eventIdentifier”).
- **Storage of orders 2+** — must show the user the choice in the UI. See [`rules/orders.md`](orders.md).
- **Graceful fallback** on `IError "Resource is closed"` and empty collections — a mandatory pattern when accessing resources not closed by the admin panel. See [`pages/04-error-handling.md`](../pages/04-error-handling.md).

---

## Anti-patterns

- ❌ **Dump everything in the chat.** “Oh, this page still needs to be created in the admin panel” will disappear through 50 turns in the message. Only MISMATCH-LOG.
- ❌ **Create the file “in advance.”** If there is not a single mismatch — the file should not exist. Noise.
- ❌ **“TODO: hook up data later” in code instead of item C.x.** TODO in code is acceptable, but **only in conjunction** with an item in MISMATCH-LOG, where it is described what exactly needs to be created in the admin panel and what temporarily stands as a fallback.
- ❌ **Text description of form fields.** “Need email, name, phone” — is not allowed. Only a table with `marker | type | title`.
- ❌ **Silently delete closed items.** Closed → `✅` in one PR, deleted — in the next.
- ❌ **Store questions for the user anywhere.** Only prefix `> ❓ Clarify with the user:` inside the relevant item.
- ❌ **Use MISMATCH-LOG as a todo-list for the current task.** Steps that the AI will complete in one turn go into TodoWrite / plan, not into the mismatch log.
- ❌ **Create an item without a date.** Without `(YYYY-MM-DD)` it is impossible to catch stuck items during the next cleanup.

---

## Quick check before committing

- [ ] All new markers (forms, events, attributes) used in the code are either confirmed through `/inspect-api`, or reflected in item C.x with a fallback.
- [ ] All TODOs in the new code reference a specific item in MISMATCH-LOG (`// see MISMATCH-LOG.md C.1.3`).
- [ ] Closed items in the admin panel are marked `✅` (or deleted via PR).
- [ ] Questions for the user are formatted with the prefix `> ❓ Clarify with the user:` inside the item.
- [ ] Each new item has a date `(YYYY-MM-DD)`.

> These checks are a candidate for a pre-commit hook: `grep` on `getFormByMarker\('...'\)` / `generateCode\(.*,\s*'...'\)` without recording in C, `grep` on `TODO` without a reference to `MISMATCH-LOG.md [BC]\.\d`. If manual verification is tedious — set up a hook in `.git/hooks/pre-commit` or through `husky`.
