export function allocateMoneyByWeight(total: number, weights: number[], digits = 2) {
  if (weights.length === 0) return [];
  const factor = 10 ** digits;
  const totalMinor = Math.round(Math.abs(Number.isFinite(total) ? total : 0) * factor);
  const sign = total < 0 ? -1 : 1;
  const normalized = weights.map((value) => Number.isFinite(value) && value > 0 ? value : 0);
  const weightTotal = normalized.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = weightTotal > 0 ? normalized : normalized.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const allocations = effectiveWeights.map((weight, index) => {
    const exact = effectiveTotal > 0 ? totalMinor * weight / effectiveTotal : 0;
    const minor = Math.floor(exact);
    return { index, minor, remainder: exact - minor };
  });
  let remaining = totalMinor - allocations.reduce((sum, item) => sum + item.minor, 0);
  const byRemainder = [...allocations].sort((left, right) => (
    right.remainder - left.remainder || left.index - right.index
  ));
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    byRemainder[index % byRemainder.length].minor += 1;
  }
  return allocations
    .sort((left, right) => left.index - right.index)
    .map((item) => sign * item.minor / factor);
}
