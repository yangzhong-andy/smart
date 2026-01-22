# TK Smart ERP UI 设计规范

## 📋 目录
1. [设计原则](#设计原则)
2. [颜色系统](#颜色系统)
3. [字体规范](#字体规范)
4. [间距规范](#间距规范)
5. [组件使用指南](#组件使用指南)
6. [页面布局规范](#页面布局规范)

---

## 🎨 设计原则

### 1. 一致性
- 所有页面使用统一的视觉语言
- 保持交互模式的一致性
- 复用已建立的组件和样式

### 2. 层次感
- 使用清晰的视觉层次
- 重要信息突出显示
- 使用阴影和光效增强层次

### 3. 现代感
- 毛玻璃效果（backdrop-filter）
- 流畅的动画过渡
- 渐变和光效

---

## 🎨 颜色系统

### 主色调
```css
/* 主色 - 蓝色系 */
--primary-500: #0095FF
--primary-400: #00E5FF
--primary-300: #4DD0FF
--primary-600: #0077CC

/* 背景色 */
--bg-primary: #0B0E14
--bg-secondary: #14161F
--bg-card: rgba(15, 23, 42, 0.6)
```

### 语义色
```css
/* 成功 */
--success: #10b981 (emerald-500)

/* 警告 */
--warning: #f59e0b (amber-500)

/* 错误 */
--danger: #ef4444 (rose-500)

/* 信息 */
--info: #3b82f6 (blue-500)
```

### 文字颜色
```css
--text-primary: #f1f5f9 (slate-100)
--text-secondary: #cbd5e1 (slate-300)
--text-tertiary: #94a3b8 (slate-400)
--text-disabled: #64748b (slate-500)
```

---

## 📝 字体规范

### 字体大小
```css
/* 标题 */
--text-2xl: 1.5rem (24px)    /* 页面主标题 */
--text-xl: 1.25rem (20px)    /* 区块标题 */
--text-lg: 1.125rem (18px)   /* 卡片标题 */

/* 正文 */
--text-base: 1rem (16px)     /* 主菜单、按钮 */
--text-sm: 0.875rem (14px)   /* 正文、子菜单 */
--text-xs: 0.75rem (12px)    /* 辅助信息 */

/* 小字 */
--text-[10px]: 0.625rem      /* 标签、说明 */
```

### 字重
```css
--font-bold: 700      /* 标题、重要信息 */
--font-semibold: 600  /* 菜单项、按钮 */
--font-medium: 500    /* 正文强调 */
--font-normal: 400    /* 正文 */
```

### 行高
```css
--leading-tight: 1.25
--leading-snug: 1.375
--leading-normal: 1.5
--leading-relaxed: 1.625
```

---

## 📏 间距规范

### 基础间距单位
使用 Tailwind 的间距系统（4px 基准）

### 常用间距
```css
/* 内边距 */
--p-xs: 0.5rem (8px)    /* 图标容器 */
--p-sm: 0.75rem (12px)  /* 小按钮 */
--p-md: 1rem (16px)     /* 标准按钮、卡片 */
--p-lg: 1.25rem (20px)  /* 大按钮 */
--p-xl: 1.5rem (24px)   /* 页面容器 */

/* 外边距 */
--gap-sm: 0.5rem (8px)   /* 紧密排列 */
--gap-md: 1rem (16px)   /* 标准间距 */
--gap-lg: 1.5rem (24px) /* 宽松间距 */
--gap-xl: 2rem (32px)   /* 区块间距 */
```

### 圆角
```css
--rounded-sm: 0.25rem (4px)   /* 小元素 */
--rounded-md: 0.5rem (8px)    /* 按钮 */
--rounded-lg: 0.75rem (12px)  /* 卡片 */
--rounded-xl: 1rem (16px)    /* 大卡片 */
--rounded-2xl: 1.5rem (24px) /* 统计卡片 */
```

---

## 🧩 组件使用指南

### 1. StatCard - 统计卡片

**用途**: 显示统计数据

**示例**:
```tsx
import { StatCard } from "@/components/ui";
import { Wallet } from "lucide-react";

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
```

**Props**:
- `title`: 标题（必填）
- `value`: 数值（必填）
- `icon`: Lucide 图标（可选）
- `iconColor`: 图标颜色（可选，默认 primary-300）
- `gradient`: 背景渐变（可选）
- `trend`: 趋势数据（可选）
- `children`: 自定义内容（可选）

---

### 2. ActionButton - 操作按钮

**用途**: 所有操作按钮

**示例**:
```tsx
import { ActionButton } from "@/components/ui";
import { Plus } from "lucide-react";

<ActionButton
  variant="primary"
  icon={Plus}
  size="md"
  onClick={handleClick}
>
  新增
</ActionButton>
```

**Props**:
- `variant`: "primary" | "secondary" | "danger" | "ghost"
- `icon`: Lucide 图标（可选）
- `iconPosition`: "left" | "right"（默认 left）
- `size`: "sm" | "md" | "lg"（默认 md）
- `isLoading`: 加载状态（可选）

---

### 3. PageHeader - 页面头部

**用途**: 所有页面的头部区域

**示例**:
```tsx
import { PageHeader, ActionButton } from "@/components/ui";
import { Plus } from "lucide-react";

<PageHeader
  title="物流渠道"
  description="管理物流商信息，支持多物流商、多渠道代码。"
  actions={
    <>
      <ActionButton variant="secondary">导出</ActionButton>
      <ActionButton variant="primary" icon={Plus}>新增</ActionButton>
    </>
  }
/>
```

---

### 4. SearchBar - 搜索栏

**用途**: 所有搜索功能

**示例**:
```tsx
import { SearchBar } from "@/components/ui";

<SearchBar
  value={searchQuery}
  onChange={setSearchQuery}
  placeholder="搜索物流商名称、渠道代码..."
/>
```

---

### 5. EmptyState - 空状态

**用途**: 无数据时的展示

**示例**:
```tsx
import { EmptyState, ActionButton } from "@/components/ui";
import { Package } from "lucide-react";

<EmptyState
  icon={Package}
  title="暂无数据"
  description="点击右上角"新增"按钮创建第一条记录"
  action={<ActionButton variant="primary">立即创建</ActionButton>}
/>
```

---

## 📐 页面布局规范

### 标准页面结构

```tsx
export default function ExamplePage() {
  return (
    <div className="space-y-6 p-6">
      {/* 1. 页面头部 */}
      <PageHeader
        title="页面标题"
        description="页面描述"
        actions={/* 操作按钮 */}
      />

      {/* 2. 统计面板（可选） */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard ... />
        <StatCard ... />
      </div>

      {/* 3. 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchBar ... />
        {/* 其他筛选器 */}
      </div>

      {/* 4. 主要内容 */}
      {data.length === 0 ? (
        <EmptyState ... />
      ) : (
        <div className="grid ...">
          {/* 数据展示 */}
        </div>
      )}
    </div>
  );
}
```

### 容器间距
- 页面容器: `space-y-6` (24px)
- 区块间距: `gap-4` (16px) 或 `gap-6` (24px)
- 卡片内边距: `p-5` (20px) 或 `p-6` (24px)

---

## 🎭 动画规范

### 过渡时间
```css
--duration-fast: 150ms    /* 快速交互 */
--duration-normal: 300ms  /* 标准过渡 */
--duration-slow: 500ms    /* 复杂动画 */
```

### 缓动函数
```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
--ease-out: cubic-bezier(0, 0, 0.2, 1)
```

### 常用动画
- 悬停: `hover:scale-[1.02]` (轻微放大)
- 点击: `active:translate-y-px` (按下效果)
- 淡入: `opacity-0` → `opacity-100`
- 滑入: `translate-x-[-10px]` → `translate-x-0`

---

## 💡 最佳实践

### ✅ 推荐做法
1. **使用组件库**: 优先使用 `@/components/ui` 中的组件
2. **保持一致性**: 新页面参考已有页面的布局
3. **响应式设计**: 使用 Tailwind 响应式类（`md:`, `lg:`）
4. **无障碍性**: 添加适当的 `aria-label` 和语义化 HTML

### ❌ 避免做法
1. **不要硬编码颜色**: 使用 Tailwind 颜色类或 CSS 变量
2. **不要重复样式**: 提取为组件或工具类
3. **不要忽略加载状态**: 为异步操作添加加载指示
4. **不要忽略空状态**: 提供友好的空状态提示

---

## 📚 参考资源

- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/icons/)
- [Framer Motion](https://www.framer.com/motion/)

---

**最后更新**: 2026-01-14
**维护者**: TK Smart ERP 开发团队
