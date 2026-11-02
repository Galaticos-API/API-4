
param(
    [string]$ApiBaseUrl = 'http://localhost:3001',
    [ValidateRange(1, 3600)]
    [int]$ProcessingTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

# ============================================================
# CONFIGURAÇÕES E FUNÇÕES AUXILIARES
# ============================================================

function Get-DemoAdminPassword {
    if (-not [string]::IsNullOrWhiteSpace($env:SINAPSE_DEMO_ADMIN_PASSWORD)) {
        return $env:SINAPSE_DEMO_ADMIN_PASSWORD
    }

    $dotenvPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'

    if (Test-Path -LiteralPath $dotenvPath) {
        $line = Get-Content -LiteralPath $dotenvPath |
            Where-Object { $_ -match '^\s*SINAPSE_DEMO_ADMIN_PASSWORD=' } |
            Select-Object -First 1

        if ($line) {
            return (
                $line -replace '^\s*SINAPSE_DEMO_ADMIN_PASSWORD=', ''
            ).Trim().Trim('"').Trim("'")
        }
    }

    return 'Admin@123'
}

function Get-NormalizedText {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ''
    }

    $normalized = $Text.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = [System.Text.StringBuilder]::new()

    foreach ($ch in $normalized.ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }

    return $sb.ToString().Normalize([System.Text.NormalizationForm]::FormC).Trim().ToLowerInvariant()
}

function Invoke-ApiRequest {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,

        [Parameter(Mandatory)]
        [hashtable]$Headers,

        [ValidateSet('Get', 'Post')]
        [string]$Method = 'Get',

        [string]$Body,

        [int]$TimeoutSec = 15
    )

    $params = @{
        Uri         = $Uri
        Method      = $Method
        Headers     = $Headers
        TimeoutSec  = $TimeoutSec
        ErrorAction = 'Stop'
    }

    if ($Body) {
        $params.ContentType = 'application/json; charset=utf-8'
        $params.Body = $Body
    }

    return Invoke-RestMethod @params
}

function Send-Document {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string]$DocumentsUrl,

        [Parameter(Mandatory)]
        [string]$Token
    )

    Add-Type -AssemblyName System.Net.Http

    $httpClient = $null
    $request = $null
    $response = $null
    $multipart = $null
    $fileStream = $null
    $fileContent = $null

    try {
        $httpClient = [System.Net.Http.HttpClient]::new()
        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Post,
            $DocumentsUrl
        )

        $request.Headers.Authorization =
            [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
                'Bearer',
                $Token
            )

        $multipart = [System.Net.Http.MultipartFormDataContent]::new()

        $fileStream = [System.IO.File]::OpenRead($FilePath)

        $fileContent = [System.Net.Http.StreamContent]::new(
            $fileStream
        )

        $fileContent.Headers.ContentType =
            [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse(
                'application/octet-stream'
            )

        $multipart.Add(
            $fileContent,
            'file',
            [System.IO.Path]::GetFileName($FilePath)
        )

        $request.Content = $multipart

        $response = $httpClient.SendAsync(
            $request
        ).GetAwaiter().GetResult()

        $responseBody = $response.Content.ReadAsStringAsync().
            GetAwaiter().GetResult()

        if (-not $response.IsSuccessStatusCode) {
            throw "Falha no upload. HTTP $([int]$response.StatusCode): $responseBody"
        }

        $document = $responseBody | ConvertFrom-Json

        if (-not $document.id) {
            throw "A API recebeu o upload, mas não retornou o ID do documento. Resposta: $responseBody"
        }

        return $document
    }
    finally {
        if ($response) {
            $response.Dispose()
        }

        if ($request) {
            $request.Dispose()
        }

        if ($multipart) {
            $multipart.Dispose()
        }

        if ($fileContent) {
            $fileContent.Dispose()
        }

        if ($fileStream) {
            $fileStream.Dispose()
        }

        if ($httpClient) {
            $httpClient.Dispose()
        }
    }
}

# ============================================================
# VALIDAÇÃO DA API
# ============================================================

try {
    $apiUri = [Uri]$ApiBaseUrl
}
catch {
    throw "URL da API inválida: $ApiBaseUrl"
}

if (
    $apiUri.Scheme -ne 'http' -or
    $apiUri.Host -notin @('localhost', '127.0.0.1', '::1')
) {
    throw 'A carga de acervos de QA só pode autenticar em uma API local (localhost).'
}

$apiBase = $apiUri.AbsoluteUri.TrimEnd('/')

# ============================================================
# DIRETÓRIOS E FIXTURES
# ============================================================

$root = Split-Path $PSScriptRoot -Parent

$fixtureDirectory = Join-Path $root 'docs/qa/acervo-demo'

if (-not (Test-Path -LiteralPath $fixtureDirectory -PathType Container)) {
    throw "Diretório de fixtures não encontrado: $fixtureDirectory"
}

$fixtures = @(
    @{
        Project   = 'Plataforma Sinapse'
        ProjectId = '40000000-0000-4000-8000-000000000001'
        File      = 'plataforma-sinapse-qa.md'
    },
    @{
        Project   = 'Portal de Pagamentos PIX'
        ProjectId = '40000000-0000-4000-8000-000000000002'
        File      = 'portal-pagamentos-pix-qa.md'
    },
    @{
        Project   = 'Sistema de Autenticação Unificada'
        ProjectId = '40000000-0000-4000-8000-000000000003'
        File      = 'autenticacao-unificada-qa.md'
    }
)

# Validar todos os arquivos antes de iniciar a operação.

foreach ($fixture in $fixtures) {
    $filePath = Join-Path $fixtureDirectory $fixture.File

    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        throw "Fixture ausente: $($fixture.File)"
    }

    if ((Get-Item -LiteralPath $filePath).Length -eq 0) {
        throw "Fixture vazia: $($fixture.File)"
    }
}

# ============================================================
# AUTENTICAÇÃO
# ============================================================

$password = Get-DemoAdminPassword

$loginBody = @{
    email    = 'admin@sinapse.local'
    password = $password
} | ConvertTo-Json -Compress

$login = Invoke-ApiRequest `
    -Uri "$apiBase/api/v1/auth/login" `
    -Headers @{} `
    -Method Post `
    -Body $loginBody

if ([string]::IsNullOrWhiteSpace($login.token)) {
    throw 'A autenticação não retornou um token válido.'
}

$token = [string]$login.token

$headers = @{
    Authorization = "Bearer $token"
}

Write-Host 'Autenticação realizada com sucesso.' -ForegroundColor Green

# ============================================================
# CONSULTAR PROJETOS
# ============================================================

$projectsResponse = Invoke-ApiRequest `
    -Uri "$apiBase/api/v1/projects" `
    -Headers $headers

if ($null -eq $projectsResponse.items) {
    throw 'A API não retornou a lista de projetos esperada.'
}

# ============================================================
# PROCESSAMENTO DOS ACERVOS
# ============================================================

foreach ($fixture in $fixtures) {

    Write-Host ''
    Write-Host "Projeto: $($fixture.Project)" -ForegroundColor Cyan

    $filePath = Join-Path $fixtureDirectory $fixture.File

    # --------------------------------------------------------
    # Localizar projeto
    # --------------------------------------------------------

    $targetName = [string]$fixture.Project
    $targetId = [string]$fixture.ProjectId
    $targetNormalized = Get-NormalizedText $targetName

    $project = @(
        $projectsResponse.items |
            Where-Object {
                ($_.nome -eq $targetName) -or
                (-not [string]::IsNullOrWhiteSpace($targetId) -and $_.id -eq $targetId) -or
                ((Get-NormalizedText $_.nome) -eq $targetNormalized)
            }
    )

    if ($project.Count -eq 0) {
        $available = ($projectsResponse.items | ForEach-Object { "$($_.nome) ($($_.id))" }) -join ', '
        throw "O projeto local esperado não existe: $($fixture.Project). Projetos disponíveis na API: [$available]"
    }
    elseif ($project.Count -gt 1) {
        throw "O projeto local esperado está duplicado: $($fixture.Project)"
    }

    if ([string]::IsNullOrWhiteSpace([string]$project[0].id)) {
        throw "O projeto não possui ID válido: $($fixture.Project)"
    }

    $projectId = [Uri]::EscapeDataString(
        [string]$project[0].id
    )

    $documentsBaseUrl = "$apiBase/api/v1/projects/$projectId/documents"

    $documentsUrl = "$documentsBaseUrl`?limit=50"

    # --------------------------------------------------------
    # Consultar documentos existentes
    # --------------------------------------------------------

    $documents = Invoke-ApiRequest `
        -Uri $documentsUrl `
        -Headers $headers

    if ($null -eq $documents.items) {
        throw "A API não retornou a lista de documentos do projeto $($fixture.Project)."
    }

    $matches = @(
        $documents.items |
            Where-Object {
                $_.nome -eq $fixture.File
            }
    )

    if ($matches.Count -gt 1) {
        throw "Há documentos duplicados de QA no projeto $($fixture.Project): $($fixture.File)"
    }

    # --------------------------------------------------------
    # Upload ou reutilização do documento
    # --------------------------------------------------------

    if ($matches.Count -eq 0) {

        Write-Host "Enviando: $($fixture.File)" -ForegroundColor Yellow

        $document = Send-Document `
            -FilePath $filePath `
            -DocumentsUrl $documentsBaseUrl `
            -Token $token

        Write-Host "Enviado para ingestão: $($fixture.Project) / $($fixture.File)" `
            -ForegroundColor Green
    }
    else {

        $document = $matches[0]

        $expectedSize = (Get-Item -LiteralPath $filePath).Length

        if ([long]$document.tamanho_bytes -ne [long]$expectedSize) {
            throw "A fixture $($fixture.File) já existe com conteúdo de outra versão. Remova ou versione esse documento antes de atualizar o acervo."
        }

        if ($document.status_processamento -eq 'falha') {

            Write-Host "Reenfileirando documento com falha: $($fixture.File)" `
                -ForegroundColor Yellow

            $retryUrl = "$documentsBaseUrl/$($document.id)/retry"

            Invoke-ApiRequest `
                -Uri $retryUrl `
                -Headers $headers `
                -Method Post | Out-Null

            Write-Host "Reenfileirado para ingestão: $($fixture.Project) / $($fixture.File)" `
                -ForegroundColor Green
        }
        elseif ($document.status_processamento -eq 'processado') {

            Write-Host "Documento já processado: $($fixture.File)" `
                -ForegroundColor Green
        }
    }

    # --------------------------------------------------------
    # Validar ID do documento
    # --------------------------------------------------------

    if ([string]::IsNullOrWhiteSpace([string]$document.id)) {
        throw "A API não retornou um ID válido para o documento $($fixture.File)."
    }

    # --------------------------------------------------------
    # Aguardar ingestão
    # --------------------------------------------------------

    $deadline = (Get-Date).AddSeconds(
        $ProcessingTimeoutSeconds
    )

    Write-Host "Aguardando processamento: $($fixture.File)" `
        -ForegroundColor Cyan

    do {

        $current = Invoke-ApiRequest `
            -Uri $documentsUrl `
            -Headers $headers

        $processed = @(
            $current.items |
                Where-Object {
                    $_.id -eq $document.id
                }
        ) | Select-Object -First 1

        if (-not $processed) {
            throw "O documento deixou de aparecer no projeto $($fixture.Project)."
        }

        $status = [string]$processed.status_processamento

        switch ($status) {

            'processado' {

                Write-Host "Acervo pronto: $($fixture.Project) / $($fixture.File)" `
                    -ForegroundColor Green

                break
            }

            'falha' {

                throw "A ingestão falhou para $($fixture.Project) / $($fixture.File). Consulte o diagnóstico de documentos no backend."
            }

            default {

                if ((Get-Date) -ge $deadline) {
                    throw "Tempo esgotado aguardando a ingestão de $($fixture.File). Execute este script novamente para retomar."
                }

                Start-Sleep -Seconds 5
            }
        }

    } while ($status -ne 'processado')
}

# ============================================================
# FINALIZAÇÃO
# ============================================================

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host 'ACERVOS DE QA DISPONÍVEIS' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green

Write-Host 'Os três acervos foram processados com sucesso.'
