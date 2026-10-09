# Kwai Shop 巴西接入（首版）

## 范围与启用

3001 / baxi 的平台中心新增「Kwai Shop → 店铺授权与数据」。首版提供应用配置、商家 OAuth、授权续期和人工分页读取订单、商品、SKU。**不是自动全量同步，也未接通结算、利润、库存扣减或发货。** 快照不会生成财务流水。

1. 在 Kwai 后台轮换曾在截图中暴露的 appSecret / signSecret；不要发到聊天或提交 Git。
2. 用管理员登录 `https://www.baxi8.com/platforms/kwai`，填写 appKey、appSecret、signSecret。
3. Kwai 应用登记回调 `https://www.baxi8.com/api/kwai/oauth/callback`。
4. 从 ERP 点击授权，在同一浏览器完成商家同意。回调处理器只接受 10 分钟内、绑定浏览器和发起管理员的一次性状态。
5. 选择店铺读取商品/订单每页最多 50 条，有下一页时继续。订单时间窗口在翻页期间固定；首版界面提供近 7 / 30 天更新时间查询。商品 SKU 按商品手动读取。

HTTP/IP 页面不能提交应用凭证；查询接口仅管理员可用。空参数回调返回 200 只证明接口部署，不证明商家已经授权。授权后仍需实际核对订单、商品、SKU，与店铺后台一致才算完成联调。

## 安全与持久化

- AES-256-GCM 加密应用密钥和令牌；查询接口不返回密钥、令牌。主密钥优先 `KWAI_ENCRYPTION_KEY`，否则使用 `NEXTAUTH_SECRET` / `JWT_SECRET`，至少 32 字符。该密钥需要安全备份；更换会使旧密文不可读，需重填凭证并重新授权。
- OAuth 使用官方参数 `status`，数据库保存哈希及浏览器随机数哈希；HttpOnly / Secure / SameSite=Lax cookie。应用凭证修订号变化使旧授权失效。
- 刷新令牌会轮换：通过店铺数据库行锁串行刷新。查询前或手动刷新，不依赖定时任务。网络结果不确定/刷新失败时可能需要重新授权，不能重放旧刷新令牌并假设成功。
- 不记录第三方原始错误、code、token、带密钥的请求 URL；反向代理如记录回调查询串，也应在代理层屏蔽 code/status。
- 订单仅保存白名单业务字段，不保存买家地址、电话、CPF、姓名等个人信息。
- 官方 Long 编号作为字符串无损保存；金额保存分，缺失不是零；订单必须为 BRL 巴西站。
- `KwaiRecord(shopId, kind, externalId)` 唯一，事务 upsert；较早启动的请求不覆盖更新快照。同一商家只绑定一个应用。
- 断开功能清除 ERP 本地令牌、停止读取并保留历史快照；如需官方撤销权限，另到 Kwai 后台操作。

## 官方协议依据

入口：<https://developer-shop.kwai.com/document?menu=merchant-1>（2026-10-09 核对）。

| 功能 | 官方路径 / 文档 |
| --- | --- |
| 商家授权 | `https://shop.kwai.com/shop/b/authorize`；`redirect_uri` 参数去掉协议头，`status` 原样返回 |
| 获取令牌 | GET `/rest/open/api/oauth2/token` |
| 刷新令牌 | GET `/rest/open/api/oauth2/refreshToken` |
| 订单列表 / 详情 | POST `/rest/open/api/trade/queryOrderList`、`queryOrderDetails` |
| 商品列表 | POST `/rest/open/api/product/listItem` |
| SKU | GET `/rest/open/api/product/getSkuList` |

API 主机 `api-shop.kwai.com`。SHA256 原串：域名+路径+按名称升序的原始 query `key=value`（无分隔符）+`signSecret=...`。忽略 sign。商品文档明确忽略 accessToken；订单文档指向通用签名说明（只排除 sign），因此订单签名包含 accessToken。此文档差异必须通过真实授权的只读调用验证，不能宣称尚未执行的联调成功。不自动尝试其他签名模式。

OAuth 文档 ID `eZQADeRNLAsCZB0mSDsmZjgrE`；签名 `eZQAaLJSe0K8aHlJcG96lDOsW`；订单 `eZQBe4xQJ21uH_hBeHWTj1KWa`；商品 `eZQAi-nGtq5SHOgMDpK0QebjC`；SKU `eZQDs0u54rZzfrMFRHFJckvq0`（官方页面指向的 Qingque 文档）。

## 发布与回退

源码以已上线 `v2026.10.09.2` / `afcb1fdd9f90540f19069cb69bf06b2e4f8d9592` 为基线。仅增补 Kwai，不替换旧平台实现。发布仅 baxi，3003 不随本次变更。

迁移 `20261009170000_add_kwai_integration` 仅追加 Platform 枚举和四张新表，无旧业务数据 UPDATE/DELETE。迁移前沿用受管发布流程备份。若应用数据库角色无枚举所有权，发布停在迁移前，按精确 tag 的迁移文件由具备所有权的管理员执行，确认新表应用权限后标记已应用并继续受管 promote；不使用 db push、不扩大已有表权限。

回退只切回 previous 代码，不反向删除 Kwai 表。验证清单：完整测试/构建；回调无参数 200；未登录配置接口 401；非法回调不创建店铺；管理员 HTTPS 页面显示配置入口；已有平台路由仍存在。
