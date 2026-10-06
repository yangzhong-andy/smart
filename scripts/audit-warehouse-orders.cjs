const { PrismaClient } = require('/srv/smart-erp/baxi/current/node_modules/@prisma/client');
const prisma = new PrismaClient();
const orderIds = process.argv.slice(2);
async function main() {
  const orders = await prisma.tikTokOrder.findMany({ where: orderIds.length ? { orderId: { in: orderIds } } : {}, orderBy: { createTime: 'desc' }, take: orderIds.length ? undefined : 10, select: { orderId:true, shopId:true, createTime:true, status:true, rawData:true } });
  const variants = await prisma.productVariant.findMany({ select:{id:true,skuId:true,weightKg:true,lengthCm:true,widthCm:true,heightCm:true,product:{select:{name:true}}} });
  const bySku = new Map(variants.map(v=>[v.skuId.toLowerCase(),v]));
  const out = orders.map(o => { const raw=o.rawData||{}; const items=raw.line_items||raw.lineItems||raw.items||raw.product_items||[]; return {orderId:o.orderId,shopId:o.shopId,createTime:o.createTime,status:o.status,items:items.map(i=>{const sku=String(i.seller_sku||i.sellerSku||i.sku||'');const v=bySku.get(sku.toLowerCase());return {sellerSku:sku,quantity:i.quantity,sale_price:i.sale_price,variant:v?{skuId:v.skuId,weightKg:String(v.weightKg),lengthCm:String(v.lengthCm),widthCm:String(v.widthCm),heightCm:String(v.heightCm),name:v.product?.name}:null};})};});
  console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
