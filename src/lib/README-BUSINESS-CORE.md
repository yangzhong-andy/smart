# 业财一体化核心架构文档

## 概述

本架构提供了统一的业务标识符（UID）和状态机管理系统，支持业务数据的穿透查询和状态流转管理。

## 核心功能

### 1. 唯一标识符索引 (UID)

所有业务实体都拥有一个全局唯一的业务ID（UID），格式：`{ENTITY_TYPE}-{TIMESTAMP}-{RANDOM}`

**支持的实体类型：**
- `ORDER` - 采购订单
- `RECHARGE` - 充值记录
- `CONSUMPTION` - 消耗记录
- `BILL` - 账单
- `PAYMENT_REQUEST` - 付款申请
- `CASH_FLOW` - 财务流水
- `SETTLEMENT` - 结算记录
- `REBATE` - 返点记录
- `TRANSFER` - 内部划拨
- `ADJUSTMENT` - 调整记录

### 2. 状态机管理

统一的状态定义和转换规则：

**状态列表：**
- `DRAFT` - 草稿
- `SUBMITTED` - 已提交
- `PENDING_APPROVAL` - 审批中
- `APPROVED` - 已批准
- `REJECTED` - 已退回
- `SETTLED` - 已结清
- `REVERSED` - 已冲销
- `CANCELLED` - 已取消

**状态转换规则：**
- `DRAFT` → `SUBMITTED`, `CANCELLED`
- `SUBMITTED` → `PENDING_APPROVAL`, `DRAFT`, `CANCELLED`
- `PENDING_APPROVAL` → `APPROVED`, `REJECTED`, `CANCELLED`
- `APPROVED` → `SETTLED`, `REVERSED`
- `REJECTED` → `DRAFT`, `CANCELLED`
- `SETTLED` → `REVERSED`
- `REVERSED` → (终态)
- `CANCELLED` → (终态)

### 3. 穿透查询

通过UID可以查询所有关联的业务数据，支持递归查询。

## 使用方法

### 生成UID

```typescript
import { generateBusinessUID } from "@/lib/business-core";

const uid = generateBusinessUID("BILL");
// 输出: BILL-1705123456789-A1B2C3D4
```

### 为业务实体添加UID

```typescript
import { enrichWithUID } from "@/lib/business-utils";

const bill = {
  id: "bill-123",
  month: "2026-01",
  // ... 其他字段
};

const billWithUID = enrichWithUID(bill, "BILL");
// billWithUID.uid 现在包含全局唯一ID
```

### 状态转换

```typescript
import { transitionStatus } from "@/lib/state-machine";

const result = transitionStatus("DRAFT", "SUBMITTED", "提交审批");
if (result.success) {
  // 更新实体状态
  entity.status = result.newStatus;
}
```

### 建立业务关联

```typescript
import { createBusinessRelation } from "@/lib/business-core";

// 建立账单和流水之间的关联
createBusinessRelation(
  billUID,
  cashFlowUID,
  "PAYMENT",
  { amount: 1000, currency: "USD" }
);
```

### 穿透查询

```typescript
import { traceBusinessUID } from "@/lib/business-core";

// 查询所有关联的业务数据
const results = traceBusinessUID("BILL-1705123456789-A1B2C3D4", 5);
results.forEach(result => {
  console.log(result.entityType, result.status, result.data);
});
```

### 使用穿透查询组件

```typescript
import BusinessTraceModal from "@/components/BusinessTraceModal";

<BusinessTraceModal
  uid="BILL-1705123456789-A1B2C3D4"
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
/>
```

## 迁移指南

### 为现有数据添加UID

```typescript
import { migrateToUID } from "@/lib/business-utils";

// 在加载数据时自动迁移
const bills = getMonthlyBills();
const migratedBills = bills.map(bill => migrateToUID(bill, "BILL"));
```

### 兼容旧ID查询

```typescript
import { findUIDByOldId } from "@/lib/business-utils";

// 通过旧ID查找UID
const uid = findUIDByOldId("bill-123");
if (uid) {
  const results = traceBusinessUID(uid);
}
```

## 注意事项

1. **向后兼容**：所有UID字段都是可选的（`uid?: string`），现有代码无需立即修改
2. **数据迁移**：旧数据在首次访问时会自动生成UID
3. **状态转换**：使用状态机工具确保状态转换的合法性
4. **关联关系**：建立关联关系时使用`createBusinessRelation`函数

## 未来扩展

- [ ] 支持更多业务实体类型
- [ ] 添加状态转换审计日志
- [ ] 实现状态转换的权限控制
- [ ] 支持批量状态转换
- [ ] 添加业务数据版本管理
