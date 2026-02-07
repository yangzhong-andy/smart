/**
 * 创建 InventoryLog 表及枚举（库存流水：入库/出库/调拨）
 * 若入库时报错 "The table `public.InventoryLog` does not exist"，在项目根目录执行：
 *   node scripts/add-inventory-log-table.js
 * 或：npm run fix:inventory-log
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run(sql, desc) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log('  ✓', desc);
  } catch (e) {
    if (e.message && (e.message.includes('already exists') || e.message.includes('duplicate'))) {
      console.log('  -', desc, '(已存在，跳过)');
    } else {
      throw e;
    }
  }
}

async function main() {
  console.log('正在创建 InventoryLog 表及相关对象...\n');

  try {
    await prisma.$connect();
    console.log('数据库连接成功。\n');

    await run(
      `DO $$ BEGIN CREATE TYPE "InventoryLogType" AS ENUM ('IN', 'OUT', 'TRANSFER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      '枚举 InventoryLogType'
    );
    await run(
      `DO $$ BEGIN CREATE TYPE "InventoryLogStatus" AS ENUM ('PENDING_INBOUND', 'INBOUNDED', 'IN_TRANSIT', 'ARRIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      '枚举 InventoryLogStatus'
    );

    await run(
      `CREATE TABLE IF NOT EXISTS "InventoryLog" (
        "id" TEXT NOT NULL,
        "type" "InventoryLogType" NOT NULL,
        "status" "InventoryLogStatus" NOT NULL,
        "variantId" TEXT NOT NULL,
        "qty" INTEGER NOT NULL,
        "warehouseId" TEXT,
        "fromWarehouseId" TEXT,
        "toWarehouseId" TEXT,
        "deliveryOrderId" TEXT,
        "relatedOrderNo" TEXT,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
      );`,
      '表 InventoryLog'
    );

    await run(`CREATE INDEX IF NOT EXISTS "InventoryLog_variantId_idx" ON "InventoryLog"("variantId");`, '索引 variantId');
    await run(`CREATE INDEX IF NOT EXISTS "InventoryLog_warehouseId_idx" ON "InventoryLog"("warehouseId");`, '索引 warehouseId');
    await run(`CREATE INDEX IF NOT EXISTS "InventoryLog_deliveryOrderId_idx" ON "InventoryLog"("deliveryOrderId");`, '索引 deliveryOrderId');
    await run(`CREATE INDEX IF NOT EXISTS "InventoryLog_type_idx" ON "InventoryLog"("type");`, '索引 type');
    await run(`CREATE INDEX IF NOT EXISTS "InventoryLog_status_idx" ON "InventoryLog"("status");`, '索引 status');

    const fks = [
      ['InventoryLog_variantId_fkey', 'variantId', 'ProductVariant', 'id', 'CASCADE'],
      ['InventoryLog_warehouseId_fkey', 'warehouseId', 'Warehouse', 'id', 'SET NULL'],
      ['InventoryLog_fromWarehouseId_fkey', 'fromWarehouseId', 'Warehouse', 'id', 'SET NULL'],
      ['InventoryLog_toWarehouseId_fkey', 'toWarehouseId', 'Warehouse', 'id', 'SET NULL'],
      ['InventoryLog_deliveryOrderId_fkey', 'deliveryOrderId', 'DeliveryOrder', 'id', 'SET NULL']
    ];
    for (const [name, col, refTable, refCol, onDel] of fks) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "InventoryLog" ADD CONSTRAINT "${name}" FOREIGN KEY ("${col}") REFERENCES "${refTable}"("${refCol}") ON DELETE ${onDel} ON UPDATE CASCADE;`
        );
        console.log('  ✓', '外键', name);
      } catch (e) {
        if (e.message && e.message.includes('already exists')) {
          console.log('  -', '外键', name, '(已存在，跳过)');
        } else {
          console.log('  !', '外键', name, e.message);
        }
      }
    }

    console.log('\n完成。请重新在拿货单管理页点击「确认入库」。');
  } catch (e) {
    console.error('\n执行失败：', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
