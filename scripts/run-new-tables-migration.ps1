# 执行新表迁移（通知、供应商对账、供应链扩展、业财关联）
# 用法: .\scripts\run-new-tables-migration.ps1
# 前置: 确保 DATABASE_URL 可连、数据库服务已启动

$ErrorActionPreference = "Stop"
Write-Host "=== 新表迁移（Notification / Supplier* / OrderTracking / BatchReceipt / Document / SalesVelocity / BusinessRelation）===" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..

Write-Host "`n1. 应用迁移 (migrate deploy)..." -ForegroundColor Green
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "失败: 请检查 DATABASE_URL 及数据库是否可连 (db.prisma.io:5432)" -ForegroundColor Red
    exit 1
}

Write-Host "`n2. 生成 Prisma Client..." -ForegroundColor Green
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "失败: 若提示文件被占用，请先关闭 npm run dev 或 IDE 再重试" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 新表迁移完成 ===" -ForegroundColor Cyan
