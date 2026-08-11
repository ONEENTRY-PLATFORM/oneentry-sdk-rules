---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# JSDoc — function formatting rules

> **Optional rule.** Connect in `CLAUDE.md` of the project if a strict JSDoc standard is adopted. Otherwise, the default "minimum comments" from `CLAUDE.md` applies.

Each **declared function** in the project — React component, custom hook, utility, server action, handler, exported or not — must be accompanied by a JSDoc block above the declaration.

**This rule overrides** the default "no comments": for projects with this rule, JSDoc is part of the function contract, not a "just in case" comment.

---

## Language — English

All JSDoc comments and inline comments in the code must be in English.

---

## Block structure

1. **First line** — short description through em-dash: `Name — what it does.`
2. Empty line.
3. (optional) **Extended context** — why this way, nuances of behavior. Then another empty line.
4. **`@param   {Type}   name           - Description.`** for each argument.
5. For destructured props — **chain notation**: first the object `props` (type `{object}` or named type), then each field `props.fieldName` with its own type.
6. **`@returns Description.`** — always when there is a return value, **WITHOUT type in curly braces** (the type is already in the TS signature).

---

## Types — must duplicate with TS signature

All `@param` must have a type in curly braces — **even if this type is already in the TypeScript signature**. This is a conscious duplication: it helps read the code in IDE tooltips, in hover previews, and in diffs without switching to the signature.

`@returns` is written **without** a type — the description goes immediately after the tag with one space.

---

## Column alignment

Columns `{Type}`, `name`, `- Description` for `@param` — align with spaces vertically within one JSDoc block, so that it reads like a table.

If types are of significantly different lengths — a single space is allowed; the main thing is that the style is consistent within one block.

---

## React component with destructured props

```tsx
/**
 * CardAnimations — wraps a product card in a reveal animation that fires when it enters the viewport.
 *
 * @param   {object}    props               - Component props.
 * @param   {ReactNode} props.children      - Card content.
 * @param   {string}    props.className     - Class merged onto the wrapping `<div>`.
 * @param   {number}    props.index         - Absolute card index across all pages; drives the stagger.
 * @param   {number}    props.productsLimit - Page size; resets the stagger on a new page.
 * @returns JSX wrapper with the bound GSAP reveal animation.
 */
const CardAnimations = ({ children, className, index, productsLimit }: Props): JSX.Element => { ... }
```

---

## Async server fetcher

```tsx
/**
 * fetchDictionary — loads the `static_content` attribute set and normalizes it into
 * `Record<marker, IAttributeValue>`, so that `dict?.MARKER?.value` returns a string.
 *
 * @returns Promise resolving to a map of markers → attribute with a string `value`.
 */
const fetchDictionary = async (): Promise<IAttributeValues> => { ... }
```

---

## Utility with primitive arguments

```tsx
/**
 * t — server-side counterpart of `useT()`: reads a string from the dictionary by marker.
 *
 * @param   {string}          marker   - Dictionary marker (attribute name).
 * @param   {string}          fallback - Returned when the marker is missing.
 * @returns Promise resolving to the dictionary string, or the fallback.
 */
export const t = async (marker: string, fallback: string): Promise<string> => { ... }
```

---

## Server Action (`'use server'`)

```ts
/**
 * logInUser — user sign-in via the AuthProvider API.
 *
 * Despite living under `src/app/api/server/...`, this file is NOT `'use server'` — it runs on the client
 * (called from `'use client'` forms). Per the rule `AuthProvider.auth/signUp/generateCode/checkCode`
 * must be client-side, otherwise the fingerprint is taken from the server.
 *
 * @param   {LogInProps} props          - Sign-in arguments.
 * @param   {string}     props.method   - Auth-provider marker (e.g. `email`).
 * @param   {string}     props.login    - User identifier (email).
 * @param   {string}     props.password - User password.
 * @returns Promise resolving to `{ data }` on success or `{ error }` on failure.
 */
export const logInUser = async ({ method, login, password }: LogInProps) => { ... }
```

See `.claude/rules/auth-provider.md` and `.claude/rules/server-actions.md` — the extended context about the fingerprint must be indicated in JSDoc if the function is called from the client despite the path `src/app/api/server/...`.

---

## What NOT to cover with JSDoc

- **Internal callbacks** in `useEffect` / `useGSAP` / `.map()` / `.filter()` / `onClick={() => ...}` — without JSDoc, if they do not have a separate named declaration.
- **Anonymous arrows** in JSX — `onClick={() => doX()}` — without JSDoc.
- **TypeScript types and interfaces** — JSDoc is needed for functions, not types. For types, use a regular TS comment `/** comment */` above the field if the behavior is not obvious.

---

## Extending single-line JSDoc

When editing a file where a function already has a single-line JSDoc without `@param`/`@returns` — **extend** it to the full form:

```ts
// ❌ Before editing
/** Submit form data. */
export const submitForm = async (data: FormData) => { ... }

// ✅ After editing (along with any other changes in the file)
/**
 * submitForm — submit form data via FormData API.
 *
 * @param   {FormData} data - Payload to post.
 * @returns Promise resolving to the API response.
 */
export const submitForm = async (data: FormData) => { ... }
```

---

## Relation to the "minimum comments" rule

The default `CLAUDE.md` — "minimum comments in code". **This rule (`jsdoc.md`) is an exception** for function declarations. Everything else still applies:

- **Do not comment WHAT** — naming and signature already convey that.
- **Comment WHY** — why this way and not otherwise; what is non-trivial; references to rules, incidents, specific bugs.
- **Do not leave** comments like `// added for the X flow` or `// fix from issue #123` — this is history, not a contract.
- **Inside the function body** — comments only when WHY is not obvious (rule from the system prompt).
