param(
  [Parameter(Mandatory=$true)][string]$WorkerDirectory,
  [Parameter(Mandatory=$true)][string]$StateDirectory,
  [Parameter(Mandatory=$true)][string]$ProgressHtml,
  [Parameter(Mandatory=$true)][string]$ModelFile,
  [Parameter(Mandatory=$true)][string]$ServerBinary,
  [Parameter(Mandatory=$true)][string]$ModelSha256
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $WorkerDirectory
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source
$arguments = @((Join-Path $WorkerDirectory 'scripts/run-semantic-translation-batch.mjs'), '--publish',
  '--state-dir', $StateDirectory, '--progress-html', $ProgressHtml, '--model-file', $ModelFile,
  '--server-binary', $ServerBinary, '--model-sha256', $ModelSha256)
& $node @arguments >> (Join-Path $StateDirectory 'worker.stdout.log') 2>> (Join-Path $StateDirectory 'worker.stderr.log')
exit $LASTEXITCODE
