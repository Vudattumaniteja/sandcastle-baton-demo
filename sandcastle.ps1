<#
.SYNOPSIS
    Sandcastle Sequential Issue Baton Runner for Antigravity CLI (agy)
.DESCRIPTION
    Runs an autonomous, sequential GitHub issue baton loop using Antigravity CLI.
    Each issue executes in a fresh, isolated agy session to prevent context bloat.
.EXAMPLE
    .\sandcastle.ps1 -Repo "owner/repo" -StartIssue 1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [int]$StartIssue = 1,

    [Parameter(Mandatory = $false)]
    [int]$MaxIssues = 20,

    [Parameter(Mandatory = $false)]
    [string]$Timeout = "30m",

    [Parameter(Mandatory = $false)]
    [string]$Model
)

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "   Sandcastle Baton Orchestrator for Antigravity" -ForegroundColor Cyan
Write-Host "===============================================`n" -ForegroundColor Cyan

# 1. Verify GitHub CLI is installed and authenticated
try {
    $ghVersion = gh --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "GitHub CLI (gh) is not installed or not in PATH."
        exit 1
    }
    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "GitHub CLI is not authenticated. Run 'gh auth login' first."
        exit 1
    }
} catch {
    Write-Error "Failed to verify gh CLI: $_"
    exit 1
}

# 2. Detect Repository if not provided
if ([string]::IsNullOrWhiteSpace($Repo)) {
    try {
        $detectedRepo = gh repo view --json nameWithOwner -q ".nameWithOwner" 2>$null
        if ($detectedRepo) {
            $Repo = $detectedRepo
            Write-Host "[+] Auto-detected Repository: $Repo" -ForegroundColor Green
        }
    } catch {}
}

while ([string]::IsNullOrWhiteSpace($Repo)) {
    $Repo = Read-Host "Enter GitHub repository (owner/repo or full URL)"
}

Write-Host "[+] Target Repository: $Repo" -ForegroundColor Green
Write-Host "[+] Starting from Issue: #$StartIssue`n" -ForegroundColor Green

$currentIssue = $StartIssue
$issuesProcessed = 0

while ($issuesProcessed -lt $MaxIssues) {
    Write-Host "--------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[Baton] Inspecting Issue #$currentIssue on $Repo..." -ForegroundColor Yellow

    # Query issue status via gh
    $issueJsonRaw = gh issue view $currentIssue --repo $Repo --json number,title,state,labels 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $issueJsonRaw) {
        Write-Host "[-] Issue #$currentIssue not found or inaccessible. Scanning for next open issue..." -ForegroundColor Gray
        $currentIssue++
        continue
    }

    $issueObj = $issueJsonRaw | ConvertFrom-Json
    $title = $issueObj.title
    $state = $issueObj.state
    $labelNames = ($issueObj.labels | ForEach-Object { $_.name.ToLower() })

    if ($state -eq "CLOSED") {
        Write-Host "[i] Issue #$currentIssue is already CLOSED ($title). Skipping to next..." -ForegroundColor Gray
        $currentIssue++
        continue
    }

    Write-Host "[+] Found Open Issue #$currentIssue - '$title'" -ForegroundColor Cyan

    # Check Gating Labels
    $hasReady = $labelNames -contains "ready-for-agent"
    $hasAfk = ($labelNames -contains "afk") -or ($labelNames -contains "afk")
    $isBlocked = $labelNames -contains "status blocked"

    if ($isBlocked) {
        Write-Host "[!] Issue #$currentIssue is marked 'status blocked'. Halting baton." -ForegroundColor Red
        break
    }

    if (-not $hasReady -or -not $hasAfk) {
        Write-Host "[!] Issue #$currentIssue does not satisfy gates (missing 'ready-for-agent' or 'AFK')." -ForegroundColor DarkYellow
        Write-Host "    Labels present: $(($issueObj.labels | ForEach-Object {$_.name}) -join ', ')" -ForegroundColor DarkYellow
        Write-Host "[!] Halting baton until issue labels are prepared." -ForegroundColor Red
        break
    }

    Write-Host "[+] Gate checks passed ('ready-for-agent' and 'AFK' present)." -ForegroundColor Green
    Write-Host "[+] Launching fresh Antigravity CLI session for Issue #$currentIssue..." -ForegroundColor Magenta

    # Construct agy prompt
    $prompt = "Use sandcastle skill. Repository: $Repo Issue: #$currentIssue. Follow the Sandcastle worker contract: read issue, implement minimal clean solution, verify with tests, commit, push branch, open PR, merge PR, and close issue #$currentIssue."

    $agyArgs = @(
        "--dangerously-skip-permissions",
        "--print-timeout", $Timeout,
        "--prompt", $prompt
    )

    if (-not [string]::IsNullOrWhiteSpace($Model)) {
        $agyArgs += @("--model", $Model)
    }

    # Execute agy CLI session
    $startTime = Get-Date
    & agy @agyArgs
    $agyExitCode = $LASTEXITCODE
    $duration = (Get-Date) - $startTime

    Write-Host "`n[+] Session for Issue #$currentIssue finished in $($duration.TotalMinutes.ToString('F1')) min (Exit Code: $agyExitCode)." -ForegroundColor Cyan

    # Re-check Issue Status
    $postCheckRaw = gh issue view $currentIssue --repo $Repo --json state,labels 2>$null
    if ($postCheckRaw) {
        $postCheck = $postCheckRaw | ConvertFrom-Json
        $postLabels = ($postCheck.labels | ForEach-Object { $_.name.ToLower() })

        if ($postCheck.state -eq "CLOSED") {
            Write-Host "[SUCCESS] Issue #$currentIssue was CLOSED and verified!" -ForegroundColor Green
            $issuesProcessed++
            $currentIssue++
            Write-Host "[Baton] Advancing baton to next issue...`n" -ForegroundColor Green
            Start-Sleep -Seconds 3
        } elseif ($postLabels -contains "status blocked") {
            Write-Host "[!] Issue #$currentIssue reported BLOCKED. Halting baton loop." -ForegroundColor Red
            break
        } else {
            Write-Host "[!] Issue #$currentIssue is still OPEN and not closed. Halting baton for review." -ForegroundColor Yellow
            break
        }
    } else {
        Write-Host "[!] Could not fetch issue post-status. Halting baton." -ForegroundColor Red
        break
    }
}

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "   Sandcastle Baton Loop Complete" -ForegroundColor Cyan
Write-Host "   Total issues closed in this run: $issuesProcessed" -ForegroundColor Cyan
Write-Host "===============================================`n" -ForegroundColor Cyan
