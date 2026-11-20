# Reconocimiento de voz offline con el motor de Windows (System.Speech).
# -Once: escucha una frase y termina. Sin -Once: escucha continuo (palabra clave).
# Imprime líneas "TEXT:<frase>|<confianza>" o "STATE:<estado>" en UTF-8.
param([switch]$Once, [int]$Timeout = 8)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

$rec = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'es' } | Select-Object -First 1
if (-not $rec) { Write-Output 'ERROR:No hay reconocedor de voz en español instalado en Windows'; exit 2 }

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($rec)
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
try { $engine.SetInputToDefaultAudioDevice() } catch { Write-Output 'ERROR:No encuentro un micrófono'; exit 3 }
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds($Timeout)
$engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.8)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds($Timeout)

Write-Output 'STATE:listening'
if ($Once) {
  $r = $engine.Recognize([TimeSpan]::FromSeconds($Timeout + 2))
  if ($r) { Write-Output ("TEXT:" + $r.Text + "|" + [math]::Round($r.Confidence, 2)) } else { Write-Output 'TEXT:|0' }
  $engine.Dispose()
  exit 0
}

# Modo continuo
$engine.InitialSilenceTimeout = [TimeSpan]::Zero
$engine.BabbleTimeout = [TimeSpan]::Zero
while ($true) {
  $r = $engine.Recognize()
  if ($r -and $r.Text) { Write-Output ("TEXT:" + $r.Text + "|" + [math]::Round($r.Confidence, 2)) }
}
