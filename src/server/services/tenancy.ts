import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import { writeAuditLog } from "@/server/audit/write";
import { sendAuthEmail, assertAuthEmailConfigured } from "@/server/auth/email";
import { ForbiddenError, InvitationError } from "@/server/auth/errors";
import type { TenantContext } from "@/server/rbac/guards";
import { canAssignRole } from "@/server/rbac/permissions";

type ProvisioningInput = {
  organizationName: string;
  subAccountName: string;
};

function createSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${randomBytes(4).toString("hex")}`;
}

export async function provisionOrganization(
  userId: string,
  input: ProvisioningInput,
): Promise<{ orgId: string; subAccountId: string }> {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: createSlug(input.organizationName),
      },
    });
    const subAccount = await tx.subAccount.create({
      data: {
        orgId: org.id,
        name: input.subAccountName,
        slug: createSlug(input.subAccountName),
      },
    });

    await tx.orgMembership.create({
      data: { orgId: org.id, userId, role: "OWNER", status: "ACTIVE" },
    });
    await tx.subAccountMembership.create({
      data: {
        subAccountId: subAccount.id,
        userId,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await writeAuditLog(tx, {
      orgId: org.id,
      subAccountId: subAccount.id,
      userId,
      action: "organization.provision",
      entityType: "Organization",
      entityId: org.id,
      metadata: { subAccountId: subAccount.id },
    });
    await writeAuditLog(tx, {
      orgId: org.id,
      subAccountId: subAccount.id,
      userId,
      action: "membership.create",
      entityType: "OrgMembership",
      entityId: userId,
      metadata: { role: "OWNER" },
    });
    await writeAuditLog(tx, {
      orgId: org.id,
      subAccountId: subAccount.id,
      userId,
      action: "membership.create",
      entityType: "SubAccountMembership",
      entityId: userId,
      metadata: { role: "ADMIN" },
    });

    return { orgId: org.id, subAccountId: subAccount.id };
  });
}

type InvitationInput = {
  email: string;
  role: UserRole;
  scope: "organization" | "subAccount";
};

export async function inviteMember(
  context: TenantContext,
  input: InvitationInput,
): Promise<{ invitationId: string }> {
  const roleAllowedInScope =
    input.scope === "organization"
      ? input.role === "ADMIN" || input.role === "AGENT"
      : input.role === "ADMIN" ||
        input.role === "AGENT" ||
        input.role === "CLIENT_USER";

  if (!roleAllowedInScope || !canAssignRole(context.role, input.role)) {
    throw new ForbiddenError("Your role cannot assign the requested membership role.");
  }
  assertAuthEmailConfigured();

  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const subAccountId =
    input.scope === "subAccount" ? context.subAccountId : null;
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL is required to create an invitation link.");
  }
  const inviteUrl = new URL("/invite", appUrl);
  inviteUrl.searchParams.set("token", token);

  const invitation = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: context.orgId },
      select: { id: true },
    });
    if (!organization) {
      throw new ForbiddenError();
    }

    await tx.invitation.updateMany({
      where: {
        orgId: context.orgId,
        subAccountId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });

    const created = await tx.invitation.create({
      data: {
        orgId: context.orgId,
        subAccountId,
        invitedByUserId: context.userId,
        email,
        role: input.role,
        tokenHash,
        expiresAt,
      },
    });
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId,
      userId: context.userId,
      action: "membership.invite",
      entityType: "Invitation",
      entityId: created.id,
      metadata: { email, role: input.role },
    });
    return created;
  });

  try {
    await sendAuthEmail({
      to: email,
      subject: "You have been invited to Atryn",
      url: inviteUrl.toString(),
    });
  } catch (error) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { expiresAt: new Date() },
        });
        await writeAuditLog(tx, {
          orgId: context.orgId,
          subAccountId,
          userId: context.userId,
          action: "membership.invitation_delivery_failed",
          entityType: "Invitation",
          entityId: invitation.id,
        });
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Invitation email failed and the invitation could not be revoked.",
      );
    }
    throw error;
  }

  return { invitationId: invitation.id };
}

export async function acceptInvitation(
  userId: string,
  token: string,
): Promise<{ orgId: string; subAccountId: string | null }> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        orgId: true,
        subAccountId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= now
    ) {
      throw new InvitationError("This invitation is invalid, expired, or already used.");
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });
    if (
      !user?.emailVerified ||
      user.email.toLowerCase() !== invitation.email.toLowerCase()
    ) {
      throw new InvitationError(
        "Sign in with the verified email address that received the invitation.",
      );
    }

    if (invitation.subAccountId) {
      const existing = await tx.subAccountMembership.findUnique({
        where: {
          subAccountId_userId: {
            subAccountId: invitation.subAccountId,
            userId,
          },
        },
        select: { status: true },
      });
      if (existing?.status === "SUSPENDED") {
        throw new InvitationError("A suspended membership cannot be reactivated by invitation.");
      }
      await tx.subAccountMembership.upsert({
        where: {
          subAccountId_userId: {
            subAccountId: invitation.subAccountId,
            userId,
          },
        },
        create: {
          subAccountId: invitation.subAccountId,
          userId,
          role: invitation.role,
          status: "ACTIVE",
        },
        update: { role: invitation.role, status: "ACTIVE" },
      });
    } else {
      const existing = await tx.orgMembership.findUnique({
        where: { orgId_userId: { orgId: invitation.orgId, userId } },
        select: { status: true },
      });
      if (existing?.status === "SUSPENDED") {
        throw new InvitationError("A suspended membership cannot be reactivated by invitation.");
      }
      await tx.orgMembership.upsert({
        where: { orgId_userId: { orgId: invitation.orgId, userId } },
        create: {
          orgId: invitation.orgId,
          userId,
          role: invitation.role,
          status: "ACTIVE",
        },
        update: { role: invitation.role, status: "ACTIVE" },
      });
    }

    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) {
      throw new InvitationError("This invitation has already been accepted.");
    }

    await writeAuditLog(tx, {
      orgId: invitation.orgId,
      subAccountId: invitation.subAccountId,
      userId,
      action: "membership.accept",
      entityType: invitation.subAccountId
        ? "SubAccountMembership"
        : "OrgMembership",
      entityId: userId,
      metadata: { role: invitation.role, invitationId: invitation.id },
    });

    return {
      orgId: invitation.orgId,
      subAccountId: invitation.subAccountId,
    };
  });
}
