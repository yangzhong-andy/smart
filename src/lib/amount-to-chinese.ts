/**
 * 金额转人民币大写
 * 例如：1234.56 -> 壹仟贰佰叁拾肆元伍角陆分
 */
const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const UNITS = ["", "拾", "佰", "仟"];
const SECTIONS = ["", "万", "亿"];

function sectionToChinese(n: number): string {
  if (n === 0) return "零";
  let s = "";
  let u = 0;
  let needZero = false;
  while (n > 0) {
    const d = n % 10;
    if (d === 0) {
      if (needZero) s = "零" + s;
      needZero = false;
    } else {
      s = DIGITS[d] + UNITS[u] + s;
      needZero = true;
    }
    n = Math.floor(n / 10);
    u = (u + 1) % 4;
  }
  return s;
}

export function amountToChineseUppercase(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "零元整";
  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);
  if (intPart === 0 && decPart === 0) return "零元整";

  let result = "";
  if (intPart > 0) {
    const str = String(intPart);
    const len = str.length;
    for (let i = 0; i < len; i += 4) {
      const section = parseInt(str.slice(Math.max(0, len - i - 4), len - i), 10);
      const sectionStr = sectionToChinese(section);
      const sectionUnit = SECTIONS[Math.floor(i / 4)];
      if (sectionStr) result = sectionStr + sectionUnit + result;
    }
    result += "元";
  } else {
    result = "零元";
  }

  if (decPart === 0) {
    result += "整";
  } else {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;
    result += DIGITS[jiao] + (jiao ? "角" : "");
    result += DIGITS[fen] + (fen ? "分" : "");
    if (!jiao && fen) result = result.replace("零元", "零元零角");
  }
  return result;
}
