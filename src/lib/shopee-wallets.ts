export type WalletKind = "STORE" | "ADVERTISING";

function roundMoney(value: number) {
  const sign = value < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100);
}

export function normalizeWalletKind(value: unknown): WalletKind {
  const kind = String(value || "").trim().toUpperCase();
  if (kind !== "STORE" && kind !== "ADVERTISING") throw new Error("钱包类型无效");
  return kind;
}

export function normalizeMoney(value: unknown, label = "金额", allowZero = false) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new Error(`${label}必须${allowZero ? "大于等于" : "大于"} 0`);
  }
  return roundMoney(amount);
}

export function normalizeCurrency(value: unknown, fallback = "BRL") {
  const currency = String(value || fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("币种格式不正确");
  return currency;
}

export function normalizeAutoTopupRate(percentValue: unknown) {
  const percent = Number(percentValue || 0);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("自动充值比例必须在 0% 到 100% 之间");
  }
  return Math.round(percent * 10_000) / 1_000_000;
}

export function applySignedWalletAmount(balanceValue: unknown, amountValue: unknown) {
  const balance = Number(balanceValue);
  if (!Number.isFinite(balance)) throw new Error("钱包余额格式无效");
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount === 0) throw new Error("流水金额不能为 0");
  const roundedBalance = roundMoney(balance);
  const roundedAmount = roundMoney(amount);
  const balanceAfter = roundMoney(roundedBalance + roundedAmount);
  // 历史广告扣费可能早于可同步的充值明细，形成待补来源的负余额。
  // 收入必须允许继续补回；只有支出才受“不能扣穿余额”约束。
  if (roundedAmount < 0 && balanceAfter < 0) throw new Error(`钱包余额不足：当前余额 ${roundedBalance.toFixed(2)}`);
  return { balanceBefore: roundedBalance, amount: roundedAmount, balanceAfter };
}

export function validateInternalTransfer(
  source: { id: string; shopSettingId: string; walletType: string; currency: string; balance: unknown },
  target: { id: string; shopSettingId: string; walletType: string; currency: string },
  amountValue: unknown,
) {
  if (source.id === target.id) throw new Error("转出与转入钱包不能相同");
  if (source.shopSettingId !== target.shopSettingId) throw new Error("平台内部划转只能在同一家店铺内进行");
  if (source.walletType !== "STORE" || target.walletType !== "ADVERTISING") {
    throw new Error("只支持从店铺钱包划转到广告钱包");
  }
  if (source.currency !== target.currency) throw new Error("不同币种的钱包不能直接划转");
  const amount = normalizeMoney(amountValue, "划转金额");
  const debit = applySignedWalletAmount(source.balance, -amount);
  return { amount, debit };
}
