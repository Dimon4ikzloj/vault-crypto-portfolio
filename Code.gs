// Вставь свой API-ключ CoinMarketCap (https://coinmarketcap.com/api/)
const API_KEY = "YOUR_API_KEY";

// Кэш котировок: не чаще 1 раза в 4 часа (лимит бесплатного CMC)
const PRICE_CACHE_TTL_SEC = 14400;
const PRICE_FETCH_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Известные UCID для надёжного получения цены по тикеру
const KNOWN_COIN_IDS = {
  "SUI": "20947",
  "BTC": "1",
  "ETH": "1027",
  "SOL": "5426",
  "TON": "11419",
  "ARB": "11841",
  "APT": "21794",
  "TIA": "22861",
  "LDO": "8000",
  "PYTH": "28177",
  "NOT": "28850",
  "DOGS": "32698",
  "ZK": "24091",
  "LUNC": "4172"
};

// Базовый список монет (используется, если пользовательский список в Properties пуст)
const DEFAULT_COINS = [
  "SUI", "20947", "LUNC", "LOOKS", "ARB", "APT", "18761", "6958", "2348", "2416",
  "HFT", "9386", "SWEAT", "DYDX", "16463", "22065", "24477", "ALI", "15084", "1INCH",
  "19018", "DOGS", "ZK", "22691", "32461", "5IRE", "NOT", "28508", "9436", "29587",
  "PYTH", "MON", "PI", "33734", "26997", "AEVO", "TIA", "LDO", "CFG", "9258", "33979", 
  "32198", "6636", "8916", "36020", "37263", "20362", "33734", "8646", "24087", "25114", 
  "28066", "6535", "8534", "21159", "38770", "38515", "7737", "1027"
];

function doGet(e) {
  const page = e && e.parameter ? e.parameter.page : '';

  if (page === 'manifest') {
    return serveWebManifest();
  }
  if (page === 'sw') {
    return serveServiceWorker();
  }
  if (page === 'icon') {
    return servePwaIcon();
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Vault — Крипто Портфель')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getWebAppExecUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return '';
  }
}

function getWebAppScopeUrl() {
  const execUrl = getWebAppExecUrl();
  if (!execUrl) return '';
  const match = execUrl.match(/^(https:\/\/script\.google\.com\/macros\/s\/[^/]+\/)/);
  return match ? match[1] : execUrl;
}

function getPwaIconSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<rect width="512" height="512" rx="112" fill="#0a0a0a"/>',
    '<rect x="48" y="48" width="416" height="416" rx="88" fill="none" stroke="#2dd4bf" stroke-width="12" opacity="0.35"/>',
    '<text x="256" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="220" font-weight="700" fill="#2dd4bf">V</text>',
    '</svg>'
  ].join('');
}

function getPwaIconDataUri() {
  return 'data:image/svg+xml;base64,' + Utilities.base64Encode(getPwaIconSvg());
}

function serveWebManifest() {
  const execUrl = getWebAppExecUrl();
  const scopeUrl = getWebAppScopeUrl() || execUrl;
  const iconDataUri = getPwaIconDataUri();

  // ВАЖНО: иконки заданы как data:-URI (base64), а не как ссылка на "?page=icon".
  // ContentService в Apps Script не умеет отдавать произвольный MIME-тип (только
  // фиксированный enum ATOM/CSV/JSON/TEXT/XML/...), поэтому "?page=icon" всегда
  // приходил бы с неверным Content-Type и Chrome не мог распознать его как картинку.
  // Из-за этого манифест не проходил проверку installability (нужны иконки 192px и 512px).
  const manifest = {
    name: 'Vault — Крипто Портфель',
    short_name: 'Vault',
    description: 'Учёт крипто-портфеля: сделки, цены CMC, графики',
    start_url: execUrl || './',
    scope: scopeUrl || './',
    id: execUrl || './',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay', 'browser'],
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'any',
    lang: 'ru',
    categories: ['finance', 'utilities'],
    icons: [
      { src: iconDataUri, sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: iconDataUri, sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  };

  return ContentService.createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

function serveServiceWorker() {
  const sw = [
    "self.addEventListener('install', function(e) { self.skipWaiting(); });",
    "self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });",
    "self.addEventListener('fetch', function(e) {",
    "  if (e.request.method !== 'GET') return;",
    "  e.respondWith(fetch(e.request));",
    "});"
  ].join('\n');

  return ContentService.createTextOutput(sw)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function servePwaIcon() {
  return ContentService.createTextOutput(getPwaIconSvg())
    .setMimeType(ContentService.MimeType.XML);
}

/**
 * Возвращает список всех отслеживаемых монет (из памяти или базовый)
 */
function getTrackedCoins() {
  const userProperties = PropertiesService.getUserProperties();
  const saved = userProperties.getProperty('TRACKED_COINS_LIST');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch(e) {}
  }
  return DEFAULT_COINS.slice();
}

function isTickerAsset(value) {
  const asset = String(value || '').toUpperCase().trim();
  return asset && !/^\d+$/.test(asset);
}

function isPortfolioAsset(value) {
  const asset = String(value || '').trim();
  if (!asset) return false;
  return isNumericId(asset) || isTickerAsset(asset);
}

/**
 * Список тикеров пользователя для быстрого выбора в форме сделок
 */
function getUserAssets() {
  const saved = PropertiesService.getUserProperties().getProperty('USER_ASSETS_LIST');
  let list = [];
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {}
  }
  return list.map(function(c) { return String(c).toUpperCase().trim(); }).filter(isPortfolioAsset);
}

function saveUserAssets(list) {
  const normalized = [];
  const seen = {};
  (list || []).forEach(function(coin) {
    const raw = String(coin || '').trim();
    const asset = isNumericId(raw) ? raw : raw.toUpperCase();
    if (isPortfolioAsset(asset) && !seen[asset]) {
      seen[asset] = true;
      normalized.push(asset);
    }
  });
  PropertiesService.getUserProperties().setProperty('USER_ASSETS_LIST', JSON.stringify(normalized));
  return normalized;
}

function addUserAsset(coin) {
  const raw = String(coin || '').trim();
  const asset = isNumericId(raw) ? raw : raw.toUpperCase();
  if (!isPortfolioAsset(asset)) return getUserAssets();

  const list = getUserAssets();
  const idx = list.indexOf(asset);
  if (idx !== -1) list.splice(idx, 1);
  list.unshift(asset);
  return saveUserAssets(list);
}

function syncUserAssetsFromTransactions(transactions) {
  const list = getUserAssets();
  const seen = {};
  list.forEach(function(c) { seen[c] = true; });

  (transactions || []).forEach(function(tx) {
    const raw = String(tx.coin || '').trim();
    const asset = isNumericId(raw) ? raw : raw.toUpperCase();
    if (isPortfolioAsset(asset) && !seen[asset]) {
      list.push(asset);
      seen[asset] = true;
    }
  });

  return saveUserAssets(list);
}

function addUserAssetCoin(coin) {
  if (!coin) return { success: false, error: 'Введите UCID монеты' };
  const raw = String(coin).trim();
  if (!isNumericId(raw)) {
    return { success: false, error: 'Введите UCID с CoinMarketCap (число, например 20947 для Sui)' };
  }
  const asset = raw;
  const list = addUserAsset(asset);
  ensureCoinsTracked([asset]);
  return { success: true, list: list, meta: readCoinMeta(asset) };
}

/**
 * Ручные цены для делистнутых / скам-монет (нет котировки на CMC)
 */
function getManualPrices() {
  const saved = PropertiesService.getUserProperties().getProperty('MANUAL_PRICES');
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return {};
}

function saveManualPricesMap(map) {
  PropertiesService.getUserProperties().setProperty('MANUAL_PRICES', JSON.stringify(map || {}));
}

function getManualPricesList() {
  const map = getManualPrices();
  return Object.keys(map).sort().map(function(coin) {
    return {
      coin: coin,
      price: map[coin].price,
      invested: map[coin].invested || 0,
      amount: map[coin].amount || 0,
      note: map[coin].note || '',
      updatedAt: map[coin].updatedAt || ''
    };
  });
}

function upsertManualInvestment(asset, invested, amount, note) {
  const investedTotal = parseSheetNumber(invested);
  if (investedTotal <= 0) return { success: true, skipped: true };

  const coinAmount = parseSheetNumber(amount);
  const qty = coinAmount > 0 ? coinAmount : 1;
  const unitPrice = investedTotal / qty;
  const manualId = 'manual-inv-' + asset;
  const txNote = String(note || '').trim() || 'Скам / ручное вложение';
  const txDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const info = getDealsSheet(true);
  const sheet = info.sheet;
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (normalizeTxId(data[i][0], i + 1) === manualId) {
      sheet.getRange(i + 1, 1, 1, 11).setValues([[
        manualId,
        'Покупка',
        asset,
        qty,
        unitPrice,
        investedTotal,
        0,
        txDate,
        0,
        0,
        txNote
      ]]);
      sheet.getRange(i + 1, 1).setNumberFormat('@');
      addUserAsset(asset);
      return { success: true, updated: true };
    }
  }

  return addTransaction({
    id: manualId,
    type: 'Покупка',
    coin: asset,
    amount: qty,
    price: unitPrice,
    total: investedTotal,
    date: txDate,
    fee: 0,
    note: txNote
  });
}

function deleteManualInvestment(asset) {
  return deleteTransaction('manual-inv-' + asset);
}

function setManualCoinPrice(coin, price, note, invested, amount) {
  const asset = String(coin || '').toUpperCase().trim();
  if (!isTickerAsset(asset)) {
    return { success: false, error: 'Укажите тикер монеты (буквы), например LTMUB' };
  }

  const numPrice = parseSheetNumber(price);
  if (numPrice < 0) {
    return { success: false, error: 'Цена не может быть отрицательной' };
  }

  const investedTotal = parseSheetNumber(invested);
  const coinAmount = parseSheetNumber(amount);

  const map = getManualPrices();
  map[asset] = {
    price: numPrice,
    invested: investedTotal > 0 ? investedTotal : (map[asset] ? map[asset].invested : 0),
    amount: coinAmount > 0 ? coinAmount : (map[asset] ? map[asset].amount : 0),
    note: String(note || '').trim() || (numPrice === 0 ? 'Делистинг / скам' : 'Ручная цена'),
    updatedAt: new Date().toISOString()
  };
  saveManualPricesMap(map);
  addUserAsset(asset);
  ensureCoinsTracked([asset]);

  if (investedTotal > 0) {
    const txResult = upsertManualInvestment(asset, investedTotal, coinAmount, map[asset].note);
    if (txResult && txResult.success === false) {
      return txResult;
    }
  }

  return {
    success: true,
    manualPrices: map,
    list: getManualPricesList()
  };
}

function removeManualCoinPrice(coin) {
  const asset = String(coin || '').toUpperCase().trim();
  const map = getManualPrices();
  if (!map[asset]) {
    return { success: false, error: 'Ручная цена для ' + asset + ' не найдена' };
  }
  delete map[asset];
  saveManualPricesMap(map);
  deleteManualInvestment(asset);
  return { success: true, manualPrices: map, list: getManualPricesList() };
}

function applyManualPrices(livePrices, missingPrices) {
  const manual = getManualPrices();
  const missing = (missingPrices || []).slice();

  Object.keys(manual).forEach(function(coin) {
    const entry = manual[coin];
    if (!entry || typeof entry.price !== 'number' || isNaN(entry.price)) return;
    livePrices[coin] = entry.price;
    const idx = missing.indexOf(coin);
    if (idx !== -1) missing.splice(idx, 1);
  });

  return missing;
}

/**
 * Добавление новой монеты или UCID из интерфейса
 */
function addTrackedCoinOrId(newAsset) {
  if (!newAsset) return {success: false, error: 'Пустое значение'};
  const asset = String(newAsset).toUpperCase().trim();
  const currentList = getTrackedCoins();
  
  if (currentList.indexOf(asset) !== -1) {
    return {success: false, error: 'Этот актив уже отслеживается!'};
  }
  
  currentList.push(asset);
  PropertiesService.getUserProperties().setProperty('TRACKED_COINS_LIST', JSON.stringify(currentList));

  return { success: true, list: currentList, price: readCachedPrice(asset), meta: readCoinMeta(asset) };
}

/**
 * Проверяет, является ли значение числовым UCID CoinMarketCap
 */
function isNumericId(value) {
  return /^\d+$/.test(String(value).trim());
}

/**
 * Добавляет монеты из портфеля в список отслеживания (без дубликатов)
 */
function ensureCoinsTracked(coins) {
  if (!coins || !coins.length) return getTrackedCoins();

  const currentList = getTrackedCoins();
  const normalized = currentList.map(function(c) { return String(c).toUpperCase().trim(); });
  let changed = false;

  coins.forEach(function(coin) {
    const asset = String(coin).toUpperCase().trim();
    if (asset && normalized.indexOf(asset) === -1) {
      currentList.push(asset);
      normalized.push(asset);
      changed = true;
    }
  });

  if (changed) {
    PropertiesService.getUserProperties().setProperty('TRACKED_COINS_LIST', JSON.stringify(currentList));
  }

  return currentList;
}

/**
 * Открывает Google Таблицу: привязанную к скрипту или по SPREADSHEET_ID в свойствах проекта
 */
function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(String(id).trim());
    } catch (e) {
      throw new Error('Не удалось открыть таблицу по SPREADSHEET_ID: ' + id);
    }
  }

  throw new Error('Скрипт не привязан к Google Таблице. Откройте таблицу → Расширения → Apps Script. Либо задайте SPREADSHEET_ID в свойствах скрипта (Проект → Свойства проекта).');
}

function findDealsSheet(ss) {
  const sheets = ss.getSheets();
  const names = ['Сделки', 'Deals', 'Transactions', 'Сделки '];

  for (let n = 0; n < names.length; n++) {
    const sheet = ss.getSheetByName(names[n]);
    if (sheet) return sheet;
  }

  for (let i = 0; i < sheets.length; i++) {
    const lower = String(sheets[i].getName()).toLowerCase().trim();
    if (lower === 'сделки' || lower === 'deals' || lower === 'transactions') {
      return sheets[i];
    }
  }

  for (let j = 0; j < sheets.length; j++) {
    const candidate = sheets[j];
    if (candidate.getLastRow() < 2) continue;

    const colCount = Math.max(1, Math.min(11, candidate.getLastColumn()));
    const headers = candidate.getRange(1, 1, 1, colCount).getValues()[0];
    const normalized = headers.map(function(cell) { return String(cell || '').toLowerCase().trim(); });

    const hasType = normalized.indexOf('тип') !== -1 || normalized.indexOf('type') !== -1;
    const hasCoin = normalized.indexOf('монета') !== -1 || normalized.indexOf('coin') !== -1 ||
      normalized.indexOf('актив') !== -1 || normalized.indexOf('symbol') !== -1;

    if (hasType && hasCoin) return candidate;
  }

  return null;
}

/**
 * Получает лист «Сделки» из привязанной таблицы
 */
function getDealsSheet(createIfMissing) {
  const ss = getSpreadsheet();
  let sheet = findDealsSheet(ss);

  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet('Сделки');
    sheet.appendRow(['ID', 'Тип', 'Монета', 'Количество', 'Цена', 'Сумма', 'Комиссия', 'Дата', 'P&L', 'Средняя цена покупки', 'Примечания']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#6366f1').setFontColor('white');
  }

  return { ss: ss, sheet: sheet };
}

function normalizeTxId(raw, rowIndex) {
  if (raw === null || raw === undefined || raw === '') {
    return rowIndex ? 'row-' + rowIndex : '';
  }
  let id = String(raw).trim();
  while (id.charAt(0) === "'") {
    id = id.substring(1);
  }
  return id;
}

function parseTxDate(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return str;
}

function normalizeTxType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'buy' || t === 'покупка') return 'Покупка';
  if (t === 'sell' || t === 'продажа') return 'Продажа';
  if (t === 'airdrop' || t === 'аирдроп' || t === 'air drop') return 'Аирдроп';
  if (t === 'scam' || t === 'скам') return 'Скам';
  if (t === 'correction' || t === 'adjustment' || t === 'корректировка') return 'Корректировка';
  return String(raw || '').trim();
}

const VALID_TX_TYPES = ['Покупка', 'Продажа', 'Аирдроп', 'Скам', 'Корректировка'];

function isValidTxType(type) {
  return VALID_TX_TYPES.indexOf(type) !== -1;
}

function isScamType(type) {
  return type === 'Скам';
}

/**
 * "Корректировка себестоимости" — служебная сделка без изменения количества
 * монет (amount = 0), только меняет "Вложено" на сумму total (может быть
 * отрицательной). Нужна, чтобы честно (без подделки цены/количества в других
 * строках) перенести нереализованный P&L между монетами — например, при
 * ребалансировке "с переносом просадки" каждая сторона (продажа/покупка)
 * пишется по РЕАЛЬНОЙ цене и количеству, а разница в себестоимости
 * оформляется отдельной, ясно подписанной строкой.
 */
function isCorrectionType(type) {
  return type === 'Корректировка';
}

function getScamCoinSet(transactions) {
  const scam = {};
  (transactions || []).forEach(function(tx) {
    if (tx.type === 'Скам') {
      const key = normalizeCoinKey(tx.coin);
      if (key) scam[key] = true;
    }
  });
  return scam;
}

function isScamCoinKey(coin, scamCoins) {
  return !!(scamCoins && scamCoins[normalizeCoinKey(coin)]);
}

function isAcquisitionType(type) {
  return type === 'Покупка' || type === 'Аирдроп';
}

/**
 * Парсит числа из Google Таблицы (поддержка запятой как десятичного разделителя)
 */
function parseSheetNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;

  let str = String(raw).trim().replace(/\s/g, '');
  if (!str) return 0;

  if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.indexOf(',') !== -1) {
    str = str.replace(',', '.');
  }

  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function readTransactionsFromSheet(sheet) {
  const data = sheet.getDataRange().getValues();
  const transactions = [];
  const uniqueCoinsInPortfolio = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const type = normalizeTxType(row[1]);
    const coin = normalizeCoinKey(row[2]);

    if (!type && !coin && !row[3] && !row[5]) continue;
    if (!type || !coin) continue;
    if (type !== 'Покупка' && type !== 'Продажа' && type !== 'Аирдроп' && type !== 'Скам') continue;

    const id = normalizeTxId(row[0], i + 1);
    if (!id) continue;

    if (uniqueCoinsInPortfolio.indexOf(coin) === -1) {
      uniqueCoinsInPortfolio.push(coin);
    }

    transactions.push({
      id: id,
      type: type,
      coin: coin,
      amount: parseSheetNumber(row[3]),
      price: parseSheetNumber(row[4]),
      total: parseSheetNumber(row[5]),
      fee: parseSheetNumber(row[6]),
      date: parseTxDate(row[7]),
      pnl: parseSheetNumber(row[8]),
      avgBuy: parseSheetNumber(row[9]),
      note: row[10] || ''
    });
  }

  return { transactions: transactions, uniqueCoinsInPortfolio: uniqueCoinsInPortfolio };
}

/**
 * Получение транзакций — цены ТОЛЬКО из кэша, без запросов к API
 */
function getTransactions() {
  try {
    const info = getDealsSheet(true);
    const sheet = info.sheet;
    const ss = info.ss;
    const parsed = readTransactionsFromSheet(sheet);

    const livePrices = {};
    let missingPrices = [];

    try {
      ensureCoinsTracked(parsed.uniqueCoinsInPortfolio);
      migrateLegacyPriceStore();
      const scamCoins = getScamCoinSet(parsed.transactions);

      parsed.uniqueCoinsInPortfolio.forEach(function(coin) {
        if (isScamCoinKey(coin, scamCoins)) {
          livePrices[coin] = 0;
          return;
        }

        const price = readCachedPrice(coin);
        if (typeof price === 'number' && !isNaN(price)) {
          livePrices[coin] = price;
        } else {
          livePrices[coin] = null;
          missingPrices.push(coin);
        }
      });
    } catch (priceErr) {
      return buildTransactionsError(String(priceErr));
    }

    missingPrices = applyManualPrices(livePrices, missingPrices);
    const userAssets = syncUserAssetsFromTransactions(parsed.transactions);
    const coinMeta = buildCoinMetaMap(parsed.uniqueCoinsInPortfolio);

    return {
      transactions: parsed.transactions,
      livePrices: livePrices,
      coinMeta: coinMeta,
      priceCacheInfo: getPriceCacheInfo(),
      trackedCoins: getTrackedCoins(),
      userAssets: userAssets,
      manualPrices: getManualPrices(),
      manualPricesList: getManualPricesList(),
      priceUpdate: { success: true, cached: true, fromApi: false, updatedCount: 0, errors: [] },
      missingPrices: missingPrices,
      sheetRows: sheet.getLastRow(),
      sheetName: sheet.getName(),
      spreadsheetUrl: ss.getUrl()
    };
  } catch (e) {
    return buildTransactionsError(String(e));
  }
}

/**
 * Загрузка портфеля + авто-синхронизация при открытии, если прошло ≥4 ч с последнего API-запроса.
 */
function getTransactionsWithAutoSync() {
  let priceUpdate = {
    success: true,
    cached: true,
    fromApi: false,
    updatedCount: 0,
    errors: [],
    throttled: false
  };

  if (canCallPriceApiNow()) {
    priceUpdate = syncPortfolioPrices(false);
  } else {
    const cacheInfo = getPriceCacheInfo();
    priceUpdate.throttled = true;
    priceUpdate.nextFetchAt = cacheInfo.nextFetchAt;
    priceUpdate.lastFetchAt = cacheInfo.lastFetchAt;
    priceUpdate.lastSuccessfulSyncAt = cacheInfo.lastSuccessfulSyncAt;
  }

  const data = getTransactions();
  data.priceUpdate = priceUpdate;
  data.autoSyncedOnLoad = !!(priceUpdate.fromApi && priceUpdate.updatedCount > 0);
  data.autoSync = getAutoSyncStatus();
  return data;
}

function buildTransactionsError(message) {
  return {
    transactions: [],
    livePrices: {},
    coinMeta: {},
    priceCacheInfo: getPriceCacheInfo(),
    userAssets: getUserAssets(),
    manualPrices: getManualPrices(),
    manualPricesList: getManualPricesList(),
    error: message,
    priceUpdate: { success: false, errors: [message] }
  };
}

/**
 * Единственная точка запроса цен к CMC: один пакетный запрос, не чаще 1 раза в 4 часа.
 * skipThrottle=true игнорирует 4-часовой лимит (кнопка «Принудительная синхронизация»
 * для проверки работоспособности — использовать редко, чтобы не исчерпать лимит CMC).
 */
function syncPortfolioPrices(skipThrottle) {
  if (!API_KEY || API_KEY === "YOUR_API_KEY") {
    return { success: false, error: "API-ключ CoinMarketCap не настроен" };
  }

  const cacheInfo = getPriceCacheInfo();
  if (!skipThrottle && !canCallPriceApiNow()) {
    return {
      success: true,
      cached: true,
      throttled: true,
      fromApi: false,
      updatedCount: 0,
      errors: [],
      nextFetchAt: cacheInfo.nextFetchAt,
      lastFetchAt: cacheInfo.lastFetchAt,
      lastSuccessfulSyncAt: cacheInfo.lastSuccessfulSyncAt
    };
  }

  const info = getDealsSheet(true);
  const parsed = readTransactionsFromSheet(info.sheet);
  const collected = collectPortfolioIds(parsed.uniqueCoinsInPortfolio, parsed.transactions);
  const ids = collected.ids;
  const symbols = collected.symbols;

  if (ids.length === 0 && symbols.length === 0) {
    return {
      success: true,
      cached: true,
      fromApi: false,
      updatedCount: 0,
      errors: [],
      message: 'Нет монет для запроса. Добавьте монеты по UCID (число с CoinMarketCap).'
    };
  }

  const cache = CacheService.getScriptCache();
  let updatedCount = 0;
  const errors = [];
  const tvErrors = [];
  let apiCalled = false;

  for (let i = 0; i < ids.length; i += 100) {
    const result = processChunk(ids.slice(i, i + 100), 'id', cache);
    if (result.apiCalled) apiCalled = true;
    updatedCount += result.updated;
    if (result.error) errors.push(result.error);
  }

  for (let j = 0; j < symbols.length; j += 100) {
    const result = processChunk(symbols.slice(j, j + 100), 'symbol', cache);
    if (result.apiCalled) apiCalled = true;
    updatedCount += result.updated;
    if (result.error) errors.push(result.error);
  }

  if (apiCalled) {
    markPriceApiFetched();
  }
  if (updatedCount > 0) {
    markSuccessfulSync();
  }

  if (apiCalled) {
    const tvIds = ids.slice();
    symbols.forEach(function(sym) {
      const resolvedId = resolvePortfolioCoinId(sym);
      if (resolvedId && tvIds.indexOf(resolvedId) === -1) tvIds.push(resolvedId);
    });
    if (tvIds.length > 0) {
      const tvResult = resolveTradingViewSymbolsForIds(tvIds);
      if (tvResult.errors && tvResult.errors.length) {
        tvResult.errors.forEach(function(err) { tvErrors.push(err); });
      }
    }
  }

  const refreshedInfo = getPriceCacheInfo();

  return {
    success: updatedCount > 0 || errors.length === 0,
    cached: updatedCount === 0,
    fromApi: updatedCount > 0,
    throttled: false,
    updatedCount: updatedCount,
    errors: errors,
    tvErrors: tvErrors,
    requestedIds: ids.length + symbols.length,
    nextFetchAt: refreshedInfo.nextFetchAt,
    lastFetchAt: refreshedInfo.lastFetchAt,
    lastSuccessfulSyncAt: refreshedInfo.lastSuccessfulSyncAt
  };
}

/**
 * Синхронизация цен + загрузка портфеля (кнопка «Синхронизировать»)
 */
function syncAndGetTransactions() {
  ensureAutoUpdateTrigger();
  const priceUpdate = syncPortfolioPrices(false);
  const data = getTransactions();
  data.priceUpdate = priceUpdate;
  return data;
}

/**
 * Принудительная синхронизация БЕЗ учёта 4-часового троттлинга (кнопка
 * «Принудительная синхронизация» — для проверки/тестирования, не злоупотреблять).
 */
function forceSyncAndGetTransactions() {
  const priceUpdate = syncPortfolioPrices(true);
  const data = getTransactions();
  data.priceUpdate = priceUpdate;
  return data;
}

/**
 * Разбивает монеты портфеля на: id (можно запросить по UCID) и symbols
 * (тикеры без известного UCID — запрашиваются у CMC по символу).
 * Тикеры, помеченные как AMBIG_ (коллизия символа на CMC), пропускаются —
 * для них нужен явный UCID.
 */
function collectPortfolioIds(coins, transactions) {
  const ids = [];
  const symbols = [];
  const seenIds = {};
  const seenSymbols = {};
  const scamCoins = getScamCoinSet(transactions);
  const registry = getNamesRegistry();

  (coins || []).forEach(function(coin) {
    const key = normalizeCoinKey(coin);
    if (isScamCoinKey(coin, scamCoins)) return;

    if (isNumericId(key)) {
      if (!seenIds[key]) {
        seenIds[key] = true;
        ids.push(key);
      }
      return;
    }

    const resolvedId = resolvePortfolioCoinId(key);
    if (resolvedId) {
      if (!seenIds[resolvedId]) {
        seenIds[resolvedId] = true;
        ids.push(resolvedId);
      }
      return;
    }

    if (registry['AMBIG_' + key]) return;

    if (!seenSymbols[key]) {
      seenSymbols[key] = true;
      symbols.push(key);
    }
  });

  return { ids: ids, symbols: symbols };
}

function addTransaction(data) {
  const info = getDealsSheet(true);
  const sheet = info.sheet;

  const txType = normalizeTxType(data.type);
  if (!isValidTxType(txType)) {
    return { success: false, error: 'Неизвестный тип сделки: ' + data.type };
  }

  const allData = sheet.getDataRange().getValues();
  const coinFormatted = normalizeCoinKey(data.coin);
  const isAirdrop = txType === 'Аирдроп';
  const isScam = txType === 'Скам';
  const isCorrection = isCorrectionType(txType);
  let amount = parseFloat(data.amount) || 0;
  let price = parseFloat(data.price) || 0;
  let total = parseFloat(data.total) || 0;
  let fee = parseFloat(data.fee) || 0;

  if (isAirdrop) {
    price = 0;
    total = 0;
    fee = 0;
  } else if (isScam) {
    total = parseSheetNumber(data.total);
    if (total <= 0) {
      return { success: false, error: 'Укажите сумму вложений в скам-монету' };
    }
    amount = 1;
    price = total;
    fee = 0;
  } else if (isCorrection) {
    // Корректировка не трогает количество монет — только "Вложено" (может
    // быть отрицательной величиной, чтобы уменьшить себестоимость).
    amount = 0;
    price = 0;
    fee = 0;
    total = parseSheetNumber(data.total);
    if (!total) {
      return { success: false, error: 'Укажите ненулевую сумму корректировки' };
    }
  }

  if (!coinFormatted) {
    return { success: false, error: 'Укажите монету' };
  }
  if (!isScam && !isCorrection && amount <= 0) {
    return { success: false, error: isAirdrop ? 'Укажите количество монет из аирдропа' : 'Количество должно быть больше 0' };
  }
  if (!isAirdrop && !isScam && !isCorrection && (price <= 0 || total <= 0)) {
    return { success: false, error: 'Укажите цену и сумму сделки' };
  }

  if (txType === 'Продажа') {
    let currentBalance = 0;
    for (let i = 1; i < allData.length; i++) {
      const rowCoin = String(allData[i][2]).toUpperCase().trim();
      const rowType = normalizeTxType(allData[i][1]);
      if (rowCoin === coinFormatted && normalizeTxId(allData[i][0], i + 1)) {
        if (isAcquisitionType(rowType)) {
          currentBalance += parseFloat(allData[i][3]) || 0;
        } else if (rowType === 'Продажа') {
          currentBalance -= parseFloat(allData[i][3]) || 0;
        }
      }
    }
    if (currentBalance < amount - 0.000001) {
      return {success: false, error: 'Недостаточно монет в портфеле для продажи!'};
    }
  }

  const coinAcquisitions = [];
  let correctionCost = 0;
  for (let i = 1; i < allData.length; i++) {
    const rowCoin = String(allData[i][2]).toUpperCase().trim();
    const rowType = normalizeTxType(allData[i][1]);
    if (rowCoin === coinFormatted && normalizeTxId(allData[i][0], i + 1)) {
      if (isAcquisitionType(rowType)) {
        coinAcquisitions.push({
          amount: parseFloat(allData[i][3]) || 0,
          price: parseFloat(rowType === 'Аирдроп' ? 0 : allData[i][4]) || 0
        });
      } else if (isCorrectionType(rowType)) {
        correctionCost += parseFloat(allData[i][5]) || 0;
      }
    }
  }

  let avgBuy = 0;
  let pnl = 0;

  if (txType === 'Продажа' && (coinAcquisitions.length > 0 || correctionCost)) {
    const totalAmount = coinAcquisitions.reduce((s, b) => s + b.amount, 0);
    const totalCost = coinAcquisitions.reduce((s, b) => s + (b.amount * b.price), 0) + correctionCost;
    if (totalAmount > 0) {
      avgBuy = totalCost / totalAmount;
      pnl = (price - avgBuy) * amount - fee;
    }
  }

  const txId = data.id ? String(data.id) : String(Date.now());
  const lastRow = sheet.getLastRow() + 1;

  sheet.getRange(lastRow, 1, 1, 11).setValues([[
    txId,
    txType,
    coinFormatted,
    amount,
    price,
    total,
    fee,
    data.date,
    pnl,
    avgBuy,
    data.note || (isAirdrop ? 'Аирдроп' : (isScam ? 'Скам' : (isCorrection ? 'Корректировка себестоимости' : '')))
  ]]);

  sheet.getRange(lastRow, 1).setNumberFormat('@');
  sheet.getRange(lastRow, 8).setNumberFormat('yyyy-mm-dd');

  ensureCoinsTracked([coinFormatted]);
  if (isNumericId(coinFormatted)) {
    addUserAsset(coinFormatted);
  } else if (isTickerAsset(coinFormatted)) {
    addUserAsset(coinFormatted);
  }

  return {success: true};
}

function isSwapNote_(note) {
  const n = String(note || '');
  return n.indexOf('Ребалансировка') === 0 ||
    n.indexOf('Обмен → ') === 0 ||
    n.indexOf('Обмен ← ') === 0;
}

function isDrawdownSwapNote_(note) {
  return String(note || '').indexOf('Ребалансировка (просадка)') === 0;
}

function formatSwapNote_(directionArrow, otherCoin, userNote, transferDrawdown) {
  const prefix = transferDrawdown
    ? ('Ребалансировка (просадка) ' + directionArrow + ' ' + otherCoin)
    : ('Ребалансировка ' + directionArrow + ' ' + otherCoin);
  const extra = String(userNote || '').trim();
  if (!extra) return prefix;
  if (isSwapNote_(extra)) return extra;
  return prefix + ' | ' + extra;
}

/**
 * Обмен одной монеты на другую напрямую (например, APT → NEAR), минуя доллары
 * на балансе. Записывается как обычная "Продажа" исходной монеты (с расчётом
 * реализованного P&L по её средней цене покупки) + "Покупка" целевой монеты —
 * те же две строки, что получились бы, если добавить их вручную по отдельности,
 * но обе валидируются и записываются за один проход, чтобы при ошибке в одной
 * из сторон не оставалась "повисшая" половина обмена.
 *
 * transferDrawdown: убыток не фиксируется, а исходная стоимость проданных монет
 * переносится в точку входа купленной (APT $50 вложений → 12.5 NEAR по $4).
 */
function addSwapTransaction(data) {
  const info = getDealsSheet(true);
  const sheet = info.sheet;

  const sell = data && data.sell;
  const buy = data && data.buy;
  if (!sell || !buy) {
    return { success: false, error: 'Не переданы обе стороны обмена' };
  }

  const date = data.date;
  const fee = parseSheetNumber(data.fee);

  const sellCoin = normalizeCoinKey(sell.coin);
  const buyCoin = normalizeCoinKey(buy.coin);

  if (!sellCoin || !buyCoin) {
    return { success: false, error: 'Укажите обе монеты для обмена' };
  }
  if (sellCoin === buyCoin) {
    return { success: false, error: 'Монеты обмена должны отличаться' };
  }

  const sellAmount = parseSheetNumber(sell.amount);
  const sellPrice = parseSheetNumber(sell.price);
  const sellTotal = parseSheetNumber(sell.total) || (sellAmount * sellPrice);

  const buyAmount = parseSheetNumber(buy.amount);
  let buyPrice = parseSheetNumber(buy.price);
  let buyTotal = parseSheetNumber(buy.total) || (buyAmount * buyPrice);
  const transferDrawdown = !!(data && data.transferDrawdown);
  const userNote = (data && data.note) || (sell && sell.note) || '';

  if (sellAmount <= 0 || sellPrice <= 0 || sellTotal <= 0) {
    return { success: false, error: 'Укажите корректное количество и цену для монеты, которую отдаёте' };
  }
  if (buyAmount <= 0 || buyPrice <= 0 || buyTotal <= 0) {
    return { success: false, error: 'Укажите корректное количество и цену для монеты, которую получаете' };
  }

  const allData = sheet.getDataRange().getValues();

  // Баланс отдаваемой монеты — как при обычной продаже
  let currentBalance = 0;
  for (let i = 1; i < allData.length; i++) {
    const rowCoin = String(allData[i][2]).toUpperCase().trim();
    const rowType = normalizeTxType(allData[i][1]);
    if (rowCoin === sellCoin && normalizeTxId(allData[i][0], i + 1)) {
      if (isAcquisitionType(rowType)) {
        currentBalance += parseFloat(allData[i][3]) || 0;
      } else if (rowType === 'Продажа') {
        currentBalance -= parseFloat(allData[i][3]) || 0;
      }
    }
  }
  if (currentBalance < sellAmount - 0.000001) {
    return { success: false, error: 'Недостаточно ' + sellCoin + ' для обмена (баланс: ' + currentBalance + ')' };
  }

  // Средняя цена покупки отдаваемой монеты — для реализованного P&L
  const coinAcquisitions = [];
  for (let i = 1; i < allData.length; i++) {
    const rowCoin = String(allData[i][2]).toUpperCase().trim();
    const rowType = normalizeTxType(allData[i][1]);
    if (rowCoin === sellCoin && isAcquisitionType(rowType) && normalizeTxId(allData[i][0], i + 1)) {
      coinAcquisitions.push({
        amount: parseFloat(allData[i][3]) || 0,
        price: parseFloat(rowType === 'Аирдроп' ? 0 : allData[i][4]) || 0
      });
    }
  }

  let avgBuy = 0;
  let pnl = 0;
  if (transferDrawdown) {
    const snap = computeHoldingsSnapshot_();
    const hSell = snap[sellCoin];
    avgBuy = hSell && hSell.avgBuy > 0 ? hSell.avgBuy : 0;
    if (avgBuy <= 0) {
      return { success: false, error: 'Нельзя перенести просадку: у отдаваемой монеты нет точки входа (капитал отбит или монеты бесплатные)' };
    }
    const transferredCost = avgBuy * sellAmount;
    buyTotal = transferredCost;
    buyPrice = transferredCost / buyAmount;
    pnl = -fee;
  } else if (coinAcquisitions.length > 0) {
    const totalAmount = coinAcquisitions.reduce((s, b) => s + b.amount, 0);
    const totalCost = coinAcquisitions.reduce((s, b) => s + (b.amount * b.price), 0);
    if (totalAmount > 0) {
      avgBuy = totalCost / totalAmount;
      pnl = (sellPrice - avgBuy) * sellAmount - fee;
    }
  }

  const sellNote = formatSwapNote_('→', buyCoin, userNote, transferDrawdown);
  const buyNote = formatSwapNote_('←', sellCoin, userNote, transferDrawdown);

  const baseId = String(Date.now());
  const sellId = baseId + '-swap-out';
  const buyId = baseId + '-swap-in';
  const lastRow = sheet.getLastRow() + 1;

  // Обе строки пишутся одним вызовом setValues — если что-то пойдёт не так,
  // это произойдёт до записи (все проверки выше), а не между двумя отдельными
  // сохранениями, так что "половинчатого" обмена быть не может.
  sheet.getRange(lastRow, 1, 2, 11).setValues([
    [sellId, 'Продажа', sellCoin, sellAmount, sellPrice, sellTotal, fee, date, pnl, avgBuy, sellNote],
    [buyId, 'Покупка', buyCoin, buyAmount, buyPrice, buyTotal, 0, date, 0, 0, buyNote]
  ]);

  sheet.getRange(lastRow, 1, 2, 1).setNumberFormat('@');
  sheet.getRange(lastRow, 8, 2, 1).setNumberFormat('yyyy-mm-dd');

  ensureCoinsTracked([sellCoin, buyCoin]);
  [sellCoin, buyCoin].forEach(function(c) {
    if (isNumericId(c) || isTickerAsset(c)) addUserAsset(c);
  });

  return { success: true };
}

function deleteTransaction(id) {
  const info = getDealsSheet(false);
  const sheet = info.sheet;
  if (!sheet) return {success: false, error: 'Лист «Сделки» не найден'};

  const targetId = normalizeTxId(id);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeTxId(data[i][0], i + 1) === targetId) {
      sheet.deleteRow(i + 1);
      return {success: true};
    }
  }
  return {success: false, error: 'Сделка не найдена'};
}

/**
 * Редактирование существующей сделки — та же логика валидации/пересчёта, что и в
 * addTransaction, но обновляет строку по ID вместо добавления новой. Строка,
 * которая редактируется, исключается из расчёта баланса/средней цены покупки,
 * чтобы можно было менять сумму/количество без ложного "недостаточно монет".
 */
function updateTransaction(data) {
  const info = getDealsSheet(false);
  const sheet = info.sheet;
  if (!sheet) return { success: false, error: 'Лист «Сделки» не найден' };

  const targetId = normalizeTxId(data.id);
  if (!targetId) return { success: false, error: 'Не указан ID сделки' };

  const allData = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < allData.length; i++) {
    if (normalizeTxId(allData[i][0], i + 1) === targetId) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) return { success: false, error: 'Сделка не найдена' };

  const txType = normalizeTxType(data.type);
  if (txType !== 'Покупка' && txType !== 'Продажа' && txType !== 'Аирдроп' && txType !== 'Скам') {
    return { success: false, error: 'Неизвестный тип сделки: ' + data.type };
  }

  const coinFormatted = normalizeCoinKey(data.coin);
  const isAirdrop = txType === 'Аирдроп';
  const isScam = txType === 'Скам';
  let amount = parseFloat(data.amount) || 0;
  let price = parseFloat(data.price) || 0;
  let total = parseFloat(data.total) || 0;
  let fee = parseFloat(data.fee) || 0;

  if (isAirdrop) {
    price = 0;
    total = 0;
    fee = 0;
  } else if (isScam) {
    total = parseSheetNumber(data.total);
    if (total <= 0) {
      return { success: false, error: 'Укажите сумму вложений в скам-монету' };
    }
    amount = 1;
    price = total;
    fee = 0;
  }

  if (!coinFormatted) {
    return { success: false, error: 'Укажите монету' };
  }
  if (!isScam && amount <= 0) {
    return { success: false, error: isAirdrop ? 'Укажите количество монет из аирдропа' : 'Количество должно быть больше 0' };
  }
  if (!isAirdrop && !isScam && (price <= 0 || total <= 0)) {
    return { success: false, error: 'Укажите цену и сумму сделки' };
  }

  if (txType === 'Продажа') {
    let currentBalance = 0;
    for (let i = 1; i < allData.length; i++) {
      if (i === rowIndex) continue;
      const rowCoin = String(allData[i][2]).toUpperCase().trim();
      const rowType = normalizeTxType(allData[i][1]);
      if (rowCoin === coinFormatted && normalizeTxId(allData[i][0], i + 1)) {
        if (isAcquisitionType(rowType)) {
          currentBalance += parseFloat(allData[i][3]) || 0;
        } else if (rowType === 'Продажа') {
          currentBalance -= parseFloat(allData[i][3]) || 0;
        }
      }
    }
    if (currentBalance < amount - 0.000001) {
      return {success: false, error: 'Недостаточно монет в портфеле для продажи!'};
    }
  }

  const coinAcquisitions = [];
  for (let i = 1; i < allData.length; i++) {
    if (i === rowIndex) continue;
    const rowCoin = String(allData[i][2]).toUpperCase().trim();
    const rowType = normalizeTxType(allData[i][1]);
    if (rowCoin === coinFormatted && isAcquisitionType(rowType) && normalizeTxId(allData[i][0], i + 1)) {
      coinAcquisitions.push({
        amount: parseFloat(allData[i][3]) || 0,
        price: parseFloat(rowType === 'Аирдроп' ? 0 : allData[i][4]) || 0
      });
    }
  }

  let avgBuy = 0;
  let pnl = 0;

  if (txType === 'Продажа' && coinAcquisitions.length > 0) {
    const totalAmount = coinAcquisitions.reduce((s, b) => s + b.amount, 0);
    const totalCost = coinAcquisitions.reduce((s, b) => s + (b.amount * b.price), 0);
    if (totalAmount > 0) {
      avgBuy = totalCost / totalAmount;
      pnl = isDrawdownSwapNote_(data.note) ? -fee : ((price - avgBuy) * amount - fee);
    }
  }

  sheet.getRange(rowIndex + 1, 1, 1, 11).setValues([[
    targetId,
    txType,
    coinFormatted,
    amount,
    price,
    total,
    fee,
    data.date,
    pnl,
    avgBuy,
    data.note || (isAirdrop ? 'Аирдроп' : (isScam ? 'Скам' : ''))
  ]]);

  sheet.getRange(rowIndex + 1, 1).setNumberFormat('@');
  sheet.getRange(rowIndex + 1, 8).setNumberFormat('yyyy-mm-dd');

  ensureCoinsTracked([coinFormatted]);
  if (isNumericId(coinFormatted)) {
    addUserAsset(coinFormatted);
  } else if (isTickerAsset(coinFormatted)) {
    addUserAsset(coinFormatted);
  }

  return { success: true };
}

/**
 * Реализация подсистемы CoinMarketCap API & кэширования (не чаще 1 раза в 4 часа)
 */
function getLastPriceFetchTime() {
  return parseInt(PropertiesService.getScriptProperties().getProperty('LAST_PRICE_FETCH_MS') || '0', 10);
}

function getLastSuccessfulSyncTime() {
  return parseInt(PropertiesService.getScriptProperties().getProperty('LAST_SUCCESSFUL_SYNC_MS') || '0', 10);
}

function markPriceApiFetched() {
  PropertiesService.getScriptProperties().setProperty('LAST_PRICE_FETCH_MS', String(Date.now()));
}

function markSuccessfulSync() {
  PropertiesService.getScriptProperties().setProperty('LAST_SUCCESSFUL_SYNC_MS', String(Date.now()));
}

function canCallPriceApiNow() {
  const last = getLastPriceFetchTime();
  return !last || (Date.now() - last) >= PRICE_FETCH_INTERVAL_MS;
}

/**
 * Сбрасывает 4-часовой троттлинг API вручную (запусти в редакторе Apps Script,
 * если нужно проверить синхронизацию сразу после исправления кода, не дожидаясь таймера).
 */
function resetSyncThrottle() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_PRICE_FETCH_MS');
  return { success: true, message: 'Троттлинг сброшен. Теперь можно синхронизировать заново.' };
}

function getPriceCacheInfo() {
  const last = getLastPriceFetchTime();
  const lastSuccess = getLastSuccessfulSyncTime();
  const next = last ? last + PRICE_FETCH_INTERVAL_MS : 0;
  return {
    lastFetchAt: last || null,
    lastSuccessfulSyncAt: lastSuccess || null,
    nextFetchAt: next || null,
    canFetchNow: canCallPriceApiNow(),
    intervalHours: PRICE_FETCH_INTERVAL_MS / (60 * 60 * 1000),
    autoSync: getAutoSyncStatus()
  };
}

/**
 * Статус фонового триггера updateAllCoins (не зависит от открытия веб-приложения).
 */
function getAutoSyncStatus() {
  let triggers = [];
  try {
    triggers = ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'updateAllCoins';
    });
  } catch (e) {
    return { triggerInstalled: false, triggerCount: 0, error: String(e) };
  }

  const props = PropertiesService.getScriptProperties();
  const lastRun = parseInt(props.getProperty('LAST_TRIGGER_RUN_MS') || '0', 10);
  let lastResult = null;
  try {
    lastResult = JSON.parse(props.getProperty('LAST_TRIGGER_RESULT') || 'null');
  } catch (ignore) {}

  let lastTriggerError = props.getProperty('LAST_TRIGGER_ERROR') || null;
  if (isTvOnlyTriggerError(lastTriggerError)) {
    props.deleteProperty('LAST_TRIGGER_ERROR');
    lastTriggerError = null;
  }

  return {
    triggerInstalled: triggers.length > 0,
    triggerCount: triggers.length,
    lastTriggerRunAt: lastRun || null,
    lastTriggerError: lastTriggerError,
    lastTriggerTvWarning: props.getProperty('LAST_TRIGGER_TV_WARNING') || null,
    tvPairsApiDisabled: isTvPairsApiDisabled(),
    lastTriggerResult: lastResult
  };
}

/**
 * Создаёт триггер автообновления, если его ещё нет (без дубликатов).
 * Вызывается при загрузке приложения и при ручной синхронизации.
 */
function ensureAutoUpdateTrigger() {
  try {
    const existing = ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'updateAllCoins';
    });
    if (existing.length > 0) {
      return { installed: true, created: false, count: existing.length };
    }
    ScriptApp.newTrigger('updateAllCoins')
      .timeBased()
      .everyHours(1)
      .create();
    return {
      installed: true,
      created: true,
      count: 1,
      message: 'Фоновая синхронизация включена (проверка каждый час, API — раз в 4 ч.)'
    };
  } catch (e) {
    return { installed: false, created: false, error: formatTriggerError(e) };
  }
}

/**
 * Попытка включить фоновую синхронизацию из веб-приложения.
 * Если Google блокирует — вернёт пошаговую инструкцию для редактора.
 */
function installBackgroundSync() {
  const result = ensureAutoUpdateTrigger();
  const autoSync = getAutoSyncStatus();
  const success = !!(result.installed || autoSync.triggerInstalled);
  return {
    success: success,
    created: !!result.created,
    triggerSetup: result,
    autoSync: autoSync,
    needsEditorSetup: !success,
    editorUrl: getScriptEditorUrl(),
    instructions: [
      'Откройте редактор Apps Script',
      'В списке функций выберите setupAutoUpdate',
      'Нажмите ▶ Выполнить',
      'Подтвердите разрешения Google',
      'Обновите эту страницу'
    ]
  };
}

/**
 * При открытии Google Таблицы (если скрипт привязан к таблице).
 */
function onOpen(e) {
  try {
    ensureAutoUpdateTrigger();
  } catch (err) {
    Logger.log('onOpen ensureAutoUpdateTrigger: ' + err);
  }
}

function normalizeCoinKey(coin) {
  const raw = String(coin || '').trim();
  if (!raw) return '';
  if (/^\d+(\.0+)?$/.test(raw)) return String(parseInt(raw, 10));
  return raw.toUpperCase();
}

function getNamesRegistry() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('COIN_NAMES_REGISTRY');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

function saveNamesRegistry(registry) {
  PropertiesService.getScriptProperties().setProperty('COIN_NAMES_REGISTRY', JSON.stringify(registry || {}));
}

/**
 * Имя монеты сохраняется навсегда при первом ответе API. Повторных запросов «только за имя» нет.
 */
function saveCoinToRegistry(coinData) {
  if (!coinData || !coinData.id) return null;

  const registry = getNamesRegistry();
  const id = String(coinData.id);
  const symbol = coinData.symbol ? String(coinData.symbol).toUpperCase() : '';
  const name = String(coinData.name || '').trim() || symbol;
  if (!name) return registry[id] || null;

  const existing = registry[id];
  registry[id] = {
    id: coinData.id,
    symbol: symbol || (existing && existing.symbol) || '',
    name: name,
    resolvedAt: (existing && existing.resolvedAt) || Date.now(),
    tvSymbol: (existing && existing.tvSymbol) || '',
    tvExchange: (existing && existing.tvExchange) || '',
    tvResolvedAt: (existing && existing.tvResolvedAt) || null
  };

  if (symbol) {
    const symKey = 'SYM_' + symbol;
    const prev = registry[symKey];
    if (!prev || String(prev.id) === id) {
      registry[symKey] = registry[id];
      delete registry['AMBIG_' + symbol];
    } else {
      delete registry[symKey];
      registry['AMBIG_' + symbol] = true;
    }
  }

  saveNamesRegistry(registry);
  return registry[id];
}

function lookupRegistry(coinKey) {
  const key = normalizeCoinKey(coinKey);
  if (!key) return null;

  const registry = getNamesRegistry();
  if (isNumericId(key)) {
    return registry[key] || null;
  }

  if (registry['AMBIG_' + key]) {
    return null;
  }

  if (registry['SYM_' + key]) {
    return registry['SYM_' + key];
  }

  if (KNOWN_COIN_IDS[key] && registry[KNOWN_COIN_IDS[key]]) {
    return registry[KNOWN_COIN_IDS[key]];
  }

  return null;
}

function migrateNamesFromPriceStore() {
  const store = getPriceStore();
  const registry = getNamesRegistry();
  let changed = false;

  Object.keys(store).forEach(function(storeKey) {
    if (storeKey.indexOf('ID_') !== 0) return;
    const entry = store[storeKey];
    if (!entry || !entry.name) return;

    const id = String(entry.id || storeKey.replace('ID_', ''));
    if (registry[id] && registry[id].name) return;

    registry[id] = {
      id: entry.id || parseInt(id, 10),
      symbol: entry.symbol || '',
      name: entry.name,
      resolvedAt: entry.updatedAt || Date.now()
    };
    changed = true;
  });

  if (changed) saveNamesRegistry(registry);
  rebuildRegistrySymbolIndex();
}

function rebuildRegistrySymbolIndex() {
  const registry = getNamesRegistry();
  const symbolOwners = {};
  let changed = false;

  Object.keys(registry).forEach(function(k) {
    if (k.indexOf('SYM_') === 0 || k.indexOf('AMBIG_') === 0) return;
    const entry = registry[k];
    if (!entry || !entry.symbol || !entry.id) return;
    const sym = String(entry.symbol).toUpperCase();
    if (!symbolOwners[sym]) symbolOwners[sym] = [];
    const idStr = String(entry.id);
    if (symbolOwners[sym].indexOf(idStr) === -1) symbolOwners[sym].push(idStr);
  });

  Object.keys(symbolOwners).forEach(function(sym) {
    const ids = symbolOwners[sym];
    const symKey = 'SYM_' + sym;
    const ambigKey = 'AMBIG_' + sym;
    if (ids.length === 1) {
      if (registry[symKey] !== registry[ids[0]] || registry[ambigKey]) changed = true;
      registry[symKey] = registry[ids[0]];
      delete registry[ambigKey];
    } else if (ids.length > 1) {
      if (registry[symKey] || !registry[ambigKey]) changed = true;
      delete registry[symKey];
      registry[ambigKey] = true;
    }
  });

  if (changed) saveNamesRegistry(registry);
}

/**
 * Определяет UCID монеты в портфеле. Для коллизий тикеров (SOS и др.) — только UCID.
 */
function resolvePortfolioCoinId(value) {
  const key = normalizeCoinKey(value);
  if (!key) return null;
  if (isNumericId(key)) return key;

  const registry = getNamesRegistry();
  if (registry['AMBIG_' + key]) return null;

  const fromRegistry = lookupRegistry(key);
  if (fromRegistry && fromRegistry.id) return String(fromRegistry.id);

  if (KNOWN_COIN_IDS[key]) return String(KNOWN_COIN_IDS[key]);

  return null;
}

function readCachedPriceById(id) {
  const idStr = String(id);
  const cache = CacheService.getScriptCache();
  const cached = cache.get('CRYPTO_ID_' + idStr);
  if (cached !== null && cached !== undefined && cached !== '') {
    const price = parseFloat(cached);
    if (!isNaN(price)) return price;
  }

  const store = getPriceStore();
  const entry = store['ID_' + idStr];
  if (entry && typeof entry.price === 'number' && !isNaN(entry.price)) {
    return entry.price;
  }

  return null;
}

function readCachedPrice(value) {
  const key = normalizeCoinKey(value);
  if (!key) return null;

  const id = resolvePortfolioCoinId(value);

  if (id) {
    const byId = readCachedPriceById(id);
    if (byId !== null) return byId;
  }

  if (isNumericId(key)) {
    const direct = readCachedPriceById(key);
    if (direct !== null) return direct;
  }

  const legacyCache = readLegacyCachePrice(key, id);
  if (legacyCache !== null) return legacyCache;

  const stored = readStoredCoinData(value);
  if (stored && typeof stored.price === 'number' && !isNaN(stored.price)) {
    return stored.price;
  }

  return null;
}

function diagnoseCoinPrice(coinKey) {
  const key = normalizeCoinKey(coinKey);
  const registry = getNamesRegistry();
  const resolvedId = resolvePortfolioCoinId(key);
  const meta = readCoinMeta(key);
  const stored = resolvedId ? readStoredCoinData(resolvedId) : null;

  return {
    input: coinKey,
    normalizedKey: key,
    resolvedId: resolvedId,
    ambiguousSymbol: !isNumericId(key) && !!registry['AMBIG_' + key],
    meta: meta,
    price: readCachedPrice(key),
    storedPrice: stored ? stored.price : null,
    storedName: stored ? stored.name : null,
    hint: (!isNumericId(key) && registry['AMBIG_' + key])
      ? 'Тикер «' + key + '» есть у нескольких монет на CMC. В сделках укажите UCID (число), не тикер.'
      : (!resolvedId
        ? 'Не удалось определить UCID. Добавьте монету по UCID с CoinMarketCap.'
        : null)
  };
}

function getPriceStore() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('COIN_PRICE_STORE');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

function savePriceStore(store) {
  PropertiesService.getScriptProperties().setProperty('COIN_PRICE_STORE', JSON.stringify(store || {}));
}

function persistCoinData(coinData) {
  saveCoinToRegistry(coinData);

  const store = getPriceStore();
  const id = String(coinData.id);
  const symbol = coinData.symbol ? String(coinData.symbol).toUpperCase() : '';
  const registryEntry = lookupRegistry(id);
  const entry = {
    id: coinData.id,
    symbol: symbol,
    name: (registryEntry && registryEntry.name) || coinData.name || symbol,
    price: coinData.quote.USD.price,
    updatedAt: Date.now()
  };
  store['ID_' + id] = entry;
  savePriceStore(store);
}

function migrateLegacyPriceStore() {
  const store = getPriceStore();
  let changed = false;

  Object.keys(store).forEach(function(k) {
    if (k.indexOf('SYM_') !== 0) return;
    const entry = store[k];
    if (!entry || !entry.id) return;
    const idKey = 'ID_' + entry.id;
    const existing = store[idKey];
    if (!existing || (entry.updatedAt || 0) >= (existing.updatedAt || 0)) {
      store[idKey] = entry;
      changed = true;
    }
  });

  if (changed) savePriceStore(store);
}

function readStoredCoinData(value) {
  const store = getPriceStore();
  const key = normalizeCoinKey(value);
  if (!key) return null;

  const id = resolvePortfolioCoinId(value);
  if (id && store['ID_' + id]) return store['ID_' + id];

  if (isNumericId(key) && store['ID_' + key]) return store['ID_' + key];

  if (store['SYM_' + key]) return store['SYM_' + key];

  if (!isNumericId(key)) {
    const storeKeys = Object.keys(store);
    for (let i = 0; i < storeKeys.length; i++) {
      const storeKey = storeKeys[i];
      if (storeKey.indexOf('ID_') !== 0) continue;
      const entry = store[storeKey];
      if (entry && entry.symbol && entry.symbol === key) return entry;
    }
  }

  return null;
}

function readLegacyCachePrice(key, id) {
  const cache = CacheService.getScriptCache();
  const keys = [];

  if (id) keys.push('CRYPTO_ID_' + id);
  if (isNumericId(key)) keys.push('CRYPTO_ID_' + key);
  keys.push('CRYPTO_' + key);

  const seen = {};
  for (let i = 0; i < keys.length; i++) {
    if (!keys[i] || seen[keys[i]]) continue;
    seen[keys[i]] = true;
    const cached = cache.get(keys[i]);
    if (cached !== null && cached !== undefined && cached !== '') {
      const price = parseFloat(cached);
      if (!isNaN(price)) return price;
    }
  }

  return null;
}

function readCoinMeta(value) {
  const key = normalizeCoinKey(value);
  if (!key) return null;

  const fromRegistry = lookupRegistry(key);
  if (fromRegistry && fromRegistry.name) {
    return {
      id: fromRegistry.id,
      symbol: fromRegistry.symbol || '',
      name: fromRegistry.name,
      tvSymbol: fromRegistry.tvSymbol || null,
      tvExchange: fromRegistry.tvExchange || null
    };
  }

  const cache = CacheService.getScriptCache();
  let raw = null;

  if (isNumericId(key)) {
    raw = cache.get('CRYPTO_META_' + key);
  } else {
    raw = cache.get('CRYPTO_META_SYM_' + key);
    if (!raw && KNOWN_COIN_IDS[key]) {
      raw = cache.get('CRYPTO_META_' + KNOWN_COIN_IDS[key]);
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name) {
        saveCoinToRegistry({
          id: parsed.id,
          symbol: parsed.symbol,
          name: parsed.name
        });
        return parsed;
      }
    } catch (e) {}
  }

  const stored = readStoredCoinData(key);
  if (stored && stored.name) {
    saveCoinToRegistry({
      id: stored.id,
      symbol: stored.symbol,
      name: stored.name
    });
    return {
      id: stored.id,
      symbol: stored.symbol,
      name: stored.name,
      price: stored.price
    };
  }

  return null;
}

function buildCoinMetaMap(coins) {
  migrateNamesFromPriceStore();

  const map = {};
  (coins || []).forEach(function(coin) {
    const key = normalizeCoinKey(coin);
    if (!key) return;

    const meta = readCoinMeta(key);
    const registry = getNamesRegistry();
    const isAmbiguous = !isNumericId(key) && !!registry['AMBIG_' + key];

    if (meta && meta.name) {
      map[key] = {
        id: meta.id,
        symbol: meta.symbol || '',
        name: meta.name,
        tvSymbol: meta.tvSymbol || null,
        tvExchange: meta.tvExchange || null,
        resolved: true,
        ambiguous: isAmbiguous
      };
    } else if (isNumericId(key)) {
      map[key] = {
        id: parseInt(key, 10),
        symbol: '',
        name: null,
        resolved: false,
        ambiguous: false
      };
    } else {
      map[key] = {
        id: null,
        symbol: key,
        name: key,
        resolved: !isAmbiguous,
        ambiguous: isAmbiguous
      };
    }
  });
  return map;
}

function normalizeCmcExchangeSlug(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Приоритет бирж для графика TradingView: сначала Binance, если пары нет — Gate, OKX и др.
 */
var TV_EXCHANGE_PRIORITY = [
  'binance', 'gate', 'okx', 'okex', 'bybit', 'mexc', 'kucoin', 'bitget', 'huobi', 'htx'
];

function buildTradingViewSymbolFromPair(exchangeSlug, base, quote) {
  const baseU = String(base || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let quoteU = String(quote || 'USDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (quoteU === 'USD') quoteU = 'USDT';
  if (!baseU || !quoteU) return null;

  const slug = normalizeCmcExchangeSlug(exchangeSlug);
  if (slug.indexOf('binance') !== -1) return 'BINANCE:' + baseU + quoteU;
  if (slug.indexOf('gate') !== -1) return 'GATEIO:' + baseU + '_' + quoteU;
  if (slug.indexOf('okx') !== -1 || slug.indexOf('okex') !== -1) return 'OKX:' + baseU + quoteU;
  if (slug.indexOf('bybit') !== -1) return 'BYBIT:' + baseU + quoteU;
  if (slug.indexOf('mexc') !== -1) return 'MEXC:' + baseU + quoteU;
  if (slug.indexOf('kucoin') !== -1) return 'KUCOIN:' + baseU + '-' + quoteU;
  if (slug.indexOf('bitget') !== -1) return 'BITGET:' + baseU + quoteU;
  if (slug.indexOf('huobi') !== -1 || slug.indexOf('htx') !== -1) return 'HUOBI:' + baseU + quoteU;
  return null;
}

function exchangePriorityScore(slug) {
  const s = normalizeCmcExchangeSlug(slug);
  for (let i = 0; i < TV_EXCHANGE_PRIORITY.length; i++) {
    if (s.indexOf(TV_EXCHANGE_PRIORITY[i]) !== -1) return i;
  }
  return 999;
}

function pickBestTradingViewPair(marketPairs, coinSymbol) {
  if (!marketPairs || !marketPairs.length) return null;

  const candidates = [];
  marketPairs.forEach(function(pair) {
    const quote = (pair.market_pair_quote && pair.market_pair_quote.currency_symbol) ||
      (pair.quote && pair.quote.currency_symbol) || '';
    const quoteU = String(quote).toUpperCase();
    if (quoteU !== 'USDT' && quoteU !== 'USD') return;

    const base = (pair.market_pair_base && pair.market_pair_base.currency_symbol) ||
      (pair.base && pair.base.currency_symbol) || coinSymbol || '';
    const exchangeSlug = (pair.exchange && (pair.exchange.slug || pair.exchange.name)) || '';
    const tvSymbol = buildTradingViewSymbolFromPair(exchangeSlug, base, quoteU);
    if (!tvSymbol) return;

    candidates.push({
      tvSymbol: tvSymbol,
      score: exchangePriorityScore(exchangeSlug),
      exchange: exchangeSlug
    });
  });

  if (candidates.length === 0) return null;
  candidates.sort(function(a, b) { return a.score - b.score; });
  return candidates[0];
}

function saveTvSymbolForCoin(id, tvSymbol, tvExchange) {
  if (!id || !tvSymbol) return;
  const registry = getNamesRegistry();
  const idStr = String(id);
  const existing = registry[idStr] || lookupRegistry(idStr) || {};
  registry[idStr] = {
    id: existing.id || parseInt(idStr, 10),
    symbol: existing.symbol || '',
    name: existing.name || existing.symbol || '',
    resolvedAt: existing.resolvedAt || Date.now(),
    tvSymbol: tvSymbol,
    tvExchange: tvExchange || '',
    tvResolvedAt: Date.now()
  };

  if (registry[idStr].symbol) {
    const symKey = 'SYM_' + registry[idStr].symbol;
    if (registry[symKey] && String(registry[symKey].id) === idStr) {
      registry[symKey].tvSymbol = tvSymbol;
      registry[symKey].tvExchange = tvExchange || '';
      registry[symKey].tvResolvedAt = Date.now();
    }
  }
  saveNamesRegistry(registry);
}

function extractMarketPairsForId(data, coinId) {
  if (!data) return [];
  if (data.market_pairs && (!data.id || String(data.id) === String(coinId))) {
    return data.market_pairs;
  }
  if (data[coinId] && data[coinId].market_pairs) {
    return data[coinId].market_pairs;
  }
  if (data[String(coinId)] && data[String(coinId)].market_pairs) {
    return data[String(coinId)].market_pairs;
  }
  return [];
}

/**
 * По данным CMC market-pairs подбирает символ TradingView (Binance → Gate → OKX …)
 * Endpoint market-pairs доступен не на всех тарифах CMC (403 на Basic).
 */
function isTvPairsApiDisabled() {
  return PropertiesService.getScriptProperties().getProperty('TV_PAIRS_API_DISABLED') === '1';
}

function disableTvPairsApi(reason) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('TV_PAIRS_API_DISABLED', '1');
  if (reason) props.setProperty('TV_PAIRS_API_DISABLED_REASON', reason);
}

function isTvOnlyTriggerError(message) {
  if (!message) return false;
  const parts = String(message).split(';').map(function(s) { return s.trim(); }).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(function(part) {
    return part.indexOf('TV pairs HTTP') === 0 || part.indexOf('TradingView:') === 0;
  });
}

function resolveTradingViewSymbolsForIds(ids) {
  if (!ids || !ids.length || !API_KEY || API_KEY === 'YOUR_API_KEY') {
    return { updated: 0, errors: [] };
  }
  if (isTvPairsApiDisabled()) {
    return { updated: 0, errors: [], skipped: true };
  }

  const unique = [];
  const seen = {};
  ids.forEach(function(id) {
    const s = String(id);
    if (!seen[s]) {
      seen[s] = true;
      unique.push(s);
    }
  });

  let updated = 0;
  const errors = [];

  for (let i = 0; i < unique.length; i += 5) {
    const chunk = unique.slice(i, i + 5);
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/market-pairs/latest?id=' +
      encodeURIComponent(chunk.join(',')) + '&limit=50&sort=volume_24h_strict&category=spot';

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'GET',
        headers: { 'X-CMC_PRO_API_KEY': API_KEY, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });
      const statusCode = response.getResponseCode();

      if (statusCode === 403) {
        disableTvPairsApi('HTTP 403');
        errors.push('TradingView: биржи CMC недоступны на вашем тарифе (403). Графики работают через резервные символы.');
        break;
      }

      if (statusCode !== 200) {
        errors.push('TV pairs HTTP ' + statusCode);
        continue;
      }

      const body = JSON.parse(response.getContentText());
      if (body.status && body.status.error_code !== 0) {
        errors.push(body.status.error_message || ('CMC pairs error ' + body.status.error_code));
        continue;
      }

      const data = body.data || {};
      chunk.forEach(function(coinId) {
        const pairs = extractMarketPairsForId(data, coinId);
        const registryEntry = lookupRegistry(coinId);
        const coinSymbol = registryEntry ? registryEntry.symbol : '';
        const best = pickBestTradingViewPair(pairs, coinSymbol);
        if (best && best.tvSymbol) {
          saveTvSymbolForCoin(coinId, best.tvSymbol, best.exchange);
          updated++;
        }
      });
    } catch (e) {
      errors.push(formatApiError(e));
    }
  }

  return { updated: updated, errors: errors };
}

function getCryptoCacheKeys(value) {
  const key = normalizeCoinKey(value);
  const id = resolvePortfolioCoinId(value);
  const keys = [];
  if (id) keys.push('CRYPTO_ID_' + id);
  if (isNumericId(key)) keys.push('CRYPTO_ID_' + key);
  keys.push('CRYPTO_' + key);
  return keys;
}

function CRYPTO(value) {
  if (!value) return "Ошибка: значение не указано";

  const cached = readCachedPrice(value);
  if (cached !== null) return cached;

  return "Цена не найдена (нажмите «Синхронизировать»)";
}

/**
 * Загрузка цен для портфеля: просмотр — только кэш; API — не чаще 1 раза в 4 часа, пакетами
 */
function fetchPricesForCoins(coins, forceRefresh) {
  if (!API_KEY || API_KEY === "YOUR_API_KEY") {
    return { success: false, error: "API-ключ CoinMarketCap не настроен" };
  }

  const cache = CacheService.getScriptCache();
  const normalizedCoins = [];
  const seen = {};

  (coins || []).forEach(function(coin) {
    const normalized = String(coin).trim();
    const key = isNumericId(normalized) ? normalized : normalized.toUpperCase();
    if (key && !seen[key]) {
      seen[key] = true;
      normalizedCoins.push(key);
    }
  });

  const mayCallApi = !!forceRefresh && canCallPriceApiNow();
  const cacheInfo = getPriceCacheInfo();

  if (!mayCallApi) {
    return {
      success: true,
      cached: true,
      updatedCount: 0,
      errors: [],
      throttled: !!forceRefresh && !canCallPriceApiNow(),
      fromApi: false,
      nextFetchAt: cacheInfo.nextFetchAt,
      lastFetchAt: cacheInfo.lastFetchAt
    };
  }

  const ids = [];
  const symbols = [];
  const seenIds = {};
  const seenSymbols = {};

  normalizedCoins.forEach(function(coin) {
    if (isNumericId(coin)) {
      if (!seenIds[coin]) {
        seenIds[coin] = true;
        ids.push(coin);
      }
    } else if (KNOWN_COIN_IDS[coin]) {
      const id = KNOWN_COIN_IDS[coin];
      if (!seenIds[id]) {
        seenIds[id] = true;
        ids.push(id);
      }
    } else if (isTickerAsset(coin)) {
      if (!seenSymbols[coin]) {
        seenSymbols[coin] = true;
        symbols.push(coin);
      }
    }
  });

  let updatedCount = 0;
  const errors = [];

  for (let i = 0; i < ids.length; i += 100) {
    const result = processChunk(ids.slice(i, i + 100), 'id', cache);
    updatedCount += result.updated;
    if (result.error) errors.push(result.error);
  }

  for (let j = 0; j < symbols.length; j += 100) {
    const result = processChunk(symbols.slice(j, j + 100), 'symbol', cache);
    updatedCount += result.updated;
    if (result.error) errors.push(result.error);
  }

  if (updatedCount > 0) {
    markPriceApiFetched();
  }

  const refreshedInfo = getPriceCacheInfo();

  return {
    success: updatedCount > 0 || errors.length === 0,
    updatedCount: updatedCount,
    errors: errors,
    cached: updatedCount === 0,
    fromApi: updatedCount > 0,
    throttled: false,
    nextFetchAt: refreshedInfo.nextFetchAt,
    lastFetchAt: refreshedInfo.lastFetchAt
  };
}

function fetchSingleCoinPrice(coin, cache) {
  const normalized = String(coin).toUpperCase().trim();
  const attempts = [];

  if (KNOWN_COIN_IDS[normalized]) {
    attempts.push({ type: 'id', value: KNOWN_COIN_IDS[normalized] });
  }
  if (isNumericId(normalized)) {
    attempts.push({ type: 'id', value: normalized });
  }
  attempts.push({ type: 'symbol', value: normalized });

  const uniqueAttempts = [];
  const seen = {};
  attempts.forEach(function(attempt) {
    const key = attempt.type + ':' + attempt.value;
    if (!seen[key]) {
      seen[key] = true;
      uniqueAttempts.push(attempt);
    }
  });

  let lastError = null;

  for (let i = 0; i < uniqueAttempts.length; i++) {
    const attempt = uniqueAttempts[i];
    const result = requestCmcQuote(attempt.type, attempt.value);
    if (result.error) {
      lastError = result.error;
      continue;
    }

    if (result.coinData) {
      storeCoinPrice(result.coinData, cache);
      const price = readCachedPrice(normalized);
      if (price !== null) {
        return { price: price, error: null };
      }
    }
  }

  return { price: null, error: lastError || 'Цена не найдена в ответе API' };
}

function formatApiError(error) {
  const message = String(error || '');
  if (message.indexOf('script.external_request') !== -1 || message.indexOf('UrlFetchApp.fetch') !== -1) {
    return 'Нет разрешения на внешние запросы. В Apps Script запустите authorizeExternalRequests() и подтвердите доступ.';
  }
  if (isMailAuthError_(message)) {
    return formatMailAuthError_();
  }
  return message;
}

function isMailAuthError_(error) {
  const message = String(error || '');
  return message.indexOf('script.send_mail') !== -1 ||
    message.indexOf('MailApp.sendEmail') !== -1 ||
    (message.indexOf('MailApp') !== -1 && message.indexOf('разрешен') !== -1);
}

function formatMailAuthError_() {
  return 'Нет разрешения на отправку почты. В редакторе Apps Script выберите authorizeSendMail → ▶ Выполнить → Разрешить. Затем вернитесь и снова нажмите «Тест».';
}

function formatTriggerError(error) {
  const message = String(error || '');
  if (message.indexOf('script.scriptapp') !== -1 || message.indexOf('ScriptApp.newTrigger') !== -1) {
    return 'Google не разрешает создавать триггеры из веб-приложения. Один раз запустите setupAutoUpdate() в редакторе Apps Script.';
  }
  if (message.indexOf('Authorization') !== -1 || message.indexOf('разрешени') !== -1) {
    return 'Нужно подтвердить разрешения: редактор Apps Script → setupAutoUpdate → Выполнить → Разрешить.';
  }
  return formatApiError(error);
}

function getScriptEditorUrl() {
  return 'https://script.google.com/home/projects/' + ScriptApp.getScriptId() + '/edit';
}

function getSetupInfo() {
  const autoSync = getAutoSyncStatus();
  try {
    const ss = getSpreadsheet();
    const sheet = findDealsSheet(ss);
    const sheetNames = ss.getSheets().map(function(s) { return s.getName(); });

    return {
      scriptEditorUrl: getScriptEditorUrl(),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetId: ss.getId(),
      sheetName: sheet ? sheet.getName() : null,
      sheetRows: sheet ? sheet.getLastRow() : 0,
      sheetNames: sheetNames,
      bound: !!SpreadsheetApp.getActiveSpreadsheet(),
      autoSync: autoSync
    };
  } catch (e) {
    return {
      scriptEditorUrl: getScriptEditorUrl(),
      error: String(e),
      autoSync: autoSync
    };
  }
}

/**
 * Диагностика: почему сделки не отображаются (запустите в редакторе или из веб-приложения)
 */
function diagnoseTransactions() {
  try {
    const ss = getSpreadsheet();
    const sheet = findDealsSheet(ss);
    const sheetNames = ss.getSheets().map(function(s) { return s.getName(); });

    if (!sheet) {
      return {
        ok: false,
        spreadsheetUrl: ss.getUrl(),
        sheetNames: sheetNames,
        message: 'Лист со сделками не найден. Создайте лист «Сделки» или переименуйте существующий. Листы в таблице: ' + sheetNames.join(', ')
      };
    }

    const data = sheet.getDataRange().getValues();
    const parsed = readTransactionsFromSheet(sheet);
    const skipped = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const type = normalizeTxType(row[1]);
      const coin = String(row[2] || '').toUpperCase().trim();
      if (!type && !coin && !row[3] && !row[5]) continue;

      if (!type || !coin || (type !== 'Покупка' && type !== 'Продажа' && type !== 'Аирдроп' && type !== 'Скам')) {
        skipped.push({ row: i + 1, type: row[1], coin: row[2], reason: 'Нужны колонки: Тип = Покупка/Продажа/Аирдроп/Скам, Монета = тикер' });
      }
    }

    return {
      ok: parsed.transactions.length > 0,
      spreadsheetUrl: ss.getUrl(),
      sheetName: sheet.getName(),
      rawRows: Math.max(0, data.length - 1),
      parsedCount: parsed.transactions.length,
      skippedRows: skipped.slice(0, 10),
      sampleParsed: parsed.transactions.slice(0, 3),
      message: parsed.transactions.length > 0
        ? 'Найдено ' + parsed.transactions.length + ' сделок на листе «' + sheet.getName() + '»'
        : (data.length > 1
          ? 'В таблице ' + (data.length - 1) + ' строк, но ни одна не распознана как сделка. Проверьте колонки B (Тип) и C (Монета).'
          : 'Лист «' + sheet.getName() + '» пустой — добавьте сделки через форму или вручную.')
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function checkApiAccess() {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    return { ok: false, message: 'API-ключ CoinMarketCap не настроен в Code.gs' };
  }

  const info = getPriceCacheInfo();
  return {
    ok: true,
    message: 'Ключ задан. Цены обновляются кнопкой «Синхронизировать» (не чаще 1 раза в 4 ч).' +
      (info.lastFetchAt ? ' Последнее обновление: ' + new Date(info.lastFetchAt).toLocaleString('ru-RU') + '.' : '')
  };
}

/**
 * Запусти ОДИН РАЗ вручную в редакторе Apps Script для выдачи разрешений.
 * Появится окно Google — нажми "Разрешить".
 */
function authorizeExternalRequests() {
  const response = UrlFetchApp.fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=20947', {
    method: 'GET',
    headers: { 'X-CMC_PRO_API_KEY': API_KEY, 'Accept': 'application/json' },
    muteHttpExceptions: true
  });

  return {
    success: response.getResponseCode() === 200,
    status: response.getResponseCode(),
    body: response.getContentText()
  };
}

/**
 * Запусти ОДИН РАЗ вручную в редакторе Apps Script, чтобы Google выдал
 * право на MailApp (письма с алертами). Из веб-приложения это окно
 * согласия само не появляется — только из редактора.
 */
function authorizeSendMail() {
  const remaining = MailApp.getRemainingDailyQuota();
  return {
    success: true,
    message: 'Разрешение на отправку почты выдано. Осталось писем сегодня: ' + remaining + '.'
  };
}

function requestCmcQuote(type, value) {
  const param = type === 'symbol' ? 'symbol' : 'id';
  const endpoints = [
    'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?' + param + '=' + encodeURIComponent(value),
    'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?' + param + '=' + encodeURIComponent(value)
  ];

  const options = {
    method: "GET",
    headers: { "X-CMC_PRO_API_KEY": API_KEY, "Accept": "application/json" },
    muteHttpExceptions: true
  };

  let lastError = 'API не вернул котировку для ' + value;

  for (let i = 0; i < endpoints.length; i++) {
    try {
      const response = UrlFetchApp.fetch(endpoints[i], options);
      const statusCode = response.getResponseCode();
      const rawBody = response.getContentText();

      if (statusCode !== 200) {
        lastError = 'HTTP ' + statusCode + ': ' + rawBody;
        continue;
      }

      const data = JSON.parse(rawBody);
      if (data.status && data.status.error_code !== 0) {
        lastError = data.status.error_message || ('CMC error ' + data.status.error_code);
        continue;
      }

      const coinData = extractCoinData(data.data, type, value);
      if (coinData) {
        return { coinData: coinData, error: null };
      }

      lastError = 'Пустой ответ API для ' + value;
    } catch (e) {
      lastError = formatApiError(e);
    }
  }

  return { coinData: null, error: lastError };
}

function extractCoinData(dataSection, type, value) {
  if (!dataSection) return null;

  if (type === 'id') {
    const idStr = String(value);
    let entry = dataSection[idStr] || dataSection[parseInt(idStr, 10)];
    if (!entry) return null;
    if (Array.isArray(entry)) entry = entry[0];
    if (!entry || !entry.quote || !entry.quote.USD) return null;
    return entry;
  }

  const lookupKey = String(value).toUpperCase();
  let entry = dataSection[lookupKey];
  if (!entry) return null;
  if (Array.isArray(entry)) {
    if (entry.length > 1) return { ambiguous: true };
    entry = entry[0];
  }
  if (!entry || !entry.quote || !entry.quote.USD) return null;

  return entry;
}

function markSymbolAmbiguous(symbol) {
  const key = String(symbol || '').toUpperCase().trim();
  if (!key) return;
  const registry = getNamesRegistry();
  if (!registry['AMBIG_' + key]) {
    registry['AMBIG_' + key] = true;
    delete registry['SYM_' + key];
    saveNamesRegistry(registry);
  }
}

function storeCoinPrice(coinData, cache) {
  const price = coinData.quote.USD.price;
  const id = coinData.id;
  const symbol = coinData.symbol ? String(coinData.symbol).toUpperCase() : null;
  const name = coinData.name || symbol || '';

  if (price === null || price === undefined || isNaN(price) || !id) return;

  const meta = {
    id: id,
    symbol: symbol || '',
    name: name,
    price: price
  };

  cache.put('CRYPTO_ID_' + id, price.toString(), PRICE_CACHE_TTL_SEC);
  cache.put('CRYPTO_META_' + id, JSON.stringify(meta), PRICE_CACHE_TTL_SEC);

  persistCoinData(coinData);
}

/**
 * Вызывается триггером каждый час (см. setupAutoUpdate / ensureAutoUpdateTrigger).
 * Запрос к CMC — не чаще раза в 4 часа (canCallPriceApiNow).
 */
function updateAllCoins() {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  props.setProperty('LAST_TRIGGER_RUN_MS', String(now));

  try {
    const result = syncPortfolioPrices(false);
    props.setProperty('LAST_TRIGGER_RESULT', JSON.stringify({
      at: now,
      fromApi: !!result.fromApi,
      updatedCount: result.updatedCount || 0,
      throttled: !!result.throttled,
      success: !!result.success,
      errors: result.errors || []
    }));

    if (result.errors && result.errors.length) {
      props.setProperty('LAST_TRIGGER_ERROR', result.errors.join('; '));
    } else if (result.error) {
      props.setProperty('LAST_TRIGGER_ERROR', String(result.error));
    } else {
      props.deleteProperty('LAST_TRIGGER_ERROR');
    }

    if (result.tvErrors && result.tvErrors.length) {
      props.setProperty('LAST_TRIGGER_TV_WARNING', result.tvErrors[0]);
    } else {
      props.deleteProperty('LAST_TRIGGER_TV_WARNING');
    }

    try {
      checkPriceAlerts();
    } catch (alertErr) {
      Logger.log('checkPriceAlerts failed: ' + alertErr);
    }

    return result;
  } catch (e) {
    props.setProperty('LAST_TRIGGER_ERROR', formatApiError(e));
    throw e;
  }
}

/**
 * ─── Уведомления по цене (% от точки входа) ───
 * Идут по email (MailApp) и/или в личный Telegram-бот пользователя.
 * Токен бота вводится в UI и хранится в свойствах скрипта, не в коде.
 * Сообщения отправляются только на сохранённый chat_id — посторонний,
 * нашедший бота поиском, алерты не получает. Проверка идёт из
 * updateAllCoins() — почасовой серверный триггер без открытого браузера.
 */
const PRICE_ALERTS_PROP = 'PRICE_ALERTS_LIST';
const ALERT_EMAIL_PROP = 'PRICE_ALERT_EMAIL';
const TELEGRAM_BOT_TOKEN_PROP = 'TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID_PROP = 'TELEGRAM_CHAT_ID';
const TELEGRAM_BOT_USERNAME_PROP = 'TELEGRAM_BOT_USERNAME';
const TELEGRAM_CHAT_LABEL_PROP = 'TELEGRAM_CHAT_LABEL';

function getPriceAlerts() {
  const saved = PropertiesService.getUserProperties().getProperty(PRICE_ALERTS_PROP);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function savePriceAlerts_(list) {
  PropertiesService.getUserProperties().setProperty(PRICE_ALERTS_PROP, JSON.stringify(list));
}

function getAlertEmail() {
  const saved = PropertiesService.getUserProperties().getProperty(ALERT_EMAIL_PROP);
  if (saved) return saved;
  try {
    const active = Session.getActiveUser().getEmail();
    if (active) return active;
  } catch (e) {}
  try {
    return Session.getEffectiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function saveAlertEmail(email) {
  const clean = String(email || '').trim();
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { success: false, error: 'Некорректный email' };
  }
  PropertiesService.getUserProperties().setProperty(ALERT_EMAIL_PROP, clean);
  return { success: true, email: clean };
}

function maskTelegramToken_(token) {
  const raw = String(token || '');
  if (raw.length < 8) return '';
  return '••••' + raw.slice(-4);
}

function normalizeTelegramToken_(token) {
  return String(token || '').replace(/\s+/g, '').trim();
}

function isValidTelegramToken_(token) {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(normalizeTelegramToken_(token));
}

function getTelegramSettings_() {
  const props = PropertiesService.getUserProperties();
  return {
    token: props.getProperty(TELEGRAM_BOT_TOKEN_PROP) || '',
    chatId: props.getProperty(TELEGRAM_CHAT_ID_PROP) || '',
    botUsername: props.getProperty(TELEGRAM_BOT_USERNAME_PROP) || '',
    chatLabel: props.getProperty(TELEGRAM_CHAT_LABEL_PROP) || ''
  };
}

function telegramStatusFromSettings_(settings) {
  const s = settings || getTelegramSettings_();
  return {
    hasToken: !!s.token,
    tokenHint: s.token ? maskTelegramToken_(s.token) : '',
    botUsername: s.botUsername || '',
    chatId: s.chatId || '',
    chatLabel: s.chatLabel || '',
    connected: !!(s.token && s.chatId)
  };
}

function getTelegramBotStatus() {
  return telegramStatusFromSettings_(getTelegramSettings_());
}

function telegramApi_(token, method, payload) {
  const cleanToken = normalizeTelegramToken_(token);
  const methodName = String(method || '').split('?')[0];
  const url = 'https://api.telegram.org/bot' + cleanToken + '/' + methodName;
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
    followRedirects: true
  };
  const response = UrlFetchApp.fetch(url, options);
  let body = {};
  try {
    body = JSON.parse(response.getContentText() || '{}');
  } catch (e) {
    throw new Error('Telegram вернул не JSON (HTTP ' + response.getResponseCode() + ')');
  }
  if (!body.ok) {
    throw new Error(body.description || ('Telegram: ошибка ' + response.getResponseCode()));
  }
  return body.result;
}

function telegramChatLabel_(chat) {
  if (!chat) return '';
  if (chat.username) return '@' + chat.username;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim();
  return name || ('чат ' + chat.id);
}

function chatFromTelegramUpdate_(upd) {
  if (!upd) return null;
  const msg = upd.message || upd.edited_message;
  if (msg && msg.chat) {
    return { chat: msg.chat, text: String(msg.text || ''), source: 'message' };
  }
  const member = upd.my_chat_member;
  if (member && member.chat) {
    const status = member.new_chat_member && member.new_chat_member.status;
    return {
      chat: member.chat,
      text: (status === 'member' || status === 'restricted') ? '/start' : String(status || ''),
      source: 'my_chat_member'
    };
  }
  return null;
}

function pickPrivateTelegramChat_(updates) {
  let found = null;
  let foundStart = null;
  (updates || []).forEach(function(upd) {
    const parsed = chatFromTelegramUpdate_(upd);
    if (!parsed || !parsed.chat || parsed.chat.type !== 'private') return;
    found = parsed.chat;
    if (String(parsed.text || '').indexOf('/start') === 0) foundStart = parsed.chat;
  });
  return foundStart || found;
}

function fetchTelegramUpdates_(token) {
  telegramApi_(token, 'deleteWebhook', { drop_pending_updates: false });
  const allowed = ['message', 'edited_message', 'my_chat_member'];
  let updates = telegramApi_(token, 'getUpdates', {
    limit: 100,
    timeout: 0,
    allowed_updates: allowed
  }) || [];
  if (!updates.length) {
    updates = telegramApi_(token, 'getUpdates', {
      limit: 100,
      timeout: 0,
      allowed_updates: allowed
    }) || [];
  }
  if (!updates.length) {
    updates = telegramApi_(token, 'getUpdates', {
      limit: 100,
      timeout: 20,
      allowed_updates: allowed
    }) || [];
  }
  return updates;
}

function bindTelegramChat_(token, chat) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(TELEGRAM_CHAT_ID_PROP, String(chat.id));
  props.setProperty(TELEGRAM_CHAT_LABEL_PROP, telegramChatLabel_(chat));
  sendTelegramMessage_(
    token,
    chat.id,
    'Vault подключён. Уведомления по цене будут приходить только в этот чат — тот, кто найдёт бота поиском, их не увидит.'
  );
  return {
    success: true,
    status: getTelegramBotStatus(),
    message: 'Чат привязан: ' + telegramChatLabel_(chat) + '. Тестовое сообщение уже в Telegram.'
  };
}

function parseTelegramChatId_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.replace(/\s/g, '').match(/-?\d{5,}/);
  return m ? m[0] : '';
}

function isTelegramChatNotFound_(error) {
  const msg = String((error && error.message) || error || '').toLowerCase();
  return msg.indexOf('chat not found') !== -1 || msg.indexOf('bot was blocked') !== -1;
}

function botNumericIdFromToken_(token) {
  const clean = normalizeTelegramToken_(token);
  const part = clean.split(':')[0];
  return /^\d+$/.test(part) ? part : '';
}

function sendTelegramMessage_(token, chatId, text) {
  const trimmed = String(text || '').substring(0, 4000);
  return telegramApi_(token, 'sendMessage', {
    chat_id: String(chatId),
    text: trimmed,
    disable_web_page_preview: true
  });
}

function tryBindTelegramChat_(token, chat, me) {
  const botId = String((me && me.id) || botNumericIdFromToken_(token) || '');
  if (botId && String(chat.id) === botId) {
    return {
      success: false,
      error: 'Это ID самого бота, а не ваш. Нужен ваш личный ID. Проще: нажмите «Подключить чат» без Chat ID и сразу напишите /start своему боту' +
        (me && me.username ? (' @' + me.username) : '') + '.'
    };
  }
  try {
    return bindTelegramChat_(token, chat);
  } catch (e) {
    if (!isTelegramChatNotFound_(e)) {
      return { success: false, error: 'Не удалось написать в чат: ' + e.message };
    }
    return { success: false, notFound: true, error: e.message };
  }
}

function connectByUpdatesOrWait_(token, me) {
  let updates = [];
  try {
    updates = fetchTelegramUpdates_(token) || [];
  } catch (e) {
    return { success: false, error: 'Не удалось прочитать чаты бота: ' + e.message };
  }
  const found = pickPrivateTelegramChat_(updates);
  if (found) return tryBindTelegramChat_(token, found, me);

  const hint = me && me.username ? ('@' + me.username) : 'своему боту';
  return {
    success: false,
    error: 'Бот ещё не видит ваш чат. Откройте именно ' + hint +
      ' (не @userinfobot), нажмите Start или напишите любое слово и сразу снова «Подключить чат». Поле Chat ID не нужно, если вы пишете боту в этот момент.'
  };
}

function saveTelegramBotToken(token) {
  const clean = normalizeTelegramToken_(token);
  if (!clean) {
    return { success: false, error: 'Вставьте токен бота от @BotFather' };
  }
  if (!isValidTelegramToken_(clean)) {
    return { success: false, error: 'Не похоже на токен бота. Он выглядит так: 123456789:AAH...' };
  }

  let me;
  try {
    me = telegramApi_(clean, 'getMe');
  } catch (e) {
    return { success: false, error: 'Telegram не принял токен: ' + e.message };
  }

  const props = PropertiesService.getUserProperties();
  const prev = props.getProperty(TELEGRAM_BOT_TOKEN_PROP) || '';
  props.setProperty(TELEGRAM_BOT_TOKEN_PROP, clean);
  props.setProperty(TELEGRAM_BOT_USERNAME_PROP, me.username || '');
  if (prev && prev !== clean) {
    props.deleteProperty(TELEGRAM_CHAT_ID_PROP);
    props.deleteProperty(TELEGRAM_CHAT_LABEL_PROP);
  }

  return {
    success: true,
    status: getTelegramBotStatus(),
    message: me.username
      ? ('Токен сохранён. Откройте @' + me.username + ' в Telegram, нажмите Start, затем «Подключить чат».')
      : 'Токен сохранён. Напишите боту /start, затем нажмите «Подключить чат».'
  };
}

function clearTelegramChatBinding_() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(TELEGRAM_CHAT_ID_PROP);
  props.deleteProperty(TELEGRAM_CHAT_LABEL_PROP);
}

function connectTelegramChat(chatIdOverride) {
  const settings = getTelegramSettings_();
  if (!settings.token) {
    return { success: false, error: 'Сначала сохраните токен бота' };
  }

  let me;
  try {
    me = telegramApi_(settings.token, 'getMe');
  } catch (e) {
    return { success: false, error: 'Не удалось обратиться к боту: ' + e.message };
  }

  const props = PropertiesService.getUserProperties();
  props.setProperty(TELEGRAM_BOT_USERNAME_PROP, me.username || '');

  const manualId = parseTelegramChatId_(chatIdOverride);
  if (String(chatIdOverride || '').trim() && !manualId) {
    return { success: false, error: 'Не удалось разобрать Chat ID. Нужно число, например 123456789 — не токен и не @username.' };
  }

  if (manualId) {
    const bound = tryBindTelegramChat_(settings.token, { id: manualId, first_name: 'чат ' + manualId }, me);
    if (bound.success) return bound;
    if (!bound.notFound) return bound;
    clearTelegramChatBinding_();
    const viaUpdates = connectByUpdatesOrWait_(settings.token, me);
    if (viaUpdates.success) return viaUpdates;
    return {
      success: false,
      error: 'Chat not found: бот не знает этот чат. Очистите поле Chat ID, нажмите «Подключить чат» и сразу напишите /start своему боту' +
        (me.username ? (' @' + me.username) : '') +
        '. Не вставляйте число из токена (до двоеточия) — это ID бота, не ваш.'
    };
  }

  if (settings.chatId) {
    try {
      sendTelegramMessage_(
        settings.token,
        settings.chatId,
        'Vault: чат уже привязан. Уведомления по цене будут приходить только сюда.'
      );
      return {
        success: true,
        status: getTelegramBotStatus(),
        message: 'Чат уже привязан' + (settings.chatLabel ? (': ' + settings.chatLabel) : '') + '.'
      };
    } catch (e) {
      // Старый ID (бота, userinfobot без /start и т.п.) — забываем и ловим свежий /start.
      clearTelegramChatBinding_();
    }
  }

  return connectByUpdatesOrWait_(settings.token, me);
}

function disconnectTelegramBot() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(TELEGRAM_BOT_TOKEN_PROP);
  props.deleteProperty(TELEGRAM_CHAT_ID_PROP);
  props.deleteProperty(TELEGRAM_BOT_USERNAME_PROP);
  props.deleteProperty(TELEGRAM_CHAT_LABEL_PROP);
  return { success: true, status: getTelegramBotStatus() };
}

function escapeEmailHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEmailMoney_(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 6);
  const sign = n < 0 ? '-' : '';
  return sign + '$' + abs.toFixed(digits);
}

function formatEmailPct_(n, digits) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return sign + n.toFixed(digits == null ? 2 : digits) + '%';
}

function formatEmailQty_(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return String(parseFloat(n.toFixed(8)));
}

function formatEmailDate_(ms) {
  if (!ms) return '—';
  try {
    const tz = Session.getScriptTimeZone() || 'GMT+5';
    return Utilities.formatDate(new Date(ms), tz, 'dd.MM.yyyy HH:mm');
  } catch (e) {
    return new Date(ms).toLocaleString('ru-RU');
  }
}

function describeCoinForEmail_(coin) {
  const key = normalizeCoinKey(coin) || String(coin || '');
  const meta = readCoinMeta(key) || {};
  const ucid = meta.id || (isNumericId(key) ? key : (resolvePortfolioCoinId(key) || ''));
  const symbol = meta.symbol || (!isNumericId(key) ? key : '');
  const name = meta.name || symbol || key;
  const title = symbol && name && String(name).toUpperCase() !== String(symbol).toUpperCase()
    ? (name + ' (' + symbol + ')')
    : (name || key);
  return { key: key, name: name, symbol: symbol, ucid: ucid, title: title };
}

function kvPlain_(label, value) {
  return label + ': ' + value;
}

function kvHtml_(label, value) {
  return '<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">' +
    escapeEmailHtml_(label) + '</td><td style="padding:4px 0;color:#111;">' +
    escapeEmailHtml_(value) + '</td></tr>';
}

function sectionHtml_(title, rowsHtml) {
  return '<h3 style="margin:20px 0 8px;font-size:14px;color:#0f766e;">' + escapeEmailHtml_(title) + '</h3>' +
    '<table style="border-collapse:collapse;font-size:14px;line-height:1.45;">' + rowsHtml + '</table>';
}

/**
 * Собирает тему и текст письма по ценовому алерту: монета, порог, текущая
 * цена, позиция и все сохранённые параметры уведомления.
 */
function buildPriceAlertEmail_(opts) {
  const alert = opts.alert || {};
  const h = opts.holding || {};
  const coin = describeCoinForEmail_(alert.coin);
  const isTest = !!opts.isTest;
  const price = (typeof opts.price === 'number' && isFinite(opts.price)) ? opts.price : null;
  const avgBuy = h.avgBuy > 0 ? h.avgBuy : 0;
  const amount = h.amount > 0 ? h.amount : 0;
  const costBasis = h.costBasis > 0 ? h.costBasis : 0;
  const thresholdPct = parseFloat(alert.thresholdPct);
  const isUp = thresholdPct > 0;
  const targetPrice = avgBuy > 0 && isFinite(thresholdPct) ? avgBuy * (1 + thresholdPct / 100) : null;
  const pnlPct = (avgBuy > 0 && price !== null) ? ((price - avgBuy) / avgBuy) * 100 : null;
  const pnlAbsPerCoin = (avgBuy > 0 && price !== null) ? (price - avgBuy) : null;
  const marketValue = (amount > 0 && price !== null) ? amount * price : null;
  const unrealized = (marketValue !== null && costBasis > 0) ? (marketValue - costBasis) : null;
  const cacheInfo = getPriceCacheInfo();
  const execUrl = opts.execUrl || getWebAppExecUrl();

  const direction = isUp ? 'рост' : 'падение';
  const whatHappened = !isFinite(thresholdPct)
    ? 'Порог уведомления не задан.'
    : (isUp
      ? ('Цена выросла и пересекла порог ' + formatEmailPct_(thresholdPct) + ' от точки входа.')
      : ('Цена упала и пробила порог ' + formatEmailPct_(thresholdPct) + ' от точки входа.'));

  const subject = isTest
    ? ('Vault: тест уведомлений — ' + coin.title)
    : ('Vault: ' + coin.title + ' ' + (isUp ? 'достигла' : 'упала до') + ' ' + formatEmailPct_(thresholdPct) + ' от входа');

  const introPlain = isTest
    ? 'Это тестовое письмо от Vault. Если вы его получили, отправка на этот адрес работает. Ниже — как выглядит настоящее уведомление и какие параметры сейчас сохранены.'
    : ('Сработало уведомление по цене: ' + whatHappened);

  const coinRows = [
    ['Название', coin.name || '—'],
    ['Тикер', coin.symbol || '—'],
    ['UCID (CoinMarketCap)', coin.ucid ? String(coin.ucid) : '—'],
    ['Ключ в портфеле', coin.key || '—']
  ];

  const eventRows = [
    ['Что произошло', isTest ? ('Пример: уведомление сработает, когда цена ' + (isUp ? 'вырастет на ' : 'упадёт на ') + formatEmailPct_(Math.abs(thresholdPct)) + ' от точки входа.') : whatHappened],
    ['Направление', direction],
    ['Порог от точки входа', isFinite(thresholdPct) ? formatEmailPct_(thresholdPct) : '—'],
    ['Целевая цена порога', targetPrice !== null ? formatEmailMoney_(targetPrice) : 'нет точки входа'],
    ['Точка входа', avgBuy > 0 ? formatEmailMoney_(avgBuy) : 'нет открытой позиции'],
    ['Текущая цена', price !== null ? formatEmailMoney_(price) : 'нет данных'],
    ['Изменение от входа', pnlPct !== null ? (formatEmailPct_(pnlPct) + (pnlAbsPerCoin !== null ? ' (' + (pnlAbsPerCoin >= 0 ? '+' : '') + formatEmailMoney_(pnlAbsPerCoin) + ' за монету)' : '')) : '—']
  ];

  const posRows = [
    ['Количество', amount > 0 ? (formatEmailQty_(amount) + (coin.symbol ? (' ' + coin.symbol) : '')) : 'нет открытой позиции'],
    ['Вложено', costBasis > 0 ? formatEmailMoney_(costBasis) : '—'],
    ['Рыночная стоимость', marketValue !== null ? formatEmailMoney_(marketValue) : '—'],
    ['Нереализованный P&L', unrealized !== null ? ((unrealized >= 0 ? '+' : '') + formatEmailMoney_(unrealized) + (pnlPct !== null ? ' (' + formatEmailPct_(pnlPct) + ')' : '')) : '—']
  ];

  const paramRows = [
    ['ID уведомления', alert.id ? String(alert.id) : '—'],
    ['Монета', coin.title],
    ['Тип', isUp ? 'уведомить при росте' : 'уведомить при падении'],
    ['Порог, % от точки входа', isFinite(thresholdPct) ? formatEmailPct_(thresholdPct) : '—'],
    ['Целевая цена', targetPrice !== null ? formatEmailMoney_(targetPrice) : '—'],
    ['Включено', alert.enabled === false ? 'нет' : 'да'],
    ['Уже срабатывало', alert.triggered ? 'да' : 'нет'],
    ['Создано', formatEmailDate_(alert.createdAt)],
    ['Сработало', isTest ? 'это тест, уведомление не отмечено как сработавшее' : formatEmailDate_(opts.triggeredAt || Date.now())],
    ['Адрес доставки', opts.email || '—'],
    ['Последняя синхронизация цен', cacheInfo.lastSuccessfulSyncAt ? formatEmailDate_(cacheInfo.lastSuccessfulSyncAt) : '—'],
    ['Проверка', 'раз в час серверным триггером, даже если приложение закрыто']
  ];

  function rowsToPlain(title, rows) {
    return [title].concat(rows.map(function(r) { return '  ' + kvPlain_(r[0], r[1]); })).join('\n');
  }

  const footerPlain = [
    'Это уведомление одноразовое: после срабатывания оно удаляется из списка в приложении. Чтобы получить его снова, добавьте порог заново.',
    execUrl ? ('Открыть портфель: ' + execUrl) : ''
  ].filter(Boolean).join('\n\n');

  const extraPlain = opts.extraPlain ? ('\n\n' + opts.extraPlain) : '';

  const body = [
    'Vault — крипто-портфель',
    '',
    introPlain,
    '',
    rowsToPlain('Монета', coinRows),
    '',
    rowsToPlain('Срабатывание', eventRows),
    '',
    rowsToPlain('Позиция', posRows),
    '',
    rowsToPlain('Параметры уведомления', paramRows),
    extraPlain,
    '',
    footerPlain
  ].join('\n');

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.5;max-width:640px;">',
    '<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Vault — крипто-портфель</p>',
    '<h2 style="margin:0 0 12px;font-size:20px;">' + escapeEmailHtml_(isTest ? 'Тестовое уведомление' : (coin.title + ' — порог ' + formatEmailPct_(thresholdPct))) + '</h2>',
    '<p style="margin:0 0 8px;">' + escapeEmailHtml_(introPlain) + '</p>',
    sectionHtml_('Монета', coinRows.map(function(r) { return kvHtml_(r[0], r[1]); }).join('')),
    sectionHtml_('Срабатывание', eventRows.map(function(r) { return kvHtml_(r[0], r[1]); }).join('')),
    sectionHtml_('Позиция', posRows.map(function(r) { return kvHtml_(r[0], r[1]); }).join('')),
    sectionHtml_('Параметры уведомления', paramRows.map(function(r) { return kvHtml_(r[0], r[1]); }).join('')),
    opts.extraHtml || '',
    '<p style="margin:24px 0 8px;font-size:13px;color:#555;">Это уведомление одноразовое: после срабатывания оно удаляется из списка в приложении. Чтобы получить его снова, добавьте порог заново.</p>',
    execUrl ? ('<p style="margin:0;"><a href="' + escapeEmailHtml_(execUrl) + '">Открыть портфель</a></p>') : '',
    '</div>'
  ].join('');

  return { subject: subject, body: body, htmlBody: html };
}

function buildTelegramAlertText_(opts) {
  const alert = opts.alert || {};
  const h = opts.holding || {};
  const coin = describeCoinForEmail_(alert.coin);
  const isTest = !!opts.isTest;
  const price = (typeof opts.price === 'number' && isFinite(opts.price)) ? opts.price : null;
  const avgBuy = h.avgBuy > 0 ? h.avgBuy : 0;
  const amount = h.amount > 0 ? h.amount : 0;
  const costBasis = h.costBasis > 0 ? h.costBasis : 0;
  const thresholdPct = parseFloat(alert.thresholdPct);
  const isUp = thresholdPct > 0;
  const targetPrice = avgBuy > 0 && isFinite(thresholdPct) ? avgBuy * (1 + thresholdPct / 100) : null;
  const pnlPct = (avgBuy > 0 && price !== null) ? ((price - avgBuy) / avgBuy) * 100 : null;
  const marketValue = (amount > 0 && price !== null) ? amount * price : null;
  const unrealized = (marketValue !== null && costBasis > 0) ? (marketValue - costBasis) : null;
  const execUrl = opts.execUrl || getWebAppExecUrl();
  const whatHappened = !isFinite(thresholdPct)
    ? 'Порог не задан.'
    : (isUp
      ? ('Цена выросла и пересекла порог ' + formatEmailPct_(thresholdPct) + ' от точки входа.')
      : ('Цена упала и пробила порог ' + formatEmailPct_(thresholdPct) + ' от точки входа.'));

  const lines = [
    isTest ? 'Vault — тестовое уведомление' : 'Vault — сработало уведомление',
    '',
    coin.title || alert.coin || '—',
    isTest
      ? ('Пример: сработает, когда цена ' + (isUp ? 'вырастет на ' : 'упадёт на ') + formatEmailPct_(Math.abs(thresholdPct)) + ' от входа.')
      : whatHappened,
    '',
    'Точка входа: ' + (avgBuy > 0 ? formatEmailMoney_(avgBuy) : 'нет позиции'),
    'Сейчас: ' + (price !== null ? formatEmailMoney_(price) : 'нет данных') +
      (pnlPct !== null ? ('  (' + formatEmailPct_(pnlPct) + ')') : ''),
    'Цель порога: ' + (targetPrice !== null ? formatEmailMoney_(targetPrice) : '—'),
    '',
    'Количество: ' + (amount > 0 ? (formatEmailQty_(amount) + (coin.symbol ? (' ' + coin.symbol) : '')) : '—'),
    'Вложено: ' + (costBasis > 0 ? formatEmailMoney_(costBasis) : '—'),
    'Стоимость: ' + (marketValue !== null ? formatEmailMoney_(marketValue) : '—'),
    'P&L: ' + (unrealized !== null
      ? ((unrealized >= 0 ? '+' : '') + formatEmailMoney_(unrealized) + (pnlPct !== null ? (' (' + formatEmailPct_(pnlPct) + ')') : ''))
      : '—'),
    '',
    'Тип: ' + (isUp ? 'рост' : 'падение') +
      (isFinite(thresholdPct) ? (', порог ' + formatEmailPct_(thresholdPct)) : ''),
    'ID: ' + (alert.id || '—'),
    'Сработало: ' + (isTest ? 'это тест, алерт не отключён' : formatEmailDate_(opts.triggeredAt || Date.now())),
    '',
    'Одноразовое уведомление. После срабатывания оно удаляется из списка. Чтобы получить снова — добавьте порог заново.'
  ];
  if (execUrl) lines.push('Портфель: ' + execUrl);
  return lines.join('\n');
}

function sendMail_(to, message) {
  MailApp.sendEmail({
    to: to,
    subject: message.subject,
    body: message.body,
    htmlBody: message.htmlBody,
    name: 'Vault'
  });
}

function formatAlertListForEmail_(alerts) {
  if (!alerts || !alerts.length) {
    return {
      plain: 'Настроенных уведомлений пока нет.',
      html: '<p style="margin:16px 0 0;color:#555;">Настроенных уведомлений пока нет.</p>'
    };
  }

  const holdings = computeHoldingsSnapshot_();
  const lines = alerts.map(function(a, i) {
    const coin = describeCoinForEmail_(a.coin);
    const h = holdings[a.coin] || {};
    const price = readCachedPrice(a.coin);
    const avgBuy = h.avgBuy > 0 ? h.avgBuy : 0;
    const target = avgBuy > 0 ? avgBuy * (1 + a.thresholdPct / 100) : null;
    const pnlPct = (avgBuy > 0 && typeof price === 'number') ? ((price - avgBuy) / avgBuy) * 100 : null;
    return [
      (i + 1) + ') ' + coin.title,
      '    Порог: ' + formatEmailPct_(a.thresholdPct) + ' от точки входа' + (target !== null ? ' (цель ' + formatEmailMoney_(target) + ')' : ''),
      '    Сейчас: ' + (typeof price === 'number' ? formatEmailMoney_(price) : 'нет цены') +
        (pnlPct !== null ? ', от входа ' + formatEmailPct_(pnlPct) : ''),
      '    Статус: ' + (a.enabled === false ? 'выключено' : 'включено') + ', ' + (a.triggered ? 'уже сработало ' + formatEmailDate_(a.triggeredAt) : 'ждёт срабатывания'),
      '    Создано: ' + formatEmailDate_(a.createdAt) + ' · ID ' + a.id
    ].join('\n');
  });

  const htmlRows = alerts.map(function(a) {
    const coin = describeCoinForEmail_(a.coin);
    const h = holdings[a.coin] || {};
    const price = readCachedPrice(a.coin);
    const avgBuy = h.avgBuy > 0 ? h.avgBuy : 0;
    const target = avgBuy > 0 ? avgBuy * (1 + a.thresholdPct / 100) : null;
    const pnlPct = (avgBuy > 0 && typeof price === 'number') ? ((price - avgBuy) / avgBuy) * 100 : null;
    return '<tr>' +
      '<td style="padding:6px 12px 6px 0;vertical-align:top;"><strong>' + escapeEmailHtml_(coin.title) + '</strong></td>' +
      '<td style="padding:6px 12px 6px 0;vertical-align:top;">' + escapeEmailHtml_(formatEmailPct_(a.thresholdPct)) +
        (target !== null ? '<br><span style="color:#666;">цель ' + escapeEmailHtml_(formatEmailMoney_(target)) + '</span>' : '') + '</td>' +
      '<td style="padding:6px 12px 6px 0;vertical-align:top;">' +
        escapeEmailHtml_(typeof price === 'number' ? formatEmailMoney_(price) : 'нет цены') +
        (pnlPct !== null ? '<br><span style="color:#666;">' + escapeEmailHtml_(formatEmailPct_(pnlPct)) + '</span>' : '') + '</td>' +
      '<td style="padding:6px 0;vertical-align:top;">' +
        escapeEmailHtml_(a.triggered ? ('сработало ' + formatEmailDate_(a.triggeredAt)) : 'ждёт') + '</td></tr>';
  }).join('');

  return {
    plain: 'Все настроенные уведомления:\n\n' + lines.join('\n\n'),
    html: '<h3 style="margin:20px 0 8px;font-size:14px;color:#0f766e;">Все настроенные уведомления</h3>' +
      '<table style="border-collapse:collapse;font-size:14px;line-height:1.4;width:100%;">' +
      '<tr style="color:#666;font-size:12px;"><td style="padding:0 12px 6px 0;">Монета</td><td style="padding:0 12px 6px 0;">Порог</td><td style="padding:0 12px 6px 0;">Сейчас</td><td style="padding:0 0 6px;">Статус</td></tr>' +
      htmlRows + '</table>'
  };
}

/**
 * Отправляет тестовое письмо на указанный (или уже сохранённый) адрес —
 * чтобы проверить, что отправка вообще работает, не дожидаясь реального
 * срабатывания алерта. В письмо попадает полный набор параметров.
 */
function sendTestAlertEmail(email) {
  const clean = String(email || '').trim() || getAlertEmail();
  if (!clean) {
    return { success: false, error: 'Укажите email' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { success: false, error: 'Некорректный email' };
  }

  try {
    const alerts = getPriceAlerts();
    const holdings = computeHoldingsSnapshot_();
    const sample = alerts.filter(function(a) { return a.enabled; })[0] || alerts[0] || {
      id: 'test',
      coin: '—',
      thresholdPct: 20,
      enabled: true,
      triggered: false,
      createdAt: Date.now()
    };
    const holding = holdings[sample.coin] || {};
    const listBlock = formatAlertListForEmail_(alerts);
    const message = buildPriceAlertEmail_({
      isTest: true,
      alert: sample,
      holding: holding,
      price: sample.coin && sample.coin !== '—' ? readCachedPrice(sample.coin) : null,
      email: clean,
      extraPlain: listBlock.plain,
      extraHtml: listBlock.html
    });
    sendMail_(clean, message);
    return { success: true, email: clean };
  } catch (e) {
    return { success: false, error: isMailAuthError_(e) ? formatMailAuthError_() : String(e) };
  }
}

function sendTestTelegramAlert() {
  const settings = getTelegramSettings_();
  if (!settings.token) {
    return { success: false, error: 'Сначала сохраните токен бота' };
  }
  if (!settings.chatId) {
    return { success: false, error: 'Сначала напишите боту /start и нажмите «Подключить чат»' };
  }

  try {
    const alerts = getPriceAlerts();
    const holdings = computeHoldingsSnapshot_();
    const sample = alerts.filter(function(a) { return a.enabled; })[0] || alerts[0] || {
      id: 'test',
      coin: '—',
      thresholdPct: 20,
      enabled: true,
      triggered: false,
      createdAt: Date.now()
    };
    const text = buildTelegramAlertText_({
      isTest: true,
      alert: sample,
      holding: holdings[sample.coin] || {},
      price: sample.coin && sample.coin !== '—' ? readCachedPrice(sample.coin) : null
    });
    sendTelegramMessage_(settings.token, settings.chatId, text);
    return { success: true, status: getTelegramBotStatus() };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}

function addPriceAlert(coin, thresholdPct) {
  const coinFormatted = normalizeCoinKey(coin);
  const pct = parseFloat(thresholdPct);

  if (!coinFormatted) return { success: false, error: 'Укажите монету' };
  if (!isFinite(pct) || pct === 0) {
    return { success: false, error: 'Укажите ненулевой процент (например, 20 для роста или -10 для падения)' };
  }

  const list = getPriceAlerts();
  const alert = {
    id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
    coin: coinFormatted,
    thresholdPct: pct,
    enabled: true,
    triggered: false,
    createdAt: Date.now(),
    triggeredAt: null
  };
  list.unshift(alert);
  savePriceAlerts_(list);
  return { success: true, alerts: list };
}

function deletePriceAlert(id) {
  const list = getPriceAlerts().filter(function(a) { return String(a.id) !== String(id); });
  savePriceAlerts_(list);
  return { success: true, alerts: list };
}

function resetPriceAlert(id) {
  const list = getPriceAlerts().map(function(a) {
    if (String(a.id) === String(id)) {
      a.triggered = false;
      a.triggeredAt = null;
    }
    return a;
  });
  savePriceAlerts_(list);
  return { success: true, alerts: list };
}

/**
 * Считает текущий остаток и точку входа по каждой монете тем же гибридным
 * методом (усреднённая цена покупки + сброс в 0 при полном отбитии капитала),
 * что и клиентский calculatePortfolio() в index.html. Нужен отдельно здесь,
 * потому что проверка алертов идёт по серверному триггеру, без открытого
 * браузера — клиентский расчёт в этот момент недоступен.
 */
function computeHoldingsSnapshot_() {
  const info = getDealsSheet(false);
  if (!info.sheet) return {};

  const parsed = readTransactionsFromSheet(info.sheet);
  const sorted = parsed.transactions.slice().sort(function(a, b) {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });

  const holdings = {};

  sorted.forEach(function(tx) {
    if (!holdings[tx.coin]) {
      holdings[tx.coin] = { amount: 0, totalBought: 0, totalSoldCash: 0, costBasis: 0, avgBuy: 0 };
    }
    const h = holdings[tx.coin];

    if (tx.type === 'Покупка') {
      const cost = tx.total || (tx.price * tx.amount);
      h.amount += tx.amount;
      h.totalBought += cost;
      h.costBasis += cost;
    } else if (tx.type === 'Аирдроп') {
      h.amount += tx.amount;
    } else if (tx.type === 'Скам') {
      h.amount += tx.amount || 1;
      h.totalBought += tx.total;
      h.costBasis += tx.total;
    } else if (tx.type === 'Продажа') {
      const avgBeforeSale = h.amount > 0 ? h.costBasis / h.amount : 0;
      const soldAmount = Math.min(tx.amount, h.amount);
      const costRemoved = avgBeforeSale * soldAmount;
      h.amount -= tx.amount;
      h.costBasis = Math.max(0, h.costBasis - costRemoved);
      // Перенос просадки: капитал не «отбит» выручкой — стоимость уехала в другую монету.
      if (!isDrawdownSwapNote_(tx.note)) {
        h.totalSoldCash += tx.total;
      }
    }

    if (h.amount <= 0.00000001) h.amount = 0;

    if (h.totalBought > 0 && h.totalSoldCash >= h.totalBought - 0.000001) {
      h.costBasis = 0;
    }

    h.avgBuy = h.amount > 0 && h.costBasis > 0 ? h.costBasis / h.amount : 0;
  });

  return holdings;
}

/**
 * Вызывается из updateAllCoins() каждый час. Для каждого включённого и ещё не
 * сработавшего алерта сравнивает текущий % изменения цены от точки входа с
 * порогом; при достижении — шлёт письмо/Telegram и удаляет уведомление
 * из списка, чтобы не слать его каждый час.
 */
function checkPriceAlerts() {
  const alerts = getPriceAlerts();
  const active = alerts.filter(function(a) { return a.enabled && !a.triggered; });
  if (active.length === 0) return { checked: 0, triggered: 0 };

  const holdings = computeHoldingsSnapshot_();
  const email = getAlertEmail();
  const telegram = getTelegramSettings_();
  const execUrl = getWebAppExecUrl();
  const canEmail = !!email;
  const canTelegram = !!(telegram.token && telegram.chatId);
  let triggeredCount = 0;
  const remaining = [];

  alerts.forEach(function(alert) {
    if (alert.triggered) return;

    const h = holdings[alert.coin];
    const price = readCachedPrice(alert.coin);
    const canCheck = !!(alert.enabled && h && h.amount > 0 && h.avgBuy > 0 && typeof price === 'number' && !isNaN(price));
    let crossed = false;
    if (canCheck) {
      const pnlPct = ((price - h.avgBuy) / h.avgBuy) * 100;
      const isUpAlert = alert.thresholdPct > 0;
      crossed = isUpAlert ? pnlPct >= alert.thresholdPct : pnlPct <= alert.thresholdPct;
    }

    if (!crossed || (!canEmail && !canTelegram)) {
      remaining.push(alert);
      return;
    }

    const triggeredAt = Date.now();
    const message = buildPriceAlertEmail_({
      isTest: false,
      alert: alert,
      holding: h,
      price: price,
      email: email,
      execUrl: execUrl,
      triggeredAt: triggeredAt
    });
    const telegramText = buildTelegramAlertText_({
      isTest: false,
      alert: alert,
      holding: h,
      price: price,
      execUrl: execUrl,
      triggeredAt: triggeredAt
    });

    let delivered = false;

    if (canTelegram) {
      try {
        sendTelegramMessage_(telegram.token, telegram.chatId, telegramText);
        delivered = true;
      } catch (e) {
        Logger.log('checkPriceAlerts telegram error: ' + e);
      }
    }

    if (canEmail) {
      try {
        sendMail_(email, message);
        delivered = true;
      } catch (e) {
        Logger.log('checkPriceAlerts email error: ' + e);
      }
    }

    if (delivered) {
      triggeredCount++;
      return;
    }
    remaining.push(alert);
  });

  savePriceAlerts_(remaining);
  return { checked: active.length, triggered: triggeredCount };
}

function processChunk(chunk, type, cache) {
  const param = type === 'symbol' ? 'symbol' : 'id';
  const values = chunk.join(',');
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?' + param + '=' + encodeURIComponent(values);

  const options = {
    method: "GET",
    headers: { "X-CMC_PRO_API_KEY": API_KEY, "Accept": "application/json" },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const rawBody = response.getContentText();

    if (statusCode !== 200) {
      return { updated: 0, error: 'HTTP ' + statusCode + ': ' + rawBody, apiCalled: true };
    }

    const data = JSON.parse(rawBody);
    if (data.status && data.status.error_code !== 0) {
      return {
        updated: 0,
        error: data.status.error_message || ('CMC error ' + data.status.error_code),
        apiCalled: true
      };
    }

    let updated = 0;

    chunk.forEach(function(identifier) {
      const coinData = extractCoinData(data.data, type, identifier);
      if (!coinData) return;

      if (coinData.ambiguous) {
        if (type === 'symbol') markSymbolAmbiguous(identifier);
        return;
      }

      if (type === 'id' && String(coinData.id) !== String(identifier)) return;

      storeCoinPrice(coinData, cache);
      updated++;
    });

    return {
      updated: updated,
      error: updated > 0 ? null : 'Нет данных в ответе API',
      apiCalled: true
    };
  } catch (err) {
    return { updated: 0, error: err.toString(), apiCalled: true };
  }
}

// Диагностика API — запусти вручную в редакторе Apps Script
function testApiForSui() {
  const cache = CacheService.getScriptCache();
  const result = fetchSingleCoinPrice('SUI', cache);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Первый запуск в редакторе Apps Script:
 * 1) authorizeExternalRequests → Разрешить
 * 2) authorizeSendMail → Разрешить (письма с алертами по цене)
 * 3) setupAutoUpdate → Разрешить (фоновая синхронизация каждый час, API — раз в 4 ч.)
 */
function setupAutoUpdate() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'updateAllCoins') ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('updateAllCoins').timeBased().everyHours(1).create();
  return {
    success: true,
    message: 'Триггер установлен: проверка каждый час, запрос к CoinMarketCap — не чаще раза в 4 часа.',
    autoSync: getAutoSyncStatus()
  };
}

/** То же, что setupAutoUpdate — для явной авторизации триггеров в редакторе. */
function authorizeBackgroundSync() {
  return setupAutoUpdate();
}