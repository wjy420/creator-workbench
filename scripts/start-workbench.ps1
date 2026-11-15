param(
    [ValidateRange(1, 65535)][int]$Port = 8769,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\', '/')
$url = "http://127.0.0.1:$Port"
$hashProvider = [Security.Cryptography.SHA256]::Create()
$workspaceHash = [BitConverter]::ToString($hashProvider.ComputeHash([Text.Encoding]::UTF8.GetBytes($workspacePath.ToLowerInvariant()))).Replace('-', '').Substring(0, 16)
$hashProvider.Dispose()
$startupMutex = New-Object Threading.Mutex($false, "Local\CreatorWorkbenchStart-$workspaceHash")
$ownsMutex = $false
$errorLog = Join-Path $workspacePath 'data\logs\workbench-error.log'
function Get-WorkbenchService {
    try { return Invoke-RestMethod -Uri "$url/api/service-info" -TimeoutSec 1 } catch { return $null }
}
function Assert-WorkbenchService($info) {
    if ($info.app -ne 'creator-workbench' -or -not [StringComparer]::OrdinalIgnoreCase.Equals($workspacePath, [IO.Path]::GetFullPath([string]$info.root).TrimEnd('\', '/'))) {
        throw "端口 $Port 已被其它服务占用，未修改该服务。"
    }
}
function Open-Workbench {
    if (-not $NoBrowser) { Start-Process -FilePath $url }
    Write-Host "工作台已就绪：$url" -ForegroundColor Green
}
try {
    Write-Host '正在启动自媒体工作台…'
    try { $ownsMutex = $startupMutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw '另一个启动程序正在运行，请稍后重试。' }
    $existing = Get-WorkbenchService
    if ($null -ne $existing) { Assert-WorkbenchService $existing; Open-Workbench; exit 0 }
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "端口 $Port 已被占用，无法启动工作台。" }
    $pathParts = @($env:Path, [Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) | Where-Object { $_ }
    $env:Path = ($pathParts -join ';')
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
    if (-not $nodePath) {
        $candidates = @('C:\dev\node\node.exe', (Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))
        $nodePath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
    if (-not $nodePath) { throw '没有找到 Node.js，请安装 Node.js 22 或更高版本后重新启动。' }
    $nodeVersion = & $nodePath --version
    $nodeMajorVersion = [int]($nodeVersion.Trim().TrimStart('v').Split('.')[0])
    if ($LASTEXITCODE -ne 0 -or $nodeMajorVersion -lt 22) { throw '工作台需要 Node.js 22 或更高版本，请更新 Node.js。' }
    $logDirectory = Split-Path -Parent $errorLog
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $outputLog = Join-Path $logDirectory 'workbench-out.log'
    $env:PORT = [string]$Port
    $env:DATA_DIR = Join-Path $workspacePath 'data'
    $serviceProcess = Start-Process -FilePath $nodePath -ArgumentList @('server.mjs') -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $ready = $false
    $startupDeadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $startupDeadline) {
        $info = Get-WorkbenchService
        if ($null -ne $info) { Assert-WorkbenchService $info; $ready = $true; break }
        $serviceProcess.Refresh()
        if ($serviceProcess.HasExited) {
            $details = if (Test-Path -LiteralPath $errorLog) { (Get-Content -LiteralPath $errorLog -Encoding UTF8 -Tail 15) -join [Environment]::NewLine } else { '' }
            throw "服务启动后退出。`n$details"
        }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw '等待服务启动超时，请查看启动日志。' }
    Open-Workbench
} catch {
    Write-Host ('启动失败：' + $_.Exception.Message) -ForegroundColor Red
    Write-Host "错误日志：$errorLog"
    exit 1
} finally {
    if ($ownsMutex) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
