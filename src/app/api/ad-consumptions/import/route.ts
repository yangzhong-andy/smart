import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const records = Array.isArray(body.records) ? body.records : [];
    const adAccountId = String(body.adAccountId || "").replace(/\x00/g, "").trim();
    const accountName = String(body.accountName || "").replace(/\x00/g, "").trim() || null;
    const agencyId = String(body.agencyId || "").replace(/\x00/g, "").trim() || null;
    const agencyName = String(body.agencyName || "").replace(/\x00/g, "").trim() || null;
    const storeId = String(body.storeId || "").replace(/\x00/g, "").trim() || null;
    const storeName = String(body.storeName || "").replace(/\x00/g, "").trim() || null;

    if (records.length === 0) return NextResponse.json({ error: "缺少消耗记录" }, { status: 400 });
    if (!adAccountId) return NextResponse.json({ error: "请选择广告账户" }, { status: 400 });

    let created = 0, skipped = 0, failed = 0;
    const batchSet = new Set<string>(); // 批次内查重

    for (const r of records) {
      try {
        // Clean every field individually
        const cleanS = (v: any) => String(v ?? "").replace(/\x00/g, "").replace(/[\u0000-\u001F]/g, "").trim();
        const cleanN = (v: any) => { const n = Number(cleanS(v)); return isNaN(n) ? 0 : Math.abs(n); };

        const dateStr = cleanS(r.date);
        const amount = cleanN(r.amount);
        if (!dateStr || amount <= 0) { skipped++; continue; }

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) { skipped++; continue; }

        // 日期字符串 YYYY-MM-DD 用于查重
        const dateOnly = dateStr.slice(0, 10);

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const campaignName = cleanS(r.campaignName) || null;
        const campaignId = cleanS(r.campaignId) || null;
        const currency = cleanS(r.currency) || "USD";
        const consumptionType = cleanS(r.consumptionType) || null;
        const cashConsumption = cleanN(r.cashConsumption) || null;
        const creditConsumption = cleanN(r.creditConsumption) || null;
        const giftConsumption = cleanN(r.giftConsumption) || null;

        // 批次内查重
        const dedupKey = `${adAccountId}|${dateOnly}|${amount}|${campaignId || ''}`;
        if (batchSet.has(dedupKey)) { skipped++; continue; }
        batchSet.add(dedupKey);

        // 插入，数据库层面唯一索引兜底 (dedup_key 由触发器自动生成)
        const id = randomUUID();
        const result: any[] = await prisma.$queryRaw`
          INSERT INTO "AdConsumption"
          (id, "adAccountId", "accountName", "agencyId", "agencyName", "storeId", "storeName",
           month, date, amount, currency, "campaignName", "campaignId",
           "cashConsumption", "creditConsumption", "giftConsumption", "consumptionType",
           "isSettled", "createdAt", "updatedAt")
          VALUES
          (${id}, ${adAccountId}, ${accountName}, ${agencyId}, ${agencyName}, ${storeId}, ${storeName},
           ${month}, ${date}, ${amount}, ${currency}, ${campaignName}, ${campaignId},
           ${cashConsumption}, ${creditConsumption}, ${giftConsumption}, ${consumptionType},
           false, NOW(), NOW())
          ON CONFLICT (dedup_key) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) {
          created++;
        } else {
          skipped++; // ON CONFLICT DO NOTHING → 重复跳过
        }
      } catch (e) {
        failed++;
        if (failed <= 3) console.error("[import] failed:", e instanceof Error ? e.message : String(e));
      }
    }

    await clearCacheByPrefix("ad-consumptions");
    await clearCacheByPrefix("monthly-bills");

    // 自动生成月账单：检查导入涉及的所有月份+代理商，缺失则自动创建
    // Reconcile the affected months even when every row was a duplicate. This
    // keeps a missing or stale monthly bill recoverable on a re-import.
    if (adAccountId && agencyId) {
      try {
        const months = [...new Set(records.map(r => {
          const d = new Date(String(r.date || "").replace(/\x00/g, "").trim());
          return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }).filter(Boolean))] as string[];

        for (const month of months) {
          // 汇总该月份+代理商的信用消耗。部分广告文件只提供
          // creditConsumption/amount，没有逐行 estimatedRebate；这时按代理商
          // 配置比例补算返点，避免新月份只有广告账单而没有返点账单。
          const summary = await prisma.$queryRawUnsafe<Array<{ totalCredit: number; totalRebate: number; currency: string; ids: string }>>(
            `SELECT
               COALESCE(SUM(COALESCE("creditConsumption", amount)::numeric), 0) as "totalCredit",
               COALESCE(SUM(COALESCE(
                 "estimatedRebate",
                 COALESCE("creditConsumption", amount)::numeric
                   * COALESCE((SELECT "rebateRate" FROM "AdAgency" WHERE id = $1 LIMIT 1), 0)::numeric / 100
               )), 0) as "totalRebate",
               MAX(currency) as currency,
               STRING_AGG(id::text, ',') as ids
             FROM "AdConsumption"
             WHERE "agencyId" = $1 AND month = $2
               AND COALESCE("creditConsumption", amount) IS NOT NULL`,
            agencyId, month
          );

          const row = summary[0];
          if (!row || Number(row.totalCredit) <= 0) continue;

          const netAmount = Number(row.totalCredit) - Number(row.totalRebate);

          // 检查是否已存在该月份+代理商的广告账单
          const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "MonthlyBill" WHERE "billType" = '广告' AND "agencyId" = $1 AND month = $2 LIMIT 1`,
            agencyId, month
          );

          if (existing.length > 0) {
            // 已有账单：更新金额和关联消耗记录
            await prisma.$executeRawUnsafe(
              `UPDATE "MonthlyBill" SET "totalAmount" = $1, "rebateAmount" = $2, "netAmount" = $3, "consumptionIds" = $4, "updatedAt" = NOW() WHERE id = $5`,
              Number(row.totalCredit), Number(row.totalRebate), netAmount,
              row.ids || '', existing[0].id
            );
          } else {
            // 没有账单：创建新的
            await prisma.$executeRawUnsafe(
              `INSERT INTO "MonthlyBill" (id, month, "billCategory", "billType", "agencyId", "agencyName", "totalAmount", currency, "rebateAmount", "netAmount", "consumptionIds", "dueDate", status, "createdBy", notes, "createdAt", "updatedAt") VALUES ($1, $2, 'Payable', '广告', $3, $4, $5, $6, $7, $8, $9, ($2 || '-01')::date + INTERVAL '2 months', 'Draft', '系统自动生成', $10, NOW(), NOW())`,
              crypto.randomUUID(), month, agencyId, agencyName,
              Number(row.totalCredit), row.currency || "USD",
              Number(row.totalRebate), netAmount,
              row.ids || '',
              `信用消耗账单（${month}）- 导入时自动生成`
            );
          }

          // 自动生成返点应收款账单
          if (Number(row.totalRebate) > 0) {
            const rebateExisting = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
              `SELECT id FROM "MonthlyBill" WHERE "billType" = '广告返点' AND "agencyId" = $1 AND month = $2 LIMIT 1`,
              agencyId, month
            );
            if (rebateExisting.length > 0) {
              // 已有返点账单：更新金额
              await prisma.$executeRawUnsafe(
                `UPDATE "MonthlyBill" SET "totalAmount" = $1, "rebateAmount" = $2, "netAmount" = $3, "consumptionIds" = $4, "updatedAt" = NOW() WHERE id = $5`,
                Number(row.totalCredit), Number(row.totalRebate), Number(row.totalRebate),
                row.ids || '', rebateExisting[0].id
              );
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO "MonthlyBill" (id, month, "billCategory", "billType", "agencyId", "agencyName", "totalAmount", currency, "rebateAmount", "rebateRate", "netAmount", "consumptionIds", "dueDate", status, "createdBy", notes, "createdAt", "updatedAt") VALUES ($1, $2, 'Receivable', '广告返点', $3, $4, $5, $6, $7, (SELECT "rebateRate" FROM "AdAgency" WHERE id = $3 LIMIT 1), $8, $9, ($2 || '-01')::date + INTERVAL '2 months', 'Draft', '系统自动生成', $10, NOW(), NOW())`,
                crypto.randomUUID(), month, agencyId, agencyName,
                Number(row.totalCredit), row.currency || "USD",
                Number(row.totalRebate), Number(row.totalRebate),
                row.ids || '',
                `返点应收账单（${month}）- 导入时自动生成`
              );
            }
          }
        }
      } catch (billErr) {
        console.error("[import] auto-bill failed:", billErr instanceof Error ? billErr.message : String(billErr));
        // 账单生成失败不影响导入结果
      }
    }

    return NextResponse.json({ success: true, created, skipped, failed, total: records.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "导入失败" }, { status: 500 });
  }
}
