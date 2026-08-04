/**
 * 清理重复的「采购尾款」待审批支出申请：同一 relatedId（拿货单）仅保留最早创建的一条，删除其余 Pending_Approval。
 *
 * 使用（在项目根目录、已配置 DATABASE_URL）：
 *   npx ts-node scripts/dedupe-pending-tail-expenses.ts
 *
 * 或指定 env 文件：
 *   npx env-cmd -f .env.local npx ts-node scripts/dedupe-pending-tail-expenses.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.expenseRequest.findMany({
    where: {
      status: "Pending_Approval",
      relatedId: { not: null },
      summary: { contains: "采购尾款" },
    },
    orderBy: { createdAt: "asc" },
  });

  const byRelated = new Map<string, typeof pending>();
  for (const r of pending) {
    const k = r.relatedId!;
    if (!byRelated.has(k)) byRelated.set(k, []);
    byRelated.get(k)!.push(r);
  }

  let deleted = 0;
  for (const [, rows] of byRelated) {
    if (rows.length <= 1) continue;
    const [, ...duplicates] = rows;
    for (const d of duplicates) {
      await prisma.expenseRequest.delete({ where: { id: d.id } });
      console.log(
        `[dedupe] deleted duplicate ${d.id} | relatedId=${d.relatedId} | ${d.summary.slice(0, 60)}…`
      );
      deleted += 1;
    }
  }

  console.log(`[dedupe] done. removed ${deleted} duplicate(s), kept oldest per relatedId.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
