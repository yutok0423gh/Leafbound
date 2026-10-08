param(
  [Parameter(Mandatory=$true)][string]$WorkerDirectory,
  [Parameter(Mandatory=$true)][string]$StateDirectory,
  [Parameter(Mandatory=$true)][string]$ProgressHtml,
  [Parameter(Mandatory=$true)][string]$ModelFile,
  [Parameter(Mandatory=$true)][string]$ServerBinary,
  [Parameter(Mandatory=$true)][string]$ModelSha256,
  [string]$TaskName = 'Leafbound-Classical-Semantic'
)
$ErrorActionPreference = 'Stop'
$worker = (Resolve-Path -LiteralPath $WorkerDirectory).Path
$runner = Join-Path $worker 'scripts/run-semantic-translation-batch.mjs'
$powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$launcher = Join-Path $worker 'scripts/start-semantic-task.ps1'
Get-Command node -ErrorAction Stop | Out-Null
foreach ($requiredFile in @($runner, $ModelFile, $ServerBinary)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) { throw "Missing file: $requiredFile" }
}
$branch = & git -C $worker branch --show-current
$remote = & git -C $worker remote get-url origin
if ($branch -ne 'codex/semantic-alignment-all' -or $remote -ne 'https://github.com/yutok0423gh/Leafbound.git') {
  throw 'The task must use the dedicated Leafbound semantic worktree.'
}
$arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File',
  $launcher, '-WorkerDirectory', $worker, '-StateDirectory', [IO.Path]::GetFullPath($StateDirectory),
  '-ProgressHtml', [IO.Path]::GetFullPath($ProgressHtml), '-ModelFile', (Resolve-Path -LiteralPath $ModelFile).Path,
  '-ServerBinary', (Resolve-Path -LiteralPath $ServerBinary).Path, '-ModelSha256', $ModelSha256)
if ($arguments | Where-Object { $_ -match '["\r\n]' }) { throw 'Unsupported quotation or newline in task argument.' }
$argumentText = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Execute -ne $powershell -or $existing.Actions.Arguments -ne $argumentText)) {
  throw 'A different task already uses this name; it was not replaced.'
}
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershell -Argument $argumentText -WorkingDirectory $worker
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $user),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)))
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings `
  -Description 'Resume local classical translation checks and publish validated semantic groups.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
