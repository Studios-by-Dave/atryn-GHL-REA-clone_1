import "server-only";

import { requireTenantContext } from "@/server/tenant/context";
import {
  getFormDetail,
  getFormSubmissions,
  getForms,
  getNotifyCandidates,
} from "@/server/services/forms";

export async function getFormsList(subAccountId: string) {
  const context = await requireTenantContext(subAccountId);
  return getForms(context);
}

export async function getFormBuilder(subAccountId: string, formId: string) {
  const context = await requireTenantContext(subAccountId);
  return getFormDetail(context, formId);
}

export async function getFormSubmissionList(subAccountId: string, formId: string) {
  const context = await requireTenantContext(subAccountId);
  return getFormSubmissions(context, formId);
}

export async function getFormNotifyCandidates(subAccountId: string) {
  const context = await requireTenantContext(subAccountId);
  return getNotifyCandidates(context);
}
