import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exists = await prisma.profitCalculation.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return notFound("测算记录不存在");
    }

    await prisma.profitCalculation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除测算记录失败", error, { includeDetailsInDev: true });
  }
}
