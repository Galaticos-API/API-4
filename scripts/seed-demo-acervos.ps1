param(
    [string]$ApiBaseUrl = 'http://localhost:3001',
    [int]$ProcessingTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

function Get-DemoAdminPassword {
    if ($env:SINAPSE_DEMO_ADMIN_PASSWORD) { return $env:SINAPSE_DEMO_ADMIN_PASSWORD }

    $dotenvPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
    if (Test-Path -LiteralPath $dotenvPath) {
        $line = Get-Content -LiteralPath $dotenvPath | Where-Object { $_ -match '^SINAPSE_DEMO_ADMIN_PASSWORD=' } | Select-Object -First 1
        if ($line) { return ($line -replace '^SINAPSE_DEMO_ADMIN_PASSWORD=', '').Trim().Trim('"').Trim("'") }
    }

    return 'Admin@123'
}

$apiUri = [Uri]$ApiBaseUrl
if ($apiUri.Scheme -ne 'http' -or $apiUri.Host -notin @('localhost', '127.0.0.1', '::1')) {
    throw 'A carga de acervos de QA só pode autenticar em uma API local (localhost).'
}

$root = Split-Path $PSScriptRoot -Parent
$fixtureDirectory = Join-Path $root 'docs/qa/acervo-demo'
$fixtures = @(
    @{ Project = 'Plataforma Sinapse'; File = 'plataforma-sinapse-qa.md' },
    @{ Project = 'Portal de Pagamentos PIX'; File = 'portal-pagamentos-pix-qa.md' },
    @{ Project = 'Sistema de Autenticação Unificada'; File = 'autenticacao-unificada-qa.md' }
)

$password = Get-DemoAdminPassword
$loginBody = @{ email = 'admin@sinapse.local'; password = $password } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Uri "$($apiUri.AbsoluteUri.TrimEnd('/'))/api/v1/auth/login" -Method Post `
    -ContentType 'application/json' -Body $loginBody -TimeoutSec 15
$headers = @{ Authorization = "Bearer $($login.token)" }
$projectsResponse = Invoke-RestMethod -Uri "$($apiUri.AbsoluteUri.TrimEnd('/'))/api/v1/projects" -Headers $headers -TimeoutSec 15

foreach ($fixture in $fixtures) {
    $filePath = Join-Path $fixtureDirectory $fixture.File
    if (-not (Test-Path -LiteralPath $filePath)) { throw "Fixture ausente: $($fixture.File)" }

    $project = @($projectsResponse.items | Where-Object { $_.nome -eq $fixture.Project })
    if ($project.Count -ne 1) { throw "O projeto local esperado não existe ou está duplicado: $($fixture.Project)" }

    $documentsUrl = "$($apiUri.AbsoluteUri.TrimEnd('/'))/api/v1/projects/$($project[0].id)/documents?limit=50"
    $documents = Invoke-RestMethod -Uri $documentsUrl -Headers $headers -TimeoutSec 15
    $matches = @($documents.items | Where-Object { $_.nome -eq $fixture.File })
    if ($matches.Count -gt 1) { throw "Há documentos duplicados de QA no projeto $($fixture.Project): $($fixture.File)" }

    if ($matches.Count -eq 0) {
        $form = @{ file = Get-Item -LiteralPath $filePath }
        $document = Invoke-RestMethod -Uri $documentsUrl.Split('?')[0] -Method Post -Headers $headers `
            -Form $form -TimeoutSec 30
        Write-Host "Enviado para ingestão: $($fixture.Project) / $($fixture.File)"
    } else {
        $document = $matches[0]
        $expectedSize = (Get-Item -LiteralPath $filePath).Length
        if ($document.tamanho_bytes -ne $expectedSize) {
            throw "A fixture $($fixture.File) já existe com conteúdo de outra versão. Remova ou versione esse documento antes de atualizar o acervo."
        }
        if ($document.status_processamento -eq 'falha') {
            Invoke-RestMethod -Uri "$($documentsUrl.Split('?')[0])/$($document.id)/retry" -Method Post `
                -Headers $headers -TimeoutSec 15 | Out-Null
            Write-Host "Reenfileirado para ingestão: $($fixture.Project) / $($fixture.File)"
        }
    }

    $deadline = (Get-Date).AddSeconds($ProcessingTimeoutSeconds)
    do {
        $current = Invoke-RestMethod -Uri $documentsUrl -Headers $headers -TimeoutSec 15
        $processed = @($current.items | Where-Object { $_.id -eq $document.id }) | Select-Object -First 1
        if (-not $processed) { throw "O documento deixou de aparecer no projeto $($fixture.Project)." }
        if ($processed.status_processamento -eq 'processado') {
            Write-Host "Acervo pronto: $($fixture.Project) / $($fixture.File)"
            break
        }
        if ($processed.status_processamento -eq 'falha') {
            throw "A ingestão falhou para $($fixture.Project) / $($fixture.File). Consulte o diagnóstico de documentos no backend."
        }
        if ((Get-Date) -ge $deadline) { throw "Tempo esgotado aguardando a ingestão de $($fixture.File). Execute este script novamente para retomar." }
        Start-Sleep -Seconds 5
    } while ($true)
}

Write-Host 'Acervos locais de QA disponíveis nos três projetos.'
