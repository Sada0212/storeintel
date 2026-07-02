/* StoreIntel — Date Filter Engine
   v40 | 29 Jun 2026
   Requires: window.__SI_TRANSACTIONS__ set after first ingest
   Exposes:  window.DateFilter.init(rows), .onChip(btn), .clearFilter()
*/
'use strict';

// ── Indian FY helpers (Apr 1 → Mar 31) ──────────────────────────
function getFYStart(date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}
function fyLabel(s)    { return `FY ${s}-${String(s+1).slice(2)}`; }
function fyRange(s)    { return { start: new Date(s,3,1), end: new Date(s+1,2,31,23,59,59) }; }

// ── Build chip options from transaction array ────────────────────
function buildOptions(rows) {
  const dates = rows.map(r => r.transaction_date).filter(d => d instanceof Date && !isNaN(d));
  if (!dates.length) return null;
  dates.sort((a,b) => a-b);

  const months = {}, years = {}, fys = {};

  for (const d of dates) {
    const y = d.getFullYear(), m = d.getMonth();
    const mKey = `${y}-${String(m+1).padStart(2,'0')}`;
    if (!months[mKey]) months[mKey] = {
      key: mKey, type:'month',
      label: d.toLocaleString('en-IN',{month:'short',year:'numeric'}),
      start: new Date(y,m,1),
      end:   new Date(y,m+1,0,23,59,59)
    };
    if (!years[y]) years[y] = {
      key:`Y${y}`, type:'year', label:`${y}`,
      start: new Date(y,0,1), end: new Date(y,11,31,23,59,59)
    };
    const fy = getFYStart(d);
    if (!fys[fy]) { const r=fyRange(fy); fys[fy]={key:`FY${fy}`,type:'fy',label:fyLabel(fy),start:r.start,end:r.end}; }
  }

  return {
    months: Object.values(months).sort((a,b)=>a.start-b.start),
    years:  Object.values(years).sort((a,b)=>a.start-b.start),
    fys:    Object.values(fys).sort((a,b)=>a.start-b.start),
    multiYear: Object.keys(years).length > 1
  };
}

// ── Filter rows by active period ─────────────────────────────────
function filterRows(rows, state) {
  if (!state || state.type === 'all') return rows;
  const {start, end} = state;
  return rows.filter(r => {
    const d = r.transaction_date;
    if (!(d instanceof Date)) return false;
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });
}

// ── Build filter bar HTML ────────────────────────────────────────
function buildBarHTML(opts) {
  if (!opts) return '';
  const chip = o =>
    `<button class="si-chip" data-fk="${o.key}" data-ft="${o.type}"
       data-fs="${o.start.toISOString()}" data-fe="${o.end.toISOString()}"
       data-fl="${o.label}" onclick="DateFilter.onChip(this)">${o.label}</button>`;

  const monthRow = `
    <div class="si-filter-row">
      <span class="si-filter-label">Month</span>
      <div class="si-chip-scroll">
        <button class="si-chip si-chip-active" data-fk="all" data-ft="all" data-fl="All Data"
          onclick="DateFilter.onChip(this)">All Data</button>
        ${opts.months.map(chip).join('')}
      </div>
    </div>`;

  const yearRow = opts.multiYear ? `
    <div class="si-filter-row">
      <span class="si-filter-label">Year</span>
      <div class="si-chip-scroll">
        ${opts.years.map(chip).join('')}
        ${opts.fys.map(chip).join('')}
      </div>
    </div>` : '';

  return `
    <div class="si-filter-bar" id="siFilterBar">
      ${monthRow}
      ${yearRow}
      <div class="si-filter-active" id="siFilterActive" style="display:none">
        <span id="siFilterBadge"></span>
        <button class="si-filter-clear" onclick="DateFilter.clearFilter()">✕ Clear</button>
      </div>
    </div>`;
}

// ── Active chip highlight ────────────────────────────────────────
function markActive(key) {
  document.querySelectorAll('.si-chip').forEach(b =>
    b.classList.toggle('si-chip-active', b.getAttribute('data-fk') === key)
  );
}

// ── Badge update ─────────────────────────────────────────────────
function updateBadge(label, count) {
  const bar   = document.getElementById('siFilterActive');
  const badge = document.getElementById('siFilterBadge');
  if (!bar) return;
  if (label === 'All Data') { bar.style.display='none'; return; }
  bar.style.display = 'flex';
  badge.textContent = `${label} · ${count.toLocaleString('en-IN')} transactions`;
}

// ── Re-run analysis + re-render with filtered rows ───────────────
function rerender(filtered) {
  const saved = window.__SI_SAVED__;
  if (!saved) return;
  const R = Analysis.runAll(filtered, Ingestion.JEWELLERY_CONFIG, saved.mappingData.mapping);
  // Keep header stable — don't override store/period line during filter
  // Just re-render tabs
  renderSummary(R);
  document.getElementById('tab-category-content').innerHTML  = renderCategory(R);
  document.getElementById('tab-staff-content').innerHTML     = renderStaff(R);
  document.getElementById('tab-discount-content').innerHTML  = renderDiscount(R);
  document.getElementById('tab-customers-content').innerHTML = renderCustomers(R);
  document.getElementById('tab-trends-content').innerHTML    = renderTrends(R);
  document.getElementById('tab-action-content').innerHTML    = renderAction(R.rfm);
  initActionDelegation();
  Renderer.switchTab('tab-summary');
}

// ── Public API ───────────────────────────────────────────────────
let _state = { type:'all', key:'all', label:'All Data', start:null, end:null };

function init(rows, saved) {
  window.__SI_TRANSACTIONS__ = rows;
  window.__SI_SAVED__        = saved;
  const opts = buildOptions(rows);
  window.__SI_FILTER_OPTS__  = opts;
  const mount = document.getElementById('siFilterBarMount');
  if (mount) mount.innerHTML = buildBarHTML(opts);
  clearFilter();
}

function onChip(btn) {
  const key   = btn.getAttribute('data-fk');
  const type  = btn.getAttribute('data-ft') || 'all';
  const label = btn.getAttribute('data-fl') || 'All Data';
  const fs    = btn.getAttribute('data-fs');
  const fe    = btn.getAttribute('data-fe');

  _state = { type, key, label, start: fs?new Date(fs):null, end: fe?new Date(fe):null };
  markActive(key);
  const filtered = filterRows(window.__SI_TRANSACTIONS__, _state);
  updateBadge(label, filtered.length);
  rerender(filtered);
}

function clearFilter() {
  _state = { type:'all', key:'all', label:'All Data', start:null, end:null };
  markActive('all');
  updateBadge('All Data', 0);
  if (window.__SI_TRANSACTIONS__) rerender(window.__SI_TRANSACTIONS__);
}

window.DateFilter = { init, onChip, clearFilter };
