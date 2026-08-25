[CmdletBinding()]
param(
    [switch]$Configure
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $workspaceRoot '.runtime\trueforge'
$secretFile = Join-Path $workspaceRoot '.env.requalification'

function Write-PresenceStatus {
    param([Parameter(Mandatory)][string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    $status = if ([string]::IsNullOrWhiteSpace($value)) { 'ABSENT' } else { 'PRESENT' }
    Write-Output "$Name=$status"
}

function Import-LocalSecretFile {
    if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) {
        return
    }

    foreach ($rawLine in Get-Content -LiteralPath $secretFile) {
        $line = $rawLine.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith('#')) {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) {
            throw "INVALID: malformed entry in .env.requalification"
        }

        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1], 'Process')
    }
}

function Require-Setting {
    param([Parameter(Mandatory)][string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name=ABSENT"
    }
    return $value
}

Import-LocalSecretFile

$baseUrl = [Environment]::GetEnvironmentVariable('TRUEFORGE_BASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    $baseUrl = 'http://127.0.0.1:8791'
}
$baseUrl = $baseUrl.TrimEnd('/')

foreach ($name in @(
    'TRUEFORGE_MODEL_API_KEY',
    'DAYTONA_API_KEY'
)) {
    Write-PresenceStatus -Name $name
}

if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
    throw 'INVALID: .runtime\trueforge is missing'
}

Push-Location $runtimeRoot
try {
    docker compose up -d | Out-Null
}
finally {
    Pop-Location
}

$health = $null
$deadline = (Get-Date).AddSeconds(45)
do {
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/healthz" -TimeoutSec 2
    }
    catch {
        Start-Sleep -Seconds 2
    }
} while ($health.status -ne 'ok' -and (Get-Date) -lt $deadline)

if ($health.status -ne 'ok') {
    throw 'TRUEFORGE_RUNTIME=INVALID'
}
Write-Output "TRUEFORGE_RUNTIME=VALID"

if ($Configure) {
    $providerType = Require-Setting -Name 'TRUEFORGE_PROVIDER_TYPE'
    $modelId = Require-Setting -Name 'TRUEFORGE_MODEL_ID'
    $modelName = Require-Setting -Name 'TRUEFORGE_MODEL_NAME'
    $modelApiKey = Require-Setting -Name 'TRUEFORGE_MODEL_API_KEY'
    $supportedTypes = @(
        'openai', 'anthropic', 'google-gemini', 'fireworks', 'zai',
        'moonshot', 'alibaba', 'together', 'custom'
    )
    if ($providerType -notin $supportedTypes) {
        throw 'TRUEFORGE_PROVIDER_TYPE=INVALID'
    }

    $manifest = [ordered]@{
        type = $providerType
        auth = @{ api_key = $modelApiKey }
        models = @(
            [ordered]@{
                model_id = $modelId
                name = $modelName
                properties = @{}
            }
        )
    }

    $providerBaseUrl = [Environment]::GetEnvironmentVariable('TRUEFORGE_PROVIDER_BASE_URL', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($providerBaseUrl)) {
        $manifest.base_url = $providerBaseUrl
    }
    if ($providerType -eq 'custom') {
        $manifest.name = Require-Setting -Name 'TRUEFORGE_PROVIDER_NAME'
        if ([string]::IsNullOrWhiteSpace($providerBaseUrl)) {
            throw 'TRUEFORGE_PROVIDER_BASE_URL=ABSENT'
        }
    }

    $providerBody = @{ manifest = $manifest } | ConvertTo-Json -Depth 8
    Invoke-RestMethod `
        -Method Put `
        -Uri "$baseUrl/api/v1/settings/model-providers" `
        -ContentType 'application/json' `
        -Body $providerBody | Out-Null
    Write-Output 'TRUEFORGE_MODEL_CONFIGURATION=VALID'

    $daytonaApiKey = [Environment]::GetEnvironmentVariable('DAYTONA_API_KEY', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($daytonaApiKey)) {
        & python (Join-Path $PSScriptRoot 'configure_daytona.py') --base-url "$baseUrl/api/v1"
        if ($LASTEXITCODE -ne 0) {
            throw 'DAYTONA_CONFIGURATION=INVALID'
        }
        Write-Output 'DAYTONA_CONFIGURATION=READY'
    }
}

$providers = Invoke-RestMethod -Uri "$baseUrl/api/v1/settings/model-providers" -TimeoutSec 5
$models = Invoke-RestMethod -Uri "$baseUrl/api/v1/models" -TimeoutSec 5
$capabilities = Invoke-RestMethod -Uri "$baseUrl/api/v1/capabilities" -TimeoutSec 5

Write-Output "TRUEFORGE_CONFIGURED_PROVIDERS=$($providers.data.Count)"
Write-Output "TRUEFORGE_AVAILABLE_MODELS=$($models.data.Count)"
$sandboxStatus = if ($capabilities.data.sandbox.enabled) { 'VALID' } else { 'ABSENT' }
Write-Output "TRUEFORGE_SANDBOX=$sandboxStatus"
