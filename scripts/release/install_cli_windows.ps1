Param(
  [string]$BinPath = "$(Resolve-Path "$PSScriptRoot/../../dist/cli/text.exe")"
)

if (!(Test-Path $BinPath)) {
  Write-Error "CLI binary not found: $BinPath"
  Write-Host "Build it first: py scripts/release/build_cli_binary.py"
  exit 1
}

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\text\bin"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path $BinPath -Destination (Join-Path $InstallDir "text.exe") -Force

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (!$UserPath) { $UserPath = "" }
if (($UserPath -split ';') -notcontains $InstallDir) {
  $NewPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
  [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
  Write-Host "PATH updated. Reopen terminal to use 'text'."
}

Write-Host "Installed text CLI at: $InstallDir\text.exe"
