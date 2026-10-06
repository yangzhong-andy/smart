import { NextRequest, NextResponse } from "next/server";
import { Prisma, PurchaseContractStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { syncProductVariantInventory } from "@/lib/inventory-sync";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<PurchaseContractStatus, string> = {
  PENDING_APPROVAL: "待审批",
  PENDING_SHIPMENT: "待发货",
  PARTIAL_SHIPMENT: "部分发货",
  SHIPPED: "发货完成",
  SETTLED: "已结清",
  CANCELLED: "已取消",
};

type QuantityInput = {
  itemId?: unknown;
  qty?: unknown;
};

/**
 * PATCH /api/purchase-contracts/[id]/quantities
 * 更新合同明细数量。只改数量，不改 SKU、单价、拿货单或库存流水。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "请提供完整的合同明细数量" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize quantity edits with other operations that use the contract as their aggregate root.
      await tx.$queryRaw`SELECT "id" FROM "PurchaseContract" WHERE "id" = ${id} FOR UPDATE`;
      const contract = await tx.purchaseContract.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (!contract) {
        throw new Error("采购合同不存在");
      }
      if (
        contract.status === PurchaseContractStatus.SETTLED ||
        contract.status === PurchaseContractStatus.CANCELLED
      ) {
        throw new Error("已结清或已取消的合同不能修改数量");
      }
      if (contract.items.length === 0) {
        throw new Error("该合同没有可编辑的 SKU 明细");
      }

      const updates = new Map<string, number>();
      for (const raw of body.items as QuantityInput[]) {
        const itemId = typeof raw?.itemId === "string" ? raw.itemId : "";
        const qty = Number(raw?.qty);
        if (!itemId || updates.has(itemId)) {
          throw new Error("合同明细参数重复或无效");
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error("合同数量必须是大于 0 的整数");
        }
        updates.set(itemId, qty);
      }

      if (updates.size !== contract.items.length) {
        throw new Error("请同时提交全部 SKU 明细的数量");
      }
      for (const item of contract.items) {
        const nextQty = updates.get(item.id);
        if (nextQty == null) {
          throw new Error(`缺少明细 ${item.sku} 的数量`);
        }
        if (nextQty < item.pickedQty) {
          throw new Error(
            `SKU ${item.sku} 的数量不能低于已取货数量 ${item.pickedQty}`,
          );
        }
        if (nextQty < item.finishedQty) {
          throw new Error(
            `SKU ${item.sku} 的数量不能低于已完工数量 ${item.finishedQty}`,
          );
        }
      }

      let totalQty = 0;
      let totalAmount = new Prisma.Decimal(0);
      for (const item of contract.items) {
        const nextQty = updates.get(item.id)!;
        totalQty += nextQty;
        totalAmount = totalAmount.add(new Prisma.Decimal(item.unitPrice).mul(nextQty));
        await tx.purchaseContractItem.update({
          where: { id: item.id },
          data: {
            qty: nextQty,
            totalAmount: new Prisma.Decimal(item.unitPrice).mul(nextQty).toDecimalPlaces(2),
            updatedAt: new Date(),
          },
        });
      }

      const pickedQty = contract.items.reduce((sum, item) => sum + item.pickedQty, 0);
      const finishedQty = contract.items.reduce((sum, item) => sum + item.finishedQty, 0);
      const totalPaid = new Prisma.Decimal(contract.totalPaid);
      totalAmount = totalAmount.toDecimalPlaces(2);
      if (totalAmount.lessThan(totalPaid)) {
        throw new Error(
          `修改后的合同金额 ${totalAmount.toFixed(2)} 低于已付款 ${totalPaid.toFixed(2)}，请先核对付款记录`,
        );
      }

      let depositAmount = new Prisma.Decimal(contract.depositAmount);
      if (new Prisma.Decimal(contract.depositRate).greaterThan(0)) {
        depositAmount = totalAmount
          .mul(new Prisma.Decimal(contract.depositRate))
          .div(100)
          .toDecimalPlaces(2);
      }
      if (depositAmount.lessThan(new Prisma.Decimal(contract.depositPaid))) {
        throw new Error(
          `修改后的定金金额 ${depositAmount.toFixed(2)} 低于已付定金 ${new Prisma.Decimal(contract.depositPaid).toFixed(2)}`,
        );
      }

      let status = contract.status;
      if (pickedQty >= totalQty) status = PurchaseContractStatus.SHIPPED;
      else if (pickedQty > 0) status = PurchaseContractStatus.PARTIAL_SHIPMENT;
      else if (
        status === PurchaseContractStatus.PARTIAL_SHIPMENT ||
        status === PurchaseContractStatus.SHIPPED
      ) {
        status = PurchaseContractStatus.PENDING_SHIPMENT;
      }

      const updated = await tx.purchaseContract.update({
        where: { id: contract.id },
        data: {
          totalQty,
          pickedQty,
          finishedQty,
          totalAmount,
          depositAmount,
          totalOwed: totalAmount.sub(totalPaid).toDecimalPlaces(2),
          status,
          updatedAt: new Date(),
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });

      return { contract: updated, variantIds: contract.items.map((item) => item.variantId).filter((value): value is string => Boolean(value)) };
    });

    // 合同余量参与库存分布计算，数量变更后同步受影响 SKU。
    for (const variantId of new Set(result.variantIds)) {
      await syncProductVariantInventory(variantId);
    }
    await clearCacheByPrefix("purchase-contracts");

    const { contract } = result;
    return NextResponse.json({
      success: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      totalQty: contract.totalQty,
      pickedQty: contract.pickedQty,
      finishedQty: contract.finishedQty,
      totalAmount: Number(contract.totalAmount),
      depositAmount: Number(contract.depositAmount),
      totalPaid: Number(contract.totalPaid),
      totalOwed: Number(contract.totalOwed),
      status: STATUS_MAP[contract.status],
      items: contract.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        qty: item.qty,
        pickedQty: item.pickedQty,
        finishedQty: item.finishedQty,
        unitPrice: Number(item.unitPrice),
        totalAmount: Number(item.totalAmount),
      })),
    });
  } catch (error: any) {
    await clearCacheByPrefix("purchase-contracts");
    const message = error?.message || "修改合同数量失败";
    const status = message === "采购合同不存在" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
