import "server-only";
import { requireTenantContext } from "@/server/tenant/context";
import { listWorkflows as svcList } from "@/server/services/workflows";

export async function getWorkflowsList(subAccountId: string) {
  const ctx = await requireTenantContext(subAccountId);
  return svcList(ctx);
}
