import { prisma } from "./prisma";

/** 「Set +1」↔「Set+1」等：去掉 + 两侧空格后再压空格 */
function candidateSkuIds(raw: string): string[] {
  const t = raw.trim();
  const out = new Set<string>();
  if (t) out.add(t);
  const plusNorm = t.replace(/\s*\+\s*/g, "+");
  if (plusNorm !== t) out.add(plusNorm);
  const plusAndSpaces = plusNorm.replace(/\s+/g, " ").trim();
  if (plusAndSpaces) out.add(plusAndSpaces);
  const noSpace = t.replace(/\s/g, "");
  if (noSpace) out.add(noSpace);
  const noSpacePlus = plusNorm.replace(/\s/g, "");
  if (noSpacePlus) out.add(noSpacePlus);
  return Array.from(out);
}

/**
 * 合同明细里的 sku 文本与 ProductVariant.skuId 需一致才能绑定。
 * 常见误差：多空格、「Set +1」vs「Set+1」等，在此做宽松匹配。
 */
export async function resolveVariantIdForContractSku(sku: string): Promise<{
  variantId: string;
  catalogSkuId: string;
} | null> {
  const t = sku.trim();
  if (!t || t === "未填" || t === "多款") return null;

  for (const cand of candidateSkuIds(t)) {
    const hit = await prisma.productVariant.findFirst({
      where: { skuId: cand },
      select: { id: true, skuId: true },
    });
    if (hit) return { variantId: hit.id, catalogSkuId: hit.skuId };
  }

  const strip = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const target = strip(t);

  const variants = await prisma.productVariant.findMany({
    select: { id: true, skuId: true },
  });
  const loose = variants.find((v) => strip(v.skuId) === target);
  if (loose) return { variantId: loose.id, catalogSkuId: loose.skuId };

  return null;
}
