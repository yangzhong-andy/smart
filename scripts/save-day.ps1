# Save the current working tree as a reversible daily Git snapshot.
# This commits source and migration changes only; ignored build artifacts and
# local secrets are excluded by .gitignore.
# Usage: .\scripts\save-day.ps1 -Message "完成 Shopee 对账"

[CmdletBinding()]
param(
    [string]$Message = "wip: daily snapshot $(Get-Date -Format 'yyyy-MM-dd')"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
    throw "当前目录不是 Git 仓库。"
}

$before = @(git status --short)
if ($before.Count -eq 0) {
    Write-Host "工作区没有需要保存的改动。" -ForegroundColor Green
    exit 0
}

Write-Host "将保存以下改动：" -ForegroundColor Cyan
$before | Write-Host
git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$staged = @(git diff --cached --name-only)
if ($staged.Count -eq 0) {
    throw "没有可提交的文件；请检查 .gitignore 和工作区状态。"
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "git commit failed." }

$commit = (git rev-parse HEAD).Trim()
Write-Host "已保存快照 $commit。当前只在本地，未发布到服务器。" -ForegroundColor Green
