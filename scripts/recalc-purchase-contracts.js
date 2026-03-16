const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// 加载 .env.local，确保 DATABASE_URL 可用
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const prisma = new PrismaClient();

/**
 * 一次性校准采购合同 & 拿货单的已付金额（基于「财务流水」而不是申请）：
 * - 合同：totalPaid / totalOwed
 * - 拿货单：tailPaid
 *
 * 规则（当前仅针对「采购尾款」场景）：
 * - 从 cashFlow 表中查出：
 *   type='EXPENSE' 且 status='CONFIRMED'，
 *   且 category='采购/采购尾款'，
 *   且 relatedId=deliveryOrder.id（拿货单ID）
 * - 按 relatedId 汇总金额，回写到：
 *   - deliveryOrder.tailPaid
 *   - 对应 purchaseContract.totalPaid / totalOwed / status
 */
async function recalcFromCashFlow() {
  console.log("🔍 正在扫描财务流水中的采购尾款支出（基于 cashFlow）…");

  const cashFlows = await prisma.cashFlow.findMany({
    where: {
      type: "EXPENSE",
      status: "CONFIRMED",
      category: "采购/采购尾款",
      relatedId: {
        not: null,
      },
    },
  });

  if (!cashFlows.length) {
    console.log("ℹ️ 未找到任何符合条件的采购尾款流水（type=EXPENSE, status=CONFIRMED, category=采购/采购尾款, 有 relatedId），无需校准。");
    return;
  }

  console.log(`📄 找到 ${cashFlows.length} 条采购尾款相关的财务流水。`);

  // 汇总：按 deliveryOrderId & contractId 聚合金额
  /** @type {Record<string, number>} */
  const tailPaidByDeliveryOrder = {};
  /** @type {Record<string, number>} */
  const tailPaidByContract = {};

  for (const flow of cashFlows) {
    const rawAmount = Number(flow.amount) || 0;
    if (rawAmount === 0) continue;

    // 约定：支出流水中采购尾款 amount 为负数，这里统一按绝对值累计
    const amount = Math.abs(rawAmount);

    const deliveryOrderId = flow.relatedId || null;
    if (!deliveryOrderId) continue;

    tailPaidByDeliveryOrder[deliveryOrderId] =
      (tailPaidByDeliveryOrder[deliveryOrderId] || 0) + amount;
  }

  const deliveryOrderIds = Object.keys(tailPaidByDeliveryOrder);
  if (!deliveryOrderIds.length) {
    console.log("ℹ️ 没有任何带 relatedId 的尾款流水，结束。");
    return;
  }

  console.log(`🔗 共有 ${deliveryOrderIds.length} 张拿货单存在已支付尾款流水，准备加载对应合同信息…`);

  const deliveryOrders = await prisma.deliveryOrder.findMany({
    where: { id: { in: deliveryOrderIds } },
    select: {
      id: true,
      contractId: true,
      tailPaid: true,
    },
  });

  if (!deliveryOrders.length) {
    console.log("⚠️ 根据 relatedId 未找到任何拿货单记录，结束。");
    return;
  }

  // 计算按合同聚合的尾款
  for (const order of deliveryOrders) {
    const paidByOrder = tailPaidByDeliveryOrder[order.id] || 0;
    if (!order.contractId) continue;
    tailPaidByContract[order.contractId] =
      (tailPaidByContract[order.contractId] || 0) + paidByOrder;
  }

  const contractIds = Object.keys(tailPaidByContract);
  console.log(`📦 共有 ${contractIds.length} 份合同涉及已支付尾款，准备写回数据库…`);

  const contracts = await prisma.purchaseContract.findMany({
    where: { id: { in: contractIds } },
    select: {
      id: true,
      totalAmount: true,
      totalPaid: true,
      totalOwed: true,
      status: true,
    },
  });

  const updates = [];

  // 更新拿货单 tailPaid
  for (const order of deliveryOrders) {
    const shouldTailPaid = tailPaidByDeliveryOrder[order.id] || 0;
    const currentTailPaid = Number(order.tailPaid || 0);
    if (Math.abs(shouldTailPaid - currentTailPaid) < 0.01) continue;

    updates.push(
      prisma.deliveryOrder.update({
        where: { id: order.id },
        data: {
          tailPaid: shouldTailPaid,
          updatedAt: new Date(),
        },
      })
    );
    console.log(
      `📝 将拿货单 ${order.id} 的 tailPaid 从 ${currentTailPaid} 校准为 ${shouldTailPaid}`
    );
  }

  // 更新合同 totalPaid / totalOwed / status
  for (const contract of contracts) {
    const tailPaid = tailPaidByContract[contract.id] || 0;
    const currentTotalPaid = Number(contract.totalPaid || 0);
    const baseAmount = Number(contract.totalAmount || 0);

    const shouldTotalPaid = currentTotalPaid + tailPaid;
    const shouldTotalOwed = baseAmount - shouldTotalPaid;

    // 简单规则：在原有 totalPaid 基础上叠加尾款。
    updates.push(
      prisma.purchaseContract.update({
        where: { id: contract.id },
        data: {
          totalPaid: shouldTotalPaid,
          totalOwed: shouldTotalOwed,
          status:
            shouldTotalPaid >= baseAmount && baseAmount > 0
              ? "SETTLED"
              : contract.status,
          updatedAt: new Date(),
        },
      })
    );
    console.log(
      `🧾 合同 ${contract.id}：totalPaid += ${tailPaid} => ${shouldTotalPaid}，totalOwed => ${shouldTotalOwed}`
    );
  }

  if (!updates.length) {
    console.log("✅ 没有需要更新的记录，所有数据已与尾款申请一致。");
    return;
  }

  console.log(`🚀 共需执行 ${updates.length} 条更新操作…`);
  await prisma.$transaction(updates);
  console.log("✅ 校准完成。");
}

async function main() {
  try {
    await recalcFromCashFlow();
  } catch (e) {
    console.error("❌ 校准过程出错：", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();

