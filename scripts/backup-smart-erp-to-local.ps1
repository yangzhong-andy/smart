param(
    [string] $BackupRoot = 'E:\ERP系统备份',
    [int] $RetentionDays = 15
)

$ErrorActionPreference = 'Stop'

$remoteHost = '149.88.87.208'
$remoteUser = 'root'
$identityFile = Join-Path $env:USERPROFILE '.ssh\id_rsa'
$remoteRoot = '/var/backups/smart-erp/databases/daily'
$databaseRoot = Join-Path $BackupRoot '数据库'
$logFile = Join-Path $BackupRoot 'backup-local.log'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$staging = Join-Path $databaseRoot ".staging-$runId"

function Write-BackupLog([string] $message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Remove-ExpiredDatabaseBackups {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -LiteralPath $databaseRoot -Directory -Filter '*CST' | ForEach-Object {
        try {
            $backupTime = [DateTime]::ParseExact($_.Name, 'yyyyMMddTHHmmssCST', [Globalization.CultureInfo]::InvariantCulture)
            if ($backupTime -lt $cutoff) {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force
                Write-BackupLog "Removed local backup older than $RetentionDays days: $($_.Name)"
            }
        } catch {
            # Ignore folders outside the managed backup naming scheme.
        }
    }
}

if (-not (Test-Path -LiteralPath $identityFile)) {
    throw "SSH key not found: $identityFile"
}

New-Item -ItemType Directory -Path $databaseRoot -Force | Out-Null
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    $sshTarget = "$remoteUser@$remoteHost"
    $latest = (& ssh.exe -i $identityFile -o BatchMode=yes -o StrictHostKeyChecking=yes $sshTarget "find '$remoteRoot' -mindepth 1 -maxdepth 1 -type d -name '20*CST' -printf '%f\n' | sort -r | head -1").Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($latest)) {
        throw 'No server database backup was found.'
    }

    $destination = Join-Path $databaseRoot $latest
    if (Test-Path -LiteralPath $destination) {
        Write-BackupLog "Already downloaded: $latest"
        Remove-ExpiredDatabaseBackups
        return
    }

    foreach ($fileName in @('smart.dump', 'smartsdfy.dump', 'SHA256SUMS')) {
        $remoteFile = "$sshTarget`:$remoteRoot/$latest/$fileName"
        & scp.exe -q -i $identityFile -o BatchMode=yes -o StrictHostKeyChecking=yes $remoteFile $staging
        if ($LASTEXITCODE -ne 0) {
            throw "Download failed: $fileName"
        }
    }

    $expectedByFile = @{}
    foreach ($line in Get-Content -LiteralPath (Join-Path $staging 'SHA256SUMS')) {
        $parts = $line -split '\s+', 2
        if ($parts.Count -eq 2) {
            $expectedByFile[$parts[1].TrimStart('*')] = $parts[0].ToLowerInvariant()
        }
    }
    foreach ($fileName in @('smart.dump', 'smartsdfy.dump')) {
        $localFile = Join-Path $staging $fileName
        $actual = (Get-FileHash -LiteralPath $localFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expectedByFile[$fileName] -ne $actual) {
            throw "Checksum mismatch: $fileName"
        }
    }

    $manifest = @{
        serverBackup = $latest
        downloadedAt = (Get-Date).ToUniversalTime().ToString('o')
        sourceHost = $remoteHost
        databases = @('smart', 'smartsdfy')
        checksumVerified = $true
    } | ConvertTo-Json
    Set-Content -LiteralPath (Join-Path $staging 'manifest.json') -Value $manifest -Encoding UTF8

    Move-Item -LiteralPath $staging -Destination $destination
    Write-BackupLog "Downloaded and verified: $latest"

    Remove-ExpiredDatabaseBackups
} catch {
    Write-BackupLog "FAILED: $($_.Exception.Message)"
    throw
} finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
