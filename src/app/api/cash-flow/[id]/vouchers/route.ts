import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

function parseVoucherImages(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof parsed === "string" && parsed.trim()) return [parsed];
  } catch {
    // Legacy rows may contain one data URL or image URL directly.
  }
  return [trimmed];
}

function serializeVoucherImages(images: string[]): string | null {
  if (images.length === 0) return null;
  return images.length === 1 ? images[0] : JSON.stringify(images);
}

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
      // 旧流水只有 voucher 时允许兼容；如果已有 transferVoucher，旧 voucher
      // 很可能就是同一张转账凭证，不能误显示为发起付款凭证。
      paymentVoucher: flow.paymentVoucher || (!flow.transferVoucher ? flow.voucher : null),
      transferVoucher: flow.transferVoucher || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const kind = body.kind === "transfer" ? "transfer" : body.kind === "payment" ? "payment" : null;
    const index = Number(body.index);
    if (!kind || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "凭证类型或图片序号无效" }, { status: 400 });
    }

    const remaining = await prisma.$transaction(async (tx) => {
      const flow = await tx.cashFlow.findUnique({
        where: { id: params.id },
        select: { voucher: true, paymentVoucher: true, transferVoucher: true },
      });
      if (!flow) throw new Error("流水记录不存在");

      const images = parseVoucherImages(
        kind === "payment"
          ? flow.paymentVoucher || (!flow.transferVoucher ? flow.voucher : null)
          : flow.transferVoucher,
      );
      if (index >= images.length) throw new Error("该凭证图片不存在或已被删除");
      images.splice(index, 1);
      const serialized = serializeVoucherImages(images);

      if (kind === "payment") {
        await tx.cashFlow.update({
          where: { id: params.id },
          data: { paymentVoucher: serialized, voucher: serialized },
        });
      } else {
        await tx.cashFlow.update({
          where: { id: params.id },
          data: { transferVoucher: serialized },
        });
      }
      return images;
    });

    await clearCacheByPrefix("cash-flow");
    return NextResponse.json({ success: true, images: remaining });
  } catch (error: any) {
    const message = error?.message || "删除凭证失败";
    const status = message === "流水记录不存在" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
