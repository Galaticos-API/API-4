# Script para desligar ambiente de desenvolvimento Sinapse

$ErrorActionPreference = "SilentlyContinue"
$rootDir = $PSScriptRoot

Write-Host "Encerrando containers Docker..." -ForegroundColor Yellow
Set-Location $rootDir
docker compose down

Write-Host "Encerrando processo do AI Service (uvicorn)..." -ForegroundColor Yellow
Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Ambiente de desenvolvimento finalizado com sucesso." -ForegroundColor Green
