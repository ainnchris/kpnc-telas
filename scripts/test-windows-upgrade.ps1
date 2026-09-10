$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) { throw 'This installer test runs only on a disposable GitHub runner.' }
$testDirectory = Join-Path $env:RUNNER_TEMP ('meet-upgrade-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$oldInstaller = Join-Path $testDirectory 'previous.exe'
Invoke-WebRequest -Uri 'https://github.com/ainnchris/kpnc-telas/releases/download/windows-0.3.0/Kpnc-Meet-Setup-0.3.0.exe' -OutFile $oldInstaller
if ((Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9916d839231c04d043f2083ed46d47805fbc95d71c272ea14f9924757c51ce04') { throw 'Previous installer checksum mismatch' }
$installation = Join-Path $testDirectory 'installed'
$previous = Start-Process -FilePath $oldInstaller -ArgumentList @('/S', ('/D=' + $installation)) -PassThru -WindowStyle Hidden
if (-not $previous.WaitForExit(120000)) { throw 'Previous install timed out' }
if ($previous.ExitCode -ne 0) { throw 'Previous install failed' }
$expectedExe = Join-Path $installation 'Kpnc Meet.exe'
if (-not (Test-Path -LiteralPath $expectedExe)) { throw 'Previous app not installed in expected directory' }
$setup = @(Get-ChildItem -LiteralPath 'apps/desktop/dist' -Filter '*.exe' -File)
if ($setup.Count -ne 1) { throw 'Expected exactly one new installer' }
$upgrade = Start-Process -FilePath $setup[0].FullName -ArgumentList @('/S', '--force-run', ('/D=' + $installation)) -PassThru -WindowStyle Hidden
if (-not $upgrade.WaitForExit(120000)) { throw 'Silent upgrade timed out' }
if ($upgrade.ExitCode -ne 0) { throw 'Silent upgrade failed' }
$expectedVersion = (Get-Content -LiteralPath 'apps/desktop/package.json' -Raw | ConvertFrom-Json).version
if ((Get-Item -LiteralPath $expectedExe).VersionInfo.ProductVersion -notlike "$expectedVersion*") { throw 'Installed version did not change' }
$appProcesses = @()
for ($attempt=0; $attempt -lt 30; $attempt++) {
  $appProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $expectedExe })
  if ($appProcesses.Count -gt 0) { break }
  Start-Sleep -Seconds 1
}
if ($appProcesses.Count -eq 0) { throw 'Application did not reopen after silent upgrade' }
Write-Output "PASS: silent upgrade 0.3.0 -> $expectedVersion, installed version verified, automatic relaunch verified"
$appProcesses | Stop-Process
