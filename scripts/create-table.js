const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  console.log('🔄 创建 PendingInboundItem 表...');
  
  // 使用原始SQL创建表
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "PendingInboundItem" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      "pendingInboundId" TEXT NOT NULL,
      "variantId" TEXT,
      "sku" TEXT NOT NULL,
      "skuName" TEXT,
      "spec" TEXT,
      "qty" INTEGER NOT NULL,
      "receivedQty" INTEGER NOT NULL DEFAULT 0,
      "unitPrice" DECIMAL(18,2),
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  
  // 创建索引
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PendingInboundItem_pendingInboundId_idx" ON "PendingInboundItem"("pendingInboundId");`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PendingInboundItem_variantId_idx" ON "PendingInboundItem"("variantId");`;
  
  console.log('✅ PendingInboundItem 表创建成功！');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
