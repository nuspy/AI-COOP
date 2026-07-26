<#
.SYNOPSIS
    Installa gli skill AI-COOP in ~/.claude/skills per l'uso locale immediato.

.DESCRIPTION
    Alternativa all'installazione via marketplace. Copia (o collega) gli skill dal
    repo alla directory skill personale di Claude Code, dove vengono scoperti
    automaticamente senza bisogno di /reload-plugins.

    Usare -Link per creare junction invece di copie: le modifiche al repo diventano
    immediatamente attive, utile mentre si sviluppano i protocolli.

.EXAMPLE
    .\install-local.ps1
    Copia gli skill.

.EXAMPLE
    .\install-local.ps1 -Link
    Crea junction verso il repo (richiede permessi di creazione link).
#>
[CmdletBinding()]
param(
    [switch]$Link,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoSkills = Join-Path $PSScriptRoot '..\plugins\ai-coop\skills' | Resolve-Path
$targetRoot = Join-Path $env:USERPROFILE '.claude\skills'

if (-not (Test-Path $targetRoot)) {
    New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
}

foreach ($skill in Get-ChildItem -Path $repoSkills -Directory) {
    $target = Join-Path $targetRoot $skill.Name

    if (Test-Path $target) {
        if (-not $Force) {
            Write-Warning "$($skill.Name): esiste gia in $targetRoot. Usa -Force per sovrascrivere."
            continue
        }
        Remove-Item -Path $target -Recurse -Force -Confirm:$false
    }

    if ($Link) {
        New-Item -ItemType Junction -Path $target -Target $skill.FullName | Out-Null
        Write-Host "$($skill.Name): collegato -> $($skill.FullName)"
    }
    else {
        Copy-Item -Path $skill.FullName -Destination $target -Recurse
        Write-Host "$($skill.Name): copiato in $target"
    }
}

Write-Host ''
Write-Host 'Fatto. Gli skill sono scoperti automaticamente: nessun reload necessario.'
Write-Host 'Verifica i prerequisiti con:  codex --version'
