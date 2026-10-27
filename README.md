# 逆市報 / Reverse Market

這是一個以「持續買入股票的人」為視角的繁體中文網站。輸入股票代號，即可檢視過去六個月的每日收市價、同額購股能力，以及根據真實數據計算的反向財經標題。

## 看甚麼

- **反向圖表（預設）**：同額購股能力指數 = 100 × 六個月期初收市價 ÷ 當日收市價。價格下跌時，線上升；價格上漲時，線下降。這是購股能力，不是反向的股價。
- **正常圖表**：每日實際收市價。
- **新聞標題**：六個月變幅、最新交易日走勢、最大單日跌幅，均由行情計算，不是 AI 臆測。
- **股價、折扣及資料日期**：保留原始數字，避免錯誤理解。
- 支援例如 `QQQ`、`AAPL`、`NVDA`、`MU`、`SPY`、`0700.HK` 等格式；是否有資料取決於行情供應商。

## 直接開啟預覽（會嘗試讀取真實行情）

下載並使用瀏覽器打開 `public/index.html` 或 `reverse-market-demo.html`，會透過 `proxy.cors.dev` 公開 CORS 轉接服務，讀取 Yahoo Finance 非官方 Chart JSON 的過去六個月每日收市價。毋須先註冊 API key。**需要網絡連線**，且由於依賴第三方免費轉接服務，可能被限流或隨時無法使用；不能保證每次都能查到。

只有在網址附加 **`?demo=1`** 時才會使用明確標示的模擬數據。**如果無法讀取真實行情，網站會明確顯示錯誤，不會自動以模擬數據取代。**

公開第三方轉接服務會看到你查詢的股票代號及請求來源；這是簡便的個人展示模式，不建議用作需要穩定度、私隱保護或正式再分發行情的生產環境。正式公開使用建議部署 Cloudflare Worker，並考慮有正式授權的數據供應商。

## 直接部署至 GoDaddy（毋須 Cloudflare）

已另備 PHP 版本，適用於支援 PHP 及 cURL 的網站空間。GoDaddy Web Hosting (cPanel) 一般支援兩者。WordPress 受管託管方案也可管理檔案，但須確認能否在指定目錄執行自訂 PHP。

### 使用現有 davis.app 網站空間

1. 登入 GoDaddy，進入你的 **Web Hosting (cPanel) → Manage → File Manager**。如果看到的是 **Managed Hosting for WordPress**，則使用 **Settings → Tools → File Browser** 或 SFTP。
2. 找出 **davis.app 的網站根目錄**（cPanel 常見為 `public_html`，但請以管理介面顯示的實際路徑為準）。不要覆蓋現有 WordPress 的 `index.php`、`.htaccess` 或其他檔案。
3. 在網站根目錄新增一個 **stocks** 資料夾（例如 `public_html/stocks/`）。
4. 從 GitHub 本專案的 `public/` 目錄，按以下結構上載**資料夾內的內容**：

```text
你的網站根目錄/
├── （現有網站檔案，保留不變）
└── stocks/
    ├── index.html
    └── api/
        └── history.php
```

5. 打開 `https://davis.app/stocks/`。先測試 `https://davis.app/stocks/api/history.php?symbol=QQQ`：成功時應顯示 JSON，內含 `points` 歷史收市價。
6. 如返回 404，檢查上載目錄與網址是否匹配；如返回 500 或 502，檢查主機 PHP/cURL、出站 HTTPS 連線及上游行情是否可用。

前端會優先查詢 GoDaddy 的 `api/history.php`；如果此路徑不存在，會嘗試 Cloudflare Worker 的 `api/history`，最後才使用僅供展示的公開 CORS 轉接服務。**不會默默以模擬股價冒充真實價格**。模擬模式必須透過 `?demo=1` 明確啟用。

可以日後另外在 GoDaddy 設定 `stocks.davis.app` 子網域，並將其網站根目錄指向同一個 `stocks` 資料夾。若已在使用 `davis.app` 主站，不要直接覆蓋主站目錄或改動 WordPress DNS 設定。

**注意：** Yahoo Finance Chart 是非官方行情接口，可能限流或封鎖主機。程式已設 15 分鐘快取及失敗提示，但不能保證所有股票與時段都有可用數據。正式公開使用前應評估資料供應商的穩定性及授權條款。

## 部署真實行情網站：Cloudflare Workers

需要 Node.js、Cloudflare 帳戶、Cloudflare Workers。

1. 在項目目錄執行 `npm install`。
2. 執行 `npx wrangler login`，依瀏覽器指示授權。
3. 執行 `npm run deploy`。部署後會得到 `*.workers.dev` 網址，普通瀏覽器即可打開。
4. 可在 Cloudflare Dashboard → Workers & Pages → 對應 Worker → Settings → Domains & Routes 綁定自己的子網域（DNS 必須經 Cloudflare 管理）。若 `davis.app` DNS 仍由 GoDaddy 管理，可先使用 `workers.dev` 或另設 Cloudflare 可管理的域名；不要直接改動現有主站 DNS。

### 股價來源

預設嘗試 Yahoo Finance 的**非官方** Chart JSON 端點（6mo / 1d）。此端點可能限流、變更或拒絕 Cloudflare Worker 的連線，故無法保證正式環境永遠可用。程式會明確顯示錯誤，不會冒充真實價格。

如需較穩定的正式數據服務，可申請 Twelve Data API key 並以 Cloudflare Worker Secret 設定：

```bash
npx wrangler secret put TWELVE_DATA_API_KEY
```

**不要**將 key 寫入 `public/index.html`、GitHub 或 `wrangler.jsonc`。設定後 Worker 會優先使用 Twelve Data；其供應範圍、速率限制、價格、再分發及對外公開顯示權利，應以訂閱方案為準。參考：https://twelvedata.com/docs

## 使用限制與原理

資料截至最後可取得的收市價，非盤中即時報價；不含交易成本、股息，拆股/調整方式按來源而定。六個月指從查詢時點回推約六個曆月；非固定 126 個交易日。

股價下跌可能因公司基本面轉差，並非一定是「好消息」。該網站的新聞標題是刻意採取長期買家的觀察角度，並不構成投資建議。

## 測試

`npm test` 驗證代號檢查及兩種行情來源的解析。

## 技術

- 純 HTML、CSS、原生 JS 與 SVG 畫圖，不依賴外部前端套件或 CDNs。
- Cloudflare Worker 代理行情來源，避免把正式 API key 暴露在瀏覽器。
- 前端不儲存個人資料，沒有登入功能。