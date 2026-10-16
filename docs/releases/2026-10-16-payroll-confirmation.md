# 3001 试用期与转正工资发布记录

- 用户于 2026-10-16 明确要求将待发布工资改动发布至服务器。
- 仅 3001（baxi）；3003 不发布、不重启。
- 基线：线上 `v2026.10.16.1` / `e588e4b8be7e3f329a1a5b5d42bf2d91986fce6e`，包含已启用内存诊断及供应商税务 SSO。
- 本次标签：`v2026.10.16.2` / `1221f19aadd116e95dd1950791023603d1f8e0a1`。
- 工资规则：1—10号当月转正标准；11—20号试用期和转正各50%（不是按实际自然日）；21号至月末当月试用期、次月转正标准。个人社保按月保持原设置。
- 预计转正日不自动转正；以实际转正日期为准。历史工资不重新计算，不自动生成或付款。

## 发布前验证

- 干净发布副本：ERP系统开发目录下 `release-staging/payroll-confirmation-20261016`。
- schema 验证、类型检查、435项测试、生产构建全部通过。
- 逐文件与线上比对：14个已有工资相关文件变更、4个新增文件；没有移除文件。诊断、SSO、依赖版本不变。
- 唯一待执行迁移：`20261015120000_add_employee_confirmation_salary`，追加6个可为空的 Employee 字段和1个可为空的 Payroll JSONB 快照字段；无 UPDATE/DELETE，不回补既有资料。
- 已核对 3001 的数据库名为 smart；迁移前 Employee 与 Payroll 均为0条，7个新增字段尚不存在，无未解决迁移。
- 发布前 3001 PID 2361022 / 重载计数1；3003 PID 2285681 / 重载计数0。
- 受管理发布单元：`smart-payroll-release-20261016-2.service`，2GiB内存、512MiB swap上限，CPU150%、Nice10；不修改业务服务的资源限制。
- 本机至GitHub连接重置/DNS失败，直接推送重试未成功；已校验的增量Git bundle 经SSH传输（SHA256 `5e4494c51d16108a66e611c9b2979d2c0d804c576ead5cb9379b15bc90ee37c9`）。服务器没有GitHub写凭据，未在服务器创建或复制凭据；最终由本机原有认证通过临时本机回环SSH SOCKS转发成功推送同一标签，转发进程随即关闭，未更改全局代理配置。正式部署仍从GitHub获取固定标签，未手工覆盖运行目录。

## 迁移权限恢复

- 15:51:35 首次部署在迁移处因 `must be owner of table Employee` / SQLSTATE 42501 / Prisma P3018 停止；构建、备用端口检查和数据库备份已成功，当时 current 未切换。
- 只读确认 Employee、Payroll、迁移表所有者均为现有角色 smart；新字段0个、失败记录 applied_steps_count=0，没有部分 ALTER。
- 核验候选 SQL SHA256：`0205d964cee1647f7140c2e47616d703ebce77a8a322518d71854850ec021f2c`，与本地标签一致。
- 由 postgres 运维身份在单个事务内 `SET LOCAL ROLE smart` 执行该精确 SQL；锁等待上限5秒、语句上限30秒。没有更改任何角色授权或表所有者，未扩大应用权限。
- 使用候选自带 Prisma `migrate resolve --applied 20261015120000_add_employee_confirmation_salary` 恢复元数据；随后既有 `smart-deploy promote baxi v2026.10.16.2` 复用已构建版本，完成烟测、再次备份、迁移核验和激活，未重新构建或手工覆盖运行目录。

## 发布后核验（已完成，北京时间）

- 15:55:44 激活成功；promote 单元正常退出。current：`/srv/smart-erp/baxi/releases/20261016T074342Z-1221f19aadd1`，previous：`/srv/smart-erp/baxi/releases/20261016T064951Z-e588e4b8be7e`。
- RELEASE.json 的 tag/commit 与本地一致，`sourceWasDirty=false`。
- 3001 PM2 PID 2382026、实际 Next PID 2382039，重载计数从1变为2，符合本次一次预期重载；3003 PID 2285681、重载计数0和版本均未变。
- 唯一新增迁移有1条有效成功记录，未解决迁移0条；7个字段均可为空，类型为3个date、3个double precision、1个jsonb。
- 候选 Prisma 客户端已成功只读查询所有新员工字段及工资快照；构建产物包含新试用期薪资和实际转正日期UI。未创建测试员工、生成或发放工资。Employee/Payroll行数仍为0，与发布前一致。
- 3001 `/login`、`/api/auth/session`、`/supplier-tax` 返回200；员工、工资和SSO会话接口未登录返回401，未绕过登录测试。这不代替用户登录后的完整入职/发工资验收。
- 内存诊断开关保持1、采样15000ms，已确认新Next进程产出真实任务诊断；未主动重放业务同步或webhook。此发布不声称修复OOM。
- 已保留数据库备份：迁移前 `20261016T075118Z-smart.dump`（125499599字节）；迁移后、切换前 `20261016T075524Z-smart.dump`（125501403字节）；原诊断发布前备份也仍保留。
- 原保留流程清理了更早目录 `20261015-supplier-tax-switch`、`20261015-supplier-tax-sso` 及旧数据库备份 `20261010T035348Z-smart.dump`、`20261014T111512Z-smart.dump`。删除不能直接撤销；上一完整诊断/SSO版本仍受previous保护，SSO源码也已保存在Git基线中。
- 首次失败发布单元的失败标记在成功验收后清除；原失败日志与本记录保留，不重启业务服务。

## 回滚

代码可按受管理流程回滚至 `v2026.10.16.1` 的完整 release。追加字段与旧代码兼容，默认不反向删除字段或改写历史数据；数据库备份保留用于事故恢复，不把还原整个数据库当作常规代码回滚步骤。
