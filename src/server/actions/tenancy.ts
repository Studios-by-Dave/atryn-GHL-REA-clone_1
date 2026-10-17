"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireTenantContext, requireAuthenticatedUser } from "@/server/tenant/context";
import { requirePermission } from "@/server/rbac/guards";
import {
  acceptInvitation,
  inviteMember as inviteMemberService,
  provisionOrganization,
} from "@/server/services/tenancy";

const provisionSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  subAccountName: z.string().trim().min(2).max(120),
});

const inviteSchema = z.object({
  subAccountId: z.string().uuid(),
  email: z.email().trim().toLowerCase(),
  role: z.enum(["ADMIN", "AGENT", "CLIENT_USER"]),
  scope: z.enum(["organization", "subAccount"]),
});

const tokenSchema = z.string().min(40).max(100);

export async function createOrganization(input: unknown) {
  const parsed = provisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new TypeError("Organization and sub-account names must be 2–120 characters.");
  }
  const user = await requireAuthenticatedUser();
  return provisionOrganization(user.id, parsed.data);
}

export async function inviteMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    throw new TypeError("The invitation details are invalid.");
  }
  const context = await requireTenantContext(parsed.data.subAccountId);
  requirePermission(context, "members.invite");
  return inviteMemberService(context, {
    email: parsed.data.email,
    role: parsed.data.role,
    scope: parsed.data.scope,
  });
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) {
    throw new TypeError("The invitation token is invalid.");
  }
  const user = await requireAuthenticatedUser();
  await acceptInvitation(user.id, parsed.data);
  redirect("/");
}
