# 迁移到新数据库脚本
# 用法: .\scripts\migrate-to-new-db.ps1
# 前提: .env.local 中 DATABASE_URL 已更新为新数据库地址

$ErrorActionPreference = "Stop"
Write-Host "=== 开始迁移到新数据库 ===" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..

# 1. 生成 Prisma Client
Write-Host "`n1. 生成 Prisma Client..." -ForegroundColor Green
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "   ✓ 完成" -ForegroundColor Green

# 2. 推送 schema 到新数据库
Write-Host "`n2. 推送 schema 到新数据库 (prisma db push)..." -ForegroundColor Green
npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ 失败: 请检查 DATABASE_URL 是否正确，以及数据库是否可访问" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ 完成" -ForegroundColor Green

# 3. 执行 seed 初始化数据
Write-Host "`n3. 执行 seed 初始化数据..." -ForegroundColor Green
npx prisma db seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Seed 失败" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ 完成" -ForegroundColor Green

Write-Host "`n=== 迁移完成 ===" -ForegroundColor Cyan
Write-Host "Restart dev server: npm run dev" -ForegroundColor Yellow
