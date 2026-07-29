/**
 * StoreIntel — Opportunity Report Ingestion Engine
 * Version: ingestion_opp_v1.2.js
 * Date:    2026-07-29 (v1.2: fixed column-index offset bug in
 *          parseOppMappingTemplate — see note below)
 * Platform: Mobile PWA (Vanilla JS, runs in-browser via SheetJS)
 *
 * v1.2 CHANGE FROM v1.1:
 *   parseOppMappingTemplate() was reporting 0 fields on correctly filled
 *   mapping templates. Root cause: XLSX.utils.sheet_to_json(ws,
 *   {header:1}) indexes each row array relative to the sheet's ACTUAL
 *   USED RANGE, not literal spreadsheet columns. This template's used
 *   range starts at column B (column A is blank), so row[0] was really
 *   column B, row[1] = C, row[2] = D, row[3] = E — everything shifted
 *   one column right of what the code assumed (row[2] = C = universal
 *   field name 'np_xxx', row[3] = D = store's column name). In practice
 *   row[2] was reading column D's already-filled value ("DATE", "RSO
 *   NAME", etc.) instead of column C's "np_date" etc. — since those
 *   values never start with "np_", every row silently failed the
 *   `universal.startsWith('np_')` check and got skipped, producing
 *   filledCount = 0 regardless of how correctly the template was filled.
 *   FIX: force the parsed range to start at true column A (index 0)
 *   via an explicit `range` option, so row[N] always means column
 *   N+1 (A=0, B=1, C=2, D=3...) exactly as the rest of the function
 *   assumes, regardless of which column the sheet's content happens
 *   to start at.
 *
 * Purpose:
 *   Reads a store's Opportunity Register (NP file) uploaded via file picker,
 *   maps columns to universal Opportunity Schema using the stored mapping,
 *   normalises values, and returns a clean array of row objects ready for
 *   analysis_opp_v1.0.js.
 *
 * Mirrors:
 *   opp_ingestion_v1.0.py (Web Python) — must produce identical rows
 *   for identical input. Any difference is a parity defect (R2).
 *
 * Dependencies:
 *   SheetJS (xlsx.full.min.js) — must be loaded before this module.
 *   Mapping stored in localStorage key: 'si_opp_mapping_b64'
 *
 * Standing rules (R1–R4):
 *   R1 — This file is versioned: ingestion_opp_v1.2.js
 *   R2 — Output schema identical to opp_ingestion_v1.0.py
 *   R3 — Core schema sector-neutral. Sector fields additive.
 *   R4 — Jewellery first. Leather/Apparel defined but not active.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL OPPORTUNITY SCHEMA — mirrors opp_ingestion_v1.0.py
// ─────────────────────────────────────────────────────────────────────────────

const OPP_MANDATORY_FIELDS = new Set([
  'np_date', 'np_salesperson', 'np_reason', 'np_category', 'np_value'
]);

// Canonical reason values — maps raw store values to standard set
const NP_REASON_MAP = {
  'DESIGN':       'DESIGN',
  'AMC':          'PRICE',   // AMC = making charges = price complaint
  'PRICE':        'PRICE',
  'MC':           'PRICE',
  'MAKING':       'PRICE',
  'SIZE':         'SIZE',
  'WEIGHT':       'WEIGHT',
  'AVAILABILITY': 'AVAILABILITY',
  'NOT AVAILABLE':'AVAILABILITY',
  'OTHER':        'OTHER',
};

const CUSTOMER_TYPE_MAP = {
  'NEW':       'NEW',
  'OLD':       'RETURNING',
  'RETURNING': 'RETURNING',
  'EXISTING':  'RETURNING',
};

const OCCASION_MAP = {
  'DAILY WEAR': 'DAILY WEAR',
  'DAILY':      'DAILY WEAR',
  'FUNCTION':   'FUNCTION',
  'GIFTING':    'GIFTING',
  'GIFT':       'GIFTING',
};

// Competitor keywords — scanned in remarks (uppercase match)
const COMPETITOR_KEYWORDS = [
  'TANISHQ','GRT','MALABAR','LALITHA','KALYAN',
  'JOY ALUKKAS','PC JEWELLER','TBZ','SENCO',
  'LOCAL STORE','LOCAL',
  'HIDESIGN','BAGGIT','CAPRESE',
  'ZARA','H&M','WESTSIDE','MAX',
];


// ─────────────────────────────────────────────────────────────────────────────
// MAPPING TEMPLATE READER
// Reads the Opportunity Mapping Template (xlsx) stored as base64
// in localStorage key 'si_opp_mapping_b64'
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the Opportunity Mapping Template from base64 string.
 * Returns { mapping: {universal_field: store_col}, storeName, sector, filledCount }
 * Sheet: 'Opportunity Mapping'
 * Col index 2 = Universal Field Name (np_xxx)
 * Col index 3 = Store's Column Name (filled by store owner)
 */
function parseOppMappingTemplate(base64String) {
  const mapping     = {};
  let storeName     = '';
  let sector        = 'jewellery';
  let filledCount   = 0;

  try {
    const wb = XLSX.read(base64String, { type: 'base64' });
    const sheetName = wb.SheetNames.find(n => n === 'Opportunity Mapping')
                   || wb.SheetNames[1]; // fallback to second sheet
    if (!sheetName) return { mapping, storeName, sector, filledCount };

    const ws = wb.Sheets[sheetName];

    // v1.2 FIX: force column indexing to start at true column A (index 0),
    // regardless of which column the sheet's used range actually begins at.
    // Without this, sheet_to_json's row arrays are indexed relative to the
    // sheet's leftmost USED column — if that's column B (column A blank,
    // as in this template), every row[N] silently shifts one column right
    // of what the rest of this function assumes.
    const range = XLSX.utils.decode_range(ws['!ref']);
    range.s.c = 0;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range });

    // Row index 6 (0-based) = row 7 in Excel = store name / sector row
    if (rows[6]) {
      storeName = String(rows[6][3] || '').trim();
      const sectorRaw = String(rows[6][4] || '').trim().toLowerCase();
      if (sectorRaw.includes('leather'))          sector = 'leather';
      else if (sectorRaw.includes('apparel') ||
               sectorRaw.includes('clothing'))    sector = 'apparel';
      else                                         sector = 'jewellery';
    }

    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const universal = String(row[2] || '').trim();
      const storeCol  = String(row[3] || '').trim();

      if (!universal.startsWith('np_'))        continue;
      if (!storeCol || storeCol === 'nan')     continue;
      if (storeCol.includes('← FILL THIS IN')) continue;

      mapping[universal] = storeCol;
      filledCount++;
    }
  } catch (e) {
    console.error('[OPP INGESTION] Error parsing mapping template:', e);
  }

  return { mapping, storeName, sector, filledCount };
}

/**
 * Auto-detect column mapping when no template is available.
 * Matches known Opportunity Register column patterns (case-insensitive).
 * Returns best-effort mapping dict.
 */
function autoDetectOppMapping(columns) {
  const colLower = {};
  for (const c of columns) colLower[c.toLowerCase().trim()] = c;

  const patterns = {
    np_date:              ['date','visit date','np date'],
    np_salesperson:               ['rso name','rso','staff name','executive','salesperson'],
    np_reason:            ['np reason','reason','why np','npreason'],
    np_category:          ['category','product category','item'],
    np_value:             ['value','amount','price','product value'],
    np_customer_name:     ['customer name','client name','name'],
    np_mobile:            ['mobile','phone','contact','mobile no'],
    np_customer_type:     ['new/old customer','new/old','customer type'],
    np_occasion:          ['occation','occasion','purpose'],
    np_gender:            ['gender'],
    np_product_shown:     ['product avl','product available','available'],
    np_alternate_offered: ['endless aisle','ea','alternate'],
    np_team:              ['team'],
    np_remarks:           ['remarks','notes','comments'],
    np_attended_by:       ['attended by','supervised by'],
    np_design_req:        ['design req','design request'],
    np_quantity:          ['quantity','qty','pieces'],
    // Jewellery
    np_karat:             ['karat','purity','karatage'],
    np_gold_rate:         ['gold rate','rate'],
    np_weight_g:          ['weight','grams','wt'],
    np_cluster:           ['cluster'],
    np_amc_pct:           ['amc','making charge','mc'],
    np_size:              ['size/length','size','length'],
    np_dia_carat:         ['dia carat','diamond carat','carats'],
  };

  const mapping = {};
  for (const [field, keywords] of Object.entries(patterns)) {
    for (const kw of keywords) {
      if (colLower[kw]) { mapping[field] = colLower[kw]; break; }
    }
  }
  return mapping;
}


// ─────────────────────────────────────────────────────────────────────────────
// DATE PARSING — mirrors Python _parse_date()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a date value from any common format.
 * Returns { date: Date, str: 'YYYY-MM-DD', month: 'YYYY-MM', week: 'YYYY-Www' }
 * or null if unparseable.
 */
function parseOppDate(val) {
  if (val === null || val === undefined || val === '') return null;

  // JS Date object (SheetJS cellDates:true)
  if (val instanceof Date && !isNaN(val)) {
    return _dateParts(val);
  }

  // SheetJS serial number
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const dt = new Date(d.y, d.m - 1, d.d);
      return _dateParts(dt);
    }
  }

  // String formats
  const s = String(val).replace(/\s+/g, '').trim();
  if (!s || s.toLowerCase() === 'nan') return null;

  const formats = [
    // DD.MM.YYYY
    { re: /^(\d{2})\.(\d{2})\.(\d{4})$/, order: [3,2,1] },
    // DD/MM/YYYY
    { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: [3,2,1] },
    // YYYY-MM-DD
    { re: /^(\d{4})-(\d{2})-(\d{2})$/, order: [1,2,3] },
    // DD-MM-YYYY
    { re: /^(\d{2})-(\d{2})-(\d{4})$/, order: [3,2,1] },
    // MM/DD/YYYY
    { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: [3,1,2] },
  ];

  for (const { re, order } of formats) {
    const m = s.match(re);
    if (m) {
      const yr = parseInt(m[order[0]]);
      const mo = parseInt(m[order[1]]) - 1;
      const dy = parseInt(m[order[2]]);
      const dt = new Date(yr, mo, dy);
      if (!isNaN(dt)) return _dateParts(dt);
    }
  }

  // Last resort: native Date parse
  const dt = new Date(s);
  if (!isNaN(dt)) return _dateParts(dt);

  return null;
}

function _dateParts(dt) {
  const yr  = dt.getFullYear();
  const mo  = String(dt.getMonth() + 1).padStart(2, '0');
  const dy  = String(dt.getDate()).padStart(2, '0');
  const str = `${yr}-${mo}-${dy}`;
  const month = `${yr}-${mo}`;

  // ISO week number
  const jan4 = new Date(yr, 0, 4);
  const week = Math.ceil((((dt - jan4) / 86400000) + jan4.getDay() + 1) / 7);
  const weekStr = `${yr}-W${String(week).padStart(2, '0')}`;

  return { date: dt, str, month, week: weekStr };
}


// ─────────────────────────────────────────────────────────────────────────────
// NORMALISATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normReason(val) {
  if (!val || val === null) return 'OTHER';
  const s = String(val).toUpperCase().trim();
  for (const [key, canon] of Object.entries(NP_REASON_MAP)) {
    if (s.includes(key)) return canon;
  }
  return 'OTHER';
}

function normBool(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).toUpperCase().trim();
  if (s === 'YES' || s === 'Y') return true;
  if (s === 'NO'  || s === 'N') return false;
  return null;
}

function normStr(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s && s.toLowerCase() !== 'nan' ? s : null;
}

function normNum(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function toTitleCase(s) {
  if (!s) return null;
  return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}

function extractCompetitor(remarks) {
  if (!remarks) return '';
  const up = String(remarks).toUpperCase();
  return COMPETITOR_KEYWORDS.filter(c => up.includes(c)).join(', ');
}


// ─────────────────────────────────────────────────────────────────────────────
// APPLY MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rename raw columns to universal field names using the mapping.
 * Returns array of row objects with universal field names.
 */
function applyOppMapping(rawRows, mapping) {
  // Build reverse: storeCol → universalField
  const reverseMap = {};
  for (const [univ, storeCol] of Object.entries(mapping)) {
    reverseMap[storeCol] = univ;
  }

  return rawRows.map(raw => {
    const row = {};
    for (const [col, val] of Object.entries(raw)) {
      const univ = reverseMap[col];
      if (univ) row[univ] = val;
    }
    return row;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// NORMALISE — mirrors Python normalise_opp()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise mapped rows to universal Opportunity Schema.
 * Output must match opp_ingestion_v1.0.py normalise_opp() exactly (R2).
 *
 * @param {Array}  mappedRows - rows with universal field names
 * @param {string} sector     - 'jewellery' | 'leather' | 'apparel'
 * @returns {Array} clean normalised rows
 */
function normaliseOpp(mappedRows, sector = 'jewellery') {
  const now = new Date();
  const rows = [];

  for (const raw of mappedRows) {
    const row = {};

    // ── Tier 1 — Mandatory ──────────────────────────────────────────────────
    const dt = parseOppDate(raw.np_date);

    // Flag but keep rows with clearly wrong year (typos like 2027 in 2026 file)
    const yearOk = dt && Math.abs(dt.date.getFullYear() - now.getFullYear()) <= 2;

    row.np_date     = dt && yearOk ? dt.str    : (dt ? dt.str : null);
    row.np_date_str = row.np_date;
    row.np_month    = dt && yearOk ? dt.month  : (dt ? dt.month : null);
    row.np_week     = dt && yearOk ? dt.week   : (dt ? dt.week  : null);

    row.np_salesperson      = toTitleCase(normStr(raw.np_salesperson));
    row.np_reason   = normReason(raw.np_reason);
    row.np_category = normStr(raw.np_category) ? String(raw.np_category).toUpperCase().trim() : null;
    row.np_value    = normNum(raw.np_value, 0);

    // ── Tier 2 — Recommended ────────────────────────────────────────────────
    row.np_customer_name  = toTitleCase(normStr(raw.np_customer_name));
    row.np_mobile         = normStr(raw.np_mobile);
    row.np_customer_type  = CUSTOMER_TYPE_MAP[String(raw.np_customer_type || '').toUpperCase().trim()] || null;
    row.np_occasion       = OCCASION_MAP[String(raw.np_occasion || '').toUpperCase().trim()]
                            || (normStr(raw.np_occasion) ? String(raw.np_occasion).toUpperCase().trim() : null);
    row.np_gender         = normStr(raw.np_gender) ? String(raw.np_gender).toUpperCase().trim() : null;
    row.np_product_shown  = normBool(raw.np_product_shown);
    row.np_alternate_offered = normBool(raw.np_alternate_offered);
    row.np_team           = normStr(raw.np_team) ? String(raw.np_team).toUpperCase().trim() : null;
    row.np_remarks        = normStr(raw.np_remarks);

    // ── Tier 4 — Optional ───────────────────────────────────────────────────
    row.np_attended_by    = toTitleCase(normStr(raw.np_attended_by));
    row.np_design_req     = normStr(raw.np_design_req) ? String(raw.np_design_req).toUpperCase().trim() : null;
    row.np_quantity       = Math.max(1, Math.round(normNum(raw.np_quantity, 1)));
    row.np_competitor_ref = extractCompetitor(row.np_remarks);

    // ── Sector-specific fields ───────────────────────────────────────────────
    if (sector === 'jewellery') {
      const karat = normNum(raw.np_karat, 0);
      row.np_karat     = karat > 0 ? karat : null;
      const rate  = normNum(raw.np_gold_rate, 0);
      row.np_gold_rate = rate > 0 ? rate : null;
      const wt    = normNum(raw.np_weight_g, 0);
      row.np_weight_g  = wt > 0 ? wt : null;
      row.np_cluster   = normStr(raw.np_cluster) ? String(raw.np_cluster).toUpperCase().trim() : null;
      const amc   = normNum(raw.np_amc_pct, 0);
      row.np_amc_pct   = amc > 0 ? amc : null;
      row.np_size      = normStr(raw.np_size) ? String(raw.np_size).toUpperCase().trim() : null;
      row.np_dia_carat = normStr(raw.np_dia_carat);

    } else if (sector === 'leather') {
      // Leather — defined, not yet active (R4)
      row.np_material   = normStr(raw.np_material);
      row.np_colour     = normStr(raw.np_colour);
      row.np_sku_type   = normStr(raw.np_sku_type);
      row.np_price_band = normStr(raw.np_price_band);

    } else if (sector === 'apparel') {
      // Apparel — defined, not yet active (R4)
      row.np_size_apparel    = normStr(raw.np_size_apparel);
      row.np_colour_apparel  = normStr(raw.np_colour_apparel);
      row.np_fit             = normStr(raw.np_fit);
      row.np_collection      = normStr(raw.np_collection);
      row.np_fabric          = normStr(raw.np_fabric);
    }

    // Skip completely empty records (no date and no value)
    if (!row.np_date && row.np_value === 0) continue;

    rows.push(row);
  }

  return rows;
}


// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION — mirrors Python validate_opp()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run post-normalisation validation.
 * Returns summary object — used in report header and console log.
 * Output must match opp_ingestion_v1.0.py validate_opp() (R2).
 */
function validateOpp(cleanRows, mapping) {
  const total      = cleanRows.length;
  const totalValue = cleanRows.reduce((s, r) => s + (r.np_value || 0), 0);
  const avgValue   = total > 0 ? totalValue / total : 0;

  const dates = cleanRows.map(r => r.np_date).filter(Boolean).sort();
  const dateMin = dates[0]  || null;
  const dateMax = dates[dates.length - 1] || null;

  // Period label
  let periodLabel = '';
  if (dateMin && dateMax) {
    const d1 = new Date(dateMin);
    const d2 = new Date(dateMax);
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
      periodLabel = `${months[d1.getMonth()]} ${d1.getFullYear()}`;
    } else if (d1.getFullYear() === d2.getFullYear()) {
      periodLabel = `${months[d1.getMonth()]} – ${months[d2.getMonth()]} ${d1.getFullYear()}`;
    } else {
      periodLabel = `${months[d1.getMonth()]} ${d1.getFullYear()} – ${months[d2.getMonth()]} ${d2.getFullYear()}`;
    }
  }

  // Reason counts
  const reasonCounts = {};
  for (const r of cleanRows) {
    reasonCounts[r.np_reason] = (reasonCounts[r.np_reason] || 0) + 1;
  }

  const missing = [...OPP_MANDATORY_FIELDS].filter(f => !(f in mapping));

  return {
    total_records:    total,
    total_value:      Math.round(totalValue),
    avg_value:        Math.round(avgValue),
    date_min:         dateMin,
    date_max:         dateMax,
    period_label:     periodLabel,
    reason_counts:    reasonCounts,
    missing_mandatory: missing,
    fields_mapped:    Object.keys(mapping).length,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT — called by app.js on file upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main ingestion entry point for Mobile PWA.
 *
 * @param {ArrayBuffer} fileBuffer  - NP file as ArrayBuffer (from FileReader)
 * @param {string}      sector      - 'jewellery' | 'leather' | 'apparel'
 * @returns {Object} { cleanRows, validation, mapping, storeName }
 *
 * Mapping is loaded from localStorage 'si_opp_mapping_b64'.
 * Falls back to auto-detection if not found.
 */
function ingestOpportunity(fileBuffer, sector = 'jewellery') {
  console.log('[OPP INGESTION] v1.2 — starting ingestion');

  // Step 1: Read file with SheetJS
  const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });

  // Pick sheet with most rows
  let bestSheet = null, bestRows = -1;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (rows.length > bestRows) { bestRows = rows.length; bestSheet = name; }
  }

  const ws      = wb.Sheets[bestSheet];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`[OPP INGESTION] Sheet: '${bestSheet}', Rows: ${rawRows.length}`);

  // Step 2: Load mapping
  let mapping  = {};
  let storeName = '';

  const savedMapping = localStorage.getItem('si_opp_mapping_b64');
  if (savedMapping) {
    const tmpl = parseOppMappingTemplate(savedMapping);
    mapping   = tmpl.mapping;
    storeName = tmpl.storeName;
    if (tmpl.sector && tmpl.sector !== 'jewellery') sector = tmpl.sector;
    console.log(`[OPP INGESTION] Mapping from template: ${tmpl.filledCount} fields`);
  } else {
    const cols = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    mapping = autoDetectOppMapping(cols);
    console.log(`[OPP INGESTION] Auto-detected mapping: ${Object.keys(mapping).length} fields`);
  }

  // Check mandatory fields
  const missing = [...OPP_MANDATORY_FIELDS].filter(f => !(f in mapping));
  if (missing.length > 0) {
    console.warn(`[OPP INGESTION] Missing mandatory fields: ${missing.join(', ')}`);
  }

  // Step 3: Apply mapping
  const mappedRows = applyOppMapping(rawRows, mapping);

  // Step 4: Normalise
  const cleanRows = normaliseOpp(mappedRows, sector);
  console.log(`[OPP INGESTION] Records normalised: ${cleanRows.length}`);

  // Step 5: Validate
  const validation = validateOpp(cleanRows, mapping);
  console.log('[OPP INGESTION] Complete:', {
    records:     validation.total_records,
    totalValue:  validation.total_value,
    period:      validation.period_label,
    reasonCounts: validation.reason_counts,
  });

  return { cleanRows, validation, mapping, storeName, sector };
}


/**
 * Save Opportunity Mapping Template to localStorage.
 * Called when the store owner uploads their mapping file in the UI.
 *
 * @param {ArrayBuffer} fileBuffer - mapping template file as ArrayBuffer
 */
function saveOppMappingTemplate(fileBuffer) {
  // IMPORTANT: Do not use btoa(binary) — it breaks on binary data with bytes > 255.
  // Callers must pass a proper base64 string obtained via FileReader.readAsDataURL().
  // The fileBuffer param here accepts EITHER:
  //   (a) ArrayBuffer — converts safely using Uint8Array chunk method
  //   (b) base64 string (from readAsDataURL, prefix stripped) — stored directly
  let b64;
  if (typeof fileBuffer === 'string') {
    // Already base64 (stripped of data URL prefix by caller)
    b64 = fileBuffer;
  } else {
    // ArrayBuffer → base64 via chunk method (safe for all byte values)
    const bytes = new Uint8Array(fileBuffer);
    let binary  = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    b64 = btoa(binary);
  }
  localStorage.setItem('si_opp_mapping_b64', b64);

  const tmpl = parseOppMappingTemplate(b64);
  console.log(`[OPP MAPPING] Saved. Fields: ${tmpl.filledCount}, Store: '${tmpl.storeName}', Sector: ${tmpl.sector}`);
  return tmpl;
}


// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  // Node/test environment
  module.exports = {
    ingestOpportunity,
    saveOppMappingTemplate,
    parseOppMappingTemplate,
    normaliseOpp,
    validateOpp,
    parseOppDate,
    NP_REASON_MAP,
    OPP_MANDATORY_FIELDS,
  };
}
