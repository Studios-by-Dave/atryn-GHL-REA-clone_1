import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { slug: "demo-agency" },
    update: {},
    create: {
      name: "Demo Agency",
      slug: "demo-agency",
      timezone: "America/New_York",
    },
  });

  const subAccount = await prisma.subAccount.upsert({
    where: { slug: "demo-client" },
    update: {},
    create: {
      orgId: org.id,
      name: "Demo Client Co",
      slug: "demo-client",
      timezone: "America/New_York",
      bookingSlug: "demo-client-co",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.local" },
    update: {},
    create: {
      email: "owner@demo.local",
      name: "Demo Owner",
      timezone: "America/New_York",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: { email: "admin@demo.local", name: "Demo Admin" },
  });
  const agent = await prisma.user.upsert({
    where: { email: "agent@demo.local" },
    update: {},
    create: { email: "agent@demo.local", name: "Demo Agent" },
  });
  const clientUser = await prisma.user.upsert({
    where: { email: "client@demo.local" },
    update: {},
    create: { email: "client@demo.local", name: "Demo Client User" },
  });

  const demoMemberships = [
    { user: owner, orgRole: "OWNER" as const, subRole: "ADMIN" as const },
    { user: admin, orgRole: "ADMIN" as const, subRole: "ADMIN" as const },
    { user: agent, orgRole: "AGENT" as const, subRole: "AGENT" as const },
    { user: clientUser, orgRole: null, subRole: "CLIENT_USER" as const },
  ];

  for (const membership of demoMemberships) {
    if (membership.orgRole) {
      await prisma.orgMembership.upsert({
        where: {
          orgId_userId: { orgId: org.id, userId: membership.user.id },
        },
        update: { role: membership.orgRole, status: "ACTIVE" },
        create: {
          orgId: org.id,
          userId: membership.user.id,
          role: membership.orgRole,
        },
      });
    }
    await prisma.subAccountMembership.upsert({
      where: {
        subAccountId_userId: {
          subAccountId: subAccount.id,
          userId: membership.user.id,
        },
      },
      update: { role: membership.subRole, status: "ACTIVE" },
      create: {
        subAccountId: subAccount.id,
        userId: membership.user.id,
        role: membership.subRole,
      },
    });
  }

  const tag = await prisma.tag.upsert({
    where: { subAccountId_name: { subAccountId: subAccount.id, name: "demo" } },
    update: {},
    create: { subAccountId: subAccount.id, name: "demo", color: "#6366f1" },
  });

  const contact = await prisma.contact.upsert({
    where: {
      subAccountId_emailNormalized: {
        subAccountId: subAccount.id,
        emailNormalized: "jane@example.com",
      },
    },
    update: {},
    create: {
      subAccountId: subAccount.id,
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      emailNormalized: "jane@example.com",
      phone: "+15551234567",
      phoneNormalized: "+15551234567",
      company: "Doe Plumbing",
      source: "seed",
      ownerUserId: owner.id,
      tags: { create: [{ tagId: tag.id }] },
    },
  });

  const pipeline = await prisma.pipeline.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      subAccountId: subAccount.id,
      name: "Default Pipeline",
      isDefault: true,
      stages: {
        create: [
          { name: "New", position: 0, probability: 10 },
          { name: "Qualified", position: 1, probability: 25 },
          { name: "Proposal", position: 2, probability: 50 },
          { name: "Won", position: 3, probability: 100, isWon: true },
          { name: "Lost", position: 4, probability: 0, isLost: true },
        ],
      },
    },
  });

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id },
    orderBy: { position: "asc" },
  });
  const newStage = stages.find((s) => s.name === "New");
  if (!newStage) throw new Error("seed stages missing");

  await prisma.opportunity.upsert({
    where: { id: "00000000-0000-0000-0000-00000000000a" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-00000000000a",
      subAccountId: subAccount.id,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: "Website redesign — Doe Plumbing",
      value: 4500,
      currency: "USD",
      assignedUserId: owner.id,
      source: "seed",
    },
  });

  await prisma.appointmentType.upsert({
    where: { slug: "intro-call" },
    update: {},
    create: {
      subAccountId: subAccount.id,
      name: "Intro Call",
      slug: "intro-call",
      durationMinutes: 30,
      bufferMinutes: 10,
      location: "Google Meet",
      reminderIntervalsMinutes: [60, 1440],
    },
  });

  console.log("Seed complete:", {
    org: org.slug,
    subAccount: subAccount.slug,
    contact: contact.email,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
