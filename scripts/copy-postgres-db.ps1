# 将「老库」整库复制到「新库」（PostgreSQL，与 Prisma schema 一致时最省事）
#
# 依赖：本机已安装 PostgreSQL 客户端（PATH 中有 pg_dump、psql；或 pg_restore 用于自定义格式）
#   Windows 示例：安装 https://www.postgresql.org/download/windows/ 并勾选 Command Line Tools
#
# 用法（在 PowerShell 中，项目根目录）：
#   $env:DATABASE_URL_SOURCE = "postgresql://旧库用户:密码@旧主机:5432/旧库名?schema=public"
#   $env:DATABASE_URL_TARGET = "postgresql://新库用户:密码@新主机:5432/新库名?schema=public"
#   .\scripts\copy-postgres-db.ps1
#
# 若新库已有表结构、只想拷数据（两库 Prisma 迁移版本一致）：
#   .\scripts\copy-postgres-db.ps1 -DataOnly
#
# 注意：
# - 目标库在「非 DataOnly」模式下会被 DROP/CREATE 冲突风险：建议新库为空库，或先手动清空。
# - 含敏感信息，勿把连接串提交到 Git。

param(
    [switch] $DataOnly
)

$ErrorActionPreference = "Stop"

function Test-Url([string] $name, [string] $url) {
    if ([string]::IsNullOrWhiteSpace($url)) {
        Write-Host "缺少环境变量 ${name}，请先设置后再运行。" -ForegroundColor Red
        exit 1
    }
    if ($url -notmatch "^postgres(ql)?://") {
        Write-Host "${name} 应为 postgresql:// 或 postgres:// 连接串。" -ForegroundColor Red
        exit 1
    }
}

$src = $env:DATABASE_URL_SOURCE
$dst = $env:DATABASE_URL_TARGET
Test-Url "DATABASE_URL_SOURCE" $src
Test-Url "DATABASE_URL_TARGET" $dst

Write-Host "=== PostgreSQL 库间复制 ===" -ForegroundColor Cyan
Write-Host "源: $($src -replace ':[^:@]+@', ':****@')" -ForegroundColor Gray
Write-Host "目标: $($dst -replace ':[^:@]+@', ':****@')" -ForegroundColor Gray
Write-Host "模式: $(if ($DataOnly) { '仅数据 (--data-only)' } else { '结构+数据（整库逻辑备份）' })" -ForegroundColor Gray

$dumpFile = Join-Path ([System.IO.Path]::GetTempPath()) ("smart-erp-pg-dump-" + [Guid]::NewGuid().ToString("N") + ".sql")

try {
    if ($DataOnly) {
        Write-Host "`n正在从源库导出数据..." -ForegroundColor Green
        & pg_dump --no-owner --no-acl --data-only --quote-all-identifiers -f $dumpFile $src
        if ($LASTEXITCODE -ne 0) { throw "pg_dump 失败" }
    }
    else {
        Write-Host "`n正在从源库导出结构+数据..." -ForegroundColor Green
        & pg_dump --no-owner --no-acl --clean --if-exists --quote-all-identifiers -f $dumpFile $src
        if ($LASTEXITCODE -ne 0) { throw "pg_dump 失败" }
    }

    Write-Host "正在导入到目标库..." -ForegroundColor Green
    & psql $dst -v ON_ERROR_STOP=1 -f $dumpFile
    if ($LASTEXITCODE -ne 0) { throw "psql 导入失败" }

    Write-Host "`n完成。建议在新库上执行: npx prisma migrate resolve（若用迁移）并验证应用连接。" -ForegroundColor Cyan
}
finally {
    if (Test-Path $dumpFile) {
        Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
    }
}
