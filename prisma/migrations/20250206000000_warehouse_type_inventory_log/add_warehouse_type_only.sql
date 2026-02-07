-- 若创建仓库报错「数据库缺少 type 字段」，可在数据库里执行本文件（只添加 Warehouse.type，不影响其它表）
-- 使用：在 psql / DBeaver / Navicat 等中连接同一数据库后执行

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WarehouseType') THEN
    CREATE TYPE "WarehouseType" AS ENUM ('DOMESTIC', 'OVERSEAS');
  END IF;
END $$;

ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "type" "WarehouseType" NOT NULL DEFAULT 'DOMESTIC';
