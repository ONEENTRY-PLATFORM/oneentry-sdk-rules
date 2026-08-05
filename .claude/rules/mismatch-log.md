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

`MISMATCH-LOG.md` in the root of the project is a **single abstract registry** of what needs to be synchronized between the front (Next.js application) and the back (OneEntry admin panel). The file lives alongside `CLAUDE.md` and helps **both the AI companion and the user** maintain a comprehensive overview:

- which entities (pages, forms, products, attributes, events, OAuth providers) still **need to be created in the admin panel** for the feature to work on the front;
- what questions the **user/client** needs to resolve (discrepancy between the layout and the technical specification, ambiguous behavior, choice of implementation);
- what technical discrepancies with the standard (layout, technical specification, documentation) have been **deferred** and are awaiting separate correction.

Without this file, agreements get lost in correspondence: the AI silently places a fallback mock, the user forgets to create a page in the admin panel, and two days later no one remembers what is left to do. MISMATCH-LOG turns “loose ends” into a checklist.

> The file is **optional**, but **recommended** for any OneEntry SDK project more complex than a single page. If a feature hinges on the absence of an entity in the admin panel, an ambiguous requirement, or someone else's layer of work — record it here, not just in chat.

---

## When to create MISMATCH-LOG.md

Create the file in the root of the project upon the first occurrence of any trigger:

- **Missing OneEntry entity** for feature implementation (page with the required `pageUrl`, form with the required `identifier`, attribute, OAuth provider, event for `generateCode`, order status, payment method, etc.).
- **User provided contradictory or incomplete requirements** — the layout says one thing, the technical specification another, and the code is simpler in a third way.
- **User delegated part of the work** to another party (admin panel, designer, backend team), and without this part, the front does not align.

If none of this applies — the file is not needed.

---

## What NOT to include in MISMATCH-LOG

To prevent the file from becoming a dump, **do not** write there:

- Steps of the current task that the AI will complete in one turn — this is TodoWrite / a plan, not MISMATCH-LOG.
- Personal reminders like “fix imports later” — use a `// TODO` comment in the code or a separate ticket.
- Bugs not related to OneEntry entities and not deferred for the user — a regular ticket in PM.
- Code debt cleanup (`any` casts, arbitrary `[Npx]`, unused imports) — this is a separate mass PR with ESLint/grep, not a mismatch log.

Only what **requires action outside the current code** goes into MISMATCH-LOG: a correction in the admin panel, a response from the user/client, deferred agreement with the standard.

---

## File structure

The minimum template that the AI automatically creates upon the first mismatch. Subsections and examples are added as topics arise, empty ones are removed.

```markdown
# MISMATCH-LOG — discrepancies and gaps

A single log of what needs to be synchronized between the front and OneEntry admin.
Filled out by the AI companion and the user as work progresses. Rules — see `.claude/rules/mismatch-log.md`.

---

## Severity (for section B)

- **P0** — feature is broken (missing block, button not working, form not submitting).
- **P1** — noticeable visual/behavioral discrepancy, but the feature works.
- **P2** — minor issues (margins, tokens, hover effects).
- **P3** — code hygiene (commented-out code, inline SVG, duplicates).

Section C goes **without P-label** — these are tasks on the admin panel side, status: `open` or `✅`.

---

## Summary

| Section | Open | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| B. Manual verification (if there is a standard) | 0 | 0 | 0 | 0 | 0 |
| C. OneEntry Admin Setup | 0 | — | — | — | — |
| D. Conscious deviations from rules | 0 | — | — | — | — |

---

## Section B. Manual verification against the standard (optional)

Apply only if there is a standard: HTML layout in `static-html/`, Figma layout, screenshots, technical specification document. If there is no standard — this section is not needed, delete it.

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

Add subsections within C as topics arise — delete empty ones.

---

## Section D. Conscious deviations from rules

Sections B and C are about discrepancies with the layout and the admin panel. Real projects deviate from the **OneEntry rules** as well, and such decisions need to be recorded here — otherwise, the next agent will read the rule, see a “violation,” and come to “fix” it, breaking a conscious decision.

Format of the item: **deviation + rule from which deviated + reason + date**. Without a reason, the entry is useless: it reads as “this is just not according to the rules.”

```markdown
## Section D. Conscious deviations from rules

### D.1. `images.unoptimized: true` globally
- **Rule:** `performance-images.md` — `unoptimized` only for SVG and animated GIFs.
- **Reason:** `/_next/image` on this deployment dropped ~15% of concurrent requests
  (ERR_ABORTED in the browser); OE CDN delivers previews of acceptable weight. Diagnosis confirmed
  in Network: drops are specifically on the proxy, not on the CDN.
- **Date:** 2026-08-05. **Review:** upon changing hosting.

### D.2. Customer session in `localStorage`, not in httpOnly-cookie
- **Rule:** general security practice; `security.md` explains the compromise.
- **Reason:** refresh token is tied to `x-device-metadata` of the browser — server-side
  storage breaks rotation (`tokens.md`). Compensated by CSP + sanitizer for CMS-HTML.
- **Date:** 2026-08-05. **Review:** if the API removes the binding to fingerprint.
```

What we **do not** write here: one-off hacks without a reason, TODOs in the code (they belong in the task tracker), and anything that is actually an error — a deviation should be a decision, not an excuse.

Review section D when updating MCP rules: some deviations are closed by changing the rule.

---

## Formatting rules for items

### Identifier format

`{Section}.{subsection}.{n}` — for example `C.1.3`, `B.2.4`. The identifier is assigned when the item is created and **is not reused** even if the item is deleted (to allow referencing from commits and PRs). Add the creation date to the identifier in the format `YYYY-MM-DD` — this is needed for mechanical tracking of stuck items (see “When to read and review”):

```markdown
**C.1.3** (2026-05-13) — Create form `contact_us` ...
```

### Fields of attributes/forms — only in a table

When it is necessary to list the fields of an entity (form, attribute set, product type, order form) — **only a markdown table** with mandatory columns `marker | type | title`. If necessary — `required`, `default`, `notes`, `isLogin`, `isPassword`, `isNotification*`, `isSignUpRequired`.

```markdown
| marker     | type    | title       | required | notes              |
|------------|---------|-------------|----------|--------------------|
| `email`    | email   | Your email  | true     | isLogin            |
| `password` | string  | Password    | true     | isPassword         |
```

Text like “fields name, email, message are needed” — is not allowed. The table is read by machine vision and edited in one pass — this is important for the user's speed in the admin panel.

`type` — the actual type in OneEntry (`string`, `text`, `email`, `password`, `integer`, `float`, `date`, `dateTime`, `time`, `list`, `radioButton`, `entity`, `image`, `groupOfImages`, `file`, `timeInterval`, `spam`, `button`). See `.claude/rules/forms.md`.

### Actionable formulations

```markdown
✅ Create a page in Pages with `pageUrl: "menu"`, type `Category`, locales `ru_RU` / `en_US`, parent `root`.
❌ Add a menu.

✅ In Forms, add the flag `isNotificationPhoneSMS: true` to the `phone` field of the `reg` form — otherwise, SMS notifications about the order will not be sent.
❌ Something with the phone in registration.

✅ Create Event `user_registration` to send the activation code after signUp. Use the marker in `generateCode(method, email, 'user_registration')`.
❌ Set up events.
```

Principle: the item should be executable by the user in the admin panel without returning to the AI for clarifications.

### Links to code and standard

Attach to each item:

- **The front file** where the entity is used (or will be used) — `[components/AuthForm.tsx](components/AuthForm.tsx)`.
- If there is a **standard** — a link to Figma / static-html / technical specification.
- If there is temporarily a **fallback/mock** — indicate “temporarily: mock in `mockX.ts`” to show that the replacement is trivial.

### Questions for the user/client — next to the item

If during work a question arises that needs to be resolved by the **user or client** (discrepancy between the layout and the technical specification, ambiguous behavior, choice of implementation) — record it in **the same item** with the prefix:

```markdown
> ❓ **Clarify with the user:** in the layout, the “Order” button leads to `/checkout`, in the technical specification — opens a popup. Currently in the code — a popup (`CheckoutPopup.tsx`). Which option should be kept?
```

Do not keep such questions only in chat — they get lost. After the answer — update the item and mark it `✅` or delete it.

### Item states

Three states, with no intermediates:

- **open** — by default, requires action.
- **✅** — closed (the user did it in the admin panel / answered the question / discrepancy accepted). The AI checks via MCP / `/inspect-api` if it concerns a OneEntry entity.
- **deleted** — in the next PR after `✅`. Between `✅` and deletion, there should be one PR — the user has time to see the closure as a visual signal of progress.

Severity (P0…P3) — only for section B. Section C uses only `open` / `✅`.

If it is decided **not to do** the item — mark it `~~strike~~` + explanation (`~~C.2.3~~ — feature canceled, see PR #123`), delete in the next PR. No silent deletions.

---

## When to update MISMATCH-LOG.md

The AI companion updates the file proactively — without an explicit request from the user, in these cases:

1. **When writing code, the absence of a OneEntry entity is discovered.** A fallback/mock/TODO is placed in the code + an item is added to section C.
2. **The user provided an ambiguous requirement.** A temporary solution is accepted in the code + an item with `> ❓ Clarify with the user:` is added next to the relevant task.
3. **A discrepancy with the standard is found** (if there is a standard), which is not fixed right now — an item in section B.
4. **The user reported** that they closed item C.x in the admin panel → the AI checks via MCP / `/inspect-api` and marks it `✅`, or asks for clarification.

---

## When to read and review MISMATCH-LOG

To prevent the file from becoming a repository of one-off entries, the AI **opens it** in these situations:

- **At the beginning of work on a feature** — to check if there is an item `B.x` / `C.x` hanging on this topic. Otherwise, it may suggest redoing something that is already deferred or waiting for the user.
- **Before committing** — to go through the checklist at the end of the rules (see below).
- **Once every N weeks** (or when the user asks to “clean up MISMATCH-LOG”) — to go through the items by creation date:
  - item without movement > 4 weeks and outdated → `~~strike~~` + delete in the next PR;
  - item for which the user accepted “not doing” → `wontfix` + close.

The creation date in the identifier (`C.1.3 (2026-05-13)`) makes stale-checking mechanical: `grep` by dates older than N weeks.

---

## Connection with other rules

- **Always** before using a new marker (forms, pages, events, attributes, OAuth providers) — `/inspect-api` to check for actual existence in OneEntry. If it is not in the admin panel — add it to section C, place a fallback in the code. See skill `/inspect-api`.
- **Do not guess markers** — especially `eventIdentifier` for `generateCode`/`checkCode`/`changePassword`. See `.claude/rules/auth-provider.md` (section “eventIdentifier”).
- **Storage of orders 2+** — must show the user the choice in the UI. See `.claude/rules/orders.md`.
- **Graceful fallback** on `IError "Resource is closed"` and empty collections — a mandatory pattern when accessing resources not closed by the admin panel. See CLAUDE.md, section “Error Handling,” and `.claude/rules/error-handling.md`.

---

## Anti-patterns

- ❌ **Dump everything in chat.** “Oh, this page still needs to be created in the admin panel” will disappear in a message after 50 turns. Only MISMATCH-LOG.
- ❌ **Create the file “in advance.”** If there is not a single mismatch — the file should not exist. Noise.
- ❌ **“TODO: hook up data later” in code instead of item C.x.** TODO in code is acceptable, but **only in conjunction** with an item in MISMATCH-LOG that describes what exactly needs to be created in the admin panel and what temporarily stands as a fallback.
- ❌ **Textual description of form fields.** “Need email, name, phone” — is not allowed. Only a table with `marker | type | title`.
- ❌ **Silently delete closed items.** Closed → `✅` in one PR, deleted — in the next.
- ❌ **Store questions for the user anywhere.** Only prefix `> ❓ Clarify with the user:` inside the relevant item.
- ❌ **Use MISMATCH-LOG as a todo-list for the current task.** Steps that the AI will complete in one turn go into TodoWrite / a plan, not into the mismatch log.
- ❌ **Create an item without a date.** Without `(YYYY-MM-DD)` it is impossible to catch stuck items during the next cleanup.

---

## Quick check before commit

- [ ] All new markers (forms, events, attributes) used in the code are either confirmed via `/inspect-api` or reflected in item C.x with a fallback.
- [ ] All TODOs in the new code reference a specific item in MISMATCH-LOG (`// see MISMATCH-LOG.md C.1.3`).
- [ ] Closed items in the admin panel are marked `✅` (or deleted via PR).
- [ ] Questions for the user are formatted with the prefix `> ❓ Clarify with the user:` inside the item.
- [ ] Each new item has a date `(YYYY-MM-DD)`.

> These checks are a candidate for a pre-commit hook: `grep` on `getFormByMarker\('...'\)` / `generateCode\(.*,\s*'...'\)` without recording in C, `grep` on `TODO` without reference to `MISMATCH-LOG.md [BC]\.\d`. If manual verification is tedious — set up a hook in `.git/hooks/pre-commit` or via `husky`.
