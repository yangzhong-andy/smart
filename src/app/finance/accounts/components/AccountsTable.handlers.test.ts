import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import * as groups from "../../../../lib/account-groups";

// Handler-level regression tests, not browser/React lifecycle tests. No DOM test
// renderer is installed. Execute the actual TSX functions/inline callbacks after
// AST extraction; replace only state setters, browser storage and HTTP boundaries.
const file = ts.createSourceFile("AccountsTable.tsx", readFileSync(join(process.cwd(),
  "src/app/finance/accounts/components/AccountsTable.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(file);

function declaration(name: string) {
  const node = nodes.find((item) => (ts.isVariableDeclaration(item) || ts.isFunctionDeclaration(item)) && item.name?.getText(file) === name);
  assert.ok(node, `Missing production declaration: ${name}`);
  if (ts.isVariableDeclaration(node)) {
    assert.ok(node.initializer);
    return node.initializer;
  }
  return node;
}

function attribute(title: string, name: string) {
  const element = nodes.find((node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === "title" &&
      prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === title));
  assert.ok(element && (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)), `Missing element: ${title}`);
  const prop = element.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(file) === name);
  assert.ok(prop && ts.isJsxAttribute(prop) && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression);
  return prop.initializer.expression;
}

// Dynamic values deliberately model already-committed renders, not hook scheduling.
type Scope = Record<string, any>;
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function evaluate(scope: Scope, expression: ts.Node, name = "result") {
  const code = ts.transpileModule(`globalThis[${JSON.stringify(name)}] = (${expression.getText(file)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInContext(code, scope);
  return scope[name];
}

function harness(layout = groups.createDefaultAccountLayout()) {
  const storage = new Map<string, string>();
  const writes: Array<[string, string]> = [];
  const requests: groups.AccountLayoutState[] = [];
  const errors: string[] = [];
  const scope: Scope = createContext({
    ...groups, ALL_GROUP_ID: groups.ALL_ACCOUNT_GROUP_ID, Error,
    accountGroups: structuredClone(layout), accountOrder: [...layout.accountOrder],
    allAccounts: [
      { id: "main", accountCategory: "PRIMARY" }, { id: "ordinary" },
      { id: "child", parentId: "main" }, { id: "filtered-out" },
    ],
    accounts: [{ id: "ordinary" }, { id: "main", accountCategory: "PRIMARY" }],
    canChangeLayout: true, layoutMutationLock: { current: false },
    selectedGroupId: "primary", editingGroupId: null,
    window: { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { writes.push([key, value]); storage.set(key, value); },
    } },
    toast: { error: (message: string) => errors.push(message), success: () => {} },
  });
  for (const state of ["accountGroups", "accountOrder", "layoutSaving", "layoutError", "pendingDeleteGroup",
    "draggedAccountId", "draggedGroupId", "dragOverGroupId", "dragOverAccountId", "selectedGroupId", "editingGroupId"]) {
    if (!(state in scope)) scope[state] = null;
    scope[`set${state[0].toUpperCase()}${state.slice(1)}`] = (value: unknown) => { scope[state] = value; };
  }
  scope.fetch = async (_url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      const next = JSON.parse(String(options.body));
      requests.push(next);
      return { ok: !scope.failPut, json: async () => scope.failPut ? { error: "保存失败" } : { success: true, state: next } };
    }
    return { ok: true, json: async () => ({ state: layout, exists: true, canEdit: true }) };
  };
  for (const name of ["GROUPS_STORAGE_KEY", "ORDER_STORAGE_KEY", "SELECTED_GROUP_STORAGE_KEY", "ACCOUNT_DRAG_TYPE", "GROUP_DRAG_TYPE",
    "loadAccountGroups", "saveAccountGroups", "authHeaders", "loadAccountLayoutFromServer", "saveAccountLayoutToServer",
    "saveAccountOrder", "saveSelectedGroup", "persistLayout", "selectGroup", "removeAccountGroup", "resetDrag",
    "reorderGroup", "startGroupDrag", "isAccountDrag", "isGroupDrag", "handleGroupDragOver", "handleGroupDrop",
    "assignAccountToGroup", "moveAccount"]) evaluate(scope, declaration(name), name);
  const order = declaration("completeAccountOrder");
  assert.ok(ts.isCallExpression(order));
  scope.completeAccountOrder = evaluate(scope, order.arguments[0])();
  return { scope, storage, writes, requests, errors };
}

function dragEvent(type?: string, id = "") {
  const data: Record<string, string> = type ? { [type]: id } : {};
  return {
    prevented: false,
    preventDefault() { this.prevented = true; }, stopPropagation() {},
    dataTransfer: {
      get types() { return Object.keys(data); }, effectAllowed: "", dropEffect: "",
      getData: (key: string) => data[key] || "", setData: (key: string, value: string) => { data[key] = value; },
    },
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("every real group has an enabled delete callback; opening/cancelling does not persist, confirmation does", async () => {
  const layout = groups.createDefaultAccountLayout();
  layout.groups.push({ id: "custom", name: "自定义" });
  for (const group of layout.groups) {
    const { scope, writes, requests } = harness(layout);
    scope.group = group;
    const snapshot = plain(scope.accountGroups);
    assert.equal(evaluate(scope, attribute("删除分组（不删除账户）", "disabled")), false);
    evaluate(scope, attribute("删除分组（不删除账户）", "onClick"))();
    assert.equal(scope.pendingDeleteGroup.id, group.id);
    assert.deepEqual(plain(scope.accountGroups), snapshot);
    assert.equal(requests.length, 0);
    assert.equal(writes.length, 0);
    const dialog = nodes.find((node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ConfirmDialog");
    assert.ok(dialog && ts.isJsxSelfClosingElement(dialog));
    const cancel = dialog.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === "onCancel");
    assert.ok(cancel && ts.isJsxAttribute(cancel) && cancel.initializer && ts.isJsxExpression(cancel.initializer) && cancel.initializer.expression);
    evaluate(scope, cancel.initializer.expression)();
    assert.equal(scope.pendingDeleteGroup, null);
    assert.equal(writes.length, 0);
    evaluate(scope, attribute("删除分组（不删除账户）", "onClick"))();
    await scope.removeAccountGroup();
    assert.equal(requests.length, 1);
    assert.equal(scope.accountGroups.groups.some((item: groups.AccountGroup) => item.id === group.id), false);
    assert.equal(scope.pendingDeleteGroup, null);
    assert.equal(writes.filter(([key]) => key === scope.GROUPS_STORAGE_KEY).length, 1);
  }
});

test("empty groups survive local and server loading without restoring defaults", async () => {
  const empty = { groups: [], assignments: { main: groups.UNGROUPED_ACCOUNT_GROUP_ID }, accountOrder: ["main"] };
  const { scope, storage, writes } = harness(empty);
  storage.set(scope.GROUPS_STORAGE_KEY, JSON.stringify(empty));
  assert.deepEqual(plain(scope.loadAccountGroups()), empty);
  const remote = await scope.loadAccountLayoutFromServer();
  assert.deepEqual(plain(remote.state), empty);
  assert.equal(remote.exists, true);
  assert.equal(writes.length, 0);
});

test("failed PUT leaves layout, order, pending confirmation and local persistence unchanged", async () => {
  const { scope, requests, writes, errors } = harness();
  scope.failPut = true;
  scope.pendingDeleteGroup = scope.accountGroups.groups[0];
  const before = plain({ groups: scope.accountGroups, order: scope.accountOrder });
  await scope.removeAccountGroup();
  assert.equal(requests.length, 1);
  assert.deepEqual(plain({ groups: scope.accountGroups, order: scope.accountOrder }), before);
  assert.equal(scope.pendingDeleteGroup.id, "primary");
  assert.equal(writes.length, 0);
  assert.deepEqual(errors, ["保存失败"]);
  assert.equal(scope.layoutError, "保存失败");
  assert.equal(scope.layoutSaving, false);
  assert.equal(scope.layoutMutationLock.current, false);
});

test("group/account drag types, virtual targets and spoofed IDs cannot cross-mutate", async () => {
  const { scope, requests } = harness();
  const event = dragEvent();
  scope.startGroupDrag(event, "primary");
  assert.deepEqual(event.dataTransfer.types, [scope.GROUP_DRAG_TYPE]);
  assert.equal(scope.isAccountDrag(event), false);
  assert.equal(scope.isGroupDrag(event), true);
  for (const target of [groups.ALL_ACCOUNT_GROUP_ID, groups.UNGROUPED_ACCOUNT_GROUP_ID]) {
    scope.draggedGroupId = "primary";
    scope.handleGroupDrop(event, target);
    await flush();
  }
  scope.draggedGroupId = "primary";
  scope.handleGroupDrop(dragEvent(scope.GROUP_DRAG_TYPE, "sub"), "other");
  scope.draggedGroupId = "primary";
  scope.handleGroupDrop(dragEvent(scope.ACCOUNT_DRAG_TYPE, "main"), "other");
  await flush();
  assert.equal(requests.length, 0);
  scope.draggedGroupId = "primary";
  scope.handleGroupDrop(event, "other");
  await flush();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].groups.map((item) => item.id), ["sub", "platform", "other", "primary"]);
  assert.deepEqual(requests[0].assignments, {});
  scope.draggedAccountId = "main";
  scope.handleGroupDrop(dragEvent(scope.ACCOUNT_DRAG_TYPE, "main"), "sub");
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].assignments.main, "sub");
  assert.deepEqual(requests[1].groups, requests[0].groups);
});

test("card movement keeps saved unknown/filtered IDs and atomically saves group assignment with complete order", async () => {
  const layout = groups.createDefaultAccountLayout();
  layout.accountOrder = ["unknown-saved", "main", "main"];
  const { scope, requests } = harness(layout);
  assert.deepEqual(plain(scope.completeAccountOrder), ["unknown-saved", "main", "ordinary", "child", "filtered-out"]);
  await scope.moveAccount("main", "ordinary");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].accountOrder, ["unknown-saved", "ordinary", "main", "child", "filtered-out"]);
  assert.equal(requests[0].assignments.main, "other");
  assert.deepEqual(requests[0].groups, groups.DEFAULT_ACCOUNT_GROUPS);
  const fresh = harness();
  assert.deepEqual(plain(fresh.scope.completeAccountOrder), ["ordinary", "main", "child", "filtered-out"]);
});
