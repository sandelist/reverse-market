const SYMBOL_RE = /^[A-Z0-9^._=-]{1,20}$/;

export function normaliseSymbol(value) {
  const ticker = String(value ?? '').trim().toUpperCase();
  return SYMBOL_RE.test(ticker) ? ticker : null;
}

export function parseYahooChart(payload, symbol) {
  const result = payload?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error('找不到這隻股票的六個月歷史行情。');
  const close = result.indicators?.quote?.[0]?.close ?? [];
  const points = result.timestamp.map((seconds, i) => ({
    date: new Date(seconds * 1000).toISOString().slice(0, 10),
    close: Number(close[i]),
  })).filter(p => Number.isFinite(p.close) && p.close > 0 && p.date !== '1970-01-01');
  if (points.length < 2) throw new Error('可用歷史收市價不足。');
  return {
    symbol: result.meta?.symbol ?? symbol,
    currency: result.meta?.currency ?? 'USD',
    exchange: result.meta?.exchangeName ?? '',
    source: 'Yahoo Finance（非官方資料端點）',
    priceType: '收市價（未計入股息回報）',
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function parseTwelveData(payload, symbol) {
  if (payload?.status === 'error' || !Array.isArray(payload?.values)) {
    throw new Error(payload?.message ?? '查無歷史行情。');
  }
  const points = payload.values.map(p => ({
    date: String(p.datetime).slice(0, 10),
    close: Number(p.close),
  })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0);
  if (points.length < 2) throw new Error('可用歷史收市價不足。');
  return {
    symbol: payload.meta?.symbol ?? symbol,
    currency: payload.meta?.currency ?? 'USD',
    exchange: payload.meta?.exchange ?? '',
    source: 'Twelve Data',
    priceType: '經拆股調整的收市價（未計入股息回報）',
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function requestJSON(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 ReverseMarket/1.0' },
    signal: AbortSignal.timeout(9500),
  });
  if (!res.ok) throw new Error('上游資料服務回應 HTTP ' + res.status);
  return res.json();
}

async function historyFromYahoo(symbol) {
  const path = '/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=6mo&interval=1d';
  let lastError;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try { return parseYahooChart(await requestJSON('https://' + host + path), symbol); }
    catch (e) { lastError = e; }
  }
  throw lastError || new Error('股票資料暫時無法讀取。');
}

async function historyFromTwelve(symbol, key) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 6);
  const params = new URLSearchParams({
    symbol, interval: '1day',
    start_date: from.toISOString().slice(0, 10),
    end_date: to.toISOString().slice(0, 10),
    apikey: key,
  });
  return parseTwelveData(await requestJSON('https://api.twelvedata.com/time_series?' + params), symbol);
}

function jsonResponse(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': code === 200 ? 'public, max-age=900, s-maxage=1800' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return jsonResponse({ error: '只支援 GET。' }, 405);
    if (url.pathname !== '/api/history') return jsonResponse({ error: '找不到接口。' }, 404);
    const symbol = normaliseSymbol(url.searchParams.get('symbol'));
    if (!symbol) return jsonResponse({ error: '請輸入有效股票代號，例如 QQQ、NVDA、AAPL 或 0700.HK。' }, 400);
    try {
      const result = env.TWELVE_DATA_API_KEY
        ? await historyFromTwelve(symbol, env.TWELVE_DATA_API_KEY)
        : await historyFromYahoo(symbol);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({
        error: '暫時無法取得真實行情。請稍後再試，或在 Cloudflare 設定 TWELVE_DATA_API_KEY 使用正式資料服務。',
        detail: error instanceof Error ? error.message : '未知錯誤',
      }, 502);
    }
  },
};
