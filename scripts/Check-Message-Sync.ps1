# Script kiểm tra đồng bộ tin nhắn nick Thiệp Cưới giữa local và VPS
# Chạy: .\scripts\Check-Message-Sync.ps1

Write-Host "=== KIỂM TRA ĐỒNG BỘ TIN NHẮN THIỆP CƯỚI ===" -ForegroundColor Cyan
Write-Host ""

# Thông tin kết nối
$LOCAL_DB = "postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm"
$VPS_DB = "postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@103.172.78.245:5432/zalocrm"

# Tìm psql
$PSQL = $null
$possiblePaths = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $PSQL = $path
        Write-Host "Tìm thấy psql: $PSQL" -ForegroundColor Gray
        break
    }
}

if (-not $PSQL) {
    Write-Host "✗ Không tìm thấy psql.exe. Vui lòng cài PostgreSQL client." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Query tìm account Thiệp Cưới
$FIND_ACCOUNT = @"
SELECT id, "zaloName", "zaloUid", status, "connectedAt"
FROM "ZaloAccount"
WHERE "zaloName" ILIKE '%thiệp cưới%' OR "zaloName" ILIKE '%thiep cuoi%'
ORDER BY "connectedAt" DESC NULLS LAST;
"@

Write-Host "1. TÌM ACCOUNT THIỆP CƯỚI TRÊN LOCAL..." -ForegroundColor Yellow
$localAccount = & $PSQL $LOCAL_DB -t -A -F'|' -c $FIND_ACCOUNT | ConvertFrom-Csv -Delimiter '|' -Header id,zaloName,zaloUid,status,connectedAt | Select-Object -First 1

if ($localAccount) {
    Write-Host "   ✓ Tìm thấy: $($localAccount.zaloName)" -ForegroundColor Green
    Write-Host "     ID: $($localAccount.id)"
    Write-Host "     UID: $($localAccount.zaloUid)"
    Write-Host "     Status: $($localAccount.status)"
    Write-Host ""
} else {
    Write-Host "   ✗ Không tìm thấy account Thiệp Cưới trên local" -ForegroundColor Red
    exit 1
}

Write-Host "2. TÌM ACCOUNT THIỆP CƯỚI TRÊN VPS..." -ForegroundColor Yellow
$vpsAccount = & $PSQL $VPS_DB -t -A -F'|' -c $FIND_ACCOUNT | ConvertFrom-Csv -Delimiter '|' -Header id,zaloName,zaloUid,status,connectedAt | Select-Object -First 1

if ($vpsAccount) {
    Write-Host "   ✓ Tìm thấy: $($vpsAccount.zaloName)" -ForegroundColor Green
    Write-Host "     ID: $($vpsAccount.id)"
    Write-Host "     UID: $($vpsAccount.zaloUid)"
    Write-Host "     Status: $($vpsAccount.status)"
    Write-Host ""
} else {
    Write-Host "   ✗ Không tìm thấy account Thiệp Cưới trên VPS" -ForegroundColor Red
    exit 1
}

# Query thống kê tin nhắn
$STATS_QUERY = @"
WITH conversation_stats AS (
  SELECT
    c.id,
    c."externalThreadId",
    c."threadType",
    c."lastMessageAt",
    COUNT(m.id) as message_count,
    MIN(m."createdAt") as first_message,
    MAX(m."createdAt") as last_message
  FROM "Conversation" c
  LEFT JOIN "Message" m ON m."conversationId" = c.id
  WHERE c."zaloAccountId" = '{ACCOUNT_ID}'
  GROUP BY c.id, c."externalThreadId", c."threadType", c."lastMessageAt"
)
SELECT
  "threadType",
  COUNT(*) as conversation_count,
  SUM(message_count) as total_messages,
  MIN(first_message) as earliest_message,
  MAX(last_message) as latest_message
FROM conversation_stats
GROUP BY "threadType"
ORDER BY "threadType";
"@

$localStatsQuery = $STATS_QUERY -replace '{ACCOUNT_ID}', $localAccount.id
$vpsStatsQuery = $STATS_QUERY -replace '{ACCOUNT_ID}', $vpsAccount.id

Write-Host "3. THỐNG KÊ LOCAL..." -ForegroundColor Yellow
$localStats = & $PSQL $LOCAL_DB -c $localStatsQuery
Write-Host $localStats
Write-Host ""

Write-Host "4. THỐNG KÊ VPS..." -ForegroundColor Yellow
$vpsStats = & $PSQL $VPS_DB -c $vpsStatsQuery
Write-Host $vpsStats
Write-Host ""

# Chi tiết conversation có tin nhắn
$DETAIL_QUERY = @"
SELECT
  c."threadType",
  c."externalThreadId",
  c."displayName",
  COUNT(m.id) as msg_count,
  MIN(m."createdAt")::date as first_msg_date,
  MAX(m."createdAt")::date as last_msg_date,
  MAX(m."createdAt") as last_msg_time
FROM "Conversation" c
LEFT JOIN "Message" m ON m."conversationId" = c.id
WHERE c."zaloAccountId" = '{ACCOUNT_ID}'
GROUP BY c.id, c."threadType", c."externalThreadId", c."displayName"
HAVING COUNT(m.id) > 0
ORDER BY last_msg_time DESC NULLS LAST
LIMIT 20;
"@

$localDetailQuery = $DETAIL_QUERY -replace '{ACCOUNT_ID}', $localAccount.id
$vpsDetailQuery = $DETAIL_QUERY -replace '{ACCOUNT_ID}', $vpsAccount.id

Write-Host "5. TOP 20 HỘI THOẠI GẦN NHẤT - LOCAL..." -ForegroundColor Yellow
& $PSQL $LOCAL_DB -c $localDetailQuery
Write-Host ""

Write-Host "6. TOP 20 HỘI THOẠI GẦN NHẤT - VPS..." -ForegroundColor Yellow
& $PSQL $VPS_DB -c $vpsDetailQuery
Write-Host ""

# So sánh chi tiết một conversation cụ thể
Write-Host "7. NHẬP externalThreadId ĐỂ SO SÁNH CHI TIẾT (hoặc Enter để bỏ qua):" -ForegroundColor Yellow
$threadId = Read-Host "Thread ID"

if ($threadId) {
    $COMPARE_QUERY = @"
SELECT
  m."zaloMsgId",
  m."contentType",
  LEFT(m.content, 50) as content_preview,
  m."createdAt",
  m."isSelf"
FROM "Message" m
JOIN "Conversation" c ON c.id = m."conversationId"
WHERE c."zaloAccountId" = '{ACCOUNT_ID}'
  AND c."externalThreadId" = '$threadId'
ORDER BY m."createdAt" DESC
LIMIT 30;
"@

    $localCompareQuery = $COMPARE_QUERY -replace '{ACCOUNT_ID}', $localAccount.id
    $vpsCompareQuery = $COMPARE_QUERY -replace '{ACCOUNT_ID}', $vpsAccount.id

    Write-Host ""
    Write-Host "   LOCAL - 30 tin mới nhất:" -ForegroundColor Cyan
    & $PSQL $LOCAL_DB -c $localCompareQuery

    Write-Host ""
    Write-Host "   VPS - 30 tin mới nhất:" -ForegroundColor Cyan
    & $PSQL $VPS_DB -c $vpsCompareQuery
}

Write-Host ""
Write-Host "=== HOÀN TẤT ===" -ForegroundColor Green
