<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project state & session handoff

_Last updated: 2026-10-15_

## ⏰ Reminders for next session

- [ ] **Delete the throwaway GitHub repo `DavesHub1234/atryn`** — the `gh` token lacked the `delete_repo` scope. Fix: run `gh auth refresh -h github.com -s delete_repo`, then `gh repo delete DavesHub1234/atryn --yes` (or delete via web UI). The real repo is `Studios-by-Dave/atryn-GHL-REA-clone_1`.

## Decisions (locked)

- Product name: **Atryn** (atryn.com) — working name, revisit branding later
- Auth: **Auth.js** · Package manager: **npm**
- Stack: Next.js 16.4.1 (App Router, Turbopack) · Prisma 7 (Rust-free `prisma-client` + `@prisma/adapter-pg`) · Postgres 16 · Tailwind v4 · TypeScript · Vitest

## Current state

- **Done:** T1 foundation — schema, 2 migrations (incl. double-booking GiST exclusion constraint, verified), seed, gates green (`lint`, `typecheck`, `test`, `build`). Pushed to `master` @ `dec8eaf`.
- **Next:** T2 — Auth.js wiring, org/sub-account provisioning, membership/auditing, tenant context + RBAC guards (see `docs/INITIAL_DELIVERABLE.md` for tickets and roadmap).
- Roadmap, full schema, access matrix: `docs/INITIAL_DELIVERABLE.md`.
- Dev DB containers: `atryn-pg`, `atryn-redis`, `atryn-mailpit` (may still be running; recreate with `docker run` — see gotchas).

## Gotchas (learned the hard way)

- **Prisma 7:** `migrate diff --to-schema` (not `--to-schema-datamodel`); seed command lives in `prisma7.config.ts` (`migrations.seed`), not `package.json`.
- **UUID FKs:** any FK column referencing a `@db.Uuid` PK must itself carry `@db.Uuid` — even when `@unique`. Bit twice: `Workflow.currentVersionId`, `Conversation.contactId`.
- **Raw SQL migrations:** create via `prisma migrate dev --create-only`, then edit the generated file. Editing an existing migration file and re-running `migrate dev` **overwrites** it.
- **Docker:** the `docker compose` plugin is not installed on this machine — use `docker run` (containers above) or install the plugin. `docker-compose.yml` in repo is still the intended spec.
- **Dependency pins:** `prisma` pinned `^7` (v8 RC pulls a broken peer chain), `vitest` pinned `5.0.4` for the same reason; `@types/node` bumped to `^24` to match runtime.
- **Typecheck order:** run `next build` at least once before `tsc --noEmit` passes — Next 16 typed routes generate the `LayoutProps` global into `.next/types`.
- **Shell:** the bash tool's default cwd still points at the pre-rename path (`GoHighLevel REA Clone`); always pass `workdir` explicitly.
