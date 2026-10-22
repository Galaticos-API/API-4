$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/dev-process.ps1"

Push-Location $PSScriptRoot
try {
    Stop-DevAIProcess

    # Descarrega os modelos da memória RAM/VRAM
    try {
        if (Get-Command 'ollama' -ErrorAction SilentlyContinue) {
            foreach ($m in @('bge-m3', 'qwen2.5:1.5b')) {
                & ollama stop $m 2>$null | Out-Null
            }
        }
    } catch { }

    docker compose down
    if ($LASTEXITCODE -ne 0) { throw "Docker nao encerrou corretamente (codigo $LASTEXITCODE)." }
    Write-Host 'Ambiente deste projeto encerrado.'
} finally {
    Pop-Location
}
