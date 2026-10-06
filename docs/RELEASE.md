# 发布与回滚规则

## 唯一来源

本地 Git 仓库是源码唯一来源。服务器不接受手工编辑、临时覆盖文件或直接在运行目录执行 `git pull`。每次生产部署都要记录：Git tag、commit、构建时间、数据库迁移状态和操作者。

## 发布前

每天收工时先保存一个可回退快照：

```powershell
.\scripts\save-day.ps1 -Message "完成仓库资金对账"
```

日常快照不是生产版本。准备发布时必须在干净工作区执行：

```powershell
npm ci
npm run check
.\scripts\release.ps1 -Version "2026.09.09.1" -Message "本次发布说明"
.\scripts\publish.ps1 -Tag "v2026.09.09.1" -Push -App all
```

`release.ps1` 只创建本地 tag；`publish.ps1` 只发布已经存在的 tag，并把精确 tag 传给服务器。两者都不会执行 `prisma db push`。

## 服务器目录约定

建议每个应用使用如下结构，环境变量放在 `shared`，不放进 Git：

```text
/opt/smart-erp/
  releases/v2026.09.09.1/   # 不可变发布目录
  releases/v2026.09.08.1/
  shared/.env                # 服务器私密配置
  current -> releases/v...   # PM2 唯一运行入口
```

PM2 的 `cwd` 和启动命令都指向 `current`。新版本完整上传、安装生产依赖并通过健康检查后，才原子切换 `current`，再 reload PM2。

## 数据库迁移

1. 本地修改 `schema.prisma` 后生成迁移并审阅 SQL。
2. 迁移目录和代码一起提交、打 tag。
3. 新发布目录执行 `prisma migrate deploy`，不能执行 `prisma db push`。
4. 迁移成功后再切换应用版本；迁移失败立即停止，不启动半升级版本。
5. 破坏性变更使用扩展/迁移/收缩的多步方案，禁止在运行中的版本直接删除仍被旧代码读取的列。

## 回滚

代码回滚：把 `current` 指回上一份完整 release，reload 对应 PM2 服务。

数据库回滚：默认只回滚代码，不反向执行迁移。若迁移不可逆，先执行兼容旧代码的数据修复或前向修复脚本，再回切应用。每次迁移前保留数据库备份和迁移状态。

## 当前仓库注意事项

当前本地工作区包含大量未提交源码、迁移和历史部署材料。整理完成前不得把它整体部署到服务器；先用日快照保存，再按功能整理成正式提交，最后从干净 tag 生成发布包。

## 每日节奏

1. 开始工作：`git pull --ff-only origin <工作分支>`，确认没有异常工作区改动。
2. 工作中：每完成一个可解释的小功能就提交一次，不把不同业务混在一个提交里。
3. 收工：运行 `save-day.ps1`，记录当天可恢复点；日快照不等于可发布版本。
4. 发布：只从干净工作区创建 tag，再用 `publish.ps1` 发布精确 tag。
5. 发布后：检查两个应用的健康页、PM2 状态、`RELEASE.json` 和数据库迁移记录。
6. 出错：先回滚代码到 `previous`，不要直接反向执行 Prisma 迁移。

服务器发布顺序固定为：导出指定 tag -> 安装依赖 -> 构建 -> 烟测 -> 数据库备份 -> `prisma migrate deploy` -> 原子切换 `current` -> PM2 健康检查。任何一步失败都不切换新代码。

第一次采用这套流程前，先执行服务器状态核对。旧部署可能没有标准 `RELEASE.json`，或者遗留错误的 `previous` 链接；确认 `current` 和 `previous` 都属于同一个应用目录后，才允许第一次回滚。新流程生成的 release 会同时记录 `tag`、`ref`、完整 `commit` 和构建时间。
