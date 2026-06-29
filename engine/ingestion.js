/* StoreIntel — ingestion.js
   Port of ingestion.py + column_detector.py + template_mapper.py
   Runs entirely in the browser. No server. No upload.
   Requires: SheetJS (xlsx) loaded before this file.
*/

'use strict';

// ── UNIVERSAL SCHEMA ──────────────────────────────────────────────
const UNIVERSAL_SCHEMA = [
  'staff_name','customer_name','customer_id',
  'category_l1','category_l2',
  'gross_value','discount_amount','tax_amount','net_value',
  'transaction_date','transaction_time','transaction_hour',
  'transaction_type','is_sale',
  'weight','extra_field',
];

// ── JEWELLERY CONFIG (from jewellery_config.json) ─────────────────
const JEWELLERY_CONFIG = {
  sector: 'jewellery',
  sale_transaction_values:   ['CM','SALE','INV','CASH','CARD','BILL'],
  return_transaction_values: ['GRN','RETURN','VOID','CANCEL','CR'],
  pos_fingerprints: {
    mia_retail_pos: {
      required_columns: ['TOT Category','RSO Name','Gross Amount','Doc Date'],
      mapping: {
        staff_name:       'RSO Name',
        customer_name:    'Customer Name',
        customer_id:      null,
        category_l1:      'TOT Category',
        category_l2:      'Product Category Description',
        gross_value:      'Gross Amount',
        discount_amount:  'Overall Total Discount ( Item Level + Bill Level)',
        tax_amount:       'Total Tax (SGST, CGST, UTGST, IGST)',
        transaction_date: 'Doc Date',
        transaction_time: 'Time Of Sale',
        transaction_type: 'Transaction Type',
        weight:           'Gross Wt',
        extra_field:      'Karatage',
      }
    }
  }
};

// ── AUTO-KNOWN COLUMN PATTERNS (from column_detector.py) ──────────
const AUTO_KNOWN = {
  // Core fields — fuzzy keyword matching
  'rso':               { field: 'staff_name' },
  'salesperson':       { field: 'staff_name' },
  'staff':             { field: 'staff_name' },
  'agent':             { field: 'staff_name' },
  'cashier':           { field: 'staff_name' },
  'customer name':     { field: 'customer_name' },
  'client':            { field: 'customer_name' },
  'guest':             { field: 'customer_name' },
  'member':            { field: 'customer_name' },
  'customer id':       { field: 'customer_id' },
  'loyalty':           { field: 'customer_id' },
  'member id':         { field: 'customer_id' },
  'tot category':      { field: 'category_l1' },
  'category':          { field: 'category_l1' },
  'department':        { field: 'category_l1' },
  'section':           { field: 'category_l1' },
  'product category':  { field: 'category_l2' },
  'sub category':      { field: 'category_l2' },
  'item category':     { field: 'category_l2' },
  'gross amount':      { field: 'gross_value' },
  'ucp':               { field: 'gross_value' },
  'transprice':        { field: 'gross_value' },
  'sale amount':       { field: 'gross_value' },
  'bill amount':       { field: 'gross_value' },
  'total amount':      { field: 'gross_value' },
  'net amount':        { field: 'net_value' },
  'discount':          { field: 'discount_amount' },
  'disc ':             { field: 'discount_amount' },
  'concession':        { field: 'discount_amount' },
  'tax':               { field: 'tax_amount' },
  'gst':               { field: 'tax_amount' },
  'sgst':              { field: 'tax_amount' },
  'cgst':              { field: 'tax_amount' },
  'vat':               { field: 'tax_amount' },
  'doc date':          { field: 'transaction_date' },
  'bill date':         { field: 'transaction_date' },
  'sale date':         { field: 'transaction_date' },
  'txn date':          { field: 'transaction_date' },
  'invoice date':      { field: 'transaction_date' },
  'time of sale':      { field: 'transaction_time' },
  'bill time':         { field: 'transaction_time' },
  'txn time':          { field: 'transaction_time' },
  'transaction type':  { field: 'transaction_type' },
  'txn type':          { field: 'transaction_type' },
  'bill type':         { field: 'transaction_type' },
  'gross wt':          { field: 'weight' },
  'gross weight':      { field: 'weight' },
  'karatage':          { field: 'extra_field' },
  'karat':             { field: 'extra_field' },
  'purity':            { field: 'extra_field' },
  // skip always
  'mobile':   { field: null, skip: true },
  'phone':    { field: null, skip: true },
  'doc no':   { field: null, skip: true },
  'remarks':  { field: null, skip: true },
  'item code':{ field: null, skip: true },
};

// ── FRIENDLY LABELS for the mapping wizard UI ─────────────────────
const FIELD_LABELS = {
  gross_value:      'Gross Sale Amount ★',
  transaction_date: 'Invoice / Bill Date ★',
  category_l1:      'Product Category ★',
  staff_name:       'Salesperson / RSO',
  customer_name:    'Customer Name',
  customer_id:      'Customer ID',
  category_l2:      'Product Sub-type',
  discount_amount:  'Discount Amount',
  tax_amount:       'Tax / GST Amount',
  net_value:        'Net Amount',
  transaction_time: 'Time of Sale',
  transaction_type: 'Transaction Type (Sale/Return)',
  weight:           'Gross Weight (grams)',
  extra_field:      'Karatage / Purity',
};

const MANDATORY_FIELDS = ['gross_value','transaction_date','category_l1'];

// ─────────────────────────────────────────────────────────────────
// STEP 1 — READ FILE (SheetJS)
// ─────────────────────────────────────────────────────────────────
function readExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  // Pick the sheet with the most rows
  let bestSheet = null, bestRows = -1;
  for (const name of workbook.SheetNames) {
    const ws   = workbook.Sheets[name];
    const ref  = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const rows  = range.e.r - range.s.r;
    if (rows > bestRows) { bestRows = rows; bestSheet = name; }
  }

  if (!bestSheet) throw new Error('No usable sheet found in this file.');

  const ws   = workbook.Sheets[bestSheet];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  // Detect real header row (same logic as Python's _detect_header_row)
  const headerRowIdx = detectHeaderRow(raw);
  const headers      = raw[headerRowIdx].map(h => h == null ? '' : String(h).trim());

  const rows = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = raw[i][j] ?? null; });
    rows.push(row);
  }

  return { rows, columns: headers.filter(Boolean), sheetName: bestSheet };
}

function detectHeaderRow(rawRows) {
  // Score each row: real header rows have many string values, few numbers
  let bestRow = 0, bestScore = -1;
  const ncols = rawRows[0]?.length || 1;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row      = rawRows[i] || [];
    const nonNull  = row.filter(v => v != null).length;
    const fillRate = nonNull / ncols;
    if (fillRate < 0.35) continue;
    const strCount = row.filter(v => v != null && typeof v === 'string').length;
    if (strCount > bestScore) { bestScore = strCount; bestRow = i; }
  }
  return bestRow;
}

// ─────────────────────────────────────────────────────────────────
// STEP 2 — AUTO-DETECT MAPPING
// ─────────────────────────────────────────────────────────────────
function detectPosSystem(columns, config) {
  for (const [system, fp] of Object.entries(config.pos_fingerprints || {})) {
    const required = fp.required_columns || [];
    if (required.every(rc => columns.includes(rc))) return system;
  }
  return 'unknown';
}

function autoMap(columns, config) {
  // Try known POS first
  const pos = detectPosSystem(columns, config);
  if (pos !== 'unknown') {
    return { mapping: { ...config.pos_fingerprints[pos].mapping }, pos, confidence: 'exact' };
  }

  // Fuzzy match against AUTO_KNOWN patterns
  const mapping = {};
  const colLower = columns.map(c => ({ orig: c, lower: c.toLowerCase().trim() }));

  for (const { orig, lower } of colLower) {
    // Check each pattern
    for (const [pattern, info] of Object.entries(AUTO_KNOWN)) {
      if (lower.includes(pattern)) {
        if (info.skip) break;
        if (info.field && !mapping[info.field]) {
          mapping[info.field] = orig;
        }
        break;
      }
    }
  }

  // Check mandatory coverage
  const missing = MANDATORY_FIELDS.filter(f => !mapping[f]);
  return { mapping, pos: 'unknown', confidence: missing.length === 0 ? 'fuzzy' : 'partial', missingMandatory: missing };
}

// ─────────────────────────────────────────────────────────────────
// STEP 3 — APPLY MAPPING + NORMALISE
// ─────────────────────────────────────────────────────────────────
function applyMapping(rows, mapping) {
  return rows.map(raw => {
    const row = {};
    for (const [field, clientCol] of Object.entries(mapping)) {
      row[field] = clientCol ? (raw[clientCol] ?? null) : null;
    }
    return row;
  });
}

function normalise(rows, config) {
  const saleVals   = config.sale_transaction_values.map(v => v.toUpperCase());
  const returnVals = config.return_transaction_values.map(v => v.toUpperCase());

  const cleaned = [];

  for (const row of rows) {
    // ── Numeric
    const grossVal = toNum(row.gross_value);
    if (grossVal === 0) continue; // skip zero-value rows

    const out = { ...row };
    out.gross_value     = grossVal;
    out.discount_amount = toNum(row.discount_amount);
    out.tax_amount      = toNum(row.tax_amount);
    out.net_value       = toNum(row.net_value);
    out.weight          = toNum(row.weight);

    // ── Extra numeric fields from mapping template
    const EXTRA_NUMERIC = [
      'making_charges','wastage','metal_value','diamond_weight_ct',
      'diamond_count','diamond_value','stone_weight_g','color_stone_value',
      'stone_value','net_value','tax_amount','gold_rate','platinum_rate',
      'net_gold_weight_g','quantity','cost_price',
    ];
    for (const f of EXTRA_NUMERIC) {
      if (row[f] !== undefined && row[f] !== null) {
        out[f] = toNum(row[f]);
      }
    }

    // ── Extra string/category fields
    const EXTRA_STRING = [
      'customer_city','customer_state','stone_type','metal_type',
      'branch','collection','sku','karigar','customer_type','source_channel',
    ];
    for (const f of EXTRA_STRING) {
      if (row[f] !== undefined && row[f] !== null) {
        out[f] = String(row[f]).trim() || null;
      }
    }

    // ── Date
    const parsedDate = parseDate(row.transaction_date);
    if (!parsedDate) continue; // drop rows with no date
    out.transaction_date = parsedDate.dateStr;   // 'YYYY-MM-DD'
    out.transaction_hour = parsedDate.hour;       // 0-23 or null

    // ── Time (separate column — higher priority)
    if (row.transaction_time !== null && row.transaction_time !== undefined) {
      const h = parseHour(row.transaction_time);
      if (h !== null) out.transaction_hour = h;
    }

    // ── is_sale flag
    if (row.transaction_type) {
      const t = String(row.transaction_type).toUpperCase().trim();
      out.is_sale = saleVals.includes(t) ? true
                  : returnVals.includes(t) ? false
                  : true; // default to sale if unknown
    } else {
      out.is_sale = grossVal >= 0;
    }

    // ── String cleanup
    for (const f of ['staff_name','customer_name','category_l1','category_l2']) {
      out[f] = out[f] ? toTitleCase(String(out[f]).trim()) : 'Unknown';
    }

    cleaned.push(out);
  }

  return cleaned;
}

// ── DATE PARSER ────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Try native Date (handles ISO, many Excel string formats)
  // Try DD-MM-YYYY and DD/MM/YYYY first (Indian format)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? '20' + y : y;
    const dt   = new Date(`${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    if (!isNaN(dt)) return { dateStr: dt.toISOString().slice(0,10), hour: null };
  }

  // ISO / other formats
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const hour = dt.getHours();
    return {
      dateStr: dt.toISOString().slice(0,10),
      hour:    hour !== 0 ? hour : null,  // treat midnight as "no time info"
    };
  }

  return null;
}

function parseHour(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  // Excel stores time as decimal fraction of a day (e.g. 0.5 = 12:00, 0.75 = 18:00)
  // SheetJS returns these as numbers between 0 and 1
  const n = parseFloat(raw);
  if (!isNaN(n) && n >= 0 && n < 1) {
    return Math.floor(n * 24);
  }

  // Also handles Excel serial numbers > 1 (datetime) — extract time part
  if (!isNaN(n) && n > 1) {
    const timePart = n - Math.floor(n);
    const h = Math.floor(timePart * 24);
    return h >= 0 && h <= 23 ? h : null;
  }

  const s = String(raw).trim();
  // HH:MM or HH:MM:SS
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) { const h = parseInt(hm[1]); return h >= 0 && h <= 23 ? h : null; }

  // ISO datetime string
  const dt = new Date(s);
  if (!isNaN(dt)) return dt.getHours();

  // Try 1970 prefix for bare time strings
  const dt2 = new Date(`1970-01-01T${s}`);
  if (!isNaN(dt2)) return dt2.getHours();

  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[,\s₹Rs]/gi, ''));
  return isNaN(n) ? 0 : n;
}

function toTitleCase(s) {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─────────────────────────────────────────────────────────────────
// STEP 4 — SAVE / LOAD MAPPING PROFILE (localStorage)
// ─────────────────────────────────────────────────────────────────
function profileKey(storeName) {
  return 'si_profile_' + storeName.toLowerCase().replace(/\s+/g,'_');
}

function saveProfile(storeName, mapping, pos) {
  const profile = { storeName, mapping, pos, savedAt: new Date().toISOString() };
  try { localStorage.setItem(profileKey(storeName), JSON.stringify(profile)); } catch(e) {}
}

function loadProfile(storeName) {
  try {
    const raw = localStorage.getItem(profileKey(storeName));
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function deleteProfile(storeName) {
  try { localStorage.removeItem(profileKey(storeName)); } catch(e) {}
}

// ─────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────
function ingest(arrayBuffer, storeName, config = JEWELLERY_CONFIG, savedMapping = null) {
  // 1. Read file
  const { rows, columns } = readExcel(arrayBuffer);
  if (!rows.length) throw new Error('File appears to be empty or has no data rows.');

  // 2. Determine mapping
  let mapping, pos, confidence, missingMandatory;
  if (savedMapping) {
    mapping = savedMapping;
    pos     = 'saved';
    confidence = 'saved';
    missingMandatory = [];
  } else {
    const detected = autoMap(columns, config);
    mapping          = detected.mapping;
    pos              = detected.pos;
    confidence       = detected.confidence;
    missingMandatory = detected.missingMandatory || [];
  }

  // 3. Apply + normalise
  const mapped  = applyMapping(rows, mapping);
  const cleaned = normalise(mapped, config);

  if (!cleaned.length) throw new Error('No valid sales rows found after parsing. Check column mapping.');

  return {
    rows:             cleaned,
    columns,
    mapping,
    pos,
    confidence,
    missingMandatory,
    needsWizard:      confidence === 'partial' || missingMandatory.length > 0,
    config,
    rawRowCount:      rows.length,
  };
}

// ── EXPORTS ────────────────────────────────────────────────────────
window.Ingestion = {
  ingest,
  autoMap,
  readExcel,
  normalise,
  applyMapping,
  saveProfile,
  loadProfile,
  deleteProfile,
  JEWELLERY_CONFIG,
  FIELD_LABELS,
  MANDATORY_FIELDS,
};

// ─────────────────────────────────────────────────────────────────
// READ MAPPING FILE — port of template_mapper.py: read_template()
// Reads the StoreIntel_Column_Mapping_Template.xlsx filled by store
// Returns { mapping, filledCount, missingMandatory }
// ─────────────────────────────────────────────────────────────────

// Maps template field names → universal field names (from TEMPLATE_TO_UNIVERSAL)
const TEMPLATE_TO_UNIVERSAL = {
  'Gross Amount':                    'gross_value',
  'Invoice Date':                    'transaction_date',
  'Invoice Number':                  'invoice_number',
  'Quantity':                        'quantity',
  'Product Category':                'category_l1',
  'Salesperson':                     'staff_name',
  'Customer ID (Loyalty / POS Code)':'customer_id',
  'Transaction Time':                'transaction_time',
  'Discount Amount':                 'discount_amount',
  'Product Type':                    'category_l2',
  'Metal Type':                      'metal_type',
  'Purity / Karatage':               'extra_field',
  'Transaction Type':                'transaction_type',
  'Customer Name':                   'customer_name',
  'Diamond Weight (carats)':         'diamond_weight_ct',
  'Diamond Pieces / Count':          'diamond_count',
  'Diamond Value':                   'diamond_value',
  'Stone Type':                      'stone_type',
  'Stone Weight (grams)':            'stone_weight_g',
  'Stone Value':                     'color_stone_value',
  'Certification':                   'cert_no',
  'Metal Value':                     'metal_value',
  'Making Charges':                  'making_charges',
  'Wastage Charges':                 'wastage',
  'GST / Tax Amount':                'tax_amount',
  'Net Amount':                      'net_value',
  'Gross Weight (grams)':            'weight',
  'Net Gold Weight (grams)':         'net_gold_weight_g',
  'Customer City':                   'customer_city',
  'Customer State':                  'customer_state',
  'Customer Birthday':               'customer_birthday',
  'Customer Anniversary':            'customer_anniversary',
  'Customer Type':                   'customer_type',
  'Source / Channel':                'source_channel',
  'Branch / Store Code':             'branch',
  'Counter':                         'counter',
  'Gold Rate':                       'gold_rate',
};

function readMappingFile(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true });

  // Find "Column Mapping" sheet — or fall back to first sheet
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('column') || n.toLowerCase().includes('mapping')
  ) || workbook.SheetNames[0];

  if (!sheetName) throw new Error('No sheets found in mapping file.');

  const ws   = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  const mapping = {};
  let filledCount = 0;

  for (const row of rows) {
    // Template columns:
    // Col 0 = Tier (T1, T2…)
    // Col 1 = Field Name (e.g. "Gross Amount")
    // Col 2 = Description
    // Col 3 = Your Column Name ← user fills this
    // Col 4 = Example

    const tier      = row[0] != null ? String(row[0]).trim() : '';
    const fieldName = row[1] != null ? String(row[1]).trim() : '';
    const yourCol   = row[3] != null ? String(row[3]).trim() : '';

    // Skip non-data rows
    if (!tier.startsWith('T') || !fieldName) continue;
    // Skip unfilled or placeholder rows
    if (!yourCol || yourCol === '' || yourCol.toLowerCase().includes('fill this') ||
        yourCol.toLowerCase() === 'nan' || yourCol === 'null') continue;

    const universal = TEMPLATE_TO_UNIVERSAL[fieldName];
    if (!universal) continue;

    mapping[universal] = yourCol;
    filledCount++;
  }

  const missingMandatory = MANDATORY_FIELDS.filter(f => !mapping[f]);

  return { mapping, filledCount, missingMandatory };
}

// Add to exports
window.Ingestion.readMappingFile = readMappingFile;
window.Ingestion.TEMPLATE_TO_UNIVERSAL = TEMPLATE_TO_UNIVERSAL;
