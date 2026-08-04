/**
 * 为 Warehouse 表添加 type 字段（国内仓/海外仓）
 * 若创建仓库时报错「数据库缺少 type 字段」，在项目根目录执行：
 *   node scripts/add-warehouse-type.js
 *
 * 需要先有 .env 里的 DATABASE_URL，且能连上数据库。
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('正在为 Warehouse 表添加 type 字段...\n');

  try {
    await prisma.$connect();
    console.log('数据库连接成功。');

    // 1. 创建枚举（若不存在）
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WarehouseType') THEN
          CREATE TYPE "WarehouseType" AS ENUM ('DOMESTIC', 'OVERSEAS');
          RAISE NOTICE '已创建枚举 WarehouseType';
        ELSE
          RAISE NOTICE '枚举 WarehouseType 已存在，跳过';
        END IF;
      END $$;
    `);
    console.log('枚举 WarehouseType 已就绪。');

    // 2. 添加 type 列（若不存在）
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "type" "WarehouseType" NOT NULL DEFAULT 'DOMESTIC';
    `);
    console.log('Warehouse.type 列已就绪。');

    console.log('\n完成。请重新尝试在页面上「创建仓库」。');
  } catch (e) {
    console.error('执行失败：', e.message);
    if (e.message && e.message.includes('already exists')) {
      console.log('（可能 type 已存在，可直接在页面创建仓库试试）');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
