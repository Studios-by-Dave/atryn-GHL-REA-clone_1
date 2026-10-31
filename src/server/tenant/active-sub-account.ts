export function selectActiveSubAccount<T extends { id: string }>(
  subAccounts: readonly T[],
  requestedId: string | undefined,
): T | null {
  return (
    subAccounts.find((subAccount) => subAccount.id === requestedId) ??
    subAccounts[0] ??
    null
  );
}
