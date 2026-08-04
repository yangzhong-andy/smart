import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix, getCache, setCache, generateCacheKey } from "@/lib/redis";

export const dynamic = "force-dynamic";
const CACHE_TTL = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "500");
    const noCache = searchParams.get("noCache") === "true";

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [receivables, total] = await prisma.$transaction([
      prisma.receivable.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.receivable.count({ where }),
    ]);

    const response = {
      data: receivables.map((r: any) => ({
        id: r.id, receivableNo: r.receivableNo || undefined, type: r.type,
        counterparty: r.counterparty, description: r.description,
        originalAmount: Number(r.originalAmount), currentBalance: Number(r.currentBalance),
        currency: r.currency, dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : undefined,
        issuedDate: r.issuedDate.toISOString().slice(0, 10), status: r.status,
        receiptRecords: r.receiptRecords || [], outFlowId: r.outFlowId || undefined,
        outAccountId: r.outAccountId || undefined, outAccountName: r.outAccountName || undefined,
        rejectionReason: r.rejectionReason || undefined, notes: r.notes || undefined,
        createdBy: r.createdBy, approvedBy: r.approvedBy || undefined,
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : undefined,
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : undefined,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomStr = Math.random().toString(36).slice(2, 6).toUpperCase();
    const receivableNo = `REC-${dateStr}-${randomStr}`;

    const receivable = await prisma.receivable.create({
      data: {
        receivableNo, type: body.type, counterparty: body.counterparty,
        description: body.description || "", originalAmount: Number(body.originalAmount),
        currentBalance: Number(body.originalAmount), currency: body.currency || "CNY",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        issuedDate: body.issuedDate ? new Date(body.issuedDate) : new Date(),
        status: body.status || "Draft", outAccountId: body.outAccountId || null,
        outAccountName: body.outAccountName || null, notes: body.notes || null,
        createdBy: body.createdBy || "系统",
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
      },
    });
    await clearCacheByPrefix("receivables");
    return NextResponse.json({ ...receivable, originalAmount: Number(receivable.originalAmount), currentBalance: Number(receivable.currentBalance) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
