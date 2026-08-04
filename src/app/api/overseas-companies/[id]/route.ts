import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/overseas-companies/[id]
 * 获取单个海外公司
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const company = await prisma.overseasCompany.findUnique({
      where: { id },
    });

    if (!company) {
      return notFound("海外公司不存在");
    }

    return NextResponse.json({
      id: company.id,
      name: company.name,
      country: company.country,
      companyType: company.companyType,
      contact: company.contact ?? undefined,
      phone: company.phone ?? undefined,
      email: company.email ?? undefined,
      address: company.address ?? undefined,
      taxId: company.taxId ?? undefined,
      bankName: company.bankName ?? undefined,
      bankAccount: company.bankAccount ?? undefined,
      notes: company.notes ?? undefined,
      isActive: company.isActive,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("获取海外公司失败", error, { includeDetailsInDev: true });
  }
}

/**
 * PUT /api/overseas-companies/[id]
 * 更新海外公司
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const exists = await prisma.overseasCompany.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return notFound("海外公司不存在");
    }

    const name = body.name != null ? String(body.name).trim() : undefined;
    const country = body.country != null ? String(body.country).trim() : undefined;
    if (name === "") {
      return badRequest("公司名称不能为空");
    }
    if (country === "") {
      return badRequest("国家不能为空");
    }

    const company = await prisma.overseasCompany.update({
      where: { id },
      data: {
        name,
        country,
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
      id: company.id,
      name: company.name,
      updatedAt: company.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("更新海外公司失败", error, { includeDetailsInDev: true });
  }
}

/**
 * DELETE /api/overseas-companies/[id]
 * 删除海外公司
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const exists = await prisma.overseasCompany.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return notFound("海外公司不存在");
    }

    await prisma.overseasCompany.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除海外公司失败", error, { includeDetailsInDev: true });
  }
}
