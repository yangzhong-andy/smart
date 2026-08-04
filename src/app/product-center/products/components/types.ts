import type { ProductStatus, Product } from "@/lib/products-store";

/** 表单内供应商项 */
export type FormSupplier = {
  id: string;
  name: string;
  price?: number;
  moq?: number;
  lead_time?: number;
  isPrimary?: boolean;
};

/** 产品表单状态（录入/编辑） */
export type ProductFormState = {
  spu_code: string;
  sku_id: string;
  name: string;
  main_image: string;
  gallery_images: string[];
  category: string;
  brand: string;
  description: string;
  material: string;
  customs_name_cn: string;
  customs_name_en: string;
  default_supplier_id: string;
  status: ProductStatus;
  cost_price: string;
  target_roi: string;
  currency: Product["currency"];
  weight_kg: string;
  length: string;
  width: string;
  height: string;
  volumetric_divisor: string;
  color: string;
  size: string;
  barcode: string;
  stock_quantity: string;
  factory_id: string;
  moq: string;
  lead_time: string;
  suppliers: FormSupplier[];
};

/** 表单内单行变体（新建/添加变体时用） */
export type VariantRow = {
  tempId: string;
  color: string;
  sku_id: string;
  cost_price: string;
  size: string;
  barcode: string;
};

export function newVariantRow(): VariantRow {
  return {
    tempId: typeof crypto !== "undefined" ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    color: "",
    sku_id: "",
    cost_price: "",
    size: "",
    barcode: ""
  };
}
