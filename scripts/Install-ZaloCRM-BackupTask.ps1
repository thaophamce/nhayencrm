[CmdletBinding()]
param(
    [string]$DailyAt = '01:30',
    [string]$RcloneDestination = '',
    [string]$TaskName = 'ZaloCRM Offsite Backup'
)

$ErrorActionPreference = 'Stop'
$backupScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'Backup-ZaloCRM.ps1'))
if (-not (Test-Path -LiteralPath $backupScript)) {
    throw "Backup script not found: $backupScript"
}

$time = [datetime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$quotedScript = '"' + $backupScript.Replace('"', '""') + '"'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File $quotedScript"
if ($RcloneDestination) {
    $quotedRemote = '"' + $RcloneDestination.Replace('"', '""') + '"'
    $arguments += " -RcloneDestination $quotedRemote"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Verified PostgreSQL + local media backup for ZaloCRM, optionally copied off-site with rclone.' `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' at $DailyAt every day."
Write-Host "Test now: Start-ScheduledTask -TaskName '$TaskName'"
