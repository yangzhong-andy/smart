import { useMemo } from 'react';

/**
 * 重量计算 Hook
 * 自动计算体积重和计费重量
 * 
 * @param length - 长度（cm）
 * @param width - 宽度（cm）
 * @param height - 高度（cm）
 * @param volumetricDivisor - 体积重换算系数（默认 5000）
 * @param actualWeight - 实际重量（kg）
 * @returns 体积重和计费重量
 */
export function useWeightCalculation(
  length: string | number | undefined,
  width: string | number | undefined,
  height: string | number | undefined,
  volumetricDivisor: string | number | undefined = 5000,
  actualWeight: string | number | undefined = 0
) {
  const result = useMemo(() => {
    // 转换为数字
    const len = typeof length === 'string' ? parseFloat(length) : length;
    const wid = typeof width === 'string' ? parseFloat(width) : width;
    const hei = typeof height === 'string' ? parseFloat(height) : height;
    const divisor = typeof volumetricDivisor === 'string' ? parseFloat(volumetricDivisor) : volumetricDivisor;
    const actual = typeof actualWeight === 'string' ? parseFloat(actualWeight) : actualWeight;

    // 检查是否有有效值
    const hasValidDimensions = len && wid && hei && len > 0 && wid > 0 && hei > 0;
    const hasValidDivisor = divisor && divisor > 0;
    const hasValidActualWeight = actual !== undefined && actual !== null && !isNaN(actual);

    // 计算体积重：长 × 宽 × 高 ÷ 体积重换算系数
    let volumetricWeight = 0;
    if (hasValidDimensions && hasValidDivisor) {
      volumetricWeight = (len * wid * hei) / divisor;
    }

    // 计算计费重量：实际重量和体积重取最大值
    const actualWeightValue = hasValidActualWeight ? Math.max(0, actual) : 0;
    const chargeableWeight = Math.max(actualWeightValue, volumetricWeight);

    return {
      // 是否有有效的尺寸数据
      hasValidDimensions: hasValidDimensions && hasValidDivisor,
      // 体积重（千克）
      volumetricWeight,
      // 实际重量（千克）
      actualWeight: actualWeightValue,
      // 计费重量（千克）- 实际重量和体积重取最大值
      chargeableWeight,
      // 计算公式字符串（用于显示）
      formula: hasValidDimensions && hasValidDivisor
        ? `${len.toFixed(2)} × ${wid.toFixed(2)} × ${hei.toFixed(2)} ÷ ${divisor}`
        : null
    };
  }, [length, width, height, volumetricDivisor, actualWeight]);

  return result;
}
