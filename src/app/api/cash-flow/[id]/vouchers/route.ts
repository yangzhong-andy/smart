import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const flow = await prisma.cashFlow.findUnique({
    where: { id: params.id },
    select: {
      voucher: true,
      paymentVoucher: true,
      transferVoucher: true,
    },
  });

  if (!flow) {
    return NextResponse.json({ error: "流水记录不存在" }, { status: 404 });
  }

  return NextResponse.json(
    {
      paymentVoucher: flow.paymentVoucher || flow.voucher || null,
      transferVoucher: flow.transferVoucher || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

