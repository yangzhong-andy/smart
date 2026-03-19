import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/exporters/[id]
 * 获取单个出口公司
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exporter = await prisma.exporter.findUnique({
      where: { id },
    });

    if (!exporter) {
      return notFound("出口公司不存在");
    }

    return NextResponse.json({
      id: exporter.id,
      name: exporter.name,
      country: exporter.country,
      companyType: exporter.companyType,
      contact: exporter.contact ?? undefined,
      phone: exporter.phone ?? undefined,
      email: exporter.email ?? undefined,
      address: exporter.address ?? undefined,
      taxId: exporter.taxId ?? undefined,
      bankName: exporter.bankName ?? undefined,
      bankAccount: exporter.bankAccount ?? undefined,
      notes: exporter.notes ?? undefined,
      isActive: exporter.isActive,
      createdAt: exporter.createdAt.toISOString(),
      updatedAt: exporter.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("获取出口公司失败", error, { includeDetailsInDev: true });
  }
}

/**
 * PUT /api/exporters/[id]
 * 更新出口公司
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const exists = await prisma.exporter.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return notFound("出口公司不存在");
    }

    const name = body.name != null ? String(body.name).trim() : undefined;
    if (name === "") {
      return badRequest("公司名称不能为空");
    }

    const exporter = await prisma.exporter.update({
      where: { id },
      data: {
        name,
        country: body.country ?? undefined,
        companyType: body.companyType ?? undefined,
        contact: body.contact ?? undefined,
        phone: body.phone ?? undefined,
        email: body.email ?? undefined,
        address: body.address ?? undefined,
        taxId: body.taxId ?? undefined,
        bankName: body.bankName ?? undefined,
        bankAccount: body.bankAccount ?? undefined,
        notes: body.notes ?? undefined,
        isActive: body.isActive ?? undefined,
      },
    });

    return NextResponse.json({
      id: exporter.id,
      name: exporter.name,
      updatedAt: exporter.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("更新出口公司失败", error, { includeDetailsInDev: true });
  }
}

/**
 * DELETE /api/exporters/[id]
 * 删除出口公司
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const exists = await prisma.exporter.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return notFound("出口公司不存在");
    }

    await prisma.exporter.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除出口公司失败", error, { includeDetailsInDev: true });
  }
}
