import { prisma } from "@/lib/prisma";

let ensurePromise: Promise<void> | null = null;

/**
 * 兼容历史环境：部分库还未执行到 accountId/storeIds 迁移。
 * 在广告账户接口访问前做一次幂等自愈，避免列表/创建直接 500。
 */
export async function ensureAdAccountSchema(): Promise<void> {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "accountId" TEXT;'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];'
    );

    // 旧字段兜底回填：platformAccountId -> accountId
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'AdAccount'
            AND column_name = 'platformAccountId'
        ) THEN
          UPDATE "AdAccount"
          SET "accountId" = COALESCE("accountId", "platformAccountId")
          WHERE "accountId" IS NULL;
        END IF;
      END $$;
    `);
  })();

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
}
