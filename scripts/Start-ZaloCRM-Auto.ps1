$ErrorActionPreference = 'SilentlyContinue'
$Root = 'D:\CTY TNHH THIEP CUOI\CLAUDE\ZaloCRM'
$Run = Join-Path $Root '.runtime'
New-Item -ItemType Directory -Path $Run -Force | Out-Null
function Port($n) { return [bool](Get-NetTCPConnection -State Listen -LocalPort $n -ErrorAction SilentlyContinue) }
function Log($s) { Add-Content (Join-Path $Run 'autostart.log') "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $s" }
if (-not (Port 5433)) {
  $docker = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if ((Test-Path $docker) -and -not (Get-Process 'Docker Desktop')) { Start-Process $docker -WindowStyle Hidden }
  $end=(Get-Date).AddMinutes(4)
  do { docker info *> $null; if($LASTEXITCODE -eq 0){break}; Start-Sleep 5 } while((Get-Date)-lt $end)
  docker compose -f (Join-Path $Root 'docker-compose.yml') up -d db redis minio *> (Join-Path $Run 'docker.log')
}
if (-not (Port 3901)) {
  Log 'Start backend 3901'
  Start-Process 'C:\Program Files\nodejs\npx.cmd' -ArgumentList 'tsx','watch','--env-file=.env','src/app.ts' -WorkingDirectory (Join-Path $Root 'backend') -RedirectStandardOutput (Join-Path $Run 'backend.out.log') -RedirectStandardError (Join-Path $Run 'backend.err.log') -WindowStyle Hidden
}
$end=(Get-Date).AddSeconds(90); do {if(Port 3901){break};Start-Sleep 2} while((Get-Date)-lt $end)
if (-not (Port 5173)) {
  Log 'Start frontend 5173'
  Start-Process 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run','dev','--','--host','0.0.0.0','--port','5173','--strictPort' -WorkingDirectory (Join-Path $Root 'frontend') -RedirectStandardOutput (Join-Path $Run 'frontend.out.log') -RedirectStandardError (Join-Path $Run 'frontend.err.log') -WindowStyle Hidden
}
$end=(Get-Date).AddSeconds(60); do {if(Port 5173){break};Start-Sleep 2} while((Get-Date)-lt $end)
$cf=Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object {$_.CommandLine -match '127\.0\.0\.1:5173'}
if ((Port 5173) -and -not $cf) {
  $e=Join-Path $Run 'cloudflared.err.log'; Set-Content $e ''
  Log 'Start Cloudflare 5173'
  Start-Process 'C:\Program Files (x86)\cloudflared\cloudflared.exe' -ArgumentList 'tunnel','--url','http://127.0.0.1:5173','--no-autoupdate' -RedirectStandardOutput (Join-Path $Run 'cloudflared.out.log') -RedirectStandardError $e -WindowStyle Hidden
  $end=(Get-Date).AddSeconds(45)
  do { Start-Sleep 1; $m=[regex]::Match((Get-Content $e -Raw),'https://[a-z0-9-]+\.trycloudflare\.com'); if($m.Success){ Set-Content (Join-Path $Root 'CLOUDFLARE-LINK.txt') @("Cloudflare:",$m.Value,"","Local:","http://localhost:5173","","Cap nhat: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')","Link Cloudflare thay doi sau moi lan restart."); Log "Cloudflare $($m.Value)"; break } } while((Get-Date)-lt $end)
}
