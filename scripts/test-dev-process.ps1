$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/dev-process.ps1"
$testDirectory = Join-Path $devStateDirectory ('test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
$devProcessFile = Join-Path $testDirectory 'ai-process.json'
$devPython = (Get-Process -Id $PID).Path
$owned = $null
$unrelated = $null
try {
    foreach ($file in @('start-dev.ps1', 'stop-dev.ps1', 'scripts/dev-process.ps1')) {
        $parseErrors = $null
        $tokens = $null
        [Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) $file), [ref]$tokens, [ref]$parseErrors) | Out-Null
        if ($parseErrors.Count) { throw "Sintaxe invalida em $file" }
    }
    $startSource = Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'start-dev.ps1') -Raw
    $ast = [Management.Automation.Language.Parser]::ParseInput($startSource, [ref]$null, [ref]$null)
    $checked = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Checked' }, $true)
    Invoke-Expression $checked.Extent.Text
    $rejected = $false
    try { Invoke-Checked $devPython @('-NoProfile', '-NonInteractive', '-Command', 'exit 7') } catch { $rejected = $true }
    if (-not $rejected) { throw 'Falha externa ignorada.' }

    $wait = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Wait-Service' }, $true)
    Invoke-Expression $wait.Extent.Text
    function Start-Sleep { param($Seconds) }
    function Invoke-WebRequest { throw 'Servico indisponivel no teste' }
    $rejected = $false
    try { Wait-Service 'http://test.invalid/health' } catch { $rejected = $true }
    if (-not $rejected) { throw 'Servico indisponivel tratado como iniciado.' }
    function Invoke-WebRequest { return @{ StatusCode = 200 } }
    Wait-Service 'http://test.invalid/health'

    $owned = Start-Process $devPython -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 300') -WindowStyle Hidden -PassThru
    $unrelated = Start-Process $devPython -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 300') -WindowStyle Hidden -PassThru
    Save-DevAIProcess $owned
    $record = Get-Content -LiteralPath $devProcessFile -Raw | ConvertFrom-Json
    $record.startedTicks = '0'
    $record | ConvertTo-Json | Set-Content -LiteralPath $devProcessFile
    $rejected = $false
    try { Stop-DevAIProcess } catch { $rejected = $true }
    if (-not $rejected -or $owned.HasExited) { throw 'Identidade de processo nao conferida.' }
    Save-DevAIProcess $owned
    $devPython = 'C:\outro-projeto\python.exe'
    $rejected = $false
    try { Stop-DevAIProcess } catch { $rejected = $true }
    if (-not $rejected -or $owned.HasExited) { throw 'Executavel de outro projeto aceito.' }
    $devPython = (Get-Process -Id $PID).Path
    Stop-DevAIProcess
    $unrelated.Refresh()
    if ($unrelated.HasExited) { throw 'Processo de outro projeto encerrado.' }
    if (Test-Path -LiteralPath $devProcessFile) { throw 'Registro de processo nao removido.' }
    Write-Host 'Aprovado: sintaxe, falha de comando, disponibilidade HTTP, identidade por data/executavel e encerramento isolado.'
} finally {
    foreach ($child in @($owned, $unrelated)) {
        if ($child) { $child.Refresh(); if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit() } }
    }
    if (Test-Path -LiteralPath $devProcessFile) { Remove-Item -LiteralPath $devProcessFile }
    Remove-Item -LiteralPath $testDirectory
}
