const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_jfYuxqnG2SG3FrtnT6drd@db.prisma.io:5432/postgres?sslmode=require"
    }
  }
});

async function main() {
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      deliveryNumber: 'DO-1773994387382'
    },
    select: {
      id: true,
      deliveryNumber: true,
      qty: true,
      itemQtys: true,
      contractNumber: true
    }
  });
  
  console.log(JSON.stringify(orders, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
