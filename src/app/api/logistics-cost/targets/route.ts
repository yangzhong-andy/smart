import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { readCostClosureFees, resolveCostClosure } from "@/lib/logistics-cost-closure";

export const dynamic = "force-dynamic";

// Separate option endpoint: history stays visible, no page-size cutoff or legacy fallback.
export async function GET() {
  try {
    const containerSelect = { id: true, containerNo: true, containerType: true, costsClosedAt: true, costsReopened: true } as const;
    const result = await prisma.$transaction(async (tx) => {
      const containers = await tx.container.findMany({ select: containerSelect, orderBy: { containerNo: "asc" } });
      const batches = await tx.outboundBatch.findMany({
        select: {
          id: true, batchNumber: true, containerId: true, costsClosedAt: true, costsReopened: true,
          outboundOrder: { select: { outboundNumber: true } },
          container: { select: containerSelect },
        },
        orderBy: [{ shippedDate: "desc" }, { id: "asc" }],
      });
      const effective = resolveCostClosure(containers, batches,
        await readCostClosureFees(tx, containers.map((c) => c.id), batches.map((b) => b.id)));
      const parents = new Map(effective.containers.map((c) => [c.id, c]));
      return { containers: effective.containers, batches: effective.batches.map((b) => ({
        ...b, container: b.containerId ? parents.get(b.containerId) ?? null : null,
      })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return NextResponse.json(result);
  } catch (error) {
    console.error("读取物流费用关联对象失败", error);
    return NextResponse.json({ error: "读取费用完结状态失败，请刷新重试" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || !["container", "batch"].includes(body.type) || typeof body.id !== "string" || !body.id.trim() || typeof body.closed !== "boolean") {
      return NextResponse.json({ error: "请选择柜子或出库批次，并提供有效的完结状态" }, { status: 400 });
    }
    // Updating the target row serializes against new cost creation's FOR UPDATE lock.
    // Repeated completion preserves the original completion timestamp.
    const data = { costsClosedAt: body.closed ? new Date() : null, costsReopened: !body.closed };
    const result = await prisma.$transaction(async (tx) => {
      const current = body.type === "container"
        ? await tx.container.findUnique({ where: { id: body.id }, select: { id: true } })
        : await tx.outboundBatch.findUnique({ where: { id: body.id }, select: { id: true } });
      if (!current) return false;
      const where = { id: body.id, ...(body.closed ? { costsClosedAt: null } : {}) };
      // Branch explicitly so Prisma's generated model overloads stay type-safe.
      if (body.type === "container") await tx.container.updateMany({ where, data });
      else await tx.outboundBatch.updateMany({ where, data });
      return true;
    });
    if (!result) return NextResponse.json({ error: "柜子或出库批次不存在" }, { status: 404 });
    await clearCacheByPrefix("containers");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新费用完结状态失败", error);
    return NextResponse.json({ error: "更新费用完结状态失败，请重试" }, { status: 500 });
  }
}
