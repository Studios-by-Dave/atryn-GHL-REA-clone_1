<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project state & session handoff

_Last updated: 2026-11-08_

## ⏰ Reminders for next session

- [ ] **Delete the throwaway GitHub repo `DavesHub1234/atryn`** — the `gh` token lacked the `delete_repo` scope. Fix: run `gh auth refresh -h github.com -s delete_repo`, then `gh repo delete DavesHub1234/atryn --yes` (or delete via web UI). The real repo is `Studios-by-Dave/atryn-GHL-REA-clone_1`.

## Decisions (locked)

- Product name: **Atryn** (atryn.com) — working name, revisit branding later
- Auth: **Auth.js** · Package manager: **npm**
- Stack: Next.js 16.4.1 (App Router, Turbopack, `cacheComponents`) · Prisma 7 (Rust-free `prisma-client` + `@prisma/adapter-pg`) · Postgres 16 · Tailwind v4 · TypeScript · Vitest
- Custom, hand-rolled Tailwind UI (no shadcn/ui); lucide-react icons

## Current state

- **Done:** T1 foundation (`dec8eaf`) · T2 auth/tenancy/RBAC (`714553c`) · T3 app shell + sub-account switcher (`e61bcea`) · T4 contacts CRM (`fd7e773` server layer, `13f5c0d` pages/forms/nav, `7e9ef74` full UI).
- **T4 verified live 2026-11-08:** user QA passed — filters/sort, create, tags, notes, archive/restore + flash banners, bulk tag bar, CSV import with merged/skipped counts.
- **Next: T5 — Pipelines & opportunities** (see roadmap in `docs/INITIAL_DELIVERABLE.md`): Pipeline/PipelineStage/Opportunity/OpportunityStageHistory repos + services, `features/pipelines` board with dnd-kit drag, stage history rows, won/lost terminal stages, CLIENT_USER limited to assigned opps; pause for QA after gates.
- **Gotchas found while finishing T4:** `"use server"` files may only export async functions — `ContactActionState`/`initialContactState` live in `src/features/contacts/action-state.ts`; `hasPermission` is imported from `@/server/rbac/permissions`, not `guards`.
- Roadmap, full schema, access matrix: `docs/INITIAL_DELIVERABLE.md`.
- Dev DB containers: `atryn-pg`, `atryn-redis`, `atryn-mailpit` (running; `docker start` after reboot — no compose plugin). Dev log: `/tmp/opencode/atryn-dev4.log`.

## T4 design decisions (locked, 2026-10-31)

- **CLIENT_USER can add notes but not edit contacts** — `addNoteAction` gates on `contacts.read`, mutations on `contacts.write`.
- Changing email/phone to one held by *another* contact → `ContactValidationError`, no silent merge (merge only happens on create/import).
- Custom field values arrive as `custom.<key>` form names; `resolveCustomFieldValues` validates against `CustomField` rows server-side and ignores unknown keys.
- Prisma 7 `ContactUpdateInput` uses `owner: { connect }`, not `ownerUserId:` — scalar FK fields are absent from update input (same class of gotcha as the UUID FK one).

## Gotchas (learned the hard way)

- **Prisma 7:** `migrate diff --to-schema` (not `--to-schema-datamodel`); seed command lives in `prisma7.config.ts` (`migrations.seed`), not `package.json`.
- **UUID FKs:** any FK column referencing a `@db.Uuid` PK must itself carry `@db.Uuid` — even when `@unique`. Bit twice: `Workflow.currentVersionId`, `Conversation.contactId`.
- **Update inputs:** `updateMany` can't touch relation-backed scalars (`ownerUserId`); use `update` with `owner: {connect}`. `updateMany`'s input type also omits them, so repo `updateContact` accepts `Prisma.ContactUpdateInput`.
- **Zod v4 `z.uuid()` is strict** — RFC variant bits required. A hand-typed UUID like `…-2222-…` fails and yields 404 (via `notFound()`), not 403. Use `gen_random_uuid()`/valid v4s in tests.
- **`forbidden()` status codes work** — earlier "403 returns 404" scare was my own bad test route: a folder prefixed `_` is a *private folder*, not a route. Underscore-prefixed dirs never route.
- **`next dev` doesn't restart on `next.config.ts` changes** — kill the process (careful: `pkill -f "next dev"` also matches your own shell command line; kill by PID) and relaunch.
- **Raw SQL migrations:** create via `prisma migrate dev --create-only`, then edit the generated file. Editing an existing migration file and re-running `migrate dev` **overwrites** it.
- **Docker:** the `docker compose` plugin is not installed — use `docker run`/`docker start` on the named containers. `docker-compose.yml` in repo is still the intended spec.
- **Dependency pins:** `prisma` pinned `^7` (v8 RC pulls a broken peer chain), `vitest` pinned `5.0.4` for the same reason; `@types/node` bumped to `^24`.
- **Typecheck order:** run `next build` at least once before `tsc --noEmit` passes — Next 16 typed routes generate the `LayoutProps` global into `.next/types`.
- **Shell:** the bash tool's default cwd still points at the pre-rename path (`GoHighLevel REA Clone`); always pass `workdir` explicitly.
