param(
    [int]$DatabasePort = 55433,
    [int]$ApiPort = 8082
)

$ErrorActionPreference = 'Stop'
$jar = (Resolve-Path "$PSScriptRoot/../target/quizzcraft-api-0.1.0-SNAPSHOT.jar").Path
$scratch = Join-Path (Resolve-Path "$PSScriptRoot/../..").Path ".qc19/qc22-$([guid]::NewGuid().ToString('N'))"
$database = 'quizzcraft_qc22'
$api = "http://127.0.0.1:$ApiPort/api"
$dbArgs = @('-h', '127.0.0.1', '-p', "$DatabasePort", '-U', 'quizzcraft')
$pgOptions = "-h 127.0.0.1 -p $DatabasePort"

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)" }
}

function Get-Api {
    param([string]$Path, [int]$ExpectedStatus = 200)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$api$Path" -TimeoutSec 5
        $status = [int]$response.StatusCode
    } catch {
        if (!$_.Exception.Response) { throw }
        $status = [int]$_.Exception.Response.StatusCode
        $response = $null
    }
    if ($status -ne $ExpectedStatus) { throw "GET $Path returned $status, expected $ExpectedStatus" }
    Write-Host "GET $Path -> $status $($response.Content)"
    if ($response) { ConvertFrom-Json -InputObject $response.Content }
}

function Assert-Catalog {
    param([string]$Query = '', [string[]]$Titles)
    $body = Get-Api "/quizzes$Query"
    if (($body.PSObject.Properties.Name -join ',') -ne 'items' -or $body.items -isnot [array]) {
        throw "Expected an items array for '$Query'"
    }
    if (($body.items.title -join '|') -cne ($Titles -join '|')) {
        throw "Unexpected titles for '$Query': $($body.items.title -join ', ')"
    }
    $body.items
}

function Set-TestData {
    param([string]$Sql)
    Invoke-Checked psql ($dbArgs + @('-X', '-d', $database, '-v', 'ON_ERROR_STOP=1', '-c', $Sql))
}

$listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
if ($DatabasePort -eq $ApiPort -or $listeners.Port -contains $DatabasePort -or $listeners.Port -contains $ApiPort) {
    throw 'Choose two unused ports for the isolated database and API.'
}
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
Write-Host "Fresh PostgreSQL database: $database (port $DatabasePort). Logs: $scratch"
$pgData = Join-Path $scratch 'pgdata'
$backend = $null
$pgStarted = $false
try {
    Invoke-Checked initdb @('-D', $pgData, '-U', 'quizzcraft', '-A', 'trust', '-E', 'UTF8')
    $pgStarted = $true
    Invoke-Checked pg_ctl @('-D', $pgData, '-l', "$scratch/postgresql.log", '-o', $pgOptions, '-w', 'start')
    Invoke-Checked createdb ($dbArgs + @($database))
    $backend = Start-Process -FilePath (Get-Command java.exe).Source -ArgumentList @(
        '-jar', ('"' + $jar + '"'), "--server.port=$ApiPort",
        "--spring.datasource.url=jdbc:postgresql://127.0.0.1:${DatabasePort}/$database",
        '--spring.datasource.username=quizzcraft', '--spring.datasource.password='
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput "$scratch/spring.log" -RedirectStandardError "$scratch/spring.err"

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($backend.HasExited) { throw "Spring Boot exited. See $scratch/spring.log and spring.err." }
        try {
            $null = Invoke-WebRequest -UseBasicParsing -Uri "$api/categories" -TimeoutSec 1
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (!$ready) { throw "Spring Boot did not become ready. See $scratch/spring.log." }

    $planets = 'Planets Warm-Up'
    $rivers = 'Rivers and Mountains'
    $fractions = 'Fractions Challenge'
    $null = Assert-Catalog -Titles @($planets, $rivers, $fractions)
    $match = Assert-Catalog '?categoryId=2&difficulty=EASY&format=TRUE_FALSE' @($planets)
    $null = Assert-Catalog '?categoryId=2&difficulty=HARD' @()
    $null = Assert-Catalog '?format=MULTIPLE_CHOICE' @($planets, $fractions)
    $null = Assert-Catalog '?format=TRUE_FALSE' @($planets, $rivers)
    Get-Api '/quizzes/104' 404
    Get-Api '/quizzes/9999' 404
    $detail = Get-Api '/quizzes/101'
    $fields = 'category,description,difficulty,format,questionCount,quizId,revisionId,title'
    if ((($detail.PSObject.Properties.Name | Sort-Object) -join ',') -cne $fields -or
        (ConvertTo-Json $detail -Compress) -cne (ConvertTo-Json $match -Compress) -or
        $detail.revisionId -ne 1001 -or $detail.format -ne 'MIXED' -or $detail.questionCount -ne 3) {
        throw 'Unexpected public quiz detail or leaked fields.'
    }

    Set-TestData "UPDATE categories SET status = 'RETIRED' WHERE id = 2;"
    $retired = Assert-Catalog '?categoryId=2' @($planets)
    if ($retired.category.status -ne 'RETIRED') { throw 'The retired category status was not returned.' }

    Set-TestData @'
UPDATE categories SET status = 'ACTIVE' WHERE id = 2;
INSERT INTO quiz_revisions (id, quiz_id, number, state, title, category_id, difficulty, published_at)
VALUES (1002, 101, 2, 'PUBLISHED', 'Planets Revised', 2, 'EASY', NOW());
INSERT INTO questions (revision_id, position, type, text)
VALUES (1002, 1, 'TRUE_FALSE', 'Earth is a planet.');
INSERT INTO choices (question_id, position, text, is_correct)
SELECT q.id, c.position, c.text, c.is_correct
FROM questions q CROSS JOIN (VALUES (1, 'True', TRUE), (2, 'False', FALSE)) c(position, text, is_correct)
WHERE q.revision_id = 1002;
UPDATE quizzes SET latest_published_revision_id = 1002 WHERE id = 101;
'@
    $revised = Assert-Catalog '?format=TRUE_FALSE' @('Planets Revised', $rivers)
    $null = Assert-Catalog '?format=MULTIPLE_CHOICE' @($fractions)
    $latest = Get-Api '/quizzes/101'
    if ($revised[0].revisionId -ne 1002 -or $latest.revisionId -ne 1002 -or
        $latest.format -ne 'TRUE_FALSE' -or $latest.questionCount -ne 1) {
        throw 'The API did not use the latest published revision.'
    }

    Set-TestData "UPDATE quizzes SET status = 'REMOVED' WHERE id = 101;"
    $null = Assert-Catalog -Titles @($rivers, $fractions)
    Get-Api '/quizzes/101' 404
    Write-Host 'PASS: all QC-22 API checks passed without signing in.'
} finally {
    if ($backend -and !$backend.HasExited) {
        Stop-Process -InputObject $backend
        $backend.WaitForExit()
    }
    if ($pgStarted -and (Test-Path "$pgData/postmaster.pid")) {
        Invoke-Checked pg_ctl @('-D', $pgData, '-m', 'fast', '-w', 'stop')
    }
}
