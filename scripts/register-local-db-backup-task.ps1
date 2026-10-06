$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'backup-smart-erp-local.ps1'
$taskName = 'Smart ERP local backup'
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$triggers = @(New-ScheduledTaskTrigger -Daily -At 2:00AM)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Description 'Download and verify Smart ERP database backups and changed code snapshots to E:\ERP系统备份; retain 15 days.' -Force | Out-Null
Write-Host "Registered scheduled task: $taskName"
