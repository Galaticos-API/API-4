param(
    [switch]$NoEmbeddings,
    [switch]$NoLlm,
    [switch]$SkipPull
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/dev-process.ps1"

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command falhou (codigo $LASTEXITCODE)." }
}

function Wait-Service {
    param([string]$Url, [System.Diagnostics.Process]$Process)
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($Process) {
            $Process.Refresh()
            if ($Process.HasExited) { throw 'A IA encerrou antes de iniciar. Consulte .sinapse-dev/ai-error.log.' }
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "O servico nao ficou disponivel: $Url"
}

$previousAI = $env:AI_SERVICE_URL
$previousAnalyzer = $env:REPO_ANALYZER_URL
$startedAI = $false
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Crie .env a partir de .env.example antes de iniciar.' }
    if (Get-DevAIProcess) { throw 'A IA deste projeto ja esta iniciada. Execute stop-dev.ps1 antes de reiniciar.' }
    if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
        throw 'A porta 8000 esta ocupada. Encerre o servico existente antes de iniciar a IA nativa.'
    }
    try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null }
    catch {
        Start-Process 'ollama' -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        Wait-Service 'http://127.0.0.1:11434/api/tags'
    }

    if (-not $SkipPull) {
        $installedModels = @((Invoke-RestMethod 'http://127.0.0.1:11434/api/tags').models | ForEach-Object { $_.name })
        if (-not $NoEmbeddings -and ($installedModels -notcontains 'bge-m3:latest' -and $installedModels -notcontains 'bge-m3')) {
            Write-Host 'Baixando modelo de embeddings (bge-m3)...'
            Invoke-Checked ollama @('pull', 'bge-m3')
        }
        if (-not $NoLlm -and ($installedModels -notcontains 'qwen2.5:1.5b:latest' -and $installedModels -notcontains 'qwen2.5:1.5b')) {
            Write-Host 'Baixando modelo LLM do Copiloto (qwen2.5:1.5b)...'
            Invoke-Checked ollama @('pull', 'qwen2.5:1.5b')
        }
    }

    $aiPath = Join-Path $PSScriptRoot 'ai-service'
    $python = Join-Path $aiPath '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        Invoke-Checked python @('-m', 'venv', (Join-Path $aiPath '.venv'))
    }
    Invoke-Checked $python @('-m', 'pip', 'install', '-r', (Join-Path $aiPath 'requirements.txt'))

    # O override vale so para esta execucao; o Compose usa a rede interna por padrao.
    $env:AI_SERVICE_URL = 'http://host.docker.internal:8000'
    $env:REPO_ANALYZER_URL = 'http://host.docker.internal:8000'
    Invoke-Checked docker @('compose', 'up', '-d', '--build', 'postgres', 'backend', 'frontend')

    New-Item -ItemType Directory -Path $devStateDirectory -Force | Out-Null
    $aiProcess = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $aiPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $devStateDirectory 'ai.log') -RedirectStandardError (Join-Path $devStateDirectory 'ai-error.log')
    $startedAI = $true
    Save-DevAIProcess $aiProcess
    Wait-Service 'http://127.0.0.1:8000/health' $aiProcess
    $compose = docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel conferir as portas dos servicos.' }
    $backendPort = $compose.services.backend.ports[0].published
    $frontendPort = $compose.services.frontend.ports[0].published
    Wait-Service "http://localhost:$backendPort/health"
    Wait-Service "http://localhost:$frontendPort"
    & (Join-Path $PSScriptRoot 'scripts/seed-demo-acervos.ps1') -ApiBaseUrl "http://localhost:$backendPort"
    Write-Host "Servicos disponiveis. Frontend: http://localhost:$frontendPort | Backend: http://localhost:$backendPort | IA: http://localhost:8000"
} catch {
    if ($startedAI) { Stop-DevAIProcess }
    throw
} finally {
    $env:AI_SERVICE_URL = $previousAI
    $env:REPO_ANALYZER_URL = $previousAnalyzer
    Pop-Location
}
