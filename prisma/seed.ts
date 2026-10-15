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

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: owner.id } },
    update: {},
    create: { orgId: org.id, userId: owner.id, role: "OWNER" },
  });

  await prisma.subAccountMembership.upsert({
    where: {
      subAccountId_userId: { subAccountId: subAccount.id, userId: owner.id },
    },
    update: {},
    create: {
      subAccountId: subAccount.id,
      userId: owner.id,
      role: "ADMIN",
    },
  });

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
