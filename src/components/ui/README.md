# UI 组件库使用指南

## 📦 快速开始

```tsx
// 导入所有组件
import { StatCard, ActionButton, PageHeader, SearchBar, EmptyState } from "@/components/ui";

// 或单独导入
import StatCard from "@/components/ui/StatCard";
```

---

## 🎯 组件列表

### 1. StatCard - 统计卡片
用于展示统计数据，支持图标、渐变背景、趋势显示。

### 2. ActionButton - 操作按钮
统一的按钮组件，支持多种变体、尺寸、加载状态。

### 3. PageHeader - 页面头部
标准化的页面头部，包含标题、描述和操作按钮区域。

### 4. SearchBar - 搜索栏
带图标的搜索输入框，支持清除功能。

### 5. EmptyState - 空状态
无数据时的友好提示组件。

---

## 📝 完整示例

```tsx
"use client";

import { useState } from "react";
import { StatCard, ActionButton, PageHeader, SearchBar, EmptyState } from "@/components/ui";
import { Plus, Wallet, TrendingUp, Package } from "lucide-react";

export default function ExamplePage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <PageHeader
        title="示例页面"
        description="这是一个使用UI组件库的示例页面"
        actions={
          <>
            <ActionButton variant="secondary">导出</ActionButton>
            <ActionButton variant="primary" icon={Plus}>
              新增
            </ActionButton>
          </>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="总资产"
          value="¥1,234,567.89"
          icon={Wallet}
          gradient="linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)"
          trend={{
            value: 12.5,
            label: "较上月",
            isPositive: true
          }}
        />
        <StatCard
          title="本月收入"
          value="¥456,789.00"
          icon={TrendingUp}
          gradient="linear-gradient(135deg, #065f46 0%, #0f172a 100%)"
        />
      </div>

      {/* 搜索栏 */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="搜索..."
      />

      {/* 内容区域 */}
      {data.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无数据"
          description="点击右上角"新增"按钮创建第一条记录"
          action={
            <ActionButton variant="primary" icon={Plus}>
              立即创建
            </ActionButton>
          }
        />
      ) : (
        <div>
          {/* 数据展示 */}
        </div>
      )}
    </div>
  );
}
```

---

## 🔗 相关文档

详细的设计规范请查看：[UI设计规范文档](../../docs/UI-DESIGN-GUIDE.md)
