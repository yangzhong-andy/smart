export type ConversionOutputInput = {
  variantId: string;
  quantityPerSource: number;
};

export type StockBalance = {
  qty: number;
  reservedQty: number;
};

function wholeNumber(value: unknown, label: string, allowZero = false) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`${label}必须是${allowZero ? "大于等于" : "大于"} 0 的整数`);
  }
  return parsed;
}

export function normalizeConversionOutputs(sourceVariantId: string, outputs: ConversionOutputInput[]) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error("至少配置一个拆装后 SKU");
  const seen = new Set<string>();
  return outputs.map((output) => {
    const variantId = String(output?.variantId || "").trim();
    if (!variantId) throw new Error("请选择拆装后 SKU");
    if (variantId === sourceVariantId) throw new Error("母 SKU 不能同时作为拆装后 SKU");
    if (seen.has(variantId)) throw new Error("拆装后 SKU 不能重复");
    seen.add(variantId);
    return { variantId, quantityPerSource: wholeNumber(output.quantityPerSource, "拆装比例") };
  });
}

export function reserveSourceStock(balance: StockBalance, plannedQtyValue: unknown) {
  const plannedQty = wholeNumber(plannedQtyValue, "计划拆装数量");
  const qty = wholeNumber(balance.qty, "当前库存", true);
  const reservedQty = wholeNumber(balance.reservedQty, "锁定库存", true);
  const availableQty = qty - reservedQty;
  if (availableQty < plannedQty) throw new Error(`可用库存不足：当前可用 ${availableQty} 件`);
  return { plannedQty, qty, reservedQty: reservedQty + plannedQty, availableQty: availableQty - plannedQty };
}

export function completeSourceStock(
  balance: StockBalance,
  plannedQtyValue: unknown,
  completedQtyValue: unknown,
  damagedQtyValue: unknown,
) {
  const plannedQty = wholeNumber(plannedQtyValue, "计划拆装数量");
  const completedQty = wholeNumber(completedQtyValue, "实际完成数量", true);
  const damagedQty = wholeNumber(damagedQtyValue, "破损数量", true);
  if (completedQty + damagedQty <= 0) throw new Error("实际完成数量和破损数量不能同时为 0");
  if (completedQty + damagedQty > plannedQty) throw new Error("实际完成数量与破损数量不能超过计划数量");
  if (balance.reservedQty < plannedQty) throw new Error("拆装锁定库存异常，请先核对库存");
  const consumedQty = completedQty + damagedQty;
  if (balance.qty < consumedQty) throw new Error(`母 SKU 实物库存不足：当前 ${balance.qty} 件`);
  const qty = balance.qty - consumedQty;
  const reservedQty = balance.reservedQty - plannedQty;
  return {
    plannedQty,
    completedQty,
    damagedQty,
    consumedQty,
    uncompletedQty: plannedQty - consumedQty,
    qty,
    reservedQty,
    availableQty: qty - reservedQty,
  };
}

export function cancelSourceReservation(balance: StockBalance, plannedQtyValue: unknown) {
  const plannedQty = wholeNumber(plannedQtyValue, "计划拆装数量");
  if (balance.reservedQty < plannedQty) throw new Error("拆装锁定库存异常，请先核对库存");
  const reservedQty = balance.reservedQty - plannedQty;
  return { qty: balance.qty, reservedQty, availableQty: balance.qty - reservedQty };
}

export function calculateOutputQuantities(completedQtyValue: unknown, outputs: ConversionOutputInput[]) {
  const completedQty = wholeNumber(completedQtyValue, "实际完成数量", true);
  return outputs.map((output) => ({
    ...output,
    quantity: completedQty * wholeNumber(output.quantityPerSource, "拆装比例"),
  }));
}
