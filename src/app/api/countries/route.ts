import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";
import { serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type CountryOption = {
  value: string;
  label: string;
  source: "stores" | "config";
};

function normalize(raw: string): string {
  return String(raw || "").trim().toUpperCase();
}

function toLabel(value: string): string {
  const cfg = getCountryByCode(value);
  if (cfg) return `${cfg.name} (${cfg.code})`;
  return value;
}

/**
 * GET /api/countries
 * 返回系统国家维度选项（优先店铺国家，补齐标准配置国家）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeConfig = searchParams.get("includeConfig") !== "false";

    const storeRows = await prisma.store.findMany({
      select: { country: true },
      distinct: ["country"],
    });

    const map = new Map<string, CountryOption>();

    for (const row of storeRows) {
      const v = normalize(row.country || "");
      if (!v) continue;
      map.set(v, {
        value: v,
        label: toLabel(v),
        source: "stores",
      });
    }

    if (includeConfig) {
      for (const c of COUNTRIES) {
        const v = normalize(c.code);
        if (!v || map.has(v)) continue;
        map.set(v, {
          value: v,
          label: `${c.name} (${c.code})`,
          source: "config",
        });
      }
    }

    const data = Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "zh-Hans-CN")
    );

    return NextResponse.json({ data });
  } catch (error) {
    return serverError("获取国家选项失败", error, { includeDetailsInDev: true });
  }
}

