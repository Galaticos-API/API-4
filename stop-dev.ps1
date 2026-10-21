$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/dev-process.ps1"

Push-Location $PSScriptRoot
try {
    Stop-DevAIProcess
    docker compose down
    if ($LASTEXITCODE -ne 0) { throw "Docker nao encerrou corretamente (codigo $LASTEXITCODE)." }
    Write-Host 'Ambiente deste projeto encerrado.'
} finally {
    Pop-Location
}
