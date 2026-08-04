# Git 发布脚本
# 用法: .\scripts\release.ps1 -Version "1.0.0" -Message "发布说明"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$Message = "版本 $Version 发布"
)

Write-Host "=== 开始发布版本 $Version ===" -ForegroundColor Cyan

# 1. 检查工作区是否干净
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  工作区有未提交的更改，请先提交或暂存" -ForegroundColor Yellow
    Write-Host $status
    exit 1
}

# 2. 更新 package.json 版本号
Write-Host "`n📦 更新 package.json 版本号..." -ForegroundColor Green
$packageJson = Get-Content package.json -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content package.json -Encoding UTF8
Write-Host "✓ 版本号已更新为 $Version" -ForegroundColor Green

# 3. 提交更改
Write-Host "`n📝 提交更改..." -ForegroundColor Green
git add package.json
git commit -m "chore: 更新版本号到 $Version"
Write-Host "✓ 更改已提交" -ForegroundColor Green

# 4. 创建标签
Write-Host "`n🏷️  创建 Git 标签..." -ForegroundColor Green
git tag -a "v$Version" -m "$Message"
Write-Host "✓ 标签 v$Version 已创建" -ForegroundColor Green

# 5. 推送到远程
Write-Host "`n🚀 推送到远程仓库..." -ForegroundColor Green
git push origin main
git push origin "v$Version"
Write-Host "✓ 已推送到远程仓库" -ForegroundColor Green

# 6. 显示发布信息
Write-Host "`n✅ 版本 $Version 发布成功！" -ForegroundColor Cyan
Write-Host "`n发布信息:" -ForegroundColor Yellow
Write-Host "  版本号: $Version" -ForegroundColor White
Write-Host "  标签: v$Version" -ForegroundColor White
Write-Host "  说明: $Message" -ForegroundColor White
Write-Host "`n查看标签: git tag -l" -ForegroundColor Gray
Write-Host "查看提交: git log --oneline -5" -ForegroundColor Gray
