[CmdletBinding()]
param(
    [string]$InputPath,
    [string]$OutputPath,
    [ValidateRange(-10, 10)]
    [int]$Rate = 1,
    [ValidateRange(0, 5000)]
    [int]$BreakMilliseconds = 1200
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    $InputPath = Join-Path $PSScriptRoot 'NARRATION_DRAFT.txt'
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot 'narration-final.wav'
}
Add-Type -AssemblyName System.Speech

$paragraphs = (Get-Content -Raw -LiteralPath $InputPath) -split "(?:\r?\n){2,}" |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_.Length -gt 0 }

if ($paragraphs.Count -lt 8) {
    throw 'Narration must contain at least eight timed sections.'
}

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $synth.SelectVoice('Microsoft Zira Desktop')
    $synth.Rate = $Rate
    $synth.Volume = 100
    $prompt = [System.Speech.Synthesis.PromptBuilder]::new([System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
    for ($index = 0; $index -lt $paragraphs.Count; $index++) {
        $prompt.AppendText($paragraphs[$index])
        if ($index -lt $paragraphs.Count - 1) {
            $prompt.AppendBreak([TimeSpan]::FromMilliseconds($BreakMilliseconds))
        }
    }
    $synth.SetOutputToWaveFile($OutputPath)
    $synth.Speak($prompt)
}
finally {
    $synth.Dispose()
}

$file = Get-Item -LiteralPath $OutputPath
Write-Output ("NARRATION_AUDIO={0}" -f $file.FullName)
Write-Output ("NARRATION_BYTES={0}" -f $file.Length)
