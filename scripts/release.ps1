# Create a local Git release tag after the repository passes release checks.
# This script never deploys to a server and never changes a database.
# Usage: .\scripts\release.ps1 -Version "2026.09.09.1" -Message "说明"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$')]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Message = "Release $Version",

    [switch]$Push,
    [string]$Remote = "origin",
    [string]$Branch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Invoke-Git([string[]]$Arguments) {
    & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

$status = git status --porcelain
if ($status) {
    Write-Error "工作区不干净，先提交或明确整理以下改动：`n$status"
}

$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) { throw "当前不在分支上，不能创建发布标签。" }
if ($Branch -and $currentBranch -ne $Branch) {
    throw "当前分支是 $currentBranch，不是要求的 $Branch。"
}

Write-Host "Running release checks for $currentBranch..." -ForegroundColor Cyan
npm run release:check
if ($LASTEXITCODE -ne 0) { throw "Release checks failed." }

$tag = "v$Version"
if (git tag --list $tag) { throw "标签 $tag 已存在，拒绝覆盖。" }
Invoke-Git @("tag", "-a", $tag, "-m", $Message)

$commit = (git rev-parse HEAD).Trim()
Write-Host "Created $tag at $commit. No server was changed." -ForegroundColor Green

if ($Push) {
    Invoke-Git @("push", $Remote, $currentBranch)
    Invoke-Git @("push", $Remote, $tag)
    Write-Host "Pushed branch $currentBranch and tag $tag to $Remote." -ForegroundColor Green
} else {
    Write-Host "Tag is local only. Re-run with -Push after reviewing it." -ForegroundColor Yellow
}
