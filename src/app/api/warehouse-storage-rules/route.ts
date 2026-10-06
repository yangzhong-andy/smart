import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, required = false) {
  const text = String(value || "").trim();
  if (!text) return required ? null : undefined;
  return DATE.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
}

function serialize(rule: any) {
  return {
    ...rule,
    dailyRate: Number(rule.dailyRate),
    effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) || null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const warehouseId = String(new URL(request.url).searchParams.get("warehouseId") || "").trim();
  const rules = await prisma.warehouseStorageRule.findMany({
    where: warehouseId ? { warehouseId } : undefined,
    include: { warehouse: { select: { id: true, code: true, name: true, type: true } } },
    orderBy: [{ warehouse: { name: "asc" } }, { effectiveFrom: "desc" }],
  });
  return NextResponse.json(rules.map(serialize));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const warehouseId = String(body?.warehouseId || "").trim();
    const freeDays = Number(body?.freeDays);
    const dailyRate = Number(body?.dailyRate);
    const currency = String(body?.currency || "BRL").trim().toUpperCase();
    const effectiveFrom = parseDate(body?.effectiveFrom, true);
    const effectiveTo = parseDate(body?.effectiveTo);
    if (!warehouseId || !Number.isInteger(freeDays) || freeDays < 0 || !Number.isFinite(dailyRate) || dailyRate < 0 || !effectiveFrom || effectiveTo === null || (effectiveTo && effectiveTo < effectiveFrom) || !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "仓储规则参数无效" }, { status: 400 });
    }
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } });
    if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "请选择有效的海外仓" }, { status: 400 });
    const rule = await prisma.warehouseStorageRule.create({
      data: { warehouseId, freeDays, dailyRate, rateUnit: "CBM_DAY", currency, effectiveFrom, effectiveTo: effectiveTo || null, enabled: body?.enabled !== false, notes: String(body?.notes || "").trim() || null },
      include: { warehouse: { select: { id: true, code: true, name: true, type: true } } },
    });
    return NextResponse.json(serialize(rule));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "仓储规则保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const id = String(new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "缺少规则 id" }, { status: 400 });
  await prisma.warehouseStorageRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
