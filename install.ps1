# YOLO installer for Windows (PowerShell):
#   irm https://github.com/aphrody-labs/yolo/releases/latest/download/install.ps1 | iex
# Environment: YOLO_VERSION, YOLO_HOME (default %USERPROFILE%\.yolo), YOLO_REPO, YOLO_RELEASE_DIR, GITHUB_TOKEN
$ErrorActionPreference = "Stop"
$Repo = if ($env:YOLO_REPO) { $env:YOLO_REPO } else { "aphrody-labs/yolo" }
$HomeDir = if ($env:YOLO_HOME) { $env:YOLO_HOME } else { Join-Path $env:USERPROFILE ".yolo" }
$Version = if ($env:YOLO_VERSION) { $env:YOLO_VERSION } else { "latest" }
$Target = "x86_64-pc-windows-msvc"
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne "X64") { throw "unsupported architecture" }

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("yolo-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  $Token = if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } elseif ($env:GH_TOKEN) { $env:GH_TOKEN } else { $null }
  function Get-Asset([string]$Name) {
    $Dest = Join-Path $Tmp $Name
    if ($env:YOLO_RELEASE_DIR) { Copy-Item (Join-Path $env:YOLO_RELEASE_DIR $Name) $Dest; return $Dest }
    $Base = if ($Version -eq "latest") { "https://github.com/$Repo/releases/latest/download" } else { "https://github.com/$Repo/releases/download/$Version" }
    try { Invoke-WebRequest "$Base/$Name" -OutFile $Dest -UseBasicParsing; return $Dest } catch {
      if (-not $Token) { throw "cannot download $Name (private repository? set GITHUB_TOKEN)" }
    }
    $Api = if ($Version -eq "latest") { "https://api.github.com/repos/$Repo/releases/latest" } else { "https://api.github.com/repos/$Repo/releases/tags/$Version" }
    $H = @{ Authorization = "Bearer $Token"; Accept = "application/vnd.github+json" }
    $Release = Invoke-RestMethod $Api -Headers $H
    $Asset = $Release.assets | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if (-not $Asset) { throw "release has no asset $Name" }
    Invoke-WebRequest $Asset.url -OutFile $Dest -Headers @{ Authorization = "Bearer $Token"; Accept = "application/octet-stream" } -UseBasicParsing
    return $Dest
  }
  Write-Host "Installing yolo ($Target, $Version) into $HomeDir"
  $Sums = Get-Asset "SHA256SUMS"
  $Line = Get-Content $Sums | Where-Object { $_ -match "yolo-.*-$Target\.tar\.gz$" } | Select-Object -First 1
  if (-not $Line) { throw "no build for $Target in this release" }
  $Name = ($Line -split "\s+")[1]; $Want = ($Line -split "\s+")[0]
  $Archive = Get-Asset $Name
  $Got = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLower()
  if ($Got -ne $Want) { throw "checksum mismatch for $Name" }
  $Extract = Join-Path $Tmp "main"; New-Item -ItemType Directory -Path $Extract | Out-Null
  tar -xzf $Archive -C $Extract
  New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
  foreach ($Part in "bin", "packages", "templates", "crates", "VERSION", "LICENSE") {
    $Src = Join-Path $Extract $Part; if (-not (Test-Path $Src)) { continue }
    $Dst = Join-Path $HomeDir $Part; if (Test-Path $Dst) { Remove-Item -Recurse -Force $Dst }
    Copy-Item -Recurse $Src $Dst
  }
  foreach ($Old in "sdk", "stack") { $OldPath = Join-Path $HomeDir $Old; if (Test-Path $OldPath) { Remove-Item -Recurse -Force $OldPath } }
  $env:YOLO_HOME = $HomeDir
  & (Join-Path $HomeDir "bin\yolo.exe") runtime install (Join-Path $Extract "artifact")
  $Bin = Join-Path $HomeDir "bin"
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($UserPath -split ";") -notcontains $Bin) { [Environment]::SetEnvironmentVariable("Path", "$Bin;$UserPath", "User"); Write-Host "Added $Bin to the user PATH" }
  & (Join-Path $HomeDir "bin\yolo.exe") version
  Write-Host "yolo is installed. Open a new terminal and run: yolo doctor"
} finally { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }
