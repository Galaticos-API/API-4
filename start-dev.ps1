# Script para iniciar ambiente de desenvolvimento Sinapse
# 1. Inicia o Ollama (se não estiver rodando)
# 2. Sobe os containers essenciais (Postgres, Backend, Frontend)
# 3. Inicia o AI-Service (FastAPI) nativo no Windows usando aceleração local de hardware

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "         SINAPSE - INICIALIZANDO AMBIENTE DEV         " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Ollama
Write-Host "`n[1/3] Verificando Ollama..." -ForegroundColor Yellow
$ollamaProc = Get-Process -Name "ollama app", "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProc) {
    Write-Host "Iniciando Ollama em segundo plano..." -ForegroundColor Gray
    Start-Process "ollama" "serve" -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "Ollama ja esta em execucao." -ForegroundColor Green
}

# 2. Containers Docker
Write-Host "`n[2/3] Subindo containers Docker (Postgres, Backend, Frontend)..." -ForegroundColor Yellow
Set-Location $rootDir
docker compose up -d postgres backend frontend

# 3. AI Service (Python nativo)
Write-Host "`n[3/3] Configurando e iniciando AI-Service local..." -ForegroundColor Yellow
$aiPath = Join-Path $rootDir "ai-service"

if (-not (Test-Path "$aiPath\.venv")) {
    Write-Host "Ambiente virtual (.venv) nao encontrado em $aiPath. Criando..." -ForegroundColor Cyan
    python -m venv "$aiPath\.venv"
    Write-Host "Instalando dependencias do ai-service..." -ForegroundColor Cyan
    & "$aiPath\.venv\Scripts\pip" install -r "$aiPath\requirements.txt"
}

Write-Host "Iniciando FastAPI em nova janela..." -ForegroundColor Green
$cmdArgs = "-NoExit -Command `"cd '$aiPath'; .\.venv\Scripts\activate; uvicorn main:app --host 0.0.0.0 --port 8000 --reload`""
Start-Process powershell -ArgumentList $cmdArgs

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  Tudo pronto!" -ForegroundColor Green
Write-Host "  - Frontend:   http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend:    http://localhost:3001" -ForegroundColor White
Write-Host "  - AI Service: http://localhost:8000" -ForegroundColor White
Write-Host "  - Ollama:     http://localhost:11434" -ForegroundColor White
Write-Host "======================================================`n" -ForegroundColor Green
