# OneEntry SDK Rules

Instructions that teach AI coding assistants to build applications with the [OneEntry](https://oneentry.cloud) JavaScript SDK correctly: a full `CLAUDE.md` context file, focused rules, and step-by-step skills.

This is the content source for [`@oneentry/mcp-server`](https://www.npmjs.com/package/@oneentry/mcp-server) — the server ships no content of its own, it fetches these files at runtime.

---

## Quick start

Add to `.mcp.json` in your project root, restart your assistant, and the rules become available as context, the skills as `/mcp__oneentry__<name>` commands:

```json
{
  "mcpServers": {
    "oneentry": {
      "command": "npx",
      "args": ["-y", "@oneentry/mcp-server@latest"],
      "env": {
        "ONEENTRY_URL": "https://yourproject.oneentry.cloud",
        "ONEENTRY_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

`env` is optional — it lets the `/inspect-api` skill read your project's real markers and data shapes without asking for credentials each time. Cursor and Windsurf can use the hosted server instead; setup for every client is in the [server README](https://www.npmjs.com/package/@oneentry/mcp-server).

**Without the MCP server:** copy `CLAUDE.md` and the `.claude/` directory into your project root. Claude Code reads `CLAUDE.md` automatically and picks up `.claude/skills/*` as slash commands. The trade-off is that a copy is a snapshot, while the server always serves the current version.

---

## What's inside

```text
CLAUDE.md                          ← main instructions: SDK init, error handling, markers, common mistakes
.claude/
  rules/<name>.md                  ← focused rules, loaded when the task needs them
  skills/<name>/SKILL.md           ← step-by-step recipes for a specific feature
```

**Rules** cover the parts of the SDK that are easy to get wrong: reading `attributeValues` by type, forms and form data, authentication and token refresh, orders and payments, product statuses, localization, Server Actions, Next.js pages, and a performance family (images, bundle, streaming, RTK Query, popups, GSAP).

**Skills** are end-to-end recipes: project and SDK setup, inspecting a live project's API, pages and menus, product list / card / page, cart, favorites, filters, search, checkout and orders, profile, auth and Google OAuth, forms, captcha, reviews, subscriptions, Playwright tests.

Browse [`.claude/rules/`](.claude/rules) and [`.claude/skills/`](.claude/skills) for the current list.

---

## How the content is served

```text
https://raw.githubusercontent.com/ONEENTRY-PLATFORM/oneentry-sdk-rules/main/{path}
```

The MCP server requests `CLAUDE.md`, `.claude/rules/{name}.md` or `.claude/skills/{name}/SKILL.md` on demand and caches each response for 5 minutes (`ONEENTRY_MCP_CACHE_TTL_MS`). Updates here reach everyone within that window — no package upgrade needed on your side.

---

## Conventions

- Written against **Next.js (App Router) + TypeScript** — the stack most OneEntry projects use — though the SDK rules themselves are framework-agnostic.
- Rules describe what the **live API actually returns**. Where that differs from the SDK typings or JSDoc, the discrepancy is documented explicitly rather than smoothed over.
- Markers — pages, forms, attributes, events, order statuses — are unique to each project. The rules never hardcode them; they instruct the assistant to read them from your project via `/inspect-api`.

---

## Feedback

This repository is generated, so edits committed here are replaced on the next publish. If a rule is wrong, outdated, or missing — please [open an issue](https://github.com/ONEENTRY-PLATFORM/oneentry-sdk-rules/issues) with the SDK version and, if possible, the API response you observed. That is the fastest path into the next release.

SDK reference: <https://js-sdk.oneentry.cloud/docs/index/>
