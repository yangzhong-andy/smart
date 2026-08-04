/**
 * 测试数据生成脚本
 * 用于生成各种业务数据，验证系统功能
 * 
 * 使用方法：
 * 1. 在浏览器控制台中执行：import { generateTestData } from '@/lib/generate-test-data'; generateTestData();
 * 2. 或访问 /settings/generate-test-data 页面
 */

// 生成随机ID
function generateId(prefix: string = ""): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 生成随机日期（过去N天内）
function randomDate(daysAgo: number = 30): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  return date.toISOString();
}

// 生成未来日期（未来N天内）
function futureDate(daysAhead: number = 30): string {
  const date = new Date();
  date.setDate(date.getDate() + Math.floor(Math.random() * daysAhead));
  return date.toISOString().split('T')[0];
}

// 随机选择数组元素
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 随机数字范围
function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 随机小数
function randomFloat(min: number, max: number, decimals: number = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

/**
 * 生成测试数据
 */
export function generateTestData() {
  if (typeof window === "undefined") {
    console.error("此脚本只能在浏览器环境中运行");
    return;
  }

  console.log("🚀 开始生成测试数据...");

  // 1. 生成供应商数据
  const supplierNames = [
    "深圳华强电子厂", "东莞美妆制造", "广州服装加工", "佛山家具厂",
    "中山灯具制造", "惠州电子科技", "珠海日用品厂", "汕头玩具制造",
    "佛山陶瓷厂", "东莞五金加工", "深圳包装材料", "广州食品加工"
  ];

  const suppliers = supplierNames.map((name, index) => ({
    id: generateId("supplier-"),
    name,
    contact: `张${index + 1}`,
    phone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
    depositRate: randomNumber(20, 50),
    tailPeriodDays: randomItem([7, 15, 30, 45, 60]),
    settleBase: randomItem<"SHIPMENT" | "INBOUND">(["SHIPMENT", "INBOUND"]),
    level: randomItem<"S" | "A" | "B" | "C">(["S", "A", "B", "C"]),
    category: randomItem(["电子产品", "美妆护肤", "服装配饰", "家居用品", "食品饮料"]),
    address: `广东省${randomItem(["深圳市", "广州市", "东莞市", "佛山市"])}${randomItem(["南山区", "福田区", "天河区", "越秀区"])}工业路${randomNumber(1, 999)}号`,
    bankAccount: `6222${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`,
    bankName: randomItem(["中国工商银行", "中国建设银行", "中国农业银行", "招商银行"]),
    taxId: `9144${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`,
    invoiceRequirement: randomItem<"SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE">(["SPECIAL_INVOICE", "GENERAL_INVOICE", "NO_INVOICE"]),
    invoicePoint: randomNumber(6, 13),
    defaultLeadTime: randomNumber(7, 30),
    moq: randomNumber(100, 1000),
    createdAt: randomDate(180)
  }));

  window.localStorage.setItem("suppliers", JSON.stringify(suppliers));
  console.log(`✅ 已生成 ${suppliers.length} 个供应商`);

  // 2. 生成产品数据
  const productNames = [
    "无线蓝牙耳机", "智能手环", "美妆套装", "运动T恤", "办公椅",
    "LED台灯", "充电宝", "手机壳", "保温杯", "瑜伽垫",
    "蓝牙音箱", "数据线", "鼠标垫", "键盘", "显示器支架"
  ];

  const products = productNames.map((name, index) => {
    const costPrice = randomFloat(10, 500);
    const weight = randomFloat(0.1, 5);
    return {
      sku_id: `SKU-${String(index + 1).padStart(4, '0')}`,
      name,
      main_image: "", // 可以后续添加图片
      category: randomItem(["电子产品", "美妆护肤", "服装配饰", "家居用品", "运动健身"]),
      status: randomItem<"ACTIVE" | "INACTIVE">(["ACTIVE", "ACTIVE", "ACTIVE", "INACTIVE"]), // 75%在售
      cost_price: costPrice,
      target_roi: randomFloat(20, 50),
      currency: randomItem<"CNY" | "USD" | "HKD">(["CNY", "USD", "HKD"]),
      weight_kg: weight,
      length: randomFloat(10, 50),
      width: randomFloat(10, 50),
      height: randomFloat(5, 30),
      volumetric_divisor: randomItem([5000, 6000]),
      at_factory: randomNumber(0, 5000),
      at_domestic: randomNumber(0, 3000),
      in_transit: randomNumber(0, 2000),
      suppliers: suppliers.slice(0, randomNumber(1, 3)).map(s => ({
        id: s.id,
        name: s.name,
        price: costPrice * randomFloat(0.9, 1.1),
        moq: randomNumber(100, 500),
        lead_time: randomNumber(7, 30),
        isPrimary: false
      })),
      createdAt: randomDate(180),
      updatedAt: new Date().toISOString()
    };
  });

  // 设置第一个供应商为主供应商，并设置向后兼容字段
  products.forEach(p => {
    if (p.suppliers && p.suppliers.length > 0) {
      p.suppliers[0].isPrimary = true;
      // 设置向后兼容字段
      const primarySupplier = suppliers.find(s => s.id === p.suppliers![0].id);
      if (primarySupplier) {
        (p as any).factory_id = primarySupplier.id;
        (p as any).factory_name = primarySupplier.name;
        (p as any).moq = primarySupplier.moq;
        (p as any).lead_time = primarySupplier.defaultLeadTime;
      }
    }
  });

  window.localStorage.setItem("products", JSON.stringify(products));
  console.log(`✅ 已生成 ${products.length} 个产品`);

  // 3. 生成银行账户数据
  const accountNames = [
    "公司主账户-人民币", "公司主账户-美元", "TikTok UK店铺账户",
    "TikTok JP店铺账户", "Amazon US店铺账户", "PayPal账户"
  ];

  const currencies: Array<"RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD"> = ["RMB", "USD", "JPY", "EUR", "GBP", "HKD"];
  const exchangeRates: Record<string, number> = {
    RMB: 1,
    USD: 7.2,
    JPY: 0.048,
    EUR: 7.8,
    GBP: 9.1,
    HKD: 0.92
  };

  // 先创建账户数组（不包含 parentId）
  const accounts = accountNames.map((name, index) => {
    const currency = currencies[index] || "RMB";
    const originalBalance = randomFloat(10000, 500000);
    return {
      id: generateId("account-"),
      name,
      accountNumber: `6222${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`,
      accountType: randomItem<"对公" | "对私" | "平台">(["对公", "对私", "平台"]),
      accountCategory: index < 2 ? "PRIMARY" as const : "VIRTUAL" as const,
      accountPurpose: index < 2 ? "主账户" : `店铺收款账户-${name}`,
      currency,
      country: currency === "RMB" ? "CN" : currency === "USD" ? "US" : currency === "JPY" ? "JP" : currency === "GBP" ? "UK" : "HK",
      originalBalance,
      exchangeRate: exchangeRates[currency] || 1,
      rmbBalance: currency === "RMB" ? originalBalance : originalBalance * (exchangeRates[currency] || 1),
      parentId: undefined as string | undefined, // 稍后设置
      storeId: index >= 2 ? generateId("store-") : undefined,
      companyEntity: "测试公司",
      notes: `${name}使用说明`,
      createdAt: randomDate(365)
    };
  });

  // 设置虚拟账户的 parentId
  accounts.forEach((account, index) => {
    if (index >= 2 && accounts[0]) {
      account.parentId = accounts[0].id;
    }
  });

  window.localStorage.setItem("bankAccounts", JSON.stringify(accounts));
  console.log(`✅ 已生成 ${accounts.length} 个银行账户`);

  // 4. 生成店铺数据
  const storeNames = [
    { name: "TK-UK-01", platform: "TikTok" as const, country: "UK", currency: "GBP" as const },
    { name: "TK-JP-01", platform: "TikTok" as const, country: "JP", currency: "JPY" as const },
    { name: "AMZ-US-01", platform: "Amazon" as const, country: "US", currency: "USD" as const }
  ];

  const stores = storeNames.map((store, index) => ({
    id: accounts[index + 2]?.storeId || generateId("store-"),
    name: store.name,
    platform: store.platform,
    country: store.country,
    currency: store.currency,
    accountId: accounts[index + 2]?.id || accounts[0].id,
    accountName: accounts[index + 2]?.name || accounts[0].name,
    vatNumber: store.country === "UK" ? `GB${String(Math.floor(Math.random() * 100000000)).padStart(9, '0')}` : undefined,
    taxId: store.country !== "UK" ? String(Math.floor(Math.random() * 1000000000000)) : undefined,
    createdAt: randomDate(365)
  }));

  window.localStorage.setItem("stores", JSON.stringify(stores));
  console.log(`✅ 已生成 ${stores.length} 个店铺`);

  // 5. 生成采购合同数据
  const contracts = [];
  for (let i = 0; i < 20; i++) {
    // 选择一个产品
    const product = randomItem(products);
    
    // 确保选择的供应商在产品数据的供应商列表中
    let supplier: typeof suppliers[0];
    if (product.suppliers && product.suppliers.length > 0) {
      // 从产品的供应商列表中选择一个
      const productSupplierId = randomItem(product.suppliers).id;
      supplier = suppliers.find(s => s.id === productSupplierId) || randomItem(suppliers);
      
      // 如果供应商不在产品的供应商列表中，添加到产品中
      if (!product.suppliers.some(s => s.id === supplier.id)) {
        product.suppliers.push({
          id: supplier.id,
          name: supplier.name,
          price: product.cost_price * randomFloat(0.9, 1.1),
          moq: supplier.moq,
          lead_time: supplier.defaultLeadTime,
          isPrimary: false
        });
      }
    } else {
      // 如果产品没有供应商，随机选择一个并添加到产品中
      supplier = randomItem(suppliers);
      product.suppliers = [{
        id: supplier.id,
        name: supplier.name,
        price: product.cost_price * randomFloat(0.9, 1.1),
        moq: supplier.moq,
        lead_time: supplier.defaultLeadTime,
        isPrimary: true
      }];
      // 更新向后兼容字段
      (product as any).factory_id = supplier.id;
      (product as any).factory_name = supplier.name;
      (product as any).moq = supplier.moq;
      (product as any).lead_time = supplier.defaultLeadTime;
    }
    
    const totalQty = randomNumber(500, 5000);
    // 使用产品中该供应商的价格，如果没有则使用产品成本价
    const supplierPrice = product.suppliers.find(s => s.id === supplier.id)?.price || product.cost_price;
    const unitPrice = supplierPrice * randomFloat(0.95, 1.05);
    const totalAmount = totalQty * unitPrice;
    const depositRate = supplier.depositRate;
    const depositAmount = totalAmount * (depositRate / 100);
    const pickedQty = randomNumber(0, totalQty);
    const finishedQty = randomNumber(0, totalQty);
    const depositPaid = randomFloat(0, depositAmount);
    const totalPaid = depositPaid;
    const deliveryDate = futureDate(60);

    contracts.push({
      id: generateId("contract-"),
      contractNumber: `HT-${new Date().getFullYear()}${String(i + 1).padStart(5, '0')}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      sku: product.name,
      skuId: product.sku_id,
      unitPrice,
      totalQty,
      pickedQty,
      finishedQty,
      totalAmount,
      depositRate,
      depositAmount,
      depositPaid,
      tailPeriodDays: supplier.tailPeriodDays,
      deliveryDate,
      status: pickedQty >= totalQty ? "发货完成" as const : pickedQty > 0 ? "部分发货" as const : "待发货" as const,
      totalPaid,
      totalOwed: totalAmount - totalPaid,
      createdAt: randomDate(90),
      updatedAt: new Date().toISOString()
    });
  }

  // 更新产品数据（确保供应商关联正确）
  window.localStorage.setItem("products", JSON.stringify(products));

  window.localStorage.setItem("purchaseContracts", JSON.stringify(contracts));
  console.log(`✅ 已生成 ${contracts.length} 个采购合同`);

  // 6. 生成拿货单数据
  const deliveryOrders: any[] = [];
  contracts.forEach((contract, index) => {
    if (contract.pickedQty > 0) {
      const qty = Math.min(contract.pickedQty, randomNumber(100, 1000));
      const tailAmount = qty * contract.unitPrice * (1 - contract.depositRate / 100);
      const tailPaid = randomFloat(0, tailAmount);
      const shippedDate = randomDate(30);

      deliveryOrders.push({
        id: generateId("delivery-"),
        deliveryNumber: `NH-${new Date().getFullYear()}${String(index + 1).padStart(5, '0')}`,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        qty,
        domesticTrackingNumber: `SF${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`,
        shippedDate,
        status: randomItem<"待发货" | "已发货" | "运输中" | "已入库">(["待发货", "已发货", "运输中", "已入库"]),
        tailAmount,
        tailPaid,
        tailDueDate: contract.tailPeriodDays ? new Date(new Date(shippedDate).getTime() + contract.tailPeriodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined,
        createdAt: randomDate(60),
        updatedAt: new Date().toISOString()
      });
    }
  });

  window.localStorage.setItem("deliveryOrders", JSON.stringify(deliveryOrders));
  console.log(`✅ 已生成 ${deliveryOrders.length} 个拿货单`);

  // 7. 生成现金流数据
  const cashFlow = [];
  
  // 生成支出（采购、物流等）
  contracts.forEach((contract, index) => {
    if (contract.depositPaid > 0) {
      cashFlow.push({
        id: generateId("cf-"),
        date: randomDate(60),
        summary: `支付${contract.supplierName}采购定金`,
        category: "采购",
        type: "expense" as const,
        amount: contract.depositPaid,
        accountId: accounts[0].id,
        accountName: accounts[0].name,
        currency: "CNY",
        remark: `合同号：${contract.contractNumber}`,
        relatedId: contract.id,
        businessNumber: contract.contractNumber,
        status: "confirmed" as const,
        createdAt: randomDate(60)
      });
    }
  });

  deliveryOrders.forEach((order) => {
    if (order.tailPaid > 0) {
      cashFlow.push({
        id: generateId("cf-"),
        date: randomDate(30),
        summary: `支付拿货单尾款`,
        category: "采购",
        type: "expense" as const,
        amount: order.tailPaid,
        accountId: accounts[0].id,
        accountName: accounts[0].name,
        currency: "CNY",
        remark: `拿货单号：${order.deliveryNumber}`,
        relatedId: order.id,
        businessNumber: order.deliveryNumber,
        status: "confirmed" as const,
        createdAt: randomDate(30)
      });
    }
  });

  // 生成收入（店铺回款）
  for (let i = 0; i < 30; i++) {
    const store = randomItem(stores);
    const account = accounts.find(a => a.storeId === store.id) || accounts[0];
    cashFlow.push({
      id: generateId("cf-"),
      date: randomDate(30),
      summary: `${store.name}店铺回款`,
      category: "回款",
      type: "income" as const,
      amount: randomFloat(1000, 50000),
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      remark: `店铺${store.name}销售回款`,
      status: "confirmed" as const,
      createdAt: randomDate(30)
    });
  }

  // 生成其他支出（物流、手续费等）
  for (let i = 0; i < 15; i++) {
    cashFlow.push({
      id: generateId("cf-"),
      date: randomDate(30),
      summary: randomItem(["物流费用", "平台手续费", "广告费用", "其他支出"]),
      category: randomItem(["物流", "手续费", "广告", "其他"]),
      type: "expense" as const,
      amount: randomFloat(100, 5000),
      accountId: accounts[0].id,
      accountName: accounts[0].name,
      currency: "CNY",
      remark: "日常运营支出",
      status: "confirmed" as const,
      createdAt: randomDate(30)
    });
  }

  window.localStorage.setItem("cashFlow", JSON.stringify(cashFlow));
  console.log(`✅ 已生成 ${cashFlow.length} 条现金流记录`);

  console.log("🎉 测试数据生成完成！");
  console.log("📊 数据统计：");
  console.log(`   - 供应商：${suppliers.length} 个`);
  console.log(`   - 产品：${products.length} 个`);
  console.log(`   - 银行账户：${accounts.length} 个`);
  console.log(`   - 店铺：${stores.length} 个`);
  console.log(`   - 采购合同：${contracts.length} 个`);
  console.log(`   - 拿货单：${deliveryOrders.length} 个`);
  console.log(`   - 现金流：${cashFlow.length} 条`);

  // 提示刷新页面
  alert("✅ 测试数据生成完成！\n\n请刷新页面查看数据。");
}
