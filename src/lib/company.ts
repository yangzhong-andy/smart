/**
 * 本公司（甲方/需方）信息 - 合同、单据等统一从此处读取，方便维护与调用。
 * 优先使用环境变量，便于部署与多环境区分；未配置时使用下方默认值（请按实际修改）。
 */

export type CompanyInfo = {
  /** 公司名称 */
  name: string;
  /** 地址 */
  address: string;
  /** 电话 */
  phone: string;
  /** 联系代表（合同签字人/对接人） */
  contact: string;
  /** 付款账号：卡号 */
  bankAccount: string;
  /** 付款账号：户名 */
  bankAccountName: string;
  /** 付款账号：开户行 */
  bankName: string;
  /** 税号（可选） */
  taxId?: string;
};

const defaults: CompanyInfo = {
  name: "_________________________",
  address: "_________________________",
  phone: "_________________________",
  contact: "_________________________",
  bankAccount: "_________________________",
  bankAccountName: "_________________________",
  bankName: "_________________________",
};

function getEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return (process.env as Record<string, string | undefined>)[key];
}

/**
 * 获取本公司（甲方）信息。
 * 环境变量（可选）：
 *   COMPANY_NAME, COMPANY_ADDRESS, COMPANY_PHONE, COMPANY_CONTACT
 *   COMPANY_BANK_ACCOUNT, COMPANY_BANK_ACCOUNT_NAME, COMPANY_BANK_NAME
 *   COMPANY_TAX_ID
 */
export function getCompanyInfo(): CompanyInfo {
  return {
    name: getEnv("COMPANY_NAME") ?? defaults.name,
    address: getEnv("COMPANY_ADDRESS") ?? defaults.address,
    phone: getEnv("COMPANY_PHONE") ?? defaults.phone,
    contact: getEnv("COMPANY_CONTACT") ?? defaults.contact,
    bankAccount: getEnv("COMPANY_BANK_ACCOUNT") ?? defaults.bankAccount,
    bankAccountName: getEnv("COMPANY_BANK_ACCOUNT_NAME") ?? defaults.bankAccountName,
    bankName: getEnv("COMPANY_BANK_NAME") ?? defaults.bankName,
    taxId: getEnv("COMPANY_TAX_ID") ?? undefined,
  };
}

/**
 * 仅在服务端/API 中可用。前端合同预览使用的甲方数据来自合同快照（snapshot.buyer），
 * 由生成合同时的服务端写入，无需在前端读取环境变量。
 */
