export const ALL_ACCOUNT_GROUP_ID = "all";
export const UNGROUPED_ACCOUNT_GROUP_ID = "__ungrouped__";

export type AccountGroup = { id: string; name: string };
export type AccountGroupState = { groups: AccountGroup[]; assignments: Record<string, string> };
export type AccountLayoutState = AccountGroupState & { accountOrder: string[] };

export type GroupableAccount = {
  id: string;
  accountCategory?: string | null;
  parentId?: string | null;
  storeId?: string | null;
  accountType?: string | null;
  accountPurpose?: string | null;
};

export const DEFAULT_ACCOUNT_GROUPS: AccountGroup[] = [
  { id: "primary", name: "主账户" },
  { id: "sub", name: "子账户" },
  { id: "platform", name: "平台收款" },
  { id: "other", name: "其他账户" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealGroupId(id: string): boolean {
  return id !== ALL_ACCOUNT_GROUP_ID && id !== UNGROUPED_ACCOUNT_GROUP_ID;
}

export function createDefaultAccountLayout(): AccountLayoutState {
  return {
    groups: DEFAULT_ACCOUNT_GROUPS.map((group) => ({ ...group })),
    assignments: {},
    accountOrder: [],
  };
}

/** Normalize persisted layouts without restoring groups that were deliberately deleted. */
export function normalizeAccountLayout(value: unknown): AccountLayoutState {
  const raw = isRecord(value) ? value : {};
  const seenGroupIds = new Set<string>();
  const groups: AccountGroup[] = [];
  const sourceGroups = Array.isArray(raw.groups) ? raw.groups : createDefaultAccountLayout().groups;
  for (const group of sourceGroups) {
    if (!isRecord(group) || !isNonemptyString(group.id) || !isNonemptyString(group.name)) continue;
    if (!isRealGroupId(group.id) || seenGroupIds.has(group.id)) continue;
    seenGroupIds.add(group.id);
    groups.push({ id: group.id, name: group.name.trim() });
  }

  // Unknown references record an intentional placement. Keep them explicitly
  // ungrouped instead of letting the account fall back into another default group.
  const assignments = Object.fromEntries(
    Object.entries(isRecord(raw.assignments) ? raw.assignments : {})
      .filter(([accountId, groupId]) => isNonemptyString(accountId) && isNonemptyString(groupId))
      .map(([accountId, groupId]) => [
        accountId,
        typeof groupId === "string" && seenGroupIds.has(groupId) ? groupId : UNGROUPED_ACCOUNT_GROUP_ID,
      ]),
  );
  const accountOrder = Array.isArray(raw.accountOrder)
    ? Array.from(new Set(raw.accountOrder.filter(isNonemptyString)))
    : [];
  return { groups, assignments, accountOrder };
}

/** Validate writes before normalization, so a malformed payload cannot clear a layout. */
export function validateAccountLayoutPatch(value: unknown): string | null {
  if (!isRecord(value)) return "账户分组配置必须是对象";
  if (Object.prototype.hasOwnProperty.call(value, "groups")) {
    if (!Array.isArray(value.groups)) return "账户分组必须是数组";
    const ids = new Set<string>();
    for (const group of value.groups) {
      if (!isRecord(group) || !isNonemptyString(group.id) || !isNonemptyString(group.name)) {
        return "账户分组必须包含有效的分组标识和名称";
      }
      if (!isRealGroupId(group.id)) return "全部账户和未分组不能作为自定义分组保存";
      if (ids.has(group.id)) return "账户分组标识不能重复";
      ids.add(group.id);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "assignments")) {
    if (!isRecord(value.assignments)) return "账户分组归属必须是对象";
    if (Object.entries(value.assignments).some(([id, groupId]) => !isNonemptyString(id) || !isNonemptyString(groupId))) {
      return "账户分组归属必须包含有效的账户和分组标识";
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "accountOrder")) {
    if (!Array.isArray(value.accountOrder) || !value.accountOrder.every(isNonemptyString)) {
      return "账户排序必须是有效账户标识组成的数组";
    }
  }
  return null;
}

export function getAccountGroupId(account: GroupableAccount, state: AccountGroupState): string {
  if (Object.prototype.hasOwnProperty.call(state.assignments, account.id)) {
    const assigned = state.assignments[account.id];
    return assigned === UNGROUPED_ACCOUNT_GROUP_ID || state.groups.some((group) => group.id === assigned)
      ? assigned
      : UNGROUPED_ACCOUNT_GROUP_ID;
  }
  const defaultId = account.accountCategory === "PRIMARY"
    ? "primary"
    : account.parentId
      ? "sub"
      : account.storeId || account.accountType === "平台" || /平台|店铺|收款|回款/i.test(account.accountPurpose || "")
        ? "platform"
        : "other";
  return state.groups.some((group) => group.id === defaultId) ? defaultId : UNGROUPED_ACCOUNT_GROUP_ID;
}

/** Remove only layout metadata; account records and account ordering stay unchanged. */
export function deleteAccountGroup<T extends AccountGroupState>(
  state: T,
  groupId: string,
  accounts: readonly GroupableAccount[],
): T {
  if (!isRealGroupId(groupId) || !state.groups.some((group) => group.id === groupId)) return state;
  const assignments = new Map(Object.entries(state.assignments));
  // Include persisted assignments for accounts not present in the current view.
  for (const [accountId, assigned] of assignments) {
    if (assigned === groupId) assignments.set(accountId, UNGROUPED_ACCOUNT_GROUP_ID);
  }
  for (const account of accounts) {
    if (getAccountGroupId(account, state) === groupId) assignments.set(account.id, UNGROUPED_ACCOUNT_GROUP_ID);
  }
  return {
    ...state,
    groups: state.groups.filter((group) => group.id !== groupId),
    assignments: Object.fromEntries(assignments),
  };
}

/** Match account-card drag ordering: move the source into the target's original index. */
export function moveAccountGroup<T extends AccountGroupState>(state: T, sourceId: string, targetId: string): T {
  if (sourceId === targetId || !isRealGroupId(sourceId) || !isRealGroupId(targetId)) return state;
  const sourceIndex = state.groups.findIndex((group) => group.id === sourceId);
  const targetIndex = state.groups.findIndex((group) => group.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return state;
  const groups = [...state.groups];
  const [moved] = groups.splice(sourceIndex, 1);
  groups.splice(targetIndex, 0, moved);
  return { ...state, groups };
}
