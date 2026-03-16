const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  const order = await prisma.deliveryOrder.findUnique({
    where: { deliveryNumber: 'DO-1773480068604' }
  });
  console.log('DeliveryOrder:', JSON.stringify(order, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
