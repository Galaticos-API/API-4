param(
    [ValidateSet('backup', 'restore', 'verify')]
    [string]$Action = 'verify',
    [string]$BackupFile = (Join-Path (Split-Path $PSScriptRoot -Parent) '.sinapse-dev\backups\sinapse_backup_release.sql'),
    [string]$ContainerName = 'sinapse-postgres',
    [string]$DbUser = 'sinapse',
    [string]$DbName = 'sinapse'
)

$ErrorActionPreference = 'Stop'

function Get-TableCounts {
    param([string]$TargetDb)
    $query = "SELECT 'projeto=' || (SELECT count(*) FROM projeto) || ', epico=' || (SELECT count(*) FROM epico) || ', feature=' || (SELECT count(*) FROM feature) || ', pbi=' || (SELECT count(*) FROM pbi) || ', documento=' || (SELECT count(*) FROM documento) || ', chunk=' || (SELECT count(*) FROM chunk) || ', desenvolvedor=' || (SELECT count(*) FROM desenvolvedor) || ', tecnologia=' || (SELECT count(*) FROM tecnologia) || ', competencia=' || (SELECT count(*) FROM competencia) || ', alocacao=' || (SELECT count(*) FROM alocacao);"
    $res = docker exec $ContainerName psql -U $DbUser -d $TargetDb -t -A -c $query
    if ($LASTEXITCODE -ne 0) { throw "Falha ao consultar contagens em $TargetDb" }
    return $res.Trim()
}

if ($Action -eq 'backup' -or $Action -eq 'verify') {
    $dir = Split-Path $BackupFile -Parent
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "[Backup] Gerando dump de '$DbName' para '$BackupFile'..." -ForegroundColor Cyan
    docker exec $ContainerName pg_dump -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges | Set-Content -LiteralPath $BackupFile -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou." }
    $size = (Get-Item -LiteralPath $BackupFile).Length
    Write-Host "[Backup] Concluído ($size bytes)." -ForegroundColor Green
}

if ($Action -eq 'restore') {
    if (-not (Test-Path -LiteralPath $BackupFile)) { throw "Arquivo de backup não encontrado: $BackupFile" }
    Write-Host "[Restore] Restaurando '$BackupFile' no banco '$DbName'..." -ForegroundColor Cyan
    Get-Content -LiteralPath $BackupFile -Raw -Encoding UTF8 | docker exec -i $ContainerName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Restauração falhou." }
    Write-Host "[Restore] Concluído: $(Get-TableCounts -TargetDb $DbName)" -ForegroundColor Green
}

if ($Action -eq 'verify') {
    $tempDb = "sinapse_restore_verify_test"
    $origCounts = Get-TableCounts -TargetDb $DbName
    Write-Host "[Verify] Contagens originais ($DbName): $origCounts" -ForegroundColor Cyan
    try {
        docker exec $ContainerName psql -U $DbUser -d $DbName -c "DROP DATABASE IF EXISTS $tempDb WITH (FORCE);" | Out-Null
        docker exec $ContainerName psql -U $DbUser -d $DbName -c "CREATE DATABASE $tempDb;" | Out-Null
        Get-Content -LiteralPath $BackupFile -Raw -Encoding UTF8 | docker exec -i $ContainerName psql -U $DbUser -d $tempDb -v ON_ERROR_STOP=1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar dump no banco temporário $tempDb." }
        $restoredCounts = Get-TableCounts -TargetDb $tempDb
        Write-Host "[Verify] Contagens restauradas ($tempDb): $restoredCounts" -ForegroundColor Cyan
        if ($origCounts -ne $restoredCounts) {
            throw "Divergência entre banco original ($origCounts) e banco restaurado ($restoredCounts)!"
        }
        Write-Host "[Verify] Paridade 100% confirmada entre backup e restore!" -ForegroundColor Green
    } finally {
        docker exec $ContainerName psql -U $DbUser -d $DbName -c "DROP DATABASE IF EXISTS $tempDb WITH (FORCE);" | Out-Null
    }
}
