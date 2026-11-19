<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project state & session handoff

_Last updated: 2026-11-19_

## ⏰ Reminders for next session

- [ ] **Push local commits** — `master` is **2 ahead of `origin/master`**: `3b05fe4` (Phase 5 lint-debt fix) and `58cbe12` (T6 messaging). Run `git push origin master` once you're happy (e.g. after T6 live QA).
- [ ] **T6 live QA (pending):** open Conversations → send an email and an SMS from a thread (dev logs `[MOCK SEND]` since `OUTBOUND_MESSAGING_ENABLED="false"`). Hit `/api/webhooks/twilio/inbound?subAccountId=<uuid>` with `From`/`Body=STOP`/`MessageSid` (form-encoded) and confirm the contact's `smsOptOutAt` is set + next SMS send returns the opt-out error.
- [ ] **Delete the throwaway GitHub repo `DavesHub1234/atryn`** — the `gh` token lacked the `delete_repo` scope. Fix: run `gh auth refresh -h github.com -s delete_repo`, then `gh repo delete DavesHub1234/atryn --yes` (or delete via web UI). The real repo is `Studios-by-Dave/atryn-GHL-REA-clone_1`.

## ▶️ Start here (fresh session)

1. Work from `/home/dave123/Downloads/Websites/Shelby Web Co/Atryn - GoHighLevel REA Clone` (always pass `workdir` explicitly — the bash default cwd points at the old path).
2. Start dev containers if needed: `docker start atryn-pg atryn-redis atryn-mailpit` (then `docker ps` to confirm).
3. `npm install` is already done (Next 16.4.6). For a dev server: `npm run dev`.
4. Before/after changes, run all gates: `npm run lint && npm run test && npm run typecheck && npm run build` (build first if `tsc` complains about `LayoutProps`).
5. **Next milestone:** finish T6 live QA (above), then **Phase 7 — Appointments** (appointment types, per-user availability, public `/book/[slug]` flow, GiST double-booking guard, reschedule/cancel, confirmation via workflow engine). Roadmap + schema in `docs/INITIAL_DELIVERABLE.md`.

## Decisions (locked)

- Product name: **Atryn** (atryn.com) — working name, revisit branding later
- Auth: **Auth.js** · Package manager: **npm**
- Stack: Next.js 16.4.6 (App Router, Turbopack, `cacheComponents`) · Prisma 7 (Rust-free `prisma-client` + `@prisma/adapter-pg`) · Postgres 16 · Tailwind v4 · TypeScript · Vitest
- Custom, hand-rolled Tailwind UI (no shadcn/ui); lucide-react icons

## Current state

- **Done:** T1 foundation (`dec8eaf`) · T2 auth/tenancy/RBAC (`714553c`) · T3 app shell + sub-account switcher (`e61bcea`) · T4 contacts CRM (`fd7e773` server layer, `13f5c0d` pages/forms/nav, `7e9ef74` full UI) · T5 pipelines & opportunities (`e5edb2b` + fix `982f90b` — verified by user QA 2026-11-08) · T6 messaging (inbox, providers, webhooks — gates green 2026-11-19, pending live QA). Also merged: Next.js 16.4.1→16.4.6 security upgrade (PR #1, `4266f0c`).
- **T4 verified live 2026-11-08:** user QA passed — filters/sort, create, tags, notes, archive/restore + flash banners, bulk tag bar, CSV import with merged/skipped counts.
- **T5 verified live 2026-11-08:** user QA passed — pipeline create (fix `982f90b` restored the missing hidden `subAccountId` field), rename/delete, drag-and-drop with reload persistence, stage editor guards, filters. One initial 403 on pipeline create was the missing hidden field, fixed and re-verified. Pipelines list page (create/rename/delete), board page with dnd-kit drag between stage columns (optimistic move + server action `moveOpportunityAction`), stage history rows on create+move, won/lost terminal semantics (status + wonAt/lostAt sticky once set), stage editor (add/edit/delete, delete guarded when opps present), opportunity create form, board filters (assignee/status/min value/close-before), CLIENT_USER board read locked to assigned opps, `workflow event` stub `OPPORTUNITY_STAGE_CHANGED` in `src/server/events/bus.ts`, schemas test. Gates green: lint, 89 tests, tsc, build.
  - QA plan (from roadmap): create pipeline → drag 5 opps across stages → verify history rows via SQL → reload board → filter by assignee.
- **Gotchas found while finishing T4:** `"use server"` files may only export async functions — `ContactActionState`/`initialContactState` live in `src/features/contacts/action-state.ts`; `hasPermission` is imported from `@/server/rbac/permissions`, not `guards`.
- Roadmap, full schema, access matrix: `docs/INITIAL_DELIVERABLE.md`.
- Dev DB containers: `atryn-pg`, `atryn-redis`, `atryn-mailpit` (running; `docker start` after reboot — no compose plugin). Dev log: `/tmp/opencode/atryn-dev4.log`.

## Design decisions by phase (newest first)

## T6 (built 2026-11-19, pending live QA)
- **One conversation per contact** (`Conversation.contactId` is `@unique`); email + SMS share the thread. `ensureConversation` upserts by `contactId`.
- **Consent is enforced in one place:** `assertCanSend(contact, channel)` in `src/server/services/messaging.ts` throws `OptOutError` / `MissingAddressError` (both extend `MessagingError`, HTTP 400). Every send path must call it before hitting a provider.
- **Outbound kill switch:** `OUTBOUND_MESSAGING_ENABLED` must be `"true"` to actually call Resend/Twilio; otherwise providers log `[MOCK SEND]` and return a `mock_*` id. Also requires provider creds + `*_PROVIDER` set. Enforced in `src/server/messaging/providers.ts`.
- **Send flow:** insert Message `QUEUED` → provider → update `SENT` (+ provider ids/sentAt) or `FAILED` (+ error/failedAt) → touch conversation → audit `message.send`. Provider errors surface as a friendly `MessagingError`.
- **Webhooks (system, no user session):** Twilio inbound `/api/webhooks/twilio/inbound?subAccountId=<uuid>` (creates/finds contact by normalized phone, appends INBOUND message, increments unread, and sets `smsOptOutAt`/clears it on STOP/START keywords). Twilio status `/api/webhooks/twilio/status`. Resend `/api/webhooks/resend` (vicarious `email.*` events). Idempotency via `WebhookEvent.idempotencyKey` unique (P2002 → treated as duplicate, no-op).
- **Opt keywords** in `src/features/messaging/schemas.ts` (`parseOptKeyword`, first word only): STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT/OPTOUT → opt-out; START/YES/UNSTOP/OPTIN → opt-in.
- **Twilio signature** verification (`src/server/messaging/verify.ts`) only enforced when `TWILIO_VALIDATE_SIGNATURE=true`; Resend Svix signature NOT yet enforced (follow-up).
- **Permissions:** added `messaging.read` + `messaging.send` (OWNER/ADMIN/AGENT; not CLIENT_USER). Updated `permissions.test.ts` matrix.
- **UI:** `/s/[subAccountId]/conversations` (list + status/search filter) and `/conversations/[conversationId]` (thread + `MessageCompose` client form via `useActionState`; page marks conversation read on open). Nav "Conversations" enabled in `app-shell.tsx`.
- **Files:** `src/features/messaging/{schemas,schemas.test,action-state,queries,actions,message-compose}.ts(x)`; `src/server/repositories/messages.ts`; `src/server/services/messaging.ts`; `src/server/messaging/{providers,verify}.ts`; three webhook routes. Gates green: lint, 141 tests, tsc, build.

## T5 (locked, 2026-11-08)
- Drag-and-drop is optimistic-only: the board component mutates local card state first, then calls `moveOpportunityAction`; on error it reverts and shows the message. Plain `revalidatePath` handles persistence.
- Terminal (won/lost) stages are sticky: once `status` is `WON`/`LOST`, later moves to non-terminal stages never clear it; `wonAt`/`lostAt` are set only once.
- The board filters form and the update-opportunity edit form intentionally do NOT change stage — only drags write history rows (edit form resends current `stageId` for ownership validation).
- Stage editor lives below the board on the pipeline page (add/edit/delete; delete is refused while opportunities sit on the stage).

## T4 (locked, 2026-10-31)
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
- **`z.coerce.number()` turns `undefined` into `NaN`** and then fails validation — use `.optional().transform(v => v ?? <default>)` when a numeric field may be absent.
- **`satisfies Prisma.XSelect`**: the select object must be flat (`{ id: true, ... }`), and `GetPayload` args take `{ select: typeof flatObj }` — nesting a `select:` wrapper inside breaks every include that reuses it.
- **Webhook handlers are system callers:** they have no session, so build a pseudo `TenantContext` with `userId: ""` and never persist that id (the messaging repo only reads `subAccountId`). Don't call `writeAuditLog` from them.
- **`writeAuditLog` typing:** it wants a `Prisma.TransactionClient`; a bare `prisma` fails the type, so wrap it: `prisma.$transaction((tx) => writeAuditLog(tx, {...}))`.
- **Webhook idempotency:** rely on `WebhookEvent.idempotencyKey` `@unique` — catch the Prisma error by `error.code === "P2002"` and treat it as a duplicate no-op (don't import the runtime error class; duck-type the `code`).
- **Outbound is mocked by default:** `OUTBOUND_MESSAGING_ENABLED` must be `"true"` *and* provider creds present to call Resend/Twilio; otherwise adapters log `[MOCK SEND]` and return a `mock_*` provider id. Status webhooks can't match mock ids (expected).
