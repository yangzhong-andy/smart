/**
 * 万智香港代理IP API 客户端
 * 使用方法：
 *   import { wanziAPI } from '@/lib/wanzi-api';
 *   
 *   // 查询余额
 *   const credit = await wanziAPI.getCredit();
 *   
 *   // 购买IP
 *   const result = await wanziAPI.purchaseIP({
 *     proxies_type: 'Native',
 *     purpose_web: 'TikTok',
 *     city_name: 'Tokyo',
 *     count: 1
 *   });
 */

const WANZI_BASE_URL = 'https://api.wanzihk.com/api/N1';

// 授权信息 - 建议放到环境变量中
const USER_ID = '5564277922498993258';
const TOKEN = 'dyt61dlwepew4eiockzbif8kzmudcby2';

interface WanziResponse<T = any> {
  ts: number;
  traceId: string | null;
  Code: number;
  Message: string;
  Data: T;
}

interface CreditData {
  Credit: number;
  Used: number;
  Limit: number;
}

interface ProxyInfo {
  proxy_id: number;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  protocols: number;
  proxy_status: number;
  continents_id: string;
  continents_name: string;
  country_code: string;
  city_id: string;
  city_name: string;
  created_at: string;
  expired_at: string;
  udp_status: boolean;
  order_id: string;
  permissions: boolean;
}

interface PurchaseResponse {
  Quantity: number;
  TimePeriod: number;
  NodeInfos: ProxyInfo[];
}

interface CityInventory {
  continents_id: string;
  continents_name: string;
  country_code: string;
  city_id: string;
  city_name: string;
  number: number;  // 库存数量
}

interface InventoryResponse {
  purpose_web: string;
  country_list: CityInventory[];
}

interface BusinessItem {
  BusinessName: string;
}

interface IPListItem extends ProxyInfo {
  created_at_unix: number;
  expired_at_unix: number;
  expired: boolean;
}

interface IPListResponse {
  count: number;
  results: IPListItem[];
}

/**
 * 通用请求方法
 */
async function wanziRequest<T>(endpoint: string, data: object): Promise<T> {
  const response = await fetch(`${WANZI_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      UserId: USER_ID,
      Token: TOKEN,
      ...data,
    }),
  });

  const result: WanziResponse = await response.json();

  if (result.Code !== 1000) {
    throw new Error(`万智API错误: ${result.Message} (Code: ${result.Code})`);
  }

  return result.Data as T;
}

/**
 * 万智API 接口
 */
export const wanziAPI = {
  /**
   * 1. 获取账户额度信息
   * 返回: { Credit: 充值金额, Used: 已使用, Limit: 剩余 }
   */
  async getCredit(): Promise<CreditData> {
    return wanziRequest<CreditData>('/OpenApiCredit', {});
  },

  /**
   * 2. 获取业务场景清单
   * 返回: 业务场景列表，如 ['TikTok', 'Amazon', 'Instagram', ...]
   */
  async getBusinessList(): Promise<string[]> {
    const data = await wanziRequest<BusinessItem[]>('/OpenApiBusiness', {});
    return data.map(item => item.BusinessName);
  },

  /**
   * 3. 获取IP库存数量
   * @param proxies_type - 'Native' 或 'Broadcast'
   * @param purpose_web - 业务场景，如 'TikTok'
   * 返回: 各城市库存列表
   */
  async getInventory(proxies_type: string, purpose_web: string): Promise<CityInventory[]> {
    const data = await wanziRequest<InventoryResponse>('/OpenApiInventory', {
      proxies_type,
      purpose_web,
    });
    return data.country_list;
  },

  /**
   * 4. 下单订购新IP
   * @param params
   *   - proxies_type: 'Native' 或 'Broadcast'
   *   - purpose_web: 业务场景
   *   - city_name: 城市名称
   *   - count: 购买数量
   * 返回: 购买的代理IP信息
   */
  async purchaseIP(params: {
    proxies_type: string;
    purpose_web: string;
    city_name: string;
    count: number;
  }): Promise<PurchaseResponse> {
    return wanziRequest<PurchaseResponse>('/OpenApiPurchase', {
      proxies_type: params.proxies_type,
      purpose_web: params.purpose_web,
      udp_status: true,
      city_name: params.city_name,
      count: params.count,
    });
  },

  /**
   * 5. 续费IP
   * @param proxy_ids - Proxy ID数组，如 [11111111, 22222222]
   * 返回: 续费后的IP信息
   */
  async renewIP(proxy_ids: number[]): Promise<PurchaseResponse> {
    return wanziRequest<PurchaseResponse>('/OpenApiRenew', {
      proxies_ids: proxy_ids,
    });
  },

  /**
   * 6. 更换IP的用户名和密码
   * @param proxy_ids - Proxy ID数组
   * @param username - 新用户名
   * @param password - 新密码
   */
  async changeUserPass(proxy_ids: number[], username: string, password: string): Promise<boolean> {
    return wanziRequest<boolean>('/OpenApiUserPass', {
      proxy_ids,
      username,
      password,
    });
  },

  /**
   * 7. 获取IP清单（已购买的IP列表）
   * @param proxies_type - 'Native' 或 'Broadcast'
   * @param city_name - 可选，按城市筛选
   * @param expiring_days - 可选，筛选剩余天数
   */
  async getIPList(params: {
    proxies_type: string;
    city_name?: string;
    expiring_days?: number;
  }): Promise<IPListResponse> {
    return wanziRequest<IPListResponse>('/OpenApiList', {
      proxies_type: params.proxies_type,
      ...(params.city_name && { city_name: params.city_name }),
      ...(params.expiring_days && { expiring_days: params.expiring_days }),
    });
  },

  /**
   * 8. 获取IP详细信息
   * @param proxy_addresses - IP地址数组
   */
  async getIPDetail(proxy_addresses: string[]): Promise<ProxyInfo[]> {
    return wanziRequest<ProxyInfo[]>('/OpenApiDetail', {
      proxy_address: proxy_addresses,
    });
  },
};

/**
 * 常用城市列表（从文档中整理）
 */
export const CITIES = {
  US: ['Los Angeles', 'New York', 'Washington', 'Ashburn', 'Chicago', 'San Francisco', 'Dallas', 'Atlanta', 'Seattle', 'Phoenix', 'Boston', 'Miami', 'Denver', 'Las Vegas', 'Austin', 'Charlotte', 'Philadelphia', 'San Jose', 'Indianapolis', 'Minneapolis', 'Sacramento', 'San Antonio', 'Salt Lake City', 'Honolulu', 'Tampa'],
  JP: ['Tokyo', 'Urayasu'],
  KR: ['Seoul'],
  SG: ['Singapore'],
  HK: ['Hong Kong', 'Hong Kong S'],
  MY: ['Kuala Lumpur'],
  PH: ['Manila'],
  TH: ['Bangkok'],
  ID: ['Jakarta'],
  VN: ['Hanoi', 'Ho Chi Minh'],
  IN: ['Mumbai'],
  AE: ['Dubai'],
  SA: ['Riyadh'],
  GB: ['London'],
  FR: ['Paris'],
  DE: ['Berlin', 'Frankfurt'],
  IT: ['Rome', 'Milan'],
  ES: ['Madrid'],
  AU: ['Melbourne', 'Sydney'],
  CA: ['Toronto'],
  MX: ['Mexico City'],
  BR: ['Sao Paulo', 'Rio de Janeiro'],
  CL: ['Santiago'],
  AR: ['Buenos Aires'],
  ZA: ['Johannesburg'],
  TW: ['TaiPei'],
} as const;

export type CityName = typeof CITIES.US[number];