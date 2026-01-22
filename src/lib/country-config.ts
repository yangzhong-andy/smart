/**
 * 国家/地区配置
 * 包含国家代码、名称、法定货币等信息
 */

export type Country = {
  code: string; // ISO 国家代码
  name: string; // 国家名称（中文）
  nameEn: string; // 国家名称（英文）
  currency: "GBP" | "JPY" | "USD" | "RMB" | "EUR" | "HKD" | "SGD" | "AUD"; // 法定货币
  region: "亚洲" | "欧洲" | "美洲" | "大洋洲" | "其他"; // 地区
};

export const COUNTRIES: Country[] = [
  // 亚洲
  { code: "CN", name: "中国", nameEn: "China", currency: "RMB", region: "亚洲" },
  { code: "JP", name: "日本", nameEn: "Japan", currency: "JPY", region: "亚洲" },
  { code: "KR", name: "韩国", nameEn: "South Korea", currency: "USD", region: "亚洲" },
  { code: "SG", name: "新加坡", nameEn: "Singapore", currency: "SGD", region: "亚洲" },
  { code: "HK", name: "香港", nameEn: "Hong Kong", currency: "HKD", region: "亚洲" },
  { code: "TW", name: "台湾", nameEn: "Taiwan", currency: "USD", region: "亚洲" },
  { code: "IN", name: "印度", nameEn: "India", currency: "USD", region: "亚洲" },
  { code: "TH", name: "泰国", nameEn: "Thailand", currency: "USD", region: "亚洲" },
  { code: "MY", name: "马来西亚", nameEn: "Malaysia", currency: "USD", region: "亚洲" },
  { code: "PH", name: "菲律宾", nameEn: "Philippines", currency: "USD", region: "亚洲" },
  { code: "VN", name: "越南", nameEn: "Vietnam", currency: "USD", region: "亚洲" },
  { code: "ID", name: "印尼", nameEn: "Indonesia", currency: "USD", region: "亚洲" },
  
  // 欧洲
  { code: "UK", name: "英国", nameEn: "United Kingdom", currency: "GBP", region: "欧洲" },
  { code: "DE", name: "德国", nameEn: "Germany", currency: "EUR", region: "欧洲" },
  { code: "FR", name: "法国", nameEn: "France", currency: "EUR", region: "欧洲" },
  { code: "IT", name: "意大利", nameEn: "Italy", currency: "EUR", region: "欧洲" },
  { code: "ES", name: "西班牙", nameEn: "Spain", currency: "EUR", region: "欧洲" },
  { code: "NL", name: "荷兰", nameEn: "Netherlands", currency: "EUR", region: "欧洲" },
  { code: "PL", name: "波兰", nameEn: "Poland", currency: "EUR", region: "欧洲" },
  { code: "SE", name: "瑞典", nameEn: "Sweden", currency: "EUR", region: "欧洲" },
  
  // 美洲
  { code: "US", name: "美国", nameEn: "United States", currency: "USD", region: "美洲" },
  { code: "CA", name: "加拿大", nameEn: "Canada", currency: "USD", region: "美洲" },
  { code: "MX", name: "墨西哥", nameEn: "Mexico", currency: "USD", region: "美洲" },
  { code: "BR", name: "巴西", nameEn: "Brazil", currency: "USD", region: "美洲" },
  
  // 大洋洲
  { code: "AU", name: "澳大利亚", nameEn: "Australia", currency: "AUD", region: "大洋洲" },
  { code: "NZ", name: "新西兰", nameEn: "New Zealand", currency: "USD", region: "大洋洲" },
  
  // 其他
  { code: "GLOBAL", name: "全球", nameEn: "Global", currency: "USD", region: "其他" }
];

/**
 * 根据国家代码获取国家信息
 */
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

/**
 * 根据国家代码获取法定货币
 */
export function getCurrencyByCountry(code: string): string {
  const country = getCountryByCode(code);
  return country?.currency || "USD";
}

/**
 * 按地区分组国家
 */
export function getCountriesByRegion(): Record<string, Country[]> {
  const grouped: Record<string, Country[]> = {};
  COUNTRIES.forEach((country) => {
    if (!grouped[country.region]) {
      grouped[country.region] = [];
    }
    grouped[country.region].push(country);
  });
  return grouped;
}
