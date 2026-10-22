import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const image = await prisma.profitSelectionImage.findUnique({ where: { itemId: params.id } });
    if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    return new NextResponse(image.data, {
      headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return serverError("读取选品图片失败", error);
  }
}
