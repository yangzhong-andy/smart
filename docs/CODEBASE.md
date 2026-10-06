# Smart ERP 代码地图

## 当前边界

这是一个 Next.js 14 App Router + Prisma + PostgreSQL 的单体 ERP。浏览器页面、API、定时同步和财务/库存领域逻辑共用一个仓库，但发布时必须绑定到一个明确的 Git commit 或 tag。

## 目录职责

| 目录 | 职责 | 约束 |
| --- | --- | --- |
| `src/app/**` | 页面和 App Router API route | 页面负责组合和交互；业务规则下沉到 `src/lib` |
| `src/app/api/**` | HTTP 边界、鉴权、参数校验、响应格式 | 不在 route 内复制跨平台计费/库存算法 |
| `src/lib/**` | 领域规则、平台适配、数据访问辅助和纯函数 | 纯计算优先写成可单测模块；跨平台规则必须带平台/国家维度 |
| `prisma/schema.prisma` | 数据模型和关系 | 生产变更必须同时有 `prisma/migrations/<timestamp>_<name>/migration.sql` |
| `prisma/migrations/**` | 可审计、可前进的数据库变更 | 发布时只执行 `prisma migrate deploy`，禁止生产 `db push` |
| `scripts/**` | 本地检查、发布和一次性数据维护工具 | 每个脚本标明 dry-run/apply；不要把密码写入脚本 |
| `server-patch/**` | 历史部署材料和服务配置 | 新功能不再以临时 patch 作为源码来源；可复用脚本迁移到 `scripts/` |
| `miniprogram/**` | 微信小程序客户端 | 与 Web ERP 分开测试和发布 |

## 业务分区

- 供应链：`suppliers`、`procurement`、`inbound`、`outbound`、`inventory`、`logistics`
- 财务：`finance`、`monthly-bills`、`cash-flow`、`receivables`、`profit-*`
- 平台运营：`tiktok`、`platforms/shopee`、`platforms/mercado-livre`、`advertising`
- 组织与权限：`settings`、`hr`、`src/lib/auth-*`、`src/lib/permissions.ts`
- 补货：`src/lib/replenishment*`、`src/app/inventory` 相关工作台

## 依赖方向

页面/API -> 领域服务 (`src/lib`) -> Prisma 数据访问。

平台 API 的原始字段只在平台适配器中解析；财务报表、库存台账和补货计算消费规范化后的领域对象。需要跨模块共享的数据结构放到 `src/lib`，不要从一个页面目录反向 import 另一个页面目录。

## 当前整理重点

1. 将工作区中 9 月新增的源码和迁移先按功能分批纳入 Git，不能把临时压缩包当作发布版本。
2. 把重复的 `server-patch/deploy-*.sh` 收敛成一个可参数化发布入口。
3. 保留所有财务、库存、平台同步测试；新业务规则先补纯函数测试，再接 API。
4. 逐步移除生产流程中的 `prisma db push`，只允许本地原型或一次性明确批准的数据库初始化使用。
