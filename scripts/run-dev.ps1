Param(
    [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"

# 如果未传入参数，尝试从项目根目录的 .env 读取
if (-not $DatabaseUrl) {
    $envPath = Join-Path $PSScriptRoot "..\.env"
    if (Test-Path $envPath) {
        $line = Get-Content $envPath | Select-Object -First 1
        if ($line -match '^DATABASE_URL=(.+)$') {
            $DatabaseUrl = $Matches[1]
        }
    }
}

if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL is not set. Provide via param or .env"
    exit 1
}

$env:DATABASE_URL = $DatabaseUrl
Write-Host "Using DATABASE_URL=$env:DATABASE_URL"

Set-Location "$PSScriptRoot/.."
npm run dev
