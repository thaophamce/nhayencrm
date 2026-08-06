[CmdletBinding()]
param(
    [string]$BackupRoot = '',
    [string]$RcloneDestination = $env:ZALOCRM_BACKUP_REMOTE,
    [int]$LocalRetentionDays = 14,
    [int]$RemoteRetentionDays = 90,
    [string]$DbContainer = 'zalo-crm-db',
    [string]$AppContainer = 'zalo-crm-app'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not $BackupRoot) {
    $BackupRoot = Join-Path $PSScriptRoot '..\backups\scheduled'
}

function Write-BackupLog([string]$Message) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$stamp] $Message"
}

function Invoke-Docker([string[]]$DockerArgs) {
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($DockerArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI not found.'
}

$resolvedRoot = [System.IO.Path]::GetFullPath($BackupRoot)
New-Item -ItemType Directory -Force -Path $resolvedRoot | Out-Null

$lockPath = Join-Path $resolvedRoot '.backup.lock'
$lockStream = $null
try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
} catch {
    throw 'Another ZaloCRM backup is already running.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runName = "zalocrm-$timestamp"
$runDir = Join-Path $resolvedRoot $runName
$dbFile = Join-Path $runDir 'database.dump'
$mediaFile = Join-Path $runDir 'media.tar.gz'
$manifestFile = Join-Path $runDir 'manifest.json'
$checksumFile = Join-Path $runDir 'SHA256SUMS.txt'
$dbTemp = "/tmp/$runName-database.dump"

try {
    New-Item -ItemType Directory -Path $runDir | Out-Null

    foreach ($container in @($DbContainer, $AppContainer)) {
        $running = (& docker inspect -f '{{.State.Running}}' $container 2>$null)
        if ($LASTEXITCODE -ne 0 -or $running -ne 'true') {
            throw "Required container '$container' is not running."
        }
    }

    Write-BackupLog 'Exporting PostgreSQL in custom format...'
    Invoke-Docker @(
        'exec', $DbContainer, 'sh', '-ec',
        "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --no-owner --no-acl --file='$dbTemp'; pg_restore --list '$dbTemp' >/dev/null"
    )
    Invoke-Docker @('cp', "${DbContainer}:$dbTemp", $dbFile)
    Invoke-Docker @('exec', $DbContainer, 'rm', '-f', $dbTemp)

    Write-BackupLog 'Archiving local application files...'
    Invoke-Docker @(
        'run', '--rm',
        '--volumes-from', $AppContainer,
        '--volume', "${runDir}:/backup",
        'alpine:latest', 'sh', '-ec',
        "tar -czf /backup/media.tar.gz -C /var/lib/zalo-crm/files .; tar -tzf /backup/media.tar.gz >/dev/null"
    )

    $dbHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dbFile).Hash.ToLowerInvariant()
    $mediaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $mediaFile).Hash.ToLowerInvariant()
    @(
        "$dbHash  database.dump"
        "$mediaHash  media.tar.gz"
    ) | Set-Content -Encoding ascii -LiteralPath $checksumFile

    $manifest = [ordered]@{
        schemaVersion = 1
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        computerName = $env:COMPUTERNAME
        databaseContainer = $DbContainer
        applicationContainer = $AppContainer
        databaseBytes = (Get-Item -LiteralPath $dbFile).Length
        mediaBytes = (Get-Item -LiteralPath $mediaFile).Length
        databaseSha256 = $dbHash
        mediaSha256 = $mediaHash
        remoteDestination = if ($RcloneDestination) { $RcloneDestination } else { $null }
    }
    $manifest | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $manifestFile

    Write-BackupLog "Local backup verified: $runDir"

    if ($RcloneDestination) {
        if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
            throw 'ZALOCRM_BACKUP_REMOTE is set, but rclone is not installed.'
        }
        Write-BackupLog "Uploading to $RcloneDestination/$runName ..."
        & rclone copy $runDir "$($RcloneDestination.TrimEnd('/'))/$runName" `
            --checksum --immutable --transfers 4 --checkers 8
        if ($LASTEXITCODE -ne 0) {
            throw "rclone upload failed with exit code $LASTEXITCODE"
        }
        & rclone check $runDir "$($RcloneDestination.TrimEnd('/'))/$runName" --checksum --one-way
        if ($LASTEXITCODE -ne 0) {
            throw "rclone verification failed with exit code $LASTEXITCODE"
        }
        Write-BackupLog 'Remote upload verified.'

        if ($RemoteRetentionDays -gt 0) {
            & rclone delete $RcloneDestination --min-age "${RemoteRetentionDays}d" `
                --include '/zalocrm-*/**' --rmdirs
            if ($LASTEXITCODE -ne 0) {
                throw "rclone remote retention failed with exit code $LASTEXITCODE"
            }
        }
    } else {
        Write-BackupLog 'Remote upload skipped: ZALOCRM_BACKUP_REMOTE is not configured.'
    }

    if ($LocalRetentionDays -gt 0) {
        $cutoff = (Get-Date).AddDays(-$LocalRetentionDays)
        Get-ChildItem -LiteralPath $resolvedRoot -Directory -Filter 'zalocrm-*' |
            Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName -ne $runDir } |
            Remove-Item -Recurse -Force
    }

    Write-BackupLog 'Backup completed successfully.'
} catch {
    Write-Error $_
    throw
} finally {
    & docker exec $DbContainer rm -f $dbTemp 2>$null | Out-Null
    if ($lockStream) {
        $lockStream.Dispose()
    }
}
