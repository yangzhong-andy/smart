import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLogisticsBillGroups,
  calculateSupplierBillGroups,
  type SupplierBillOrder,
} from "./monthly-bill-calculation";

const supplierOrder = (
  overrides: Partial<SupplierBillOrder> = {}
): SupplierBillOrder => ({
  id: "order-1",
  deliveryNumber: "DO-1",
  contractId: "contract-1",
  qty: 100,
  tailAmount: 1000,
  tailPaid: 0,
  tailDueDate: "2026-08-12T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  status: "SHIPPED",
  contract: {
    supplierId: "supplier-1",
    supplierName: "供应商一",
    totalQty: 200,
    pickedQty: 100,
    depositPaid: 300,
  },
  ...overrides,
});

test("does not deduct a deposit before the contract is fully picked", () => {
  const [group] = calculateSupplierBillGroups([supplierOrder()]);
  assert.equal(group.grossAmount, 1000);
  assert.equal(group.depositDeduction, 0);
  assert.equal(group.payableAmount, 1000);
});

test("deducts paid tail and the contract deposit only in the final delivery month", () => {
  const first = supplierOrder({
    tailDueDate: "2026-07-20T00:00:00.000Z",
    contract: {
      supplierId: "supplier-1",
      supplierName: "供应商一",
      totalQty: 200,
      pickedQty: 200,
      depositPaid: 300,
    },
  });
  const final = supplierOrder({
    id: "order-2",
    deliveryNumber: "DO-2",
    tailPaid: 100,
    createdAt: "2026-08-10T00:00:00.000Z",
    contract: {
      supplierId: "supplier-1",
      supplierName: "供应商一",
      totalQty: 200,
      pickedQty: 200,
      depositPaid: 300,
    },
  });
  const groups = calculateSupplierBillGroups([first, final]);
  const july = groups.find((group) => group.month === "2026-07")!;
  const august = groups.find((group) => group.month === "2026-08")!;
  assert.equal(july.depositDeduction, 0);
  assert.equal(july.payableAmount, 1000);
  assert.equal(august.tailPaidAmount, 100);
  assert.equal(august.depositDeduction, 300);
  assert.equal(august.payableAmount, 600);
});

test("does not use one contract deposit to offset another contract in the same month", () => {
  const depositContract = supplierOrder({
    tailAmount: 100,
    contract: {
      supplierId: "supplier-1",
      supplierName: "供应商一",
      totalQty: 100,
      pickedQty: 100,
      depositPaid: 300,
    },
  });
  const otherContract = supplierOrder({
    id: "order-2",
    deliveryNumber: "DO-2",
    contractId: "contract-2",
    tailAmount: 1000,
    createdAt: "2026-08-02T00:00:00.000Z",
    contract: {
      supplierId: "supplier-1",
      supplierName: "供应商一",
      totalQty: 100,
      pickedQty: 100,
      depositPaid: 0,
    },
  });
  const [group] = calculateSupplierBillGroups([depositContract, otherContract]);
  assert.equal(group.depositDeduction, 100);
  assert.equal(group.payableAmount, 1000);
});

test("groups logistics costs by channel, shipped month and currency", () => {
  const groups = calculateLogisticsBillGroups([
    {
      id: "cost-1",
      amount: 100,
      currency: "usd",
      paymentStatus: "未付",
      dueDate: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      logisticsChannelId: "channel-1",
      logisticsChannelName: "物流商一",
      outboundShippedDate: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "cost-2",
      amount: 25.55,
      currency: "USD",
      paymentStatus: "已付",
      dueDate: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      logisticsChannelId: "channel-1",
      logisticsChannelName: "物流商一",
      outboundShippedDate: "2026-08-20T00:00:00.000Z",
    },
    {
      id: "cost-3",
      amount: 50,
      currency: "CNY",
      paymentStatus: "未付",
      dueDate: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      logisticsChannelId: "channel-1",
      logisticsChannelName: "物流商一",
      outboundShippedDate: "2026-08-20T00:00:00.000Z",
    },
  ]);
  assert.equal(groups.length, 2);
  const usd = groups.find((group) => group.currency === "USD")!;
  assert.equal(usd.grossAmount, 125.55);
  assert.equal(usd.paidAmount, 25.55);
  assert.equal(usd.payableAmount, 100);
  assert.deepEqual(usd.costIds, ["cost-1", "cost-2"]);
});
