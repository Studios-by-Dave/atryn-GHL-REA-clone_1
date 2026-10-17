# Initial Deliverable — [PRODUCT_NAME]

Working codename: **Beacon** (replace with your final product name; it only affects package names, emails, and UI copy).

An original, white-label, multi-tenant "local business growth OS": capture leads, nurture them automatically, book appointments, manage pipelines, prove revenue.

---

## 1. Architecture Overview

### High-level shape

```
                      ┌──────────────────────────────────────────────┐
                      │                 Next.js (App Router)         │
                      │  ─ UI (React Server Components + shadcn/ui)  │
                      │  ─ Server Actions (typed mutations)          │
                      │  ─ Route Handlers (webhooks, public APIs)    │
                      └──────┬───────────────────────────┬───────────┘
                             │                           │
                   ┌─────────▼─────────┐       ┌─────────▼─────────┐
                   │  Server Core      │       │  Integrations     │
                   │  ├ auth (Auth.js) │       │  ├ Resend (email) │
                   │  ├ rbac guards    │       │  ├ Twilio (SMS)   │
                   │  ├ repositories   │       │  └ Stripe (billing)│
                   │  ├ services       │       └─────────┬─────────┘
                   │  ├ zod validation │                 │
                   │  └ audit log      │                 │
                   └───────┬───────────┘                 │
              ┌────────────┴──────────────┐              │
      ┌───────▼────────┐         ┌────────▼──────────────▼──┐
      │  PostgreSQL    │         │  Redis + BullMQ           │
      │  (Prisma ORM)  │         │  - workflow runs / delays │
      │  source of     │         │  - outbound messaging     │
      │  truth         │         │  - webhook processing     │
      └────────────────┘         │  - scheduled reminders    │
                                 └───────────────────────────┘
```

### Layering rules (enforced by convention + lint review)

| Layer | Location | Responsibility | May touch |
|---|---|---|---|
| UI components | `src/components`, `src/features/**/components` | Render state, dispatch intents | Server actions / typed APIs only |
| Server actions & route handlers | `src/server/actions`, `src/app/api` | Input parsing (Zod), auth, orchestration | Services only |
| Services | `src/server/services/**` | Business logic, transactions, cross-entity rules | Repositories only |
| Repositories | `src/server/repositories/**` | All Prisma queries, always tenant-scoped | Prisma client only |
| Integrations | `src/integrations/**` | Provider SDK wrappers (Resend, Twilio, Stripe) | Nothing internal (pure adapters) |
| Jobs | `src/server/jobs/**` | BullMQ queues + processors | Services (never raw Prisma) |

Key principles:

- **No business logic in React components.** Components call server actions that return typed results.
- **One tenant-scoped Prisma entry point.** Repositories receive a `TenantContext { orgId, subAccountId, userId, role }` resolved from the session — never trusted from request bodies.
- **Idempotency everywhere it matters:** BullMQ `jobId`s (`${runId}:${stepId}`), unique `WebhookEvent.idempotencyKey`, Stripe/Twilio signature verification.
- **Durable automation:** delays live in BullMQ (delayed jobs) *and* as `resumeAt` timestamps in Postgres; a reconciliation sweep re-enqueues pending work after restarts, so a flushed Redis queue can't lose runs.
- **Dev-safe messaging:** outbound SMS/email is gated by `OUTBOUND_MESSAGING_ENABLED=false` by default in development; provider calls are logged and mocked instead.

### Request flow examples

1. **Dashboard mutation:** browser → server action → Zod parse → `requireSubAccountAccess()` → service (transaction) → repository → DB → audit log → typed response → UI optimistic/invalidation update.
2. **Public form submit:** `POST /api/public/forms/[publicId]` → honeypot + rate limit → Zod parse → upsert contact (normalized email/phone dedupe) → create submission + UTM metadata → enqueue workflow runs → notification enqueue → `200 { ok: true }`.
3. **Workflow execution:** webhook/action event → `workflow-runs.enqueue({ jobId })` → processor loads published `WorkflowVersion` → executes steps one at a time (each step logged as `WorkflowRunStep`) → `WAIT` becomes a delayed job + `resumeAt` → terminal status recorded with timings.

---

## 2. Recommended Folder Structure

```
beacon/
├── docker-compose.yml            # postgres:16, redis:7 (AOF on), mailpit (dev inbox)
├── .env.example
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                   # org, sub-accounts, users per role, demo data
├── src/
│   ├── app/
│   │   ├── (marketing)/          # public site
│   │   ├── (auth)/login, /invite, /magic-link
│   │   ├── (app)/                # authenticated shell
│   │   │   ├── layout.tsx        # nav, sub-account switcher
│   │   │   └── s/[subAccountId]/ # all tenant pages: contacts, pipelines, ...
│   │   ├── f/[publicId]/         # public form renderer (no auth)
│   │   ├── book/[slug]/          # public booking flow (no auth)
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── public/forms/[publicId]/submission/
│   │       ├── public/booking/
│   │       └── webhooks/{twilio,resend,stripe}/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── layout/               # sidebar, topbar, switcher
│   ├── features/                 # one folder per domain module
│   │   ├── contacts/
│   │   ├── pipelines/
│   │   ├── forms/
│   │   ├── workflows/
│   │   ├── messaging/
│   │   ├── appointments/
│   │   ├── tasks/
│   │   └── reports/
│   │       ├── components/       # React only
│   │       ├── actions.ts        # server actions (Zod-validated)
│   │       ├── schemas.ts        # zod schemas shared UI/server
│   │       └── queries.ts        # read-model helpers
│   ├── server/
│   │   ├── auth/                 # Auth.js config, session helpers
│   │   ├── rbac/                 # roles, guards, permission matrix
│   │   ├── tenant/               # TenantContext resolver
│   │   ├── db/                   # prisma singleton
│   │   ├── repositories/         # contacts.repo.ts, opportunities.repo.ts, ...
│   │   ├── services/             # contact.service.ts, workflow.service.ts, ...
│   │   ├── jobs/                 # queues.ts, processors/*.ts, scheduler.ts
│   │   ├── audit/                # audit writer
│   │   └── validation/           # shared zod primitives (uuid, pagination)
│   ├── integrations/
│   │   ├── email/resend.ts
│   │   ├── sms/twilio.ts
│   │   └── payments/stripe.ts
│   └── lib/                      # utils, time, normalize phone/email
├── tests/
│   ├── unit/                     # services, workflow engine, normalize/dedupe
│   ├── integration/              # repositories against test DB
│   └── e2e/                      # Playwright: form submit → contact → run
└── .github/workflows/            # lint, typecheck, test, migrate on CI
```

Conventions:

- Import direction: `app → features → server → integrations`. Never import `server` from `components` directly (only via actions).
- Each feature folder exposes exactly three surfaces: `schemas.ts`, `actions.ts`, `queries.ts`.

---

## 3. Complete Prisma Schema (MVP)

Conventions:
- UUID primary keys (`gen_random_uuid()`), exposed directly as public identifiers (they are non-guessable).
- Public shareable resources (`Form`) carry a short `publicId` slug for URLs.
- Schedule-critical timestamps are `timestamptz`; standard audit timestamps use Prisma defaults.
- Every tenant-owned row carries `subAccountId` (single-column isolation key) — except `Organization`/`User`/`Membership`, which are org-scoped.

```prisma
generator client {
  provider = "prisma-client" // Prisma 7 Rust-free client
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql" // URL comes from prisma7.config.ts → DATABASE_URL
}

// ───────────────────────────── enums ─────────────────────────────

enum UserRole {
  OWNER
  ADMIN
  AGENT
  CLIENT_USER
}

enum MembershipStatus {
  INVITED
  ACTIVE
  SUSPENDED
}

enum ContactStatus {
  ACTIVE
  ARCHIVED
}

enum OpportunityStatus {
  OPEN
  WON
  LOST
}

enum TaskStatus {
  OPEN
  IN_PROGRESS
  DONE
}

enum FormStatus {
  DRAFT
  ACTIVE
  PAUSED
}

enum FormFieldType {
  TEXT
  EMAIL
  PHONE
  DROPDOWN
  CHECKBOX
  TEXTAREA
  DATE
  CONSENT
}

enum WorkflowStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED
}

enum WorkflowVersionStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum WorkflowTriggerType {
  FORM_SUBMITTED
  CONTACT_CREATED
  TAG_ADDED
  APPOINTMENT_BOOKED
  APPOINTMENT_STATUS_CHANGED
  OPPORTUNITY_STAGE_CHANGED
  INBOUND_SMS
  INBOUND_EMAIL
}

enum WorkflowActionType {
  WAIT
  CONDITION
  SEND_EMAIL
  SEND_SMS
  ADD_TAG
  REMOVE_TAG
  UPDATE_CONTACT_FIELD
  CREATE_TASK
  MOVE_OPPORTUNITY
  NOTIFY_USER
  WEBHOOK
}

enum WorkflowRunStatus {
  PENDING
  RUNNING
  WAITING
  COMPLETED
  FAILED
  CANCELLED
}

enum WorkflowRunStepStatus {
  PENDING
  WAITING
  RUNNING
  SUCCESS
  FAILED
  SKIPPED
}

enum MessageChannel {
  EMAIL
  SMS
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageStatus {
  QUEUED
  SENT
  DELIVERED
  FAILED
  READ
}

enum ConversationStatus {
  OPEN
  ARCHIVED
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  COMPLETED
  NO_SHOW
  CANCELLED
  RESCHEDULED
}

enum DayOfWeek {
  MON
  TUE
  WED
  THU
  FRI
  SAT
  SUN
}

enum CustomFieldType {
  TEXT
  LONG_TEXT
  NUMBER
  DATE
  CHECKBOX
  SELECT
  MULTI_SELECT
  PHONE
  EMAIL
  URL
  CURRENCY
}

enum WebhookEventStatus {
  RECEIVED
  PROCESSED
  FAILED
}

// ───────────────────── tenancy & identity ────────────────────────

model Organization {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String
  slug             String   @unique
  timezone         String   @default("UTC")
  stripeCustomerId String?  @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  subAccounts  SubAccount[]
  memberships  OrgMembership[]
  auditLogs    AuditLog[]
  @@index([slug])
}

model SubAccount {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @db.Uuid
  name        String
  slug        String   @unique // used in URLs: /s/{id} preferred, slug for display/booking
  timezone    String   @default("UTC")
  status      String   @default("active") // active | suspended
  bookingSlug String?  @unique // public /book/{bookingSlug}
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org          Organization           @relation(fields: [orgId], references: [id], onDelete: Cascade)
  memberships  SubAccountMembership[]
  contacts     Contact[]
  tags         Tag[]
  customFields CustomField[]
  pipelines    Pipeline[]
  forms        Form[]
  workflows    Workflow[]
  conversations Conversation[]
  appointmentTypes AppointmentType[]
  appointments Appointment[]
  opportunities Opportunity[]
  availabilityRules AvailabilityRule[]
  tasks        Task[]
  messages     Message[]
  webhookEvents WebhookEvent[]
  auditLogs    AuditLog[]

  @@index([orgId, status])
}

model User {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   @unique
  name      String?
  image     String?
  passwordHash String? // null when magic-link-only
  timezone  String   @default("UTC")
  bookingSlug String? @unique // public per-user booking link
  lastLoginAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orgMemberships       OrgMembership[]
  subAccountMemberships SubAccountMembership[]
  ownedContacts        Contact[]              @relation("ContactOwner")
  assignedOpportunities Opportunity[]         @relation("OpportunityAssignee")
  assignedTasks        Task[]                 @relation("TaskAssignee")
  sentMessages         Message[]              @relation("MessageSender")
  appointments         Appointment[]          @relation("AppointmentHost")
  availabilityRules    AvailabilityRule[]
  notes                ContactNote[]
  workflowRunsStartedBy WorkflowRun[]         @relation("WorkflowRunTester")
  auditLogs            AuditLog[]
}

model OrgMembership {
  id        String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId     String           @db.Uuid
  userId    String           @db.Uuid
  role      UserRole // OWNER | ADMIN | AGENT (org scope)
  status    MembershipStatus @default(ACTIVE)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@index([userId])
}

model SubAccountMembership {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String           @db.Uuid
  userId       String           @db.Uuid
  role         UserRole // ADMIN | AGENT | CLIENT_USER (sub-account scope)
  status       MembershipStatus @default(ACTIVE)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  subAccount SubAccount @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([subAccountId, userId])
  @@index([userId, status])
}

// ──────────────────────────── CRM ────────────────────────────────

model Contact {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId   String        @db.Uuid
  firstName      String
  lastName       String        @default("")
  email          String?
  phone          String?
  company        String?
  source         String? // form key, manual, import, webhook
  status         ContactStatus @default(ACTIVE)
  ownerUserId    String?       @db.Uuid
  // normalized match keys — dedupe (unique per sub-account; NULLs allowed)
  emailNormalized String?
  phoneNormalized String?
  // consent / opt-out
  emailOptOutAt  DateTime?
  smsOptOutAt    DateTime?
  archivedAt     DateTime?
  deletedAt      DateTime? // soft delete; hard-delete job purges later
  lastActivityAt DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  subAccount   SubAccount        @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  owner        User?             @relation("ContactOwner", fields: [ownerUserId], references: [id], onDelete: SetNull)
  tags         ContactTag[]
  customValues CustomFieldValue[]
  notes        ContactNote[]
  opportunities Opportunity[]
  forms        FormSubmission[]
  messages     Message[]
  conversation Conversation?
  appointments Appointment[]
  tasks        Task[]
  workflowRuns WorkflowRun[]
  inboundEvents WebhookEvent[]

  @@unique([subAccountId, emailNormalized])
  @@unique([subAccountId, phoneNormalized])
  @@index([subAccountId, status, createdAt(sort: Desc)])
  @@index([subAccountId, lastName, firstName])
  @@index([subAccountId, ownerUserId, status])
  @@index([subAccountId, source])
}

model ContactNote {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String  @db.Uuid
  contactId   String   @db.Uuid
  authorUserId String? @db.Uuid
  body        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  author  User?   @relation(fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([contactId, createdAt(sort: Desc)])
}

model Tag {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String  @db.Uuid
  name        String
  color       String?
  createdAt   DateTime @default(now())

  subAccount SubAccount  @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  contacts   ContactTag[]

  @@unique([subAccountId, name])
}

model ContactTag {
  contactId String   @db.Uuid
  tagId     String   @db.Uuid
  addedAt   DateTime @default(now())

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([contactId, tagId])
  @@index([tagId])
}

model CustomField {
  id          String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String         @db.Uuid
  name        String
  key         String // stable machine key: snake_case
  type        CustomFieldType
  options     String[] @default([]) // for SELECT / MULTI_SELECT
  required    Boolean  @default(false)
  position    Int      @default(0)
  createdAt   DateTime @default(now())

  subAccount SubAccount       @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  values     CustomFieldValue[]

  @@unique([subAccountId, key])
  @@index([subAccountId, position])
}

model CustomFieldValue {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId  String   @db.Uuid
  customFieldId String   @db.Uuid
  contactId     String   @db.Uuid
  value         Json // string | number | boolean | string[] normalized by field type
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())

  customField CustomField @relation(fields: [customFieldId], references: [id], onDelete: Cascade)
  contact     Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([customFieldId, contactId])
  @@index([subAccountId, customFieldId])
}

// ─────────────────── pipelines & opportunities ───────────────────

model Pipeline {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String  @db.Uuid
  name        String
  isDefault   Boolean  @default(false)
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  subAccount SubAccount      @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  stages     PipelineStage[]
  opportunities Opportunity[]

  @@index([subAccountId, position])
}

model PipelineStage {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pipelineId String   @db.Uuid
  name       String
  position   Int
  // probability % and "won/lost terminal" flags feed reporting
  probability Int    @default(0)
  isWon      Boolean  @default(false)
  isLost     Boolean  @default(false)
  createdAt  DateTime @default(now())

  pipeline      Pipeline                 @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  opportunities Opportunity[]
  movedInFrom   OpportunityStageHistory[] @relation("StageFrom")
  movedTo       OpportunityStageHistory[] @relation("StageTo")

  @@unique([pipelineId, position])
  @@index([pipelineId])
}

model Opportunity {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId      String           @db.Uuid
  contactId         String           @db.Uuid
  pipelineId        String           @db.Uuid
  stageId           String           @db.Uuid
  name              String
  value             Decimal          @default(0) @db.Decimal(12, 2)
  currency          String           @default("USD")
  status            OpportunityStatus @default(OPEN)
  expectedCloseDate DateTime?        @db.Timestamptz
  assignedUserId    String?          @db.Uuid
  source            String?
  notes             String?
  wonAt             DateTime?        @db.Timestamptz
  lostAt            DateTime?        @db.Timestamptz
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  subAccount SubAccount            @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  contact    Contact               @relation(fields: [contactId], references: [id], onDelete: Cascade)
  pipeline   Pipeline              @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  stage      PipelineStage         @relation(fields: [stageId], references: [id], onDelete: Restrict)
  assignee   User?                 @relation("OpportunityAssignee", fields: [assignedUserId], references: [id], onDelete: SetNull)
  history    OpportunityStageHistory[]
  tasks      Task[]

  @@index([subAccountId, status, stageId])
  @@index([subAccountId, pipelineId, stageId])
  @@index([subAccountId, assignedUserId, status])
  @@index([subAccountId, createdAt(sort: Desc)])
}

model OpportunityStageHistory {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  opportunityId  String   @db.Uuid
  fromStageId    String?  @db.Uuid
  toStageId      String   @db.Uuid
  changedByUserId String? @db.Uuid
  note           String?
  createdAt      DateTime @default(now())

  opportunity Opportunity   @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  fromStage   PipelineStage? @relation("StageFrom", fields: [fromStageId], references: [id], onDelete: SetNull)
  toStage     PipelineStage  @relation("StageTo", fields: [toStageId], references: [id], onDelete: Restrict)

  @@index([opportunityId, createdAt])
}

// ─────────────────────────── forms ──────────────────────────────

model Form {
  id           String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String     @db.Uuid
  publicId     String     @unique // short slug → /f/{publicId}
  name         String
  status       FormStatus @default(DRAFT)
  submitLabel  String     @default("Submit")
  successMessage String   @default("Thanks! We'll be in touch shortly.")
  redirectUrl  String?
  notifyUserIds String[]  @default([]) // validated against membership on submit
  consentText  String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  subAccount  SubAccount       @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  fields      FormField[]
  submissions FormSubmission[]

  @@index([subAccountId, status])
}

model FormField {
  id        String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  formId    String        @db.Uuid
  label     String
  name      String // machine key: email, phone, service_type ...
  type      FormFieldType
  required  Boolean       @default(false)
  placeholder String?
  helpText  String?
  options   String[]      @default([]) // DROPDOWN choices
  position  Int           @default(0)

  form Form @relation(fields: [formId], references: [id], onDelete: Cascade)

  @@unique([formId, name])
  @@index([formId, position])
}

model FormSubmission {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String  @db.Uuid
  formId      String   @db.Uuid
  contactId   String?  @db.Uuid
  data        Json // { fieldName: value } raw submission payload
  // spam protection & attribution metadata
  honeypotTriggered Boolean @default(false)
  ipHash       String? // SHA-256(ip + daily pepper), never raw IP
  userAgent    String?
  referrer     String?
  utmSource    String?
  utmMedium    String?
  utmCampaign  String?
  utmContent   String?
  utmTerm      String?
  createdAt    DateTime @default(now())

  form    Form     @relation(fields: [formId], references: [id], onDelete: Cascade)
  contact Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([subAccountId, formId, createdAt(sort: Desc)])
  @@index([contactId, createdAt(sort: Desc)])
}

// ─────────────────── workflow automation ─────────────────────────

model Workflow {
  id          String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String        @db.Uuid
  name        String
  description  String?
  status      WorkflowStatus @default(DRAFT)
  currentVersionId String?   @unique // published version pointer
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  subAccount      SubAccount        @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  currentVersion  WorkflowVersion?  @relation("PublishedVersion", fields: [currentVersionId], references: [id], onDelete: SetNull)
  versions        WorkflowVersion[] @relation("WorkflowVersions")
  runs            WorkflowRun[]

  @@index([subAccountId, status])
}

model WorkflowVersion {
  id          String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workflowId  String                @db.Uuid
  version     Int
  status      WorkflowVersionStatus @default(DRAFT)
  publishedAt DateTime?             @db.Timestamptz
  createdAt   DateTime              @default(now())

  workflow    Workflow           @relation("WorkflowVersions", fields: [workflowId], references: [id], onDelete: Cascade)
  publishedFor Workflow?         @relation("PublishedVersion")
  triggers    WorkflowTrigger[]
  actions     WorkflowAction[]
  runs        WorkflowRun[]

  @@unique([workflowId, version])
  @@index([workflowId, status])
}

model WorkflowTrigger {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workflowVersionId String              @db.Uuid
  type              WorkflowTriggerType
  // filters: { formId?, tagId?, pipelineStageId?, appointmentTypeId?, allForms? }
  config            Json                @default("{}")
  position          Int                 @default(0)

  workflowVersion WorkflowVersion @relation(fields: [workflowVersionId], references: [id], onDelete: Cascade)

  @@index([workflowVersionId, type])
}

model WorkflowAction {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workflowVersionId String           @db.Uuid
  type              WorkflowActionType
  // per-action settings, e.g. { delayMinutes: 60 }, { condition: {...} }, { templateId, subject }
  config            Json             @default("{}")
  position          Int // execution order within the version

  workflowVersion WorkflowVersion @relation(fields: [workflowVersionId], references: [id], onDelete: Cascade)
  runSteps     WorkflowRunStep[]

  @@unique([workflowVersionId, position])
  @@index([workflowVersionId])
}

model WorkflowRun {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId      String            @db.Uuid
  workflowId        String            @db.Uuid
  workflowVersionId String            @db.Uuid
  contactId         String?           @db.Uuid
  // event that caused the run: { type, payload }
  triggerEvent      Json
  status            WorkflowRunStatus @default(PENDING)
  isTestRun         Boolean           @default(false)
  startedByUserId   String?           @db.Uuid
  currentActionPosition Int           @default(0)
  resumeAt          DateTime?         @db.Timestamptz // durable WAIT bookmark
  error             String?
  startedAt         DateTime          @default(now())
  finishedAt        DateTime?         @db.Timestamptz
  durationMs        Int?

  workflow        Workflow         @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  workflowVersion WorkflowVersion  @relation(fields: [workflowVersionId], references: [id], onDelete: Restrict)
  contact         Contact?         @relation(fields: [contactId], references: [id], onDelete: SetNull)
  startedBy       User?            @relation("WorkflowRunTester", fields: [startedByUserId], references: [id], onDelete: SetNull)
  steps           WorkflowRunStep[]

  @@index([subAccountId, status, startedAt(sort: Desc)])
  @@index([workflowId, status])
  @@index([contactId, startedAt(sort: Desc)])
  @@index([status, resumeAt]) // reconciliation sweep scans WAITING runs
}

model WorkflowRunStep {
  id            String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workflowRunId String                @db.Uuid
  actionId      String?               @db.Uuid // null for trigger pseudo-step
  position      Int
  actionType    WorkflowActionType? // denormalized for easy reporting
  status        WorkflowRunStepStatus @default(PENDING)
  input         Json?
  output        Json?
  error         String?
  startedAt     DateTime?             @db.Timestamptz
  finishedAt    DateTime?             @db.Timestamptz
  durationMs    Int?

  workflowRun WorkflowRun   @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)
  action      WorkflowAction? @relation(fields: [actionId], references: [id], onDelete: SetNull)

  // one row per step per run ⇒ BullMQ retries stay idempotent
  @@unique([workflowRunId, position])
  @@index([workflowRunId, status])
}

// ─────────────────────── messaging ───────────────────────────────

model Conversation {
  id            String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId  String             @db.Uuid
  contactId     String             @unique // one conversation per contact (channels mixed within)
  status        ConversationStatus @default(OPEN)
  unreadCount   Int                @default(0)
  lastMessageAt DateTime?          @db.Timestamptz
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  subAccount SubAccount @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  contact    Contact    @relation(fields: [contactId], references: [id], onDelete: Cascade)
  messages   Message[]

  @@index([subAccountId, status, lastMessageAt(sort: Desc)])
}

model Message {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String           @db.Uuid
  conversationId String?        @db.Uuid
  contactId    String           @db.Uuid
  channel      MessageChannel
  direction    MessageDirection
  status       MessageStatus    @default(QUEUED)
  subject      String?
  body         String
  senderUserId String?          @db.Uuid
  provider     String? // resend | twilio | mock
  providerMessageId String?
  error        String?
  costMicros   Int? // optional SMS cost tracking
  sentAt       DateTime?        @db.Timestamptz
  deliveredAt  DateTime?        @db.Timestamptz
  failedAt     DateTime?        @db.Timestamptz
  readAt       DateTime?        @db.Timestamptz
  metadata     Json             @default("{}") // template, workflow run ref, etc.
  createdAt    DateTime         @default(now())

  subAccount  SubAccount    @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  contact     Contact       @relation(fields: [contactId], references: [id], onDelete: Cascade)
  sender      User?         @relation("MessageSender", fields: [senderUserId], references: [id], onDelete: SetNull)

  @@index([subAccountId, createdAt(sort: Desc)])
  @@index([conversationId, createdAt(sort: Desc)])
  @@index([contactId, createdAt(sort: Desc)])
  @@index([providerMessageId]) // webhook status lookups
}

// ───────────────────── appointments ──────────────────────────────

model AppointmentType {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId  String   @db.Uuid
  name          String
  slug          String   @unique
  description   String?
  durationMinutes Int    @default(30)
  bufferMinutes Int      @default(0)
  location      String? // physical address or "Google Meet"
  meetingUrl    String?
  reminderIntervalsMinutes Int[] @default([]) // e.g. [60, 1440]
  active        Boolean  @default(true)
  position      Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  subAccount   SubAccount    @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  appointments Appointment[]

  @@index([subAccountId, active, position])
}

model Appointment {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId      String            @db.Uuid
  contactId         String            @db.Uuid
  appointmentTypeId String?           @db.Uuid
  hostUserId        String?           @db.Uuid
  startAt           DateTime          @db.Timestamptz
  endAt             DateTime          @db.Timestamptz
  status            AppointmentStatus @default(SCHEDULED)
  location          String?
  meetingUrl        String?
  notes             String?
  cancelReason      String?
  rescheduledFromId String?           @unique @db.Uuid // at most one successor per appointment
  reminderState     Json              @default("{}") // { "60": sentAt, ... }
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  subAccount      SubAccount       @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  contact         Contact          @relation(fields: [contactId], references: [id], onDelete: Cascade)
  appointmentType AppointmentType? @relation(fields: [appointmentTypeId], references: [id], onDelete: SetNull)
  host            User?            @relation("AppointmentHost", fields: [hostUserId], references: [id], onDelete: SetNull)
  rescheduledFrom Appointment?     @relation("RescheduledFrom", fields: [rescheduledFromId], references: [id], onDelete: SetNull)
  rescheduledTo   Appointment?     @relation("RescheduledFrom")

  @@index([subAccountId, startAt])
  @@index([hostUserId, startAt])
  @@index([contactId, startAt(sort: Desc)])
  @@index([subAccountId, status, startAt])
}

model AvailabilityRule {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId String     @db.Uuid
  userId      String      @db.Uuid
  dayOfWeek   DayOfWeek
  // minutes from midnight (local to `timezone`): 540 = 09:00, 1020 = 17:00
  startMinute Int
  endMinute   Int
  timezone    String      @default("UTC")
  date        DateTime?   @db.Timestamptz // null = recurring weekly; set = one-off date
  createdAt   DateTime    @default(now())

  subAccount SubAccount @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, dayOfWeek])
  @@index([subAccountId, userId])
}

// ─────────────────────────── tasks ───────────────────────────────

model Task {
  id            String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subAccountId  String     @db.Uuid
  title         String
  description   String?
  status        TaskStatus @default(OPEN)
  dueAt         DateTime?  @db.Timestamptz
  assigneeUserId String?   @db.Uuid
  contactId     String?    @db.Uuid
  opportunityId String?    @db.Uuid
  createdByUserId String?  @db.Uuid
  completedAt   DateTime?  @db.Timestamptz
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  subAccount  SubAccount  @relation(fields: [subAccountId], references: [id], onDelete: Cascade)
  assignee    User?       @relation("TaskAssignee", fields: [assigneeUserId], references: [id], onDelete: SetNull)
  contact     Contact?    @relation(fields: [contactId], references: [id], onDelete: Cascade)
  opportunity Opportunity? @relation(fields: [opportunityId], references: [id], onDelete: Cascade)

  @@index([subAccountId, status, dueAt])
  @@index([subAccountId, assigneeUserId, status])
}

// ───────────────────── audit & webhooks ──────────────────────────

model AuditLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String?  @db.Uuid
  subAccountId String?  @db.Uuid
  userId       String?  @db.Uuid
  action       String // e.g. "contact.create", "workflow.publish"
  entityType   String
  entityId     String?
  metadata     Json     @default("{}")
  ipHash       String?
  userAgent    String?
  createdAt    DateTime @default(now())

  org        Organization? @relation(fields: [orgId], references: [id], onDelete: SetNull)
  subAccount SubAccount?   @relation(fields: [subAccountId], references: [id], onDelete: SetNull)
  user       User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([subAccountId, createdAt(sort: Desc)])
  @@index([orgId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
}

model WebhookEvent {
  id              String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  provider        String // twilio | resend | stripe | internal
  eventType       String
  idempotencyKey  String            @unique // provider event id or signed hash
  subAccountId    String?           @db.Uuid
  contactId       String?           @db.Uuid
  status          WebhookEventStatus @default(RECEIVED)
  payload         Json
  error           String?
  receivedAt      DateTime          @default(now())
  processedAt     DateTime?         @db.Timestamptz

  subAccount SubAccount? @relation(fields: [subAccountId], references: [id], onDelete: SetNull)
  contact    Contact?    @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([provider, status, receivedAt(sort: Desc)])
  @@index([subAccountId, receivedAt(sort: Desc)])
}
```

Notes / deliberate MVP simplifications (flagged for your review):

1. **Workflows are strictly per `SubAccount`** in the MVP (an agency-level workflow library can be added later with an `orgId` column + sharing rules).
2. `Form.notifyUserIds String[]` is a pragmatic MVP shortcut; a `FormNotifier` join table is the stricter alternative (follow-up ticket).
3. `Contact.emailNormalized/phoneNormalized` uniques implement duplicate prevention at the DB level (Postgres allows multiple NULLs, so phone-only and email-only contacts both work). Manual merge becomes a follow-up workflow.
4. `Conversation.contactId @unique` = one thread per contact (email + SMS messages live in the same thread, tagged by channel).
5. Double-booking prevention needs a **raw SQL migration** (exclusion constraint) that Prisma can't express — see §4.5.

### ERD-style relationships

```
Organization 1──* SubAccount 1──* Contact ──* Opportunity *──1 Pipeline 1──* PipelineStage
     │                              │              │ (history) OpportunityStageHistory
     │                              │              │
     │ *──* User (via OrgMembership │              │
     │      + SubAccountMembership) │              │
     │                              │              │
     ├──* AuditLog *────────────────┘              │
     │                                             │
SubAccount 1──* Tag *──* ContactTag *──1 Contact   │
SubAccount 1──* CustomField 1──* CustomFieldValue *──1 Contact
SubAccount 1──* Form 1──* FormField; Form 1──* FormSubmission *──? Contact
SubAccount 1──* Workflow 1──* WorkflowVersion 1──* WorkflowTrigger
                                      │ 1──* WorkflowAction
                                      └──* WorkflowRun *──? Contact
                                              └──* WorkflowRunStep *──? WorkflowAction
Contact 1──0..1 Conversation 1──* Message;  Contact 1──* Message, Appointment, Task, ContactNote
SubAccount 1──* AppointmentType 1──* Appointment *──? User(host) *──? Contact
User 1──* AvailabilityRule;  User 1──* Appointment(host), Task(assignee), Message(sender)
WebhookEvent *──? Contact / *──? SubAccount ; AuditLog *──? Org/SubAccount/User
```

### Multi-tenancy access-control matrix

Legend: ✅ full, 🟡 read/update-limited, ❌ denied, 🔒 org scope only. All access additionally requires an **active membership** in the target org/sub-account.

| Capability | OWNER (org) | ADMIN (org/sub) | AGENT (sub) | CLIENT_USER (sub) | Public (no session) |
|---|---|---|---|---|---|
| Create/delete sub-accounts, manage org billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite/remove members, assign roles | ✅ | ✅ (sub: their sub) | ❌ | ❌ | ❌ |
| View dashboard/reports | 🟡 all subs | 🟡 all subs in org | 🟡 assigned sub | 🟡 own sub | ❌ |
| Contacts: create/edit/archive/delete | ✅ | ✅ | ✅ | 🟡 read + notes | ❌ |
| Contacts: bulk tag / merge | ✅ | ✅ | ✅ | ❌ | ❌ |
| Custom fields & tags admin | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pipelines: create/rename stages | ✅ | ✅ | ✅ | 🟡 move opps only | ❌ |
| Opportunities: CRUD, drag-drop stage | ✅ | ✅ | ✅ | 🟡 own opps | ❌ |
| Forms: build/publish/delete | ✅ | ✅ | ✅ | ❌ | 🟡 submit to active forms |
| Forms: public render + submit | — | — | — | — | ✅ (rate-limited) |
| Workflows: build/publish/test | ✅ | ✅ | 🟡 build, publish needs ADMIN | ❌ | ❌ |
| Conversations: send messages | ✅ | ✅ | ✅ | 🟡 reply, no bulk | ❌ |
| Appointments: types/availability admin | ✅ | ✅ | 🟡 own availability | 🟡 own availability | 🟡 book via public link |
| Booking: create appointment | — | — | — | — | ✅ (capacity-checked) |
| Tasks: CRUD | ✅ | ✅ | ✅ | 🟡 own tasks | ❌ |
| Audit log read | 🟡 org | 🟡 org | 🟡 sub | ❌ | ❌ |
| API/webhooks config | ✅ | ✅ | ❌ | ❌ | ❌ |

Enforcement points (defense in depth):

1. `requireMembership(orgId)` / `requireSubAccountAccess(subAccountId)` in every server action (403 typed error otherwise).
2. Repository methods **hard-require** `subAccountId` — no repository query exists without it.
3. Postgres Row-Level Security as phase-2 hardening (optional; app-level guards come first).
4. Ownership checks inside services for row-level nuances (e.g., CLIENT_USER sees only assigned opportunities).

### Indexing strategy

- **Hot list queries** use composite indexes led by `subAccountId` + the filter/sort columns (see `@@index` on Contact, Opportunity, Message, Appointment, AuditLog).
- **Sort-by-recency** indexes use `sort: Desc` to match `ORDER BY ... DESC` plans.
- **Dedupe lookups** (`subAccountId, emailNormalized` / `phoneNormalized`) are unique indexes → O(log n) contact upserts.
- **Job reconciliation** index `(status, resumeAt)` on `WorkflowRun` for the boot sweep.
- **Webhook idempotency** unique `idempotencyKey` → insert-and-ignore pattern.
- **Money/report aggregates** filtered by `(subAccountId, status, createdAt/wonAt)` — covered by existing indexes; if reporting queries slow down at scale, add a nightly rollup table (follow-up).
- **Double-booking** GiST exclusion constraint (raw migration): `EXCLUDE USING gist (hostUserId WITH =, tstzrange(startAt, endAt) WITH &&) WHERE status IN ('SCHEDULED','CONFIRMED')` — requires `CREATE EXTENSION btree_gist`.
- Plan: run `prisma migrate` + `EXPLAIN (ANALYZE, BUFFERS)` on the 5 core list queries during Phase 1 QA; record baselines in the ticket.

### Migration plan

1. **Baseline (Ticket 1):** `prisma migrate dev` from this schema; commit SQL migration; Docker Compose boots fresh Postgres 16.
2. **Raw SQL companion migration** in the same ticket for what Prisma can't express:
   - `btree_gist` extension + appointment exclusion constraint (partial, `WHERE status IN (...)`).
   - Optional: `pg_trgm` GIL indexes on `Contact("firstName" || ' ' || "lastName")` for fuzzy name search (add when search proves slow).
3. **Expand → migrate → contract** for any later destructive change (never edit an applied migration; add follow-ups).
4. **Seed** (`prisma/seed.ts`): 1 agency org, 2 client sub-accounts, 1 user per role, 12 demo contacts, 2 tags, 2 pipelines, 1 form, 1 active workflow, 3 appointment types, sample appointments/messages → drives empty-state and reports development.
5. **CI:** `prisma migrate deploy` against an ephemeral DB + `prisma validate` + integration tests on every PR.
6. **Production rollout:** take backup → deploy migration in a single transaction where possible → verify with `psql \d` spot checks → only then ship the feature flag for the new module.

---

## 4. Phased Implementation Roadmap

Each phase ends with a verification pause (per your development approach).

| Phase | Scope | Exit criteria (manual QA included in tickets) |
|---|---|---|
| **0 — Foundation** | Repo scaffold (Next.js 15, TS, Tailwind, shadcn, ESLint/Prettier), Docker Compose (Postgres 16 + Redis 7 w/ AOF + Mailpit), Prisma schema + migrations + seed, CI (lint/typecheck/test) | `docker compose up` + `prisma migrate dev` + `pnpm dev` boots clean; seed data visible via psql |
| **1 — Auth + tenancy shell** | Auth.js (magic link via Resend, dev-bypass code), org/sub-account provisioning, memberships/invites, RBAC guards, tenant context resolver, sub-account switcher UI, audit log writer | 4 roles each reach correct menus; cross-tenant direct URL access returns 403; audit rows written |
| **2 — Contacts CRM** | Contact CRUD, search/filter/sort/pagination, tags, custom fields, dedupe upsert, archive/soft-delete, notes, bulk tagging, contact detail + timeline shell | Duplicate form submit merges to one contact; list of 10k seeded rows paginates < 300ms |
| **3 — Pipelines** | Pipeline/stage CRUD, opportunity CRUD, drag-and-drop (dnd-kit), stage-change history, expected-close/assignment filters | Stage move writes history row; board persists across reload |
| **4 — Forms + capture** | Form builder (8 field types), publish to `/f/[publicId]`, public renderer, honeypot + rate limit + IP hash, submission → contact upsert + UTM + tags + source, user notifications queue | Real submit creates contact with UTM + triggers webhook log; honeypot submission silently dropped |
| **5 — Workflow engine** | Trigger/action model, versioned publish, BullMQ runner with per-step logging, WAIT delays (Redis + DB reconciliation), condition branches, test-run mode, all 8 triggers / 11 actions wired to services | Test run against seed contact executes steps with timings; server restart mid-WAIT resumes correctly |
| **6 — Messaging** | Unified inbox (conversation list + thread), send email (Resend) / SMS (Twilio), delivery status webhooks, inbound reply threading, opt-out handling (STOP → smsOptOutAt), outbound kill switch | Dev-mode logs `MOCK SEND`; opted-out contact blocked with typed error; inbound STOP sets opt-out |
| **7 — Appointments** | Appointment types, per-user availability rules, public `/book/[slug]` flow (service → slot → details → confirm), exclusion-constraint double-booking guard, cancel/reschedule, confirmation via workflow engine | Two parallel booking requests: one succeeds, one gets "slot taken"; no double-booked rows possible |
| **8 — Reporting** | Dashboard widgets: contacts created, leads by source, form conversion, appointment outcomes, opportunity created/won/lost, pipeline value, revenue won, workflow success/failure, date-range filter, sub-account switch | Numbers cross-checked by hand against seed SQL; date range filters update all widgets |
| **9 — Billing + hardening (post-MVP slice)** | Stripe subscription per org, webhook idempotency, plan gating, rate limiting, optional PG RLS, load pass | Stripe test-mode checkout activates plan; replayed webhook is a no-op |

---

## 5. Security & Multi-Tenancy Safeguards

1. **Tenant context is server-derived:** `subAccountId` comes from the session/URL *only after* membership verification — never from request bodies or hidden form fields.
2. **Repository-level isolation:** no Prisma query exists without a tenant predicate; CRUD methods take `TenantContext` as first argument (type-enforced).
3. **RBAC guard matrix** mirrored in code (`src/server/rbac/permissions.ts`) with unit tests asserting every role × every action — including denials.
4. **Zod at every trust boundary:** server actions, route handlers (including public form/booking), webhook payloads, job payloads.
5. **UUIDs everywhere public**; short random slugs for shareable URLs (`Form.publicId`, booking slugs); zero sequential/auto-increment ids exposed.
6. **Idempotency:** `WebhookEvent.idempotencyKey` unique + BullMQ deterministic `jobId`s → retries can't double-send or double-book.
7. **Webhook authenticity:** Stripe/Twilio/Resend signature verification with timing-safe compares before any processing; secrets never persisted to DB.
8. **Opt-out enforcement in one place:** `assertCanSend(contact, channel)` inside the outbound messaging service — every send path (UI, workflow, notification) passes through it.
9. **Outbound kill switch:** `OUTBOUND_MESSAGING_ENABLED=false` default in dev; provider adapters log `MOCK SEND` instead of calling out.
10. **Spam/abuse:** honeypot field, per-IP rate limit (Redis token bucket) on public form + booking endpoints, IP stored only as salted SHA-256 hash.
11. **Secrets:** env-only (`.env.example` committed, `.env` git-ignored); no provider secrets in Postgres; per-tenant *non-secret* config (from-number, timezone) is DB data.
12. **Audit logging** for all consequential mutations (create/update/delete/publish/role change) with actor, entity, metadata, IP hash.
13. **Auth hardening:** Auth.js with HTTP-only secure cookies, CSRF protection, magic-link single-use + expiry, invite tokens single-use, session JWT contains only `userId` (membership re-checked per request).
14. **Data safety:** soft-delete contacts (hard purge job later), `onDelete: Restrict` where financial history must survive (opportunity → stage), parameterized queries via Prisma (no raw SQL except reviewed migrations), no stack traces to clients (typed `Result` errors + logged server-side).
15. **Dependency/CI hygiene:** lockfile committed, `npm audit` in CI, lint + typecheck + tests required before merge.
16. **RE/IP constraint:** original UI/copy/branding; no decompiled or scraped proprietary assets; product patterns derived from public documentation only.

---

## 6. Third-Party Services & Environment Variables

| Service | Purpose | MVP? | Notes / verification needed |
|---|---|---|---|
| **PostgreSQL 16** (Docker) | Primary datastore | ✅ | `btree_gist` extension required |
| **Redis 7** (Docker, AOF enabled) | BullMQ queue + rate limits | ✅ | `appendonly yes` so delayed jobs survive restarts |
| **Auth.js (NextAuth v5)** | Auth (magic link + credentials option) | ✅ | Self-hosted; recommended over Clerk for white-label + zero per-end-user cost — *confirm choice* |
| **Resend** | Transactional email + magic links | ✅ | Dev falls back to Mailpit SMTP when no API key |
| **Twilio** | SMS send/receive + STOP opt-out | ✅ (Phase 6) | Status callback + inbound webhook signatures must be verified on Twilio console — *flagged as requiring verification* |
| **Stripe** | Org subscriptions (post-MVP) | Phase 9 | Checkout + webhooks; idempotency keys required |
| **Mailpit** (Docker) | Local email inbox UI | ✅ dev | Replaces real SMTP in dev |
| **Playwright** | E2E tests | ✅ CI | |

### `.env.example`

```bash
# ── core ────────────────────────────────────────
DATABASE_URL="postgresql://beacon:beacon@localhost:5432/beacon?schema=public"
REDIS_URL="redis://localhost:6379"
APP_URL="http://localhost:3000"
NODE_ENV="development"

# ── auth ────────────────────────────────────────
AUTH_SECRET="generate-with: openssl rand -base64 32"
AUTH_TRUST_HOST="true"
# magic-link login; dev bypass shows the link in Mailpit / logs
MAGIC_LINK_DEV_BYPASS="true"

# ── messaging kill switches (NEVER send for real in dev) ──
OUTBOUND_MESSAGING_ENABLED="false"
SMS_PROVIDER="twilio"          # twilio | mock
EMAIL_PROVIDER="resend"        # resend | mailpit | mock

# ── email (Resend) ─────────────────────────────
RESEND_API_KEY=""
EMAIL_FROM="Beacon <onboarding@yourdomain.com>"

# ── SMS (Twilio) ───────────────────────────────
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER=""
TWILIO_WEBHOOK_SECRET=""       # request signature validation

# ── payments (Stripe) ──────────────────────────
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_PRICE_ID_PRO=""

# ── ops ─────────────────────────────────────────
LOG_LEVEL="info"
IP_HASH_PEPPER=""              # rotating pepper for IP hashing
```

---

## 7. First Five Implementation Tickets (dependency-ordered)

### T1 — Repo foundation & database baseline
- **Goal:** runnable dev environment with the full MVP schema migrated and seeded.
- **Touches:** root scaffold, `docker-compose.yml`, `prisma/schema.prisma` (from §3) + raw SQL migration (extension + exclusion constraint), `prisma/seed.ts`, CI workflow, `.env.example`.
- **Acceptance:** `docker compose up -d` → `prisma migrate dev` → `prisma db seed` all green; `pnpm lint && pnpm typecheck && pnpm test` pass in CI; `psql` shows 30+ tables.
- **QA:** fresh clone → zero manual fixes to boot.

### T2 — Auth, tenancy context & RBAC guards
- **Goal:** users log in; every request knows `{ orgId, subAccountId, userId, role }`; access denied by default.
- **Touches:** Auth.js config, `src/server/tenant/*`, `src/server/rbac/*` (+ permission matrix + tests), audit writer, invite/accept flow, org + sub-account provisioning actions, middleware protecting `/(app)`.
- **Acceptance:** each of the 4 roles can log in; cross-tenant URL probing returns typed 403; RBAC test suite covers role × action incl. denials; audit rows written for membership changes.
- **QA:** seed the four `@demo.local` users, request each sign-in link, then verify `OWNER`, `ADMIN`, `AGENT`, and `CLIENT_USER` permissions and cross-tenant denials before using an invitation as a second user.

### T3 — App shell: sub-account switcher & navigation
- **Goal:** authenticated dashboard chrome with working tenant switching and empty states.
- **Touches:** `(app)` layout, sidebar/topbar, sub-account switcher (writes active sub-account to cookie → server reads → validated against membership), shadcn setup, loading/error/empty components, dashboard placeholder page.
- **Acceptance:** switching sub-account updates data scope everywhere; refresh preserves selection; deep links `/s/[subAccountId]/...` enforce membership; mobile nav usable.
- **QA:** keyboard-only navigation pass, 375px viewport pass.

### T4 — Contacts module (CRM core)
- **Goal:** full contact lifecycle with dedupe, tags, custom fields, search/pagination.
- **Touches:** `Contact`/`Tag`/`CustomField*`/`ContactNote` repositories + services, `features/contacts` (list w/ server-component pagination, detail, create/edit drawer, bulk tag, archive), Zod schemas, dedupe normalize utils (email lowercase/trim, phone E.164), timeline shell (placeholders for later phases), audit events.
- **Acceptance:** create/update/archive/bulk-tag work per RBAC; duplicate email/phone upserts merge instead of insert; custom fields validate by type; list filters (status/source/owner/tag) combine; 10k-row seed paginates fast; unit tests for normalizer + dedupe service.
- **QA:** empty state → create first contact → bulk import 100 CSV rows (manual paste flow acceptable for MVP) → dedupe check → archive/restore.

### T5 — Pipelines & opportunities
- **Goal:** multi-pipeline boards with drag-and-drop and stage history.
- **Touches:** `Pipeline`/`PipelineStage`/`Opportunity`/`OpportunityStageHistory` repos + services, `features/pipelines` (board, stage editor, opportunity drawer, filters by assignee/expected close/value), dnd-kit drag between columns, workflow trigger hook stub `OPPORTUNITY_STAGE_CHANGED` (event bus only; engine lands Phase 5), audit events.
- **Acceptance:** stage move updates `stageId`, appends history row, persists reload; won/lost terminal stages set `wonAt`/`lostAt` + `status`; RBAC: CLIENT_USER limited to assigned opps; invalid cross-pipeline stage move rejected by Zod/service.
- **QA:** create pipeline → drag 5 opps across stages → verify history rows via SQL → reload board → filter by assignee.

**Dependency chain:** T1 → T2 → T3 → T4 → T5 (each ticket ships behind green CI; I'll pause after each for your verification.)

---

## Open decisions before I start coding

1. **Product name** — keep placeholder `Beacon`, or give me yours? (affects package name, `from` email, copy)
2. **Auth:** Auth.js recommended (self-hosted, white-label, no per-user fees). Clerk OK if you prefer managed UX. **Default if no reply: Auth.js.**
3. **Schema notes (§3):** review the 5 numbered design notes — accept as-is, or want stricter variants now?
4. **Package manager:** pnpm (recommended) vs npm?
