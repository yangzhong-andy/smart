const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const reqs = await p.$queryRaw`SELECT id, summary, amount, currency, status, remark, "businessNumber", "containerId", "containerNo", voucher FROM "ExpenseRequest" WHERE summary ILIKE '%BATCH-1775035%' OR remark ILIKE '%多批次%' ORDER BY "createdAt" ASC`;
  console.log('found:', reqs.length);
  reqs.forEach(r => {
    console.log('---');
    console.log('id:', r.id);
    console.log('summary:', r.summary);
    console.log('amount:', r.amount, r.currency);
    console.log('status:', r.status);
    console.log('businessNumber:', r.businessNumber);
    console.log('containerId:', r.containerId);
    console.log('containerNo:', r.containerNo);
    console.log('remark:', r.remark);
    console.log('voucher_len:', r.voucher ? r.voucher.length : 0);
  });
})()
  .then(() => p.$disconnect())
  .catch(e => { console.error('ERR:', e.message); process.exit(1);});
