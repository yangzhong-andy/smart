# 3001 内存诊断发布记录

- 用户先要求仅本地验证，随后于 2026-10-16 授权发布。
- 范围仅 3001（baxi）；不发布 3003，不包含待发布的试用期/转正工资，不改业务数据。
- 发布标签：`v2026.10.16.1`。
- 发布提交：`e588e4b8be7e3f329a1a5b5d42bf2d91986fce6e`。
- 原线上目录：`/srv/smart-erp/baxi/releases/20261015-supplier-tax-sso`。
- 基线提交：`c0f3144440093a01229e0174004aff8b89ea38f0`；已核对线上额外 SSO 改动，并以 `8efea3f` 保存。

## 隔离与验证

干净发布副本位于本地 `release-staging/resource-diagnostics-20261016`（ERP系统开发目录下）。原工作区未发布工资改动保留不动。

对比线上源码：只改动 7 个诊断接入文件，新增诊断模块、2 个测试文件和说明；没有移除文件。SSO 源码与线上一致。候选 Prisma schema 和迁移目录与线上一致，没有待执行或未解决的迁移。

- 干净发布副本：425 项测试全部通过，类型检查、schema 验证及生产构建通过。
- 包含未发布工资改动的原工作区此前通过 435 项测试；此结果不代表工资改动在本次发布范围内。
- 正式标签已推送；服务器使用既有 `/usr/local/sbin/smart-deploy deploy baxi v2026.10.16.1` 流程。
- 构建独立 systemd 单元：`smart-diag-release-20261016-1.service`，内存上限 2GiB、swap 上限 512MiB、CPU 150%、Nice 10；不改业务服务内存限制。
- `/etc/smart-erp/baxi.env` 仅设置 `ERP_RESOURCE_DIAGNOSTICS=1` 与 15000ms 采样间隔；完整旧配置保存到同目录 `baxi.env.before-resource-diagnostics-20261016`（权限 0600），不得输出其中秘密。
- 受管理流程有数据库备份和迁移核验阶段；本次无新迁移。发现部分历史迁移校验和与已应用记录不同（多数为行尾差异），本次没有编辑迁移、修复历史或改写迁移记录。

## 发布后核验（已完成，北京时间）

- 14:57:28 激活成功；发布单元正常退出，无 OOM。current：`/srv/smart-erp/baxi/releases/20261016T064951Z-e588e4b8be7e`。
- previous 指向原完整 SSO 版本 `20261015-supplier-tax-sso`，可回滚；RELEASE.json 的 tag/commit 与本地一致，`sourceWasDirty=false`。
- 3001 PM2 PID 2361022，实际 Next PID 2361034；所有相关进程目录与诊断变量正确。发布造成一次预期重载。
- 3001 `/login` 与 `/api/auth/session` 返回 200；供应商税务入口 `/supplier-tax` 返回 200，ERP SSO 会话接口未登录返回 401，保护仍有效。没有使用这些检查绕过登录。
- 3003 PID 2285681、重启计数 0、current 均与发布前一致，会话检查 200。
- 迁移阶段明确报告 `No pending migrations to apply.`；发布前后 `_prisma_migrations` 均为 123 条，内容摘要均为 `cae3fa991c03bd5a6f5ce6655ca53afa`，未新增执行迁移或改变记录。
- 14:58—14:59 已由自然运行的任务产生真实 start/checkpoint/end/sample，涵盖 TK 同步、仓库费用核对、利润报表及 Shopee 推送恢复；没有主动触发或重放业务同步/webhook。任务事件有配额，缺失 end 事件不等于任务未完成，应结合 sample 的活跃数。
- 截至 14:59:44 的已采集 RSS 最高约 479.89MiB，最近样本 RSS 339.29MiB、heapUsed 41.11MiB、活跃任务 0；这只描述短期观测，不证明内存问题已修复。服务器可用内存约 5027MiB。
- 仍观测到既有 `shopee.webhook.process` 返回 502（部署前已存在）；本次没有修复或掩盖该问题。
- 受管理流程按原保留规则删除了一份更早的发布目录 `20261014T111022Z-c0f314444009` 及旧数据库备份 `20261009T165805Z-smart.dump`；删除本身不可撤销，但本次发布前的完整 SSO 版本与新的数据库备份均保留。

诊断仅用于捕获内存异常证据，不等于已经修复或确定 OOM 根因。

## 回滚

若发布失败，既有流程应保持或恢复旧 current；额外确认诊断开关是否需要撤销。成功后的代码回滚通过 `smart-deploy rollback baxi`，只回滚代码，不回滚数据库。关闭采集时仅撤销这两个诊断环境变量，再按受管理方式重载 3001，不能用整份旧环境覆盖后续新增配置。
