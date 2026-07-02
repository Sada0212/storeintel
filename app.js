/* StoreIntel PWA — app.js v3
   Two-phase flow:
   SETUP (once): store name → upload mapping.xlsx → review → save
   MONTHLY:      pick POS excel → generate report
*/
'use strict';

// ── STATE ─────────────────────────────────────────────────────────
const state = {
  storeName:          '',
  mappingFileBuffer:  null,
  mappingFileName:    '',
  parsedMapping:      null,   // { mapping, filledCount, missingMandatory }
  posFileBuffer:      null,
  posFileName:        '',
  ingestResult:       null,
  deferredInstall:    null,
};

// ── STORAGE KEYS ──────────────────────────────────────────────────
const STORE_KEY      = 'si_store_name';
const MAPPING_KEY    = 'si_mapping';
const MAPPING_B64KEY = 'si_mapping_b64'; // raw mapping file as base64 — re-parsed fresh each time

function saveToStorage(storeName, mappingData, mappingB64 = null) {
  try {
    localStorage.setItem(STORE_KEY,   storeName);
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mappingData));
    if (mappingB64) localStorage.setItem(MAPPING_B64KEY, mappingB64);
  } catch(e) { console.warn('Storage save failed', e); }
}

function loadFromStorage() {
  try {
    const name    = localStorage.getItem(STORE_KEY);
    const mapping = localStorage.getItem(MAPPING_KEY);
    const b64     = localStorage.getItem(MAPPING_B64KEY);
    if (name && mapping) {
      // Always re-parse mapping from raw file if available — picks up any new field aliases
      if (b64) {
        try {
          const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
          const fresh = Ingestion.readMappingFile(buf);
          return { storeName: name, mappingData: fresh, mappingB64: b64 };
        } catch(e) { /* fall through to saved mapping */ }
      }
      return { storeName: name, mappingData: JSON.parse(mapping) };
    }
  } catch(e) {}
  return null;
}

function clearStorage() {
  try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(MAPPING_KEY); } catch(e) {}
}

// ── SCREEN ROUTER ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

// ── NETWORK STATUS ────────────────────────────────────────────────
function updateNetworkStatus() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  dot.className     = 'status-dot ' + (navigator.onLine ? 'online' : 'offline');
  label.textContent = navigator.onLine ? 'Online' : 'Offline';
}
window.addEventListener('online',  updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// ══════════════════════════════════════════════════════════════════
// SETUP SCREEN — store name + mapping file
// ══════════════════════════════════════════════════════════════════
function initSetupScreen() {
  const storeInput    = document.getElementById('setup-store-name');
  const mappingZone   = document.getElementById('mapping-upload-zone');
  const mappingInput  = document.getElementById('mapping-file-input');
  const mappingNameEl = document.getElementById('mapping-file-name');
  const continueBtn   = document.getElementById('btn-setup-continue');

  // Drag & drop
  mappingZone.addEventListener('dragover',  e => { e.preventDefault(); mappingZone.classList.add('drag-over'); });
  mappingZone.addEventListener('dragleave', ()  => mappingZone.classList.remove('drag-over'));
  mappingZone.addEventListener('drop', e => {
    e.preventDefault(); mappingZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleMappingFile(e.dataTransfer.files[0]);
  });
  mappingInput.addEventListener('change', () => {
    if (mappingInput.files[0]) handleMappingFile(mappingInput.files[0]);
  });

  storeInput.addEventListener('input', () => {
    state.storeName = storeInput.value.trim();
    checkSetupReady();
  });

  function handleMappingFile(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { showToast('Please pick the mapping .xlsx file'); return; }
    state.mappingFileName = file.name;
    mappingNameEl.textContent = file.name.length > 35
      ? file.name.substring(0, 32) + '...'
      : file.name;
    mappingNameEl.classList.remove('hidden');
    readFileAsArrayBuffer(file).then(buf => {
      state.mappingFileBuffer = buf;
      checkSetupReady();
    }).catch(() => showToast('Could not read that file'));
  }

  function checkSetupReady() {
    continueBtn.disabled = !(state.storeName && state.mappingFileBuffer);
  }

  continueBtn.addEventListener('click', () => {
    try {
      // Parse the mapping.xlsx using ingestion engine
      state.parsedMapping = Ingestion.readMappingFile(state.mappingFileBuffer);
      buildMappingReview(state.storeName, state.parsedMapping);
      showScreen('screen-mapping-review');
    } catch(err) {
      showError('Could not read the mapping file. Make sure it\'s the StoreIntel Column Mapping Template.\n\n' + err.message);
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// MAPPING REVIEW SCREEN
// ══════════════════════════════════════════════════════════════════
function buildMappingReview(storeName, parsed) {
  document.getElementById('review-store-name').textContent = storeName;

  const LABELS    = Ingestion.FIELD_LABELS;
  const MANDATORY = Ingestion.MANDATORY_FIELDS;
  const mapping   = parsed.mapping;

  // Mandatory rows
  const mandatoryEl = document.getElementById('review-mandatory-rows');
  mandatoryEl.innerHTML = MANDATORY.map(field => {
    const col     = mapping[field];
    const found   = !!col;
    const icon    = found ? '✅' : '❌';
    const colClass = found ? '' : 'mandatory-missing';
    const colText  = found ? col : 'NOT FOUND in mapping file';
    return `
      <div class="review-row">
        <span class="review-row-icon">${icon}</span>
        <span class="review-row-field">${LABELS[field] || field}</span>
        <span class="review-row-col ${colClass}">${colText}</span>
      </div>`;
  }).join('');

  // Optional rows — only show ones that ARE mapped
  const optionalEl = document.getElementById('review-optional-rows');
  const optional   = Object.keys(LABELS).filter(f => !MANDATORY.includes(f));
  const mappedOptional = optional.filter(f => mapping[f]);
  const unmappedOptional = optional.filter(f => !mapping[f]);

  optionalEl.innerHTML = [
    ...mappedOptional.map(field => `
      <div class="review-row">
        <span class="review-row-icon">✅</span>
        <span class="review-row-field">${LABELS[field] || field}</span>
        <span class="review-row-col">${mapping[field]}</span>
      </div>`),
    ...unmappedOptional.map(field => `
      <div class="review-row">
        <span class="review-row-icon" style="opacity:0.3">○</span>
        <span class="review-row-field">${LABELS[field] || field}</span>
        <span class="review-row-col not-found">not mapped</span>
      </div>`),
  ].join('');

  // Warning if mandatory fields missing
  const missingMandatory = MANDATORY.filter(f => !mapping[f]);
  const warningEl        = document.getElementById('review-warning');
  const confirmBtn       = document.getElementById('btn-review-confirm');

  if (missingMandatory.length > 0) {
    const missingNames = missingMandatory.map(f => LABELS[f] || f).join(', ');
    document.getElementById('review-warning-text').textContent =
      `Missing required fields: ${missingNames}. Please fill these in your mapping template and upload again.`;
    warningEl.classList.remove('hidden');
    confirmBtn.disabled = true;
  } else {
    warningEl.classList.add('hidden');
    confirmBtn.disabled = false;
  }
}

function initMappingReviewScreen() {
  document.getElementById('btn-review-back').addEventListener('click', () => showScreen('screen-setup'));

  document.getElementById('btn-review-confirm').addEventListener('click', () => {
    const saved = loadFromStorage();
    const isUpdate = !!saved; // already had a mapping before

    const mappingData = {
      mapping:      state.parsedMapping.mapping,
      filledCount:  state.parsedMapping.filledCount,
      savedAt:      new Date().toISOString(),
    };
    // Also save raw mapping file as base64 so it can be re-parsed fresh on every upload
    let mappingB64 = null;
    if (state.mappingFileBuffer) {
      try {
        const bytes = new Uint8Array(state.mappingFileBuffer);
        mappingB64 = btoa(String.fromCharCode(...bytes));
      } catch(e) {}
    }
    saveToStorage(state.storeName, mappingData, mappingB64);
    showToast(isUpdate ? 'Mapping updated ✓' : 'Mapping saved ✓');
    loadHomeScreen(state.storeName, mappingData);
    showScreen('screen-home');
  });
}

// ══════════════════════════════════════════════════════════════════
// HOME SCREEN — every month
// ══════════════════════════════════════════════════════════════════
function loadHomeScreen(storeName, mappingData) {
  document.getElementById('home-store-name').textContent = storeName;

  const LABELS    = Ingestion.FIELD_LABELS;
  const MANDATORY = Ingestion.MANDATORY_FIELDS;
  const mapping   = mappingData.mapping;

  // Status
  const missing = MANDATORY.filter(f => !mapping[f]);
  document.getElementById('home-mapping-status').textContent =
    missing.length === 0
      ? `${mappingData.filledCount} columns mapped`
      : `⚠ ${missing.length} required fields missing`;

  // Mapping summary rows (collapsible)
  const summaryRows = document.getElementById('mapping-summary-rows');
  summaryRows.innerHTML = Object.keys(LABELS).map(field => {
    const col   = mapping[field];
    const found = !!col;
    return `
      <div class="mapping-row">
        <span class="mcheck">${found ? '✓' : '○'}</span>
        <span class="mfield">${LABELS[field] || field}</span>
        <span class="mcol ${found ? '' : 'missing'}">${col || '—'}</span>
      </div>`;
  }).join('');
}

function initHomeScreen() {
  const posZone   = document.getElementById('pos-upload-zone');
  const posInput  = document.getElementById('pos-file-input');
  const posNameEl = document.getElementById('pos-file-name');
  const genBtn    = document.getElementById('btn-generate');

  posZone.addEventListener('dragover',  e => { e.preventDefault(); posZone.classList.add('drag-over'); });
  posZone.addEventListener('dragleave', ()  => posZone.classList.remove('drag-over'));
  posZone.addEventListener('drop', e => {
    e.preventDefault(); posZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handlePosFile(e.dataTransfer.files[0]);
  });
  posInput.addEventListener('change', () => {
    if (posInput.files[0]) handlePosFile(posInput.files[0]);
  });

  function handlePosFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) { showToast('Pick a .xlsx or .csv file'); return; }
    state.posFileName = file.name;
    posNameEl.textContent = file.name.length > 35
      ? file.name.substring(0, 32) + '...'
      : file.name;
    posNameEl.classList.remove('hidden');
    readFileAsArrayBuffer(file).then(buf => {
      state.posFileBuffer = buf;
      genBtn.disabled = false;
    }).catch(() => showToast('Could not read file'));
  }

  genBtn.addEventListener('click', startGenerate);

  // Mapping summary toggle
  document.getElementById('btn-toggle-mapping')?.addEventListener('click', function() {
    const rows = document.getElementById('mapping-summary-rows');
    rows.classList.toggle('hidden');
    this.textContent = rows.classList.contains('hidden')
      ? 'View column mapping ▾' : 'Hide column mapping ▴';
  });

  // Update mapping — re-run setup with store name pre-filled
  document.getElementById('btn-update-mapping').addEventListener('click', () => {
    const saved = loadFromStorage();
    // Pre-fill store name so owner doesn't retype it
    const storeInput = document.getElementById('setup-store-name');
    if (storeInput && saved?.storeName) storeInput.value = saved.storeName;
    state.storeName        = saved?.storeName || '';
    state.mappingFileBuffer = null;
    state.mappingFileName   = '';
    // Reset mapping file name display
    const nameEl = document.getElementById('mapping-file-name');
    if (nameEl) { nameEl.textContent = ''; nameEl.classList.add('hidden'); }
    document.getElementById('btn-setup-continue').disabled = !state.storeName;
    showScreen('screen-setup');
    showToast('Upload a new mapping file to update');
  });

  // Reset store → go back to setup (full reset)
  document.getElementById('btn-reset-store').addEventListener('click', () => {
    if (confirm('Change store? This clears the store name and mapping.')) {
      clearStorage();
      state.storeName     = '';
      state.posFileBuffer = null;
      state.posFileName   = '';
      const storeInput = document.getElementById('setup-store-name');
      if (storeInput) storeInput.value = '';
      document.getElementById('btn-setup-continue').disabled = true;
      showScreen('screen-setup');
    }
  });

  // New report button on report screen
  document.getElementById('btn-new-report')?.addEventListener('click', () => {
    state.posFileBuffer = null;
    state.posFileName   = '';

    // Reset file input so same file can be re-picked
    posInput.value = '';
    posNameEl.textContent = '';
    posNameEl.classList.add('hidden');
    genBtn.disabled = true;

    // Clear old report sections and reset to summary tab
    Renderer.switchTab('tab-summary');
    document.getElementById('kpi-zone').innerHTML = '';
    document.getElementById('report-badge').innerHTML = '';
    ['tab-insights','tab-category-content','tab-staff-content',
     'tab-discount-content','tab-customers-content','tab-action-content',
     'tab-trends-content']
      .forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML=''; });

    // Clear filter bar
    const filterMount = document.getElementById('siFilterBarMount');
    if (filterMount) filterMount.innerHTML = '';

    showScreen('screen-home');
  });
}

// ══════════════════════════════════════════════════════════════════
// GENERATE REPORT
// ══════════════════════════════════════════════════════════════════
async function startGenerate() {
  if (!state.posFileBuffer) return;
  const saved = loadFromStorage();
  if (!saved) { showError('No mapping found. Please set up your store first.'); return; }

  showScreen('screen-processing');
  setStep('Reading POS file…', 15);
  document.getElementById('processing-store').textContent = saved.storeName;

  try {
    await delay(150);
    setStep('Applying column mapping…', 35);

    const result = Ingestion.ingest(
      state.posFileBuffer,
      saved.storeName,
      Ingestion.JEWELLERY_CONFIG,
      saved.mappingData.mapping
    );

    setStep(`${result.rawRowCount} rows found — calculating…`, 60);
    await delay(200);

    // Run full analysis
    setStep('Running analysis…', 72);
    const analysisResults = Analysis.runAll(result.rows, Ingestion.JEWELLERY_CONFIG, saved.mappingData.mapping);

    setStep('Building report…', 88);
    await delay(150);

    // Period string
    const allDates = result.rows.map(r => r.transaction_date_str).filter(Boolean).sort();
    const period   = allDates.length
      ? fmtDate(allDates[0]) + ' – ' + fmtDate(allDates[allDates.length - 1])
      : 'Unknown period';

    // Show screen FIRST so DOM is active, then render into it
    setStep('Done ✓', 100);
    await delay(100);
    showScreen('screen-report');
    await delay(50);

    Renderer.render(analysisResults, saved.storeName, period, result.confidence);

    // v40: initialise date filter with raw transaction rows
    // DateFilter stores rows in window.__SI_TRANSACTIONS__ and builds chip bar
    DateFilter.init(result.rows, saved);

  } catch(err) {
    console.error(err);
    showError(err.message || 'Could not process your POS file. Check the file is correct.');
  }
}

// ── BUILD REPORT DATA FROM INGESTED ROWS ──────────────────────────
function buildReport(result, storeName) {
  const rows  = result.rows;
  const sales = rows.filter(r => r.is_sale !== false);

  const dates  = sales.map(r => r.transaction_date_str).filter(Boolean).sort();
  const period = dates.length
    ? fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1])
    : 'Unknown period';

  const gross   = sum(sales, 'gross_value');
  const disc    = sum(sales, 'discount_amount');
  const txns    = sales.length;
  const returns = rows.filter(r => r.is_sale === false).length;
  const custs   = new Set(sales.map(r => r.customer_name).filter(n => n && n !== 'Unknown')).size;
  const avg     = txns > 0 ? gross / txns : 0;
  const discPct = gross > 0 ? disc / gross * 100 : 0;

  return {
    storeName, period,
    rowCount:     rows.length,
    returnCount:  returns,
    confidence:   result.confidence,
    summary: {
      gross_ucp:    gross,
      net_ucp:      gross - disc,
      cm_txns:      txns,
      unique_cust:  custs,
      avg_txn:      avg,
      disc_pct:     discPct,
    },
  };
}

// ── RENDER REPORT ─────────────────────────────────────────────────
function renderReport(r) {
  document.getElementById('report-store').textContent  = r.storeName;
  document.getElementById('report-period').textContent = r.period;

  const badge = r.confidence === 'exact'
    ? `<span style="color:var(--green);font-size:11px">✓ POS auto-detected</span>`
    : `<span style="color:var(--amber);font-size:11px">✓ ${r.rowCount} rows · ${r.returnCount} returns</span>`;
  document.getElementById('report-badge').innerHTML = badge;

  const s = r.summary;
  document.getElementById('kpi-zone').innerHTML = [
    { value: fmtINR(s.gross_ucp),            label: 'Gross Sales' },
    { value: fmtINR(s.net_ucp),              label: 'Net of Returns' },
    { value: s.cm_txns.toLocaleString(),     label: 'Transactions' },
    { value: s.unique_cust > 0 ? s.unique_cust.toLocaleString() : '—', label: 'Customers' },
    { value: fmtINR(s.avg_txn),              label: 'Avg Ticket' },
    { value: s.disc_pct.toFixed(1) + '%',   label: 'Discount Rate' },
  ].map(({ value, label }) => `
    <div class="kpi-card">
      <div class="kpi-value">${value}</div>
      <div class="kpi-label">${label}</div>
    </div>`).join('');
}

// ── ERROR SCREEN ──────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  showScreen('screen-error');
}

// ── PWA INSTALL ───────────────────────────────────────────────────
function initInstallPrompt() {
  // Already installed as standalone — hide everything install-related
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.querySelectorAll('.install-banner, #btn-install-home').forEach(el => {
      el?.classList.add('hidden');
    });
    return;
  }

  const banners = document.querySelectorAll('.install-banner');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.deferredInstall = e;
    // Show all install banners
    banners.forEach(b => b.classList.remove('hidden'));
    // Also show home screen install button if it exists
    document.getElementById('btn-install-home')?.classList.remove('hidden');
    console.log('[PWA] Install prompt ready');
  });

  // All install buttons trigger the same prompt
  document.querySelectorAll('.btn-install-trigger').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.deferredInstall) {
        showToast('Open in Chrome on Android to install');
        return;
      }
      state.deferredInstall.prompt();
      const { outcome } = await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      banners.forEach(b => b.classList.add('hidden'));
      document.getElementById('btn-install-home')?.classList.add('hidden');
      if (outcome === 'accepted') showToast('StoreIntel installed ✓');
      else showToast('You can install later from the menu');
    });
  });

  // Dismiss buttons
  document.querySelectorAll('.btn-dismiss-install').forEach(btn => {
    btn.addEventListener('click', () => {
      banners.forEach(b => b.classList.add('hidden'));
    });
  });

  // Confirm installed via appinstalled event
  window.addEventListener('appinstalled', () => {
    banners.forEach(b => b.classList.add('hidden'));
    document.getElementById('btn-install-home')?.classList.add('hidden');
    showToast('StoreIntel added to home screen ✓');
  });
}

// ── SERVICE WORKER ────────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/storeintel/sw.js', { scope: '/storeintel/' })
    .then(reg => {
      const checkWorker = w => {
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Update ready — refreshing…');
            setTimeout(() => { w.postMessage('SKIP_WAITING'); location.reload(); }, 1500);
          }
        });
      };
      if (reg.waiting) checkWorker(reg.waiting);
      reg.addEventListener('updatefound', () => checkWorker(reg.installing));
    }).catch(e => console.warn('[SW]', e));
}

// ── HELPERS ───────────────────────────────────────────────────────
function sum(rows, field) {
  return rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);
}

function fmtINR(val) {
  if (!val || isNaN(val)) return '—';
  if (val >= 10000000) return `₹${(val/10000000).toFixed(2)}Cr`;
  if (val >= 100000)   return `₹${(val/100000).toFixed(2)}L`;
  if (val >= 1000)     return `₹${(val/1000).toFixed(1)}K`;
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Could not read file'));
    r.readAsArrayBuffer(file);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function setStep(text, pct) {
  const s = document.getElementById('processing-step');
  const p = document.getElementById('progress-fill');
  if (s) s.textContent  = text;
  if (p) p.style.width  = pct + '%';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// Tab switching handled by Renderer.initTabs() in renderer.js

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  updateNetworkStatus();
  initInstallPrompt();
  Renderer.initTabs();
  initSetupScreen();
  initMappingReviewScreen();
  initHomeScreen();

  // Error screen buttons
  document.getElementById('btn-retry')?.addEventListener('click', () => {
    const saved = loadFromStorage();
    showScreen(saved ? 'screen-home' : 'screen-setup');
  });
  // PDF download
  document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
    showToast('Opening print dialog…');
    setTimeout(() => window.print(), 400);
  });

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    const saved = loadFromStorage();
    showScreen(saved ? 'screen-home' : 'screen-setup');
  });

  // Decide first screen
  const saved = loadFromStorage();
  if (saved) {
    state.storeName = saved.storeName;
    loadHomeScreen(saved.storeName, saved.mappingData);
    showScreen('screen-home');
  } else {
    showScreen('screen-setup');
  }
});
