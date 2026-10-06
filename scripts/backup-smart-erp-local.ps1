$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
& (Join-Path $scriptRoot 'backup-smart-erp-to-local.ps1')
& (Join-Path $scriptRoot 'backup-smart-erp-code-to-local.ps1')
