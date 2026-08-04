# 执行数据库迁移 - 添加待入账、广告代理、返点应收等新表
# 用法: .\scripts\run-db-migration.ps1

$ErrorActionPreference = "Stop"
Write-Host "=== 数据库迁移（新增表）===" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..

Write-Host "`n1. 生成 Prisma Client..." -ForegroundColor Green
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n2. 推送 schema 到数据库 (db push)..." -ForegroundColor Green
npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "失败: 请检查 DATABASE_URL 及数据库连接" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 迁移完成 ===" -ForegroundColor Cyan
Write-Host "新增表: PendingEntry, AdAgency, AdAccount, AdConsumption, AdRecharge, RebateReceivable" -ForegroundColor Yellow
