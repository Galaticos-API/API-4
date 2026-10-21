$devStateDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) '.sinapse-dev'
$devProcessFile = Join-Path $devStateDirectory 'ai-process.json'
$devPython = [IO.Path]::GetFullPath((Join-Path (Split-Path $PSScriptRoot -Parent) 'ai-service/.venv/Scripts/python.exe'))

function Save-DevAIProcess {
    param([System.Diagnostics.Process]$Process)
    @{
        processId = $Process.Id
        startedTicks = $Process.StartTime.ToUniversalTime().Ticks.ToString()
    } | ConvertTo-Json | Set-Content -LiteralPath $devProcessFile -Encoding UTF8
}

function Get-DevAIProcess {
    if (-not (Test-Path -LiteralPath $devProcessFile)) { return $null }
    $record = Get-Content -LiteralPath $devProcessFile -Raw | ConvertFrom-Json
    $ownedProcess = Get-Process -Id $record.processId -ErrorAction SilentlyContinue
    if (-not $ownedProcess) {
        Remove-Item -LiteralPath $devProcessFile
        return $null
    }
    if ($ownedProcess.Path -ne $devPython -or $ownedProcess.StartTime.ToUniversalTime().Ticks.ToString() -ne $record.startedTicks) {
        throw 'O processo registrado nao pertence mais a esta execucao da IA. Nenhum processo foi encerrado.'
    }
    return $ownedProcess
}

function Stop-DevAIProcess {
    $ownedProcess = Get-DevAIProcess
    if ($ownedProcess) {
        Stop-Process -InputObject $ownedProcess -ErrorAction Stop
        $ownedProcess.WaitForExit()
        Remove-Item -LiteralPath $devProcessFile
    }
}
