$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_HOME = Join-Path $PSScriptRoot '.dotnet-home'
$env:NUGET_PACKAGES = Join-Path $PSScriptRoot '.nuget'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Logging__EventLog__LogLevel__Default = 'None'
$sdk = Join-Path $PSScriptRoot '.dotnet/dotnet.exe'
if (!(Test-Path $sdk)) { $sdk = 'dotnet' }
Write-Host 'TI4 Boardgame Helper: http://localhost:5116/table'
Push-Location (Join-Path $PSScriptRoot 'Ti4Companion.ApiService')
try { & $sdk run --no-launch-profile --urls http://localhost:5116; $result = $LASTEXITCODE }
finally { Pop-Location }
exit $result
