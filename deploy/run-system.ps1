# Starts the whole Retina Rescue demo on this laptop and checks it end to end (deploy/DEMO_VERCEL_NGROK.md).
#   powershell -ExecutionPolicy Bypass -File deploy\run-system.ps1          start what is not running, then check
#   powershell -ExecutionPolicy Bypass -File deploy\run-system.ps1 -Stop    stop everything it starts
# Each service runs in its own hidden process, logging to data\logs\<name>.log. Services already listening are left alone.
param([switch]$Stop, [switch]$NoFrontend)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'data\logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
$NgrokDomain = 'endpoint-widen-blinked.ngrok-free.dev'
$VercelUrl = 'https://retina-rescue.vercel.app'
$Ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $Ngrok) {
    $Ngrok = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ngrok.exe -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

# name, port, working dir, command line (run through cmd so output can be redirected)
$Services = @(
    @{ Name = 'auth-server'; Port = 4000; Dir = 'auth-server'; Cmd = 'npm run dev' },
    @{ Name = 'backend';     Port = 5000; Dir = 'backend';     Cmd = 'python -u server.py' },
    @{ Name = 'proxy';       Port = 8080; Dir = '.';           Cmd = 'node deploy\demo-proxy.mjs' },
    @{ Name = 'ngrok';       Port = 4040; Dir = '.';           Cmd = "`"$Ngrok`" http --url=$NgrokDomain 8080 --log=stdout" }
)
if (-not $NoFrontend) { $Services += @{ Name = 'frontend (local dev)'; Port = 5173; Dir = 'frontend'; Cmd = 'npm run dev' } }

function Test-Port($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

function Get-Json($url, $headers = @{}) {
    try { Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 10 } catch { $null }
}

if ($Stop) {
    foreach ($s in $Services) {
        $pids = Get-NetTCPConnection -LocalPort $s.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null | Out-Null }
        # npm --watch parents that no longer own the port
        "{0,-22} stopped" -f $s.Name
    }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'index\.js' -and $_.CommandLine -match 'ExperimentalWarning' } |
        ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
    return
}

if (-not $Ngrok) { Write-Warning 'ngrok not found: install it with  winget install Ngrok.Ngrok --source winget' }

foreach ($s in $Services) {
    if (Test-Port $s.Port) { "{0,-22} already running (port {1})" -f $s.Name, $s.Port; continue }
    $log = Join-Path $Logs (($s.Name -split ' ')[0] + '.log')
    # /s: cmd strips only the outer quotes, so quoted paths inside the command survive
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/s /c `"$($s.Cmd) > `"$log`" 2>&1`"" `
        -WorkingDirectory (Join-Path $Root $s.Dir) -WindowStyle Hidden | Out-Null
    "{0,-22} started (port {1}, log data\logs\{2})" -f $s.Name, $s.Port, (Split-Path $log -Leaf)
}

# ---- health checks ----
function Wait-For($label, $seconds, [scriptblock]$ok) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        $r = & $ok
        if ($r) { Write-Host "  OK    $label  $r"; return $true }
        Start-Sleep -Seconds 3
    }
    Write-Host "  FAIL  $label (not ready after $seconds s; see data\logs)"
    return $false
}

''
'Checking (MATLAB can take 1-2 minutes to load after a fresh start)...'
$skip = @{ 'ngrok-skip-browser-warning' = '1' }
$all = $true
$all = (Wait-For 'auth-server   http://127.0.0.1:4000/api/health' 60 { if ((Get-Json 'http://127.0.0.1:4000/api/health').ok) { 'ok' } }) -and $all
$all = (Wait-For 'backend       http://127.0.0.1:5000/api/health (MATLAB)' 240 {
    $h = Get-Json 'http://127.0.0.1:5000/api/health'; if ($h.matlab -eq 'ready') { "matlab ready, stage 1 $($h.stage1Engine)" } }) -and $all
$all = (Wait-For 'proxy         http://127.0.0.1:8080' 30 { if ((Get-Json 'http://127.0.0.1:8080/proxy-health').ok) { 'ok' } }) -and $all
$all = (Wait-For "tunnel        https://$NgrokDomain" 60 { if ((Get-Json "https://$NgrokDomain/proxy-health" $skip).ok) { 'ok' } }) -and $all
$all = (Wait-For "public site   $VercelUrl" 60 {
    $h = Get-Json "$VercelUrl/ml-api/health" $skip; if ($h.matlab -eq 'ready') { 'web app -> tunnel -> MATLAB ok' } }) -and $all
if (-not $NoFrontend) {
    $null = Wait-For 'local app     http://localhost:5173' 60 { if (Test-Port 5173) { 'ok' } }
}

''
if ($all) { "SYSTEM READY: $VercelUrl" }
else { 'SYSTEM NOT READY: see the FAIL lines above and data\logs\*.log' }
