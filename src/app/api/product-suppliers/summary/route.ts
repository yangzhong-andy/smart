import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey } from "@/lib/redis";
import { serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const CACHE_TTL = 300; // 5 分钟
const CACHE_KEY_PREFIX = "product-suppliers";
const CACHE_VERSION = "v1";

type SummaryItem = {
  count: number;
  samples: { name: string; sku?: string; unitPrice?: number }[];
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noCache = searchParams.get("noCache") === "true";
    const sampleSizeRaw = Number(searchParams.get("sampleSize") ?? 3);
    const sampleSize = Number.isFinite(sampleSizeRaw)
      ? Math.min(5, Math.max(0, Math.floor(sampleSizeRaw)))
      : 3;

    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      "summary",
      CACHE_VERSION,
      `sampleSize=${sampleSize}`
    );

    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const grouped = await prisma.productSupplier.groupBy({
      by: ["supplierId"],
      _count: { _all: true },
    });

    const resultMap: Record<string, SummaryItem> = {};
    for (const g of grouped) {
      resultMap[g.supplierId] = { count: g._count._all, samples: [] };
    }

    if (sampleSize > 0 && grouped.length > 0) {
      // 按创建时间倒序抽样；在内存中抑制同一供应商同一产品重复，避免依赖 distinct 的数据库兼容性
      const sampleRows = await prisma.productSupplier.findMany({
        select: {
          supplierId: true,
          productId: true,
          price: true,
          createdAt: true,
          product: { select: { name: true, spuCode: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(5000, grouped.length * sampleSize * 20),
      });

      const seenBySupplier = new Map<string, Set<string>>();
      for (const row of sampleRows) {
        const entry = resultMap[row.supplierId];
        if (!entry) continue;
        if (entry.samples.length >= sampleSize) continue;
        const set = seenBySupplier.get(row.supplierId) ?? new Set<string>();
        if (set.has(row.productId)) continue;
        set.add(row.productId);
        seenBySupplier.set(row.supplierId, set);
        entry.samples.push({
          name: row.product?.name || row.product?.spuCode || "未命名产品",
          sku: row.product?.spuCode ?? undefined,
          unitPrice: row.price != null ? Number(row.price) : undefined,
        });
      }
    }

    const response = { data: resultMap };
    if (!noCache) {
      await setCache(cacheKey, response, CACHE_TTL);
    }
    return NextResponse.json(response);
  } catch (error) {
    return serverError("Failed to fetch product supplier summary", error, { includeDetailsInDev: true });
  }
}

