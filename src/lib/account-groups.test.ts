import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_ACCOUNT_GROUP_ID,
  DEFAULT_ACCOUNT_GROUPS,
  UNGROUPED_ACCOUNT_GROUP_ID,
  createDefaultAccountLayout,
  deleteAccountGroup,
  getAccountGroupId,
  moveAccountGroup,
  normalizeAccountLayout,
  validateAccountLayoutPatch,
  type AccountLayoutState,
  type GroupableAccount,
} from "./account-groups";

const accounts: GroupableAccount[] = [
  { id: "main", accountCategory: "PRIMARY", storeId: "store" },
  { id: "child", parentId: "main", storeId: "store" },
  { id: "platform", accountType: "平台" },
  { id: "payout", accountPurpose: "店铺回款" },
  { id: "ordinary" },
];

test("new layouts use independent default groups and category precedence", () => {
  const state = createDefaultAccountLayout();
  assert.deepEqual(accounts.map((account) => getAccountGroupId(account, state)), ["primary", "sub", "platform", "platform", "other"]);
  assert.equal(getAccountGroupId({ id: "store", storeId: "store" }, state), "platform");
  state.groups[0].name = "Renamed";
  state.groups.pop();
  assert.deepEqual(createDefaultAccountLayout().groups, DEFAULT_ACCOUNT_GROUPS);
  assert.deepEqual(normalizeAccountLayout(null), createDefaultAccountLayout());
});

test("explicit placements override inferred account categories", () => {
  const state = createDefaultAccountLayout();
  state.assignments = { main: "other", child: UNGROUPED_ACCOUNT_GROUP_ID, platform: "deleted" };
  assert.equal(getAccountGroupId(accounts[0], state), "other");
  assert.equal(getAccountGroupId(accounts[1], state), UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(getAccountGroupId(accounts[2], state), UNGROUPED_ACCOUNT_GROUP_ID);
});

test("deleting an occupied default group moves its inferred and explicit members only", () => {
  const state = createDefaultAccountLayout();
  state.assignments = { hidden: "primary", child: "primary", ordinary: "sub" };
  state.accountOrder = ["hidden", "main", "ordinary", "child"];
  const snapshot = structuredClone({ state, accounts });
  const next = deleteAccountGroup(state, "primary", accounts);
  assert.deepEqual(next.groups.map((group) => group.id), ["sub", "platform", "other"]);
  assert.deepEqual(next.assignments, {
    hidden: UNGROUPED_ACCOUNT_GROUP_ID,
    main: UNGROUPED_ACCOUNT_GROUP_ID,
    child: UNGROUPED_ACCOUNT_GROUP_ID,
    ordinary: "sub",
  });
  assert.strictEqual(next.accountOrder, state.accountOrder);
  assert.deepEqual({ state, accounts }, snapshot);
  assert.equal(getAccountGroupId({ id: "new-primary", accountCategory: "PRIMARY" }, next), UNGROUPED_ACCOUNT_GROUP_ID);
});

test("deleting a custom group preserves assignments for hidden accounts and other groups", () => {
  const state = createDefaultAccountLayout();
  state.groups.push({ id: "custom", name: "项目账户" });
  state.assignments = { main: "custom", hiddenAccount: "custom", child: "platform", ordinary: UNGROUPED_ACCOUNT_GROUP_ID };
  const next = deleteAccountGroup(state, "custom", accounts);
  assert.deepEqual(next.groups, DEFAULT_ACCOUNT_GROUPS);
  assert.deepEqual(next.assignments, {
    main: UNGROUPED_ACCOUNT_GROUP_ID,
    hiddenAccount: UNGROUPED_ACCOUNT_GROUP_ID,
    child: "platform",
    ordinary: UNGROUPED_ACCOUNT_GROUP_ID,
  });
  assert.equal(getAccountGroupId(accounts[0], next), UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(getAccountGroupId(accounts[1], next), "platform");
});

test("other is deletable and its implicit members do not fall back into another group", () => {
  const next = deleteAccountGroup(createDefaultAccountLayout(), "other", accounts);
  assert.equal(next.groups.some((group) => group.id === "other"), false);
  assert.equal(next.assignments.ordinary, UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(getAccountGroupId({ id: "future-other" }, next), UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(getAccountGroupId(accounts[2], next), "platform");
});

test("deleting every group persists an empty layout without resurrection on reload", () => {
  const state = DEFAULT_ACCOUNT_GROUPS.reduce(
    (current, group) => deleteAccountGroup(current, group.id, accounts),
    createDefaultAccountLayout(),
  );
  assert.deepEqual(state.groups, []);
  assert.ok(accounts.every((account) => state.assignments[account.id] === UNGROUPED_ACCOUNT_GROUP_ID));
  const reloaded = normalizeAccountLayout(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded, state);
  assert.deepEqual(normalizeAccountLayout({ groups: [], assignments: {}, accountOrder: [] }).groups, []);
  assert.equal(getAccountGroupId({ id: "new", accountCategory: "PRIMARY" }, reloaded), UNGROUPED_ACCOUNT_GROUP_ID);
});

test("deleting a missing or virtual group is a no-op", () => {
  const state = createDefaultAccountLayout();
  for (const groupId of ["missing", ALL_ACCOUNT_GROUP_ID, UNGROUPED_ACCOUNT_GROUP_ID]) {
    assert.strictEqual(deleteAccountGroup(state, groupId, accounts), state);
  }
});

test("restoring a deleted category later does not pull explicitly ungrouped accounts back", () => {
  const next = deleteAccountGroup(createDefaultAccountLayout(), "primary", accounts);
  next.groups.push({ id: "primary", name: "恢复主账户" });
  assert.equal(getAccountGroupId(accounts[0], next), UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(getAccountGroupId({ id: "new-main", accountCategory: "PRIMARY" }, next), "primary");
});

test("tab reorder moves in both directions without changing assignments or account ordering", () => {
  const state: AccountLayoutState = {
    ...createDefaultAccountLayout(),
    assignments: { main: "primary", hidden: "sub", ordinary: UNGROUPED_ACCOUNT_GROUP_ID },
    accountOrder: ["hidden", "main"],
  };
  const forward = moveAccountGroup(state, "primary", "platform");
  assert.deepEqual(forward.groups.map((group) => group.id), ["sub", "platform", "primary", "other"]);
  assert.strictEqual(forward.assignments, state.assignments);
  assert.strictEqual(forward.accountOrder, state.accountOrder);
  const backward = moveAccountGroup(forward, "primary", "sub");
  assert.deepEqual(backward, state);
  assert.deepEqual(state.groups, DEFAULT_ACCOUNT_GROUPS);
  assert.deepEqual(normalizeAccountLayout(JSON.parse(JSON.stringify(forward))), forward);
});

test("reordering virtual tabs, unknown groups, or the same group is a no-op", () => {
  const state = createDefaultAccountLayout();
  for (const [source, target] of [
    ["primary", "primary"], ["missing", "primary"], ["primary", "missing"],
    [ALL_ACCOUNT_GROUP_ID, "primary"], ["primary", ALL_ACCOUNT_GROUP_ID],
    [UNGROUPED_ACCOUNT_GROUP_ID, "primary"], ["primary", UNGROUPED_ACCOUNT_GROUP_ID],
  ]) {
    assert.strictEqual(moveAccountGroup(state, source, target), state);
  }
});

test("normalization sanitizes malformed persisted data without losing hidden account intent", () => {
  const state = normalizeAccountLayout({
    groups: [null, {}, { id: 1, name: "bad" }, { id: "", name: "bad" }, { id: "blank", name: " " },
      { id: ALL_ACCOUNT_GROUP_ID, name: "all" }, { id: UNGROUPED_ACCOUNT_GROUP_ID, name: "ungrouped" },
      { id: "custom", name: " Custom " }, { id: "custom", name: "duplicate" }],
    assignments: { main: "custom", hidden: "deleted", ungrouped: UNGROUPED_ACCOUNT_GROUP_ID, all: ALL_ACCOUNT_GROUP_ID, bad: 1, blank: "", "": "custom" },
    accountOrder: ["hidden", "main", "hidden", 1, null, "", " ", "unknown-to-view"],
  });
  assert.deepEqual(state.groups, [{ id: "custom", name: "Custom" }]);
  assert.deepEqual(state.assignments, {
    main: "custom", hidden: UNGROUPED_ACCOUNT_GROUP_ID, ungrouped: UNGROUPED_ACCOUNT_GROUP_ID, all: UNGROUPED_ACCOUNT_GROUP_ID,
  });
  assert.deepEqual(state.accountOrder, ["hidden", "main", "unknown-to-view"]);
  assert.deepEqual(normalizeAccountLayout({ groups: [null, {}] }).groups, []);
  assert.deepEqual(normalizeAccountLayout({ assignments: [], accountOrder: {} }).assignments, {});
});

test("normalization and lookup safely handle inherited-looking account IDs", () => {
  const state = normalizeAccountLayout(JSON.parse('{"groups":[{"id":"custom","name":"Custom"}],"assignments":{"__proto__":"custom","constructor":"custom"}}'));
  assert.equal(Object.prototype.hasOwnProperty.call(state.assignments, "__proto__"), true);
  assert.equal(getAccountGroupId({ id: "__proto__" }, state), "custom");
  assert.equal(getAccountGroupId({ id: "toString" }, state), UNGROUPED_ACCOUNT_GROUP_ID);
  const next = deleteAccountGroup(state, "custom", []);
  assert.equal(next.assignments.__proto__, UNGROUPED_ACCOUNT_GROUP_ID);
  assert.equal(next.assignments.constructor, UNGROUPED_ACCOUNT_GROUP_ID);
});

test("write validation accepts empty groups, partial writes, and ungrouped references", () => {
  for (const value of [
    {}, { groups: [] }, { assignments: {} }, { accountOrder: [] }, createDefaultAccountLayout(),
    { assignments: { hidden: "deleted-group", main: UNGROUPED_ACCOUNT_GROUP_ID } },
    { accountOrder: ["hidden", "visible", "hidden"] },
  ]) {
    assert.equal(validateAccountLayoutPatch(value), null);
  }
});

test("write validation rejects malformed fields instead of accidentally clearing groups", () => {
  for (const value of [
    null, [], "bad", { groups: null }, { groups: {} }, { groups: [null] }, { groups: [{}] },
    { groups: [{ id: 7, name: "Bad" }] }, { groups: [{ id: "bad", name: 7 }] },
    { groups: [{ id: " ", name: "Bad" }] }, { groups: [{ id: "bad", name: " " }] },
    { groups: [{ id: ALL_ACCOUNT_GROUP_ID, name: "All" }] },
    { groups: [{ id: UNGROUPED_ACCOUNT_GROUP_ID, name: "Ungrouped" }] },
    { groups: [{ id: "duplicate", name: "First" }, { id: "duplicate", name: "Second" }] },
    { assignments: null }, { assignments: [] }, { assignments: { account: null } },
    { assignments: { account: 4 } }, { assignments: { "": "other" } },
    { accountOrder: null }, { accountOrder: {} }, { accountOrder: [1] }, { accountOrder: [""] },
  ]) {
    assert.equal(typeof validateAccountLayoutPatch(value), "string", JSON.stringify(value));
  }
});
