<?php
declare(strict_types=1);

// Reverse Market: public, read-only six-month daily-price endpoint.
// This file is designed for common GoDaddy PHP/cURL hosting.
// Data source: unofficial Yahoo Finance chart endpoint; availability is not guaranteed.
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply_json(array $body, int $status = 200): void {
    http_response_code($status);
    header('Cache-Control: ' . ($status === 200 ? 'public, max-age=600' : 'no-store'));
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    reply_json(['error' => '此接口只接受 GET 請求。'], 405);
}

$symbol = strtoupper(trim((string) ($_GET['symbol'] ?? '')));
if ($symbol === '' || !preg_match('/\A[A-Z0-9^._=-]{1,20}\z/D', $symbol)) {
    reply_json(['error' => '請輸入有效股票代號，例如 QQQ、NVDA 或 0700.HK。'], 400);
}

if (!function_exists('curl_init')) {
    reply_json(['error' => '主機尚未啟用 PHP cURL，請檢查 GoDaddy 主機設定。'], 500);
}

// Cache successful responses for 15 minutes to reduce upstream requests.
$cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) .
    DIRECTORY_SEPARATOR . 'reverse_market_' . hash('sha256', __DIR__ . ':' . $symbol) . '.json';
if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < 900) {
    $cached = @file_get_contents($cacheFile);
    if (is_string($cached) && $cached !== '') {
        header('Cache-Control: public, max-age=600');
        echo $cached;
        exit;
    }
}

function fetch_chart(string $host, string $symbol): ?array {
    $url = 'https://' . $host . '/v8/finance/chart/' .
        rawurlencode($symbol) . '?range=6mo&interval=1d';

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; ReverseMarket/1.0)',
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($body) || $status !== 200) return null;
    $json = json_decode($body, true);
    return is_array($json) ? $json : null;
}

$chart = null;
foreach (['query1.finance.yahoo.com', 'query2.finance.yahoo.com'] as $host) {
    $payload = fetch_chart($host, $symbol);
    if (!is_array($payload)) continue;
    $candidate = $payload['chart']['result'][0] ?? null;
    if (is_array($candidate) && isset($candidate['timestamp'], $candidate['indicators']['quote'][0]['close'])) {
        $chart = $candidate;
        break;
    }
}

if ($chart === null) {
    reply_json([
        'error' => '未能從 Yahoo Finance 取得這隻股票的歷史行情。',
        'detail' => '可能是股票代號無效、非官方接口限制或暫時連線失敗。資料不會以模擬數據取代。',
    ], 502);
}

$timestamps = $chart['timestamp'];
$closes = $chart['indicators']['quote'][0]['close'];
$pointsByDate = [];
foreach ($timestamps as $i => $timestamp) {
    $price = $closes[$i] ?? null;
    if (!is_numeric($timestamp) || !is_numeric($price) || (float) $price <= 0) continue;
    $date = gmdate('Y-m-d', (int) $timestamp);
    $pointsByDate[$date] = ['date' => $date, 'close' => (float) $price];
}
ksort($pointsByDate);
$points = array_values($pointsByDate);
if (count($points) < 2) {
    reply_json(['error' => '這隻股票的歷史收市價不足，無法繪製圖表。'], 422);
}

$result = [
    'symbol' => $chart['meta']['symbol'] ?? $symbol,
    'currency' => $chart['meta']['currency'] ?? 'USD',
    'exchange' => $chart['meta']['exchangeName'] ?? '',
    'source' => 'Yahoo Finance（非官方歷史行情接口）',
    'priceType' => '原始每日收市價（未計入股息；拆股調整依資料來源而定）',
    'points' => $points,
];
$encoded = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded !== false) {
    @file_put_contents($cacheFile, $encoded, LOCK_EX);
    header('Cache-Control: public, max-age=600');
    echo $encoded;
    exit;
}
reply_json(['error' => '無法處理行情資料。'], 500);
