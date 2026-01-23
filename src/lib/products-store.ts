/**
 * 产品中心数据存储
 * 管理产品档案、SKU映射等
 */

export type ProductStatus = "ACTIVE" | "INACTIVE";

export type PlatformSKUMapping = {
  platform: "TikTok" | "Amazon" | "其他";
  platformSkuId: string; // 平台SKU ID
  platformSkuName?: string; // 平台SKU名称（可选）
};

export type Product = {
  // 基础信息
  sku_id: string; // 主键，SKU编码
  name: string; // 产品名称（SPU名称）
  main_image: string; // 主图（base64 或 URL）
  category?: string; // 分类
  brand?: string; // 品牌（SPU字段）
  description?: string; // 产品描述（SPU字段）
  material?: string; // 材质（SPU字段）
  customs_name_cn?: string; // 报关名（中文）（SPU字段）
  customs_name_en?: string; // 报关名（英文）（SPU字段）
  default_supplier_id?: string; // 默认供应商ID（SPU字段）
  default_supplier_name?: string; // 默认供应商名称（冗余字段，便于显示）
  status: ProductStatus; // ACTIVE/INACTIVE
  
  // SKU 变体信息
  color?: string; // 颜色（SKU字段）
  size?: string; // 尺寸（SKU字段）
  barcode?: string; // 条形码（SKU字段）
  stock_quantity?: number; // 总库存数量（SKU字段）
  
  // 财务信息
  cost_price: number; // 参考拿货价
  target_roi?: number; // 目标ROI（%）
  currency: "CNY" | "USD" | "HKD" | "JPY" | "GBP" | "EUR"; // 默认CNY
  
  // 物理信息（用于算运费）
  weight_kg?: number; // 重量（千克）
  length?: number; // 长度（cm）
  width?: number; // 宽度（cm）
  height?: number; // 高度（cm）
  volumetric_divisor?: number; // 体积重换算系数（5000 或 6000）
  
  // 供应信息
  factory_id?: string; // 主供应商/工厂ID（向后兼容，保留）
  factory_name?: string; // 主供应商/工厂名称（向后兼容，保留）
  moq?: number; // 最小起订量（MOQ）（向后兼容，保留）
  lead_time?: number; // 生产周期（天）（向后兼容，保留）
  
  // 多供应商支持
  suppliers?: Array<{
    id: string; // 供应商ID
    name: string; // 供应商名称
    price?: number; // 该供应商的拿货价
    moq?: number; // 该供应商的最小起订量
    lead_time?: number; // 该供应商的生产周期（天）
    isPrimary?: boolean; // 是否为主供应商
  }>;
  
  // 虚拟仓库库存（轻量化实现）
  at_factory?: number; // 工厂现货数量（默认0）
  at_domestic?: number; // 国内待发数量（默认0）
  in_transit?: number; // 海运中数量（默认0）
  
  // 映射信息
  platform_sku_mapping?: PlatformSKUMapping[]; // 平台SKU映射（JSON数组）
  
  // 关联ID（新增）
  product_id?: string; // Product (SPU) ID
  variant_id?: string; // ProductVariant (SKU) ID
  
  // 元数据
  createdAt: string;
  updatedAt: string;
};

const PRODUCTS_KEY = "products";

/**
 * 获取所有产品
 */
export function getProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PRODUCTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse products", e);
    return [];
  }
}

/**
 * 保存产品列表
 */
export function saveProducts(products: Product[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error("Failed to save products", e);
  }
}

/**
 * 根据SKU ID获取产品
 */
export function getProductBySkuId(skuId: string): Product | undefined {
  const products = getProducts();
  return products.find((p) => p.sku_id === skuId);
}

/**
 * 根据状态获取产品列表
 */
export function getProductsByStatus(status: ProductStatus): Product[] {
  const products = getProducts();
  return products.filter((p) => p.status === status);
}

/**
 * 根据工厂ID获取产品列表（支持多供应商）
 */
export function getProductsByFactoryId(factoryId: string): Product[] {
  const products = getProducts();
  return products.filter((p) => {
    // 方法1: 检查主供应商（向后兼容）
    if (p.factory_id === factoryId) return true;
    
    // 方法2: 检查多供应商列表
    if (p.suppliers && Array.isArray(p.suppliers)) {
      return p.suppliers.some((s) => s.id === factoryId);
    }
    
    // 方法3: 兼容旧数据，通过 factory_name 匹配（需要传入供应商名称）
    return false;
  });
}

/**
 * 根据平台SKU ID查找产品
 */
export function getProductByPlatformSku(platform: string, platformSkuId: string): Product | undefined {
  const products = getProducts();
  return products.find((p) => 
    p.platform_sku_mapping?.some((m) => 
      m.platform === platform && m.platformSkuId === platformSkuId
    )
  );
}

/**
 * 创建或更新产品
 */
export function upsertProduct(product: Product): void {
  const products = getProducts();
  const existingIndex = products.findIndex((p) => p.sku_id === product.sku_id);
  
  if (existingIndex >= 0) {
    // 更新现有产品
    products[existingIndex] = {
      ...product,
      updatedAt: new Date().toISOString()
    };
  } else {
    // 新增产品
    products.push({
      ...product,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  
  saveProducts(products);
}

/**
 * 删除产品
 */
export function deleteProduct(skuId: string): boolean {
  const products = getProducts();
  const filtered = products.filter((p) => p.sku_id !== skuId);
  
  if (filtered.length === products.length) {
    return false; // 未找到产品
  }
  
  saveProducts(filtered);
  return true;
}

/**
 * 添加平台SKU映射
 */
export function addPlatformSKUMapping(
  skuId: string,
  mapping: PlatformSKUMapping
): boolean {
  const product = getProductBySkuId(skuId);
  if (!product) return false;
  
  const mappings = product.platform_sku_mapping || [];
  // 检查是否已存在相同平台的映射
  const existingIndex = mappings.findIndex((m) => m.platform === mapping.platform);
  
  if (existingIndex >= 0) {
    mappings[existingIndex] = mapping;
  } else {
    mappings.push(mapping);
  }
  
  product.platform_sku_mapping = mappings;
  upsertProduct(product);
  return true;
}

/**
 * 删除平台SKU映射
 */
export function removePlatformSKUMapping(
  skuId: string,
  platform: string
): boolean {
  const product = getProductBySkuId(skuId);
  if (!product || !product.platform_sku_mapping) return false;
  
  product.platform_sku_mapping = product.platform_sku_mapping.filter(
    (m) => m.platform !== platform
  );
  
  upsertProduct(product);
  return true;
}
