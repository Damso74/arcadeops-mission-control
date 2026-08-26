[CmdletBinding()]
param(
    [string]$InputPath,
    [string]$OutputPath,
    [ValidateRange(-10, 10)]
    [int]$Rate = 2,
    [ValidateRange(0, 5000)]
    [int]$BreakMilliseconds = 900
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    $InputPath = Join-Path $PSScriptRoot 'NARRATION_DRAFT.txt'
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot 'narration-final.wav'
}
Add-Type -AssemblyName System.Speech

function Get-WaveDurationSeconds {
    param([Parameter(Mandatory)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
        if ([string]::new($reader.ReadChars(4)) -ne 'RIFF') {
            throw 'Narration output is not a RIFF file.'
        }
        [void]$reader.ReadUInt32()
        if ([string]::new($reader.ReadChars(4)) -ne 'WAVE') {
            throw 'Narration output is not a WAVE file.'
        }

        $byteRate = $null
        $dataSize = $null
        while ($stream.Position + 8 -le $stream.Length) {
            $chunkId = [string]::new($reader.ReadChars(4))
            $chunkSize = [uint64]$reader.ReadUInt32()
            $chunkStart = $stream.Position
            if ($chunkId -eq 'fmt ' -and $chunkSize -ge 12) {
                [void]$reader.ReadUInt16()
                [void]$reader.ReadUInt16()
                [void]$reader.ReadUInt32()
                $byteRate = [uint64]$reader.ReadUInt32()
            }
            elseif ($chunkId -eq 'data') {
                $dataSize = $chunkSize
            }

            $nextChunk = $chunkStart + $chunkSize + ($chunkSize % 2)
            if ($nextChunk -gt $stream.Length) {
                throw 'Narration output contains a truncated WAVE chunk.'
            }
            $stream.Position = $nextChunk
        }

        if (-not $byteRate -or $null -eq $dataSize) {
            throw 'Narration output is missing WAVE duration metadata.'
        }
        return $dataSize / [double]$byteRate
    }
    finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

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
$durationSeconds = Get-WaveDurationSeconds -Path $file.FullName
if ($durationSeconds -lt 105 -or $durationSeconds -gt 130) {
    throw ("Narration duration {0:N1}s is outside the required 105-130s range. Adjust -Rate or -BreakMilliseconds." -f $durationSeconds)
}
Write-Output ("NARRATION_AUDIO={0}" -f $file.FullName)
Write-Output ("NARRATION_BYTES={0}" -f $file.Length)
Write-Output ("NARRATION_DURATION_SECONDS={0}" -f $durationSeconds.ToString('F3', [System.Globalization.CultureInfo]::InvariantCulture))
