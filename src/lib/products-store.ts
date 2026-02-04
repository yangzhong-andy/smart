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
 * 获取所有产品（同步，从 localStorage，向后兼容）
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

/** SPU 列表项（用于下拉或产品卡片聚合，按需再拉变体） */
export type SpuListItem = {
  productId: string
  name: string
  variantCount: number
  mainImage?: string
  status?: string
  category?: string
}

/**
 * 仅拉取 SPU 列表（用于下单/合同页下拉，不拉变体）
 */
export async function getSpuListFromAPI(): Promise<SpuListItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/products?list=spu");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch SPU list", e);
    return [];
  }
}

/**
 * 按需拉取单个 SPU 下的全部 SKU 变体（Prisma include 一次拿到，前端缓存；切换颜色/改数量零请求）
 */
export async function getVariantsBySpuIdFromAPI(spuId: string): Promise<Product[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch(`/api/products?spuId=${encodeURIComponent(spuId)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch variants by SPU", e);
    return [];
  }
}

/**
 * 从 API 获取所有产品（全量，兼容其他页）
 */
export async function getProductsFromAPI(): Promise<Product[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/products");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch products from API", e);
    return [];
  }
}

/**
 * 保存产品列表（全量同步到 API）
 */
export async function saveProducts(products: Product[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getProductsFromAPI();
    const existingSkuIds = new Set(existing.map((p) => p.sku_id));
    const newSkuIds = new Set(products.map((p) => p.sku_id));

    for (const e of existing) {
      if (!newSkuIds.has(e.sku_id)) {
        await fetch(`/api/products/${encodeURIComponent(e.sku_id)}`, { method: "DELETE" });
      }
    }

    for (const p of products) {
      const body = {
        sku_id: p.sku_id,
        name: p.name,
        main_image: p.main_image || "",
        category: p.category,
        brand: p.brand,
        description: p.description,
        material: p.material,
        customs_name_cn: p.customs_name_cn,
        customs_name_en: p.customs_name_en,
        default_supplier_id: p.default_supplier_id,
        status: p.status,
        cost_price: p.cost_price,
        target_roi: p.target_roi,
        currency: p.currency || "CNY",
        weight_kg: p.weight_kg,
        length: p.length,
        width: p.width,
        height: p.height,
        volumetric_divisor: p.volumetric_divisor,
        at_factory: p.at_factory ?? 0,
        at_domestic: p.at_domestic ?? 0,
        in_transit: p.in_transit ?? 0,
        color: p.color,
        size: p.size,
        barcode: p.barcode,
        stock_quantity: p.stock_quantity,
        suppliers: p.suppliers,
        platform_sku_mapping: p.platform_sku_mapping
      };
      if (existingSkuIds.has(p.sku_id)) {
        await fetch(`/api/products/${encodeURIComponent(p.sku_id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save products", e);
    throw e;
  }
}

/**
 * 根据SKU ID获取产品（同步，从 localStorage）
 */
export function getProductBySkuId(skuId: string): Product | undefined {
  const products = getProducts();
  return products.find((p) => p.sku_id === skuId);
}

/**
 * 从 API 根据 SKU ID 获取产品
 */
export async function getProductBySkuIdFromAPI(skuId: string): Promise<Product | undefined> {
  const products = await getProductsFromAPI();
  return products.find((p) => p.sku_id === skuId);
}

/**
 * 根据状态获取产品列表（同步）
 */
export function getProductsByStatus(status: ProductStatus): Product[] {
  const products = getProducts();
  return products.filter((p) => p.status === status);
}

/**
 * 从 API 根据工厂ID获取产品列表
 */
export async function getProductsByFactoryIdFromAPI(factoryId: string): Promise<Product[]> {
  const products = await getProductsFromAPI();
  return products.filter((p) => {
    if (p.factory_id === factoryId) return true;
    if (p.suppliers && Array.isArray(p.suppliers)) {
      return p.suppliers.some((s) => s.id === factoryId);
    }
    return false;
  });
}

/**
 * 根据工厂ID获取产品列表（同步，支持多供应商）
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
 * 创建或更新产品（同步到 API）
 */
export async function upsertProduct(product: Product): Promise<void> {
  const products = await getProductsFromAPI();
  const existing = products.find((p) => p.sku_id === product.sku_id);
  const body = {
    sku_id: product.sku_id,
    name: product.name,
    main_image: product.main_image || "",
    category: product.category,
    brand: product.brand,
    description: product.description,
    material: product.material,
    customs_name_cn: product.customs_name_cn,
    customs_name_en: product.customs_name_en,
    default_supplier_id: product.default_supplier_id,
    status: product.status,
    cost_price: product.cost_price,
    target_roi: product.target_roi,
    currency: product.currency || "CNY",
    weight_kg: product.weight_kg,
    length: product.length,
    width: product.width,
    height: product.height,
    volumetric_divisor: product.volumetric_divisor,
    at_factory: product.at_factory ?? 0,
    at_domestic: product.at_domestic ?? 0,
    in_transit: product.in_transit ?? 0,
    color: product.color,
    size: product.size,
    barcode: product.barcode,
    stock_quantity: product.stock_quantity,
    suppliers: product.suppliers,
    platform_sku_mapping: product.platform_sku_mapping
  };
  if (existing) {
    await fetch(`/api/products/${encodeURIComponent(product.sku_id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } else {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
}

/**
 * 删除产品
 */
export async function deleteProduct(skuId: string): Promise<boolean> {
  const products = await getProductsFromAPI();
  const found = products.some((p) => p.sku_id === skuId);
  if (!found) return false;
  const res = await fetch(`/api/products/${encodeURIComponent(skuId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete product");
  return true;
}

/**
 * 添加平台SKU映射
 */
export async function addPlatformSKUMapping(
  skuId: string,
  mapping: PlatformSKUMapping
): Promise<boolean> {
  const product = await getProductBySkuIdFromAPI(skuId);
  if (!product) return false;

  const mappings = product.platform_sku_mapping || [];
  const existingIndex = mappings.findIndex((m) => m.platform === mapping.platform);
  if (existingIndex >= 0) {
    mappings[existingIndex] = mapping;
  } else {
    mappings.push(mapping);
  }
  product.platform_sku_mapping = mappings;
  await upsertProduct(product);
  return true;
}

/**
 * 删除平台SKU映射
 */
export async function removePlatformSKUMapping(
  skuId: string,
  platform: string
): Promise<boolean> {
  const product = await getProductBySkuIdFromAPI(skuId);
  if (!product || !product.platform_sku_mapping) return false;
  product.platform_sku_mapping = product.platform_sku_mapping.filter((m) => m.platform !== platform);
  await upsertProduct(product);
  return true;
}
