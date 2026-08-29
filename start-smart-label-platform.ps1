$ErrorActionPreference = "Stop"

$DisplayVersion = "v1.0.0"
$RequiredNodeMajor = 22
$RequiredNodeMinor = 13
$PortableNodeVersion = "v22.16.0"
$PnpmVersion = "10.12.4"
$env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"

$OriginalRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeBase = Join-Path $env:LOCALAPPDATA "SmartLabelVocationalTrainingAgent"
$RuntimeRoot = Join-Path $RuntimeBase "v1.0.0"
$ToolsRoot = Join-Path $RuntimeBase "tools"
$VerifiedLockSource = Join-Path $OriginalRoot "bootstrap\pnpm-lock.verified.yaml"

Write-Host ""
Write-Host "================================================================"
Write-Host "  Smart Label Vocational Training Agent - $DisplayVersion"
Write-Host "================================================================"
Write-Host ""

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = (($machinePath, $userPath) -join ";")
}

function Test-UsableNode {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) { return $false }

  try {
    $versionText = (& node -v).Trim()
    $numbers = $versionText.TrimStart("v").Split(".")
    if ($numbers.Length -lt 2) { return $false }
    $major = [int]$numbers[0]
    $minor = [int]$numbers[1]
    return ($major -gt $RequiredNodeMajor -or ($major -eq $RequiredNodeMajor -and $minor -ge $RequiredNodeMinor))
  } catch {
    return $false
  }
}

function Try-ReusePortableNode {
  $portableRoot = Join-Path $ToolsRoot "node"
  $existingNode = Get-ChildItem -Path $portableRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $existingNode) { return $false }

  $nodeDir = Split-Path -Parent $existingNode.FullName
  $env:Path = "$nodeDir;$env:Path"

  if (Test-UsableNode) {
    Write-Host "[OK] Reusing the local portable Node.js runtime."
    return $true
  }
  return $false
}

function Try-DownloadPortableNode {
  Write-Host "[INFO] Compatible Node.js was not found."
  Write-Host "[INFO] Preparing portable Node.js $PortableNodeVersion (no administrator permission required)."

  try {
    New-Item -ItemType Directory -Path $ToolsRoot -Force | Out-Null

    $osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $arch = if ($osArch -eq "arm64") { "arm64" } else { "x64" }

    $archiveName = "node-$PortableNodeVersion-win-$arch.zip"
    $downloadUrl = "https://nodejs.org/dist/$PortableNodeVersion/$archiveName"
    $zipPath = Join-Path $ToolsRoot $archiveName
    $nodeRoot = Join-Path $ToolsRoot "node"

    Write-Host "[INFO] Downloading the official Windows $arch portable runtime..."
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

    Invoke-WebRequest -UseBasicParsing -TimeoutSec 240 -Uri $downloadUrl -OutFile $zipPath

    if (Test-Path $nodeRoot) {
      Remove-Item $nodeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $nodeRoot -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

    $portableNode = Get-ChildItem -Path $nodeRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $portableNode) { throw "node.exe was not found after extraction." }

    $nodeDir = Split-Path -Parent $portableNode.FullName
    $env:Path = "$nodeDir;$env:Path"

    if (-not (Test-UsableNode)) {
      throw "Portable Node.js was extracted but could not be started."
    }

    Write-Host "[OK] Portable Node.js is ready."
    return $true
  } catch {
    Write-Host "[WARN] Portable Node.js setup failed: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Try-InstallNodeWithWinget {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { return $false }

  Write-Host "[INFO] Falling back to Windows Package Manager (winget)..."

  try {
    & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { return $false }

    Refresh-ProcessPath
    $standardNodeDir = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path (Join-Path $standardNodeDir "node.exe")) {
      $env:Path = "$standardNodeDir;$env:Path"
    }
    return (Test-UsableNode)
  } catch {
    return $false
  }
}

function Ensure-NodeRuntime {
  if (-not (Test-UsableNode)) {
    $ready = Try-ReusePortableNode
    if (-not $ready) { $ready = Try-DownloadPortableNode }
    if (-not $ready) { $ready = Try-InstallNodeWithWinget }

    if (-not $ready) {
      Write-Host ""
      Write-Host "[ERROR] Node.js could not be prepared automatically." -ForegroundColor Red
      Write-Host "Required: Node.js 22.13 or newer."
      Write-Host "Please install Node.js LTS from https://nodejs.org/ and run this file again."
      pause
      exit 1
    }
  }

  Write-Host "[OK] Node.js version:"
  & node -v
  Write-Host ""
}

function Sync-ProjectToRuntime {
  param([string]$SourceRoot, [string]$TargetRoot)

  New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null

  # Keep only heavyweight runtime caches. Every source directory is refreshed
  # from the extracted package so a newer ZIP can never keep an older app UI.
  $excludeDirs = @("node_modules", ".next", ".vinext", ".wrangler", ".git", "dist")
  $excludeFiles = @(".dependency-fingerprint", ".install-success")

  Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
    if ($_.PSIsContainer -and ($excludeDirs -contains $_.Name)) { return }
    if ((-not $_.PSIsContainer) -and ($excludeFiles -contains $_.Name)) { return }

    if ($_.PSIsContainer) {
      $destination = Join-Path $TargetRoot $_.Name

      # Remove the previous source directory first. The old implementation copied
      # a directory into an already-existing directory and could create app\app,
      # leaving the real app\learning-studio.tsx stale.
      if (Test-Path $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
      }

      Copy-Item -LiteralPath $_.FullName -Destination $TargetRoot -Recurse -Force
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $TargetRoot $_.Name) -Force
    }
  }

  # Always restore the verified Windows-tested lockfile.
  if (Test-Path $VerifiedLockSource) {
    Copy-Item -LiteralPath $VerifiedLockSource -Destination (Join-Path $TargetRoot "pnpm-lock.yaml") -Force
  }

  return $TargetRoot
}

function Get-DependencyFingerprint {
  param([string]$Root)

  $packageFile = Join-Path $Root "package.json"
  $lockFile = Join-Path $Root "pnpm-lock.yaml"
  if (-not (Test-Path $packageFile) -or -not (Test-Path $lockFile)) { return "" }

  $packageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $packageFile).Hash
  $lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lockFile).Hash
  return "$packageHash-$lockHash"
}

function Ensure-PnpmRuntime {
  $pnpmRoot = Join-Path $ToolsRoot "pnpm-$PnpmVersion"
  $pnpmScript = Join-Path $pnpmRoot "node_modules\pnpm\bin\pnpm.cjs"

  if (Test-Path $pnpmScript) {
    $script:PnpmScript = $pnpmScript
    return
  }

  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    throw "npm is unavailable. Please reinstall Node.js LTS."
  }

  Write-Host "[INFO] Preparing pnpm $PnpmVersion runtime (one-time bootstrap)."
  Write-Host "[INFO] The pnpm runtime is stored in LocalAppData and reused later."

  New-Item -ItemType Directory -Path $pnpmRoot -Force | Out-Null

  $officialRegistry = "https://registry.npmjs.org/"
  $previousRegistry = $env:NPM_CONFIG_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $officialRegistry

  try {
    & npm install `
      --prefix $pnpmRoot `
      --no-save `
      --no-audit `
      --no-fund `
      --loglevel=error `
      --registry=$officialRegistry `
      "pnpm@$PnpmVersion"

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pnpmScript)) {
      throw "pnpm runtime bootstrap failed."
    }
  } finally {
    if ($null -eq $previousRegistry) {
      Remove-Item Env:NPM_CONFIG_REGISTRY -ErrorAction SilentlyContinue
    } else {
      $env:NPM_CONFIG_REGISTRY = $previousRegistry
    }
  }

  $script:PnpmScript = $pnpmScript
  Write-Host "[OK] pnpm $PnpmVersion runtime is ready."
  Write-Host ""
}

function Invoke-Pnpm {
  param(
    [string]$Root,
    [string[]]$PnpmArgs
  )

  if (-not $script:PnpmScript -or -not (Test-Path $script:PnpmScript)) {
    Ensure-PnpmRuntime
  }

  Push-Location $Root
  try {
    Write-Host "[INFO] pnpm $PnpmVersion $($PnpmArgs -join ' ')"

    # IMPORTANT:
    # Invoke-Pnpm is called as: $exitCode = Invoke-Pnpm ...
    # If pnpm writes normal stdout directly, PowerShell captures those text lines
    # into $exitCode together with the numeric exit code. That makes a successful
    # install look like a failure. Forward all process output to the console via
    # Write-Host so the function returns ONLY the integer exit code.
    & node $script:PnpmScript @PnpmArgs 2>&1 | ForEach-Object {
      Write-Host $_
    }

    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 1 }
    return [int]$code
  } finally {
    Pop-Location
  }
}

function Ensure-Dependencies {
  param([string]$Root)

  $vinextCli = Join-Path $Root "node_modules\vinext\dist\cli.js"
  $fingerprintFile = Join-Path $Root ".dependency-fingerprint"
  $expectedFingerprint = Get-DependencyFingerprint -Root $Root
  $existingFingerprint = if (Test-Path $fingerprintFile) {
    (Get-Content -LiteralPath $fingerprintFile -Raw).Trim()
  } else { "" }

  if ((Test-Path $vinextCli) -and $expectedFingerprint -and ($existingFingerprint -eq $expectedFingerprint)) {
    Write-Host "[OK] Project dependencies are ready. Reusing the local dependency cache."
    Write-Host ""
    return
  }

  Write-Host "[INFO] Preparing project dependencies."
  Ensure-PnpmRuntime
  Write-Host "[INFO] The verified lockfile is used directly."
  Write-Host "[INFO] Cached packages are preferred when available."
  Write-Host ""

  $officialRegistry = "https://registry.npmjs.org/"
  $previousRegistry = $env:NPM_CONFIG_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $officialRegistry

  $started = Get-Date

  # 1) 首选：冻结锁文件 + 本地缓存优先
  $exitCode = Invoke-Pnpm -Root $Root -PnpmArgs @(
    "install",
    "--frozen-lockfile",
    "--prefer-offline",
    "--registry=$officialRegistry",
    "--reporter=default"
  )
  Write-Host "[INFO] First install exit code: $exitCode"

  # 2) 若本地缓存元数据损坏，清理 store 后仍使用同一 verified lockfile 重试。
  if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[WARN] The first dependency install attempt failed." -ForegroundColor Yellow
    Write-Host "[INFO] Cleaning the pnpm store metadata and retrying once."
    [void](Invoke-Pnpm -Root $Root -PnpmArgs @("store", "prune"))

    $exitCode = Invoke-Pnpm -Root $Root -PnpmArgs @(
      "install",
      "--frozen-lockfile",
      "--registry=$officialRegistry",
      "--reporter=default"
    )
    Write-Host "[INFO] Retry install exit code: $exitCode"
  }

  # 3) 最后兜底：只修复 lockfile，不使用不存在的 prefer-online 参数。
  if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[WARN] Frozen-lock installation still failed. Repairing the lockfile from the official registry once." -ForegroundColor Yellow

    $exitCode = Invoke-Pnpm -Root $Root -PnpmArgs @(
      "install",
      "--no-frozen-lockfile",
      "--fix-lockfile",
      "--registry=$officialRegistry",
      "--reporter=default"
    )
    Write-Host "[INFO] Repair install exit code: $exitCode"
  }

  if ($null -eq $previousRegistry) {
    Remove-Item Env:NPM_CONFIG_REGISTRY -ErrorAction SilentlyContinue
  } else {
    $env:NPM_CONFIG_REGISTRY = $previousRegistry
  }

  if ($exitCode -ne 0 -or -not (Test-Path $vinextCli)) {
    Write-Host ""
    Write-Host "[ERROR] Project dependency installation failed." -ForegroundColor Red
    Write-Host "Please keep the network connected and run the launcher again."
    Write-Host "If this computer previously used a broken package cache, delete:"
    Write-Host "  $RuntimeBase"
    Write-Host "and launch again."
    pause
    exit 1
  }

  $expectedFingerprint = Get-DependencyFingerprint -Root $Root
  Set-Content -LiteralPath $fingerprintFile -Value $expectedFingerprint -Encoding ASCII

  $elapsed = [int]((Get-Date) - $started).TotalSeconds
  Write-Host ""
  Write-Host "[OK] Project dependencies are ready ($elapsed s)."
  Write-Host ""
}

function Test-TcpPortAvailable {
  param([int]$Port)

  $listener = $null
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      try { $listener.Stop() } catch {}
    }
  }
}

function Get-ExpectedDevPort {
  foreach ($port in 3000..3010) {
    if (Test-TcpPortAvailable -Port $port) {
      return $port
    }
  }
  return 3000
}

function Start-BrowserWhenReady {
  param([int]$Port)

  $pollScript = @"
`$url = "http://localhost:$Port/"
for (`$i = 0; `$i -lt 180; `$i++) {
  try {
    `$r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri `$url
    if (`$r.StatusCode -ge 200) {
      Start-Process `$url
      exit 0
    }
  } catch {}
  Start-Sleep -Seconds 1
}
"@

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($pollScript))
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded" | Out-Null
}

Ensure-NodeRuntime
$RuntimeRoot = Sync-ProjectToRuntime -SourceRoot $OriginalRoot -TargetRoot $RuntimeRoot

Write-Host "[INFO] Runtime cache:"
Write-Host "       $RuntimeRoot"
Write-Host "[INFO] The cache is shared by all extracted copies of this v1.0.0 package."
Write-Host ""

Ensure-Dependencies -Root $RuntimeRoot

$ExpectedDevPort = Get-ExpectedDevPort

Write-Host "[INFO] Starting Smart Label Vocational Training Agent..."
Write-Host "[INFO] Expected local address: http://localhost:$ExpectedDevPort/"
Write-Host "[INFO] Browser will wait for this exact port, so an older MVP process cannot be opened by mistake."
Write-Host "[INFO] Keep this window open while using the platform."
Write-Host ""

Start-BrowserWhenReady -Port $ExpectedDevPort

Push-Location $RuntimeRoot
try {
  & node ".\node_modules\vinext\dist\cli.js" dev
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "[INFO] The local service has stopped."
pause
