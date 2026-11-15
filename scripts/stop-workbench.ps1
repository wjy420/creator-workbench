param(
    [ValidateRange(1, 65535)][int]$Port = 8769,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\', '/')
try {
    $serviceInfo = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/service-info" -TimeoutSec 3
} catch {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) {
        Write-Host '自媒体工作台服务未运行。'
        exit 0
    }
    Write-Host "无法确认端口 $Port 上的服务身份，未停止任何进程。" -ForegroundColor Yellow
    Write-Host '请确认该服务已更新到当前版本。'
    exit 1
}
try {
    $reportedPath = [IO.Path]::GetFullPath([string]$serviceInfo.root).TrimEnd('\', '/')
    if ($serviceInfo.app -ne 'creator-workbench' -or -not [StringComparer]::OrdinalIgnoreCase.Equals($workspacePath, $reportedPath)) {
        throw '该端口不属于当前目录的自媒体工作台，未停止任何进程。'
    }
    $serviceProcessId = [int]$serviceInfo.pid
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serviceProcessId"
    if ($serviceProcessId -le 0 -or $processInfo.Name -ne 'node.exe' -or -not ($listeners.OwningProcess -contains $serviceProcessId)) {
        throw '服务进程与端口信息不一致，未停止任何进程。'
    }
    if ($CheckOnly) {
        Write-Host "已确认当前工作台服务，进程 $serviceProcessId，端口 $Port。检查模式未关闭服务。"
        exit 0
    }
    & "$env:SystemRoot\System32\taskkill.exe" /PID $serviceProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $serviceProcessId -ErrorAction SilentlyContinue)) {
        throw '服务未能关闭，请检查当前用户是否有权限结束此进程。'
    }
    Write-Host '自媒体工作台服务已关闭。' -ForegroundColor Green
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
