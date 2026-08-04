import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/exporters
 * 获取出口公司列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 50);

    const where: any = {};
    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const [rows, total] = await prisma.$transaction([
      prisma.exporter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.exporter.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country,
      companyType: r.companyType,
      contact: r.contact ?? undefined,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      address: r.address ?? undefined,
      taxId: r.taxId ?? undefined,
      bankName: r.bankName ?? undefined,
      bankAccount: r.bankAccount ?? undefined,
      notes: r.notes ?? undefined,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return serverError("获取出口公司列表失败", error, { includeDetailsInDev: true });
  }
}

/**
 * POST /api/exporters
 * 创建出口公司
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    if (!name) {
      return badRequest("请填写公司名称");
    }

    const exporter = await prisma.exporter.create({
      data: {
        name,
        country: body.country ?? "CN",
        companyType: body.companyType ?? "exporter",
        contact: body.contact ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        taxId: body.taxId ?? null,
        bankName: body.bankName ?? null,
        bankAccount: body.bankAccount ?? null,
        notes: body.notes ?? null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      id: exporter.id,
      name: exporter.name,
      createdAt: exporter.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("创建出口公司失败", error, { includeDetailsInDev: true });
  }
}
