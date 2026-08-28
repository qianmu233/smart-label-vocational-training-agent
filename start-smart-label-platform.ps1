$ErrorActionPreference = "Stop"

$DisplayVersion = "v1.0.0"
$OriginalRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = $OriginalRoot

Write-Host ""
Write-Host "================================================================"
Write-Host "  Smart Label Vocational Training Agent - $DisplayVersion"
Write-Host "================================================================"
Write-Host ""

# GitHub 版本不提交 .env.local。首次运行时自动创建空白本地配置模板。
$EnvLocalPath = Join-Path $OriginalRoot ".env.local"
$EnvExamplePath = Join-Path $OriginalRoot ".env.example"
if (-not (Test-Path $EnvLocalPath)) {
  if (Test-Path $EnvExamplePath) {
    Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvLocalPath -Force
    Write-Host "[CONFIG] A blank .env.local has been created from .env.example." -ForegroundColor Yellow
    Write-Host "[CONFIG] Please fill XFYUN_API_KEY, XFYUN_API_SECRET and XFYUN_FLOW_ID."
    Write-Host "[CONFIG] File: $EnvLocalPath"
    Write-Host ""
    try { Start-Process notepad.exe $EnvLocalPath | Out-Null } catch {}
    Write-Host "[INFO] Save the configuration, then run this startup file again."
    pause
    exit 0
  } else {
    Write-Host "[ERROR] .env.example is missing. Please restore it before starting." -ForegroundColor Red
    pause
    exit 1
  }
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = (($machinePath, $userPath) -join ";")
}

function Test-UsableNode {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    return $false
  }

  try {
    $versionText = (& node -v).Trim()
    $numbers = $versionText.TrimStart("v").Split(".")
    if ($numbers.Length -lt 2) {
      return $false
    }
    $major = [int]$numbers[0]
    $minor = [int]$numbers[1]
    return ($major -gt 22 -or ($major -eq 22 -and $minor -ge 13))
  } catch {
    return $false
  }
}

function Try-InstallNodeWithWinget {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Host "[INFO] Windows Package Manager (winget) is not available."
    return $false
  }

  Write-Host "[INFO] Node.js 22.13+ was not found. Trying automatic installation with winget..."
  Write-Host "[INFO] Windows may show an installation/UAC confirmation."
  Write-Host ""

  try {
    & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[WARN] winget could not install Node.js (exit code $LASTEXITCODE)." -ForegroundColor Yellow
      return $false
    }
    Refresh-ProcessPath

    # Some installers update PATH after the current shell starts. Add the standard location immediately.
    $standardNodeDir = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path (Join-Path $standardNodeDir "node.exe")) {
      $env:Path = "$standardNodeDir;$env:Path"
    }
    return (Test-UsableNode)
  } catch {
    Write-Host "[WARN] winget installation failed: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Try-UsePortableNode {
  Write-Host "[INFO] Trying a portable Node.js LTS runtime using built-in PowerShell..."
  Write-Host "[INFO] This fallback does not require a system-wide Node.js installation."
  Write-Host ""

  $toolsRoot = Join-Path $env:LOCALAPPDATA "SmartLabelVocationalTrainingAgent_tools"
  $nodeRoot = Join-Path $toolsRoot "node"
  $zipPath = Join-Path $toolsRoot "node-lts.zip"

  try {
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

    # Reuse an already downloaded portable runtime when possible.
    $existingNode = Get-ChildItem -Path $nodeRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingNode) {
      $nodeDir = Split-Path -Parent $existingNode.FullName
      $env:Path = "$nodeDir;$env:Path"
      if (Test-UsableNode) {
        Write-Host "[OK] Reusing portable Node.js runtime."
        return $true
      }
    }

    $releases = Invoke-RestMethod -UseBasicParsing -TimeoutSec 30 -Uri "https://nodejs.org/dist/index.json"
    $release = $releases | Where-Object {
      $_.lts -and $_.version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22
    } | Select-Object -First 1

    if (-not $release) {
      throw "No supported Node.js LTS release was found."
    }

    $osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $arch = if ($osArch -eq "arm64") { "arm64" } else { "x64" }
    $archiveName = "node-$($release.version)-win-$arch.zip"
    $downloadUrl = "https://nodejs.org/dist/$($release.version)/$archiveName"

    Write-Host "[INFO] Downloading $($release.version) ($arch) from the official Node.js site..."
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri $downloadUrl -OutFile $zipPath

    if (Test-Path $nodeRoot) { Remove-Item $nodeRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $nodeRoot -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

    $portableNode = Get-ChildItem -Path $nodeRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $portableNode) {
      throw "Portable Node.js download completed, but node.exe was not found."
    }

    $nodeDir = Split-Path -Parent $portableNode.FullName
    $env:Path = "$nodeDir;$env:Path"
    if (-not (Test-UsableNode)) {
      throw "Portable Node.js was downloaded but could not be started."
    }

    Write-Host "[OK] Portable Node.js runtime is ready."
    return $true
  } catch {
    Write-Host "[WARN] Portable Node.js fallback failed: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Ensure-NodeRuntime {
  if (-not (Test-UsableNode)) {
    $installed = Try-InstallNodeWithWinget
    if (-not $installed) {
      $installed = Try-UsePortableNode
    }

    if (-not $installed) {
      Write-Host ""
      Write-Host "[ERROR] Node.js could not be prepared automatically." -ForegroundColor Red
      Write-Host "Please connect to the Internet and try again."
      Write-Host "If automatic setup is blocked by school/company policy, install the current Node.js LTS manually:"
      Write-Host "  https://nodejs.org/"
      Write-Host "Required version: Node.js 22.13 or newer."
      Write-Host "Then double-click this startup file again."
      pause
      exit 1
    }
  }

  $versionText = (& node -v).Trim()
  Write-Host "[OK] Node.js version:"
  Write-Host $versionText
  Write-Host ""
}

function Copy-ToShortRuntimeIfNeeded {
  param([string]$SourceRoot)

  $resolved = (Resolve-Path $SourceRoot).Path
  if ($resolved.Length -le 120) {
    return $SourceRoot
  }

  $target = Join-Path $env:LOCALAPPDATA "SmartLabelVocationalTrainingAgent_v1.0.0"

  Write-Host "[INFO] Current path is long and may slow down Vite/Node startup:"
  Write-Host "       $resolved"
  Write-Host "[INFO] Preparing a short runtime copy:"
  Write-Host "       $target"
  Write-Host ""

  if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
  }

  $excludeDirs = @("node_modules", ".next", ".vinext", ".wrangler", ".git")
  Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
    if ($_.PSIsContainer -and ($excludeDirs -contains $_.Name)) {
      return
    }

    $destination = Join-Path $target $_.Name
    if ($_.PSIsContainer) {
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }
  }

  Write-Host "[OK] Runtime copy is ready."
  Write-Host "[INFO] The service will run from the short runtime directory."
  Write-Host ""
  return $target
}

function Ensure-Dependencies {
  param([string]$Root)

  $vinextCli = Join-Path $Root "node_modules\vinext\dist\cli.js"
  if (Test-Path $vinextCli) {
    return
  }

  Write-Host "[INFO] Preparing project dependencies for the first launch."
  Write-Host "[INFO] Keep the network connected until installation is complete."
  Write-Host ""

  $npxCmd = Get-Command npx -ErrorAction SilentlyContinue
  if (-not $npxCmd) {
    Write-Host "[ERROR] npx was not found. Reinstall Node.js with npm enabled." -ForegroundColor Red
    pause
    exit 1
  }

  Push-Location $Root
  try {
    & npx --yes pnpm@10.12.4 install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
      throw "Dependency installation failed."
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $vinextCli)) {
    Write-Host "[ERROR] Project dependencies are incomplete." -ForegroundColor Red
    Write-Host "Remove the node_modules folder, then run this file again."
    pause
    exit 1
  }
}

function Start-BrowserWhenReady {
  $pollScript = @'
$ports = 3000..3005
for ($i = 0; $i -lt 180; $i++) {
  foreach ($p in $ports) {
    try {
      $url = "http://localhost:$p/"
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $url
      if ($r.StatusCode -ge 200) {
        Start-Process $url
        exit 0
      }
    } catch {}
  }
  Start-Sleep -Seconds 1
}
'@

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($pollScript))
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded" | Out-Null
}

Ensure-NodeRuntime
$RuntimeRoot = Copy-ToShortRuntimeIfNeeded -SourceRoot $OriginalRoot
Ensure-Dependencies -Root $RuntimeRoot

Write-Host "[INFO] Starting Smart Label Vocational Training Agent..."
Write-Host "[INFO] Preferred address: http://localhost:3000/"
Write-Host "[INFO] If this port is occupied, the service selects the next port."
Write-Host "[INFO] Browser will open automatically after the Local address is ready."
Write-Host "[INFO] Keep this window open while using the platform."
Write-Host ""

Start-BrowserWhenReady

Push-Location $RuntimeRoot
try {
  & node ".\node_modules\vinext\dist\cli.js" dev
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "[INFO] The local service has stopped."
pause
