# 同步数据库（只应用版本化迁移）
# 请在本地 PowerShell 中运行，运行前请先停止开发服务器 (Ctrl+C)

Write-Host "正在同步数据库..." -ForegroundColor Cyan
Write-Host "1. 生成 Prisma 客户端..." -ForegroundColor Gray
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "prisma generate 失败" -ForegroundColor Red
    exit 1
}

Write-Host "2. 应用迁移 (migrate deploy)..." -ForegroundColor Gray
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "migrate deploy 失败，已停止；不会使用 db push 覆盖数据库。" -ForegroundColor Red
    exit 1
}

Write-Host "数据库同步完成" -ForegroundColor Green
Write-Host "若创建采购合同仍报错，请查看终端中的具体错误信息。" -ForegroundColor Gray
