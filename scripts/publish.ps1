# Publish an existing Git tag through the managed server release pipeline.
# The server receives a tag/ref and exports that exact commit; it does not
# deploy the local working tree.
# Usage: .\scripts\publish.ps1 -Tag v2026.09.09.1 -App all

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$')]
    [string]$Tag,

    [ValidateSet('baxi', 'sdfy', 'all')]
    [string]$App = 'all',

    [string]$Server = '149.88.87.208',
    [string]$User = 'root',
    [int]$Port = 22,
    [switch]$Push
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$status = git status --porcelain
if ($status) { throw "工作区不干净，先运行 save-day.ps1 或完成正式提交：`n$status" }
if (-not (git tag --list $Tag)) { throw "本地不存在标签 $Tag。" }

$commit = (git rev-list -n 1 $Tag).Trim()
if (-not $commit) { throw "无法解析标签 $Tag。" }
if ($Push) {
    git push origin $Tag
    if ($LASTEXITCODE -ne 0) { throw "推送标签失败。" }
}

$sshArgs = @('-p', "$Port", "$User@$Server", '/usr/local/sbin/smart-deploy', 'deploy', $App, $Tag)
Write-Host "发布 $Tag ($commit) 到 $Server，目标: $App" -ForegroundColor Cyan
if (-not $Push) {
    Write-Host "提示：未使用 -Push；服务器必须已经能解析该标签。" -ForegroundColor Yellow
}
& ssh @sshArgs
if ($LASTEXITCODE -ne 0) { throw "服务器发布失败。" }

Write-Host "发布命令已完成。请用 smart-deploy status 验证 current/previous。" -ForegroundColor Green
