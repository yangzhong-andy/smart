param(
    [string] $BackupRoot = 'E:\ERP系统备份',
    [int] $RetentionDays = 15
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$codeRoot = Join-Path $BackupRoot '代码'
$manifestPath = Join-Path $codeRoot 'latest-manifest.json'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$staging = Join-Path $codeRoot ".staging-$runId"
$destination = Join-Path $codeRoot $runId

function Write-CodeBackupLog([string] $message) {
    $logFile = Join-Path $BackupRoot 'backup-local.log'
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Remove-ExpiredCodeBackups {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -LiteralPath $codeRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}$' } | ForEach-Object {
        try {
            $snapshotTime = [DateTime]::ParseExact($_.Name, 'yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
            if ($snapshotTime -lt $cutoff) {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force
                Write-CodeBackupLog "Removed local code snapshot older than $RetentionDays days: $($_.Name)"
            }
        } catch {
            # Ignore folders outside the managed snapshot naming scheme.
        }
    }
}

New-Item -ItemType Directory -Path $codeRoot -Force | Out-Null

try {
    $files = Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Force | Where-Object {
        $relative = $_.FullName.Substring($projectRoot.Length + 1)
        $parts = $relative -split '[\\/]'
        $excludedDirectory = $parts | Where-Object {
            $_ -in @('node_modules', '.git', 'backups', 'tmp') -or $_ -like '.next*'
        }
        $excludedSecret = $_.Name -match '^\.env($|\.)' -and $_.Name -notmatch '^\.env\.(example|sample)$'
        $excludedGeneratedFile = $_.Name -like '*.tsbuildinfo'
        (-not $excludedDirectory) -and (-not $excludedSecret) -and (-not $excludedGeneratedFile)
    }

    $hashRows = foreach ($file in $files) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1)
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "${hash}  ${relative}"
    }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $fingerprintBytes = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes(($hashRows -join "`n")))
        $fingerprint = ([BitConverter]::ToString($fingerprintBytes) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }

    if (Test-Path -LiteralPath $manifestPath) {
        try {
            $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
            if ($previous.fingerprint -eq $fingerprint) {
                Write-CodeBackupLog "Code unchanged; snapshot skipped: $fingerprint"
                Remove-ExpiredCodeBackups
                return
            }
        } catch {
            Write-CodeBackupLog 'Previous code manifest unreadable; creating a fresh snapshot.'
        }
    }

    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1)
        $target = Join-Path $staging $relative
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }

    Set-Content -LiteralPath (Join-Path $staging 'SHA256SUMS') -Value $hashRows -Encoding ASCII
    $manifest = @{
        snapshot = $runId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        source = $projectRoot
        fingerprint = $fingerprint
        excluded = @('node_modules', '.next*', '.git', 'backups', 'tmp', '*.tsbuildinfo', 'secrets in .env files')
        fileCount = $files.Count
    } | ConvertTo-Json
    Set-Content -LiteralPath (Join-Path $staging 'manifest.json') -Value $manifest -Encoding UTF8
    Move-Item -LiteralPath $staging -Destination $destination
    Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8
    Write-CodeBackupLog "Code snapshot created: $runId files=$($files.Count) fingerprint=$fingerprint"

    Remove-ExpiredCodeBackups
} catch {
    Write-CodeBackupLog "FAILED code backup: $($_.Exception.Message)"
    throw
} finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
