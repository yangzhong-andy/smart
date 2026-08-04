const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const order = await prisma.deliveryOrder.findUnique({
    where: { deliveryNumber: 'DO-1773480068604' }
  });
  console.log('DeliveryOrder:', JSON.stringify(order, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
