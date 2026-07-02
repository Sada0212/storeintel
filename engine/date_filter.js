/* StoreIntel — Date Filter Engine
   v42 | 02 Jul 2026

   ADAPTIVE GRANULARITY:
     < 13 months  → show individual month chips
     13–24 months → show FY quarter chips  (Q1 FY23-24, Q2 FY23-24 …)
     25+ months   → show FY half-year chips (H1 FY23-24, H2 FY23-24 …)

   LAYOUT: Single row — All Data chip + adaptive chips (scrollable) + Filter btn (right)
   Filter btn opens a modal for custom date range and compare mode (future).
*/
'use strict';

// ── Indian FY helpers (Apr 1 → Mar 31) ──────────────────────────
function getFYStart(date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}
function fyLabel(s) { return `FY ${s}-${String(s+1).slice(2)}`; }

// Quarter within FY: Apr-Jun = Q1, Jul-Sep = Q2, Oct-Dec = Q3, Jan-Mar = Q4
function getFYQuarter(date) {
  const m = date.getMonth(); // 0-indexed
  if (m >= 3 && m <= 5) return 1;
  if (m >= 6 && m <= 8) return 2;
  if (m >= 9 && m <= 11) return 3;
  return 4; // Jan-Mar
}

function quarterRange(fyStart, q) {
  // Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar (next calendar year)
  const ranges = [
    null,
    { start: new Date(fyStart, 3, 1),   end: new Date(fyStart, 5, 30, 23,59,59) },   // Q1
    { start: new Date(fyStart, 6, 1),   end: new Date(fyStart, 8, 30, 23,59,59) },   // Q2
    { start: new Date(fyStart, 9, 1),   end: new Date(fyStart, 11,31, 23,59,59) },   // Q3
    { start: new Date(fyStart+1, 0, 1), end: new Date(fyStart+1, 2, 31,23,59,59) },  // Q4
  ];
  return ranges[q];
}

function halfRange(fyStart, half) {
  // H1 = Apr-Sep, H2 = Oct-Mar
  if (half === 1) return { start: new Date(fyStart,3,1), end: new Date(fyStart,8,30,23,59,59) };
  return { start: new Date(fyStart,9,1), end: new Date(fyStart+1,2,31,23,59,59) };
}

// ── Measure data span in months ──────────────────────────────────
function spanMonths(dates) {
  const first = dates[0], last = dates[dates.length-1];
  return (last.getFullYear() - first.getFullYear()) * 12
       + (last.getMonth() - first.getMonth()) + 1;
}

// ── Build chip options based on data span ────────────────────────
function buildOptions(rows) {
  const dates = rows
    .map(r => r.transaction_date)
    .filter(d => d instanceof Date && !isNaN(d))
    .sort((a,b) => a-b);

  if (!dates.length) return null;

  const span = spanMonths(dates);
  let mode, chips = [];

  if (span < 13) {
    // ── MONTHS ──────────────────────────────────────────────────
    mode = 'month';
    const seen = {};
    for (const d of dates) {
      const y = d.getFullYear(), m = d.getMonth();
      const key = `${y}-${String(m+1).padStart(2,'0')}`;
      if (!seen[key]) {
        seen[key] = true;
        chips.push({
          key, type:'month',
          label: d.toLocaleString('en-IN',{month:'short',year:'numeric'}),
          start: new Date(y,m,1),
          end:   new Date(y,m+1,0,23,59,59)
        });
      }
    }

  } else if (span < 25) {
    // ── FY QUARTERS ─────────────────────────────────────────────
    mode = 'quarter';
    const seen = {};
    for (const d of dates) {
      const fy = getFYStart(d);
      const q  = getFYQuarter(d);
      const key = `Q${q}FY${fy}`;
      if (!seen[key]) {
        seen[key] = true;
        const r = quarterRange(fy, q);
        chips.push({
          key, type:'quarter',
          label: `Q${q} ${fyLabel(fy)}`,
          start: r.start, end: r.end
        });
      }
    }

  } else {
    // ── FY HALF-YEARS ────────────────────────────────────────────
    mode = 'half';
    const seen = {};
    for (const d of dates) {
      const fy   = getFYStart(d);
      const half = (d.getMonth() >= 3 && d.getMonth() <= 8) ? 1 : 2;
      const key  = `H${half}FY${fy}`;
      if (!seen[key]) {
        seen[key] = true;
        const r = halfRange(fy, half);
        chips.push({
          key, type:'half',
          label: `H${half} ${fyLabel(fy)}`,
          start: r.start, end: r.end
        });
      }
    }
  }

  // Sort chips chronologically
  chips.sort((a,b) => b.start - a.start);

  return { mode, chips, span };
}

// ── Filter rows ──────────────────────────────────────────────────
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

// ── Build single-row filter bar HTML ─────────────────────────────
function buildBarHTML(opts) {
  if (!opts) return '';

  const chip = o =>
    `<button class="si-chip" data-fk="${o.key}" data-ft="${o.type}"
       data-fs="${o.start.toISOString()}" data-fe="${o.end.toISOString()}"
       data-fl="${o.label}" onclick="DateFilter.onChip(this)">${o.label}</button>`;

  return `
    <div class="si-filter-bar" id="siFilterBar">
      <div class="si-filter-row">
        <div class="si-chip-scroll">
          <button class="si-chip si-chip-active" data-fk="all" data-ft="all"
            data-fl="All Data" onclick="DateFilter.onChip(this)">All Data</button>
          ${opts.chips.map(chip).join('')}
        </div>
        <button class="si-filter-btn" onclick="DateFilter.openFilter()" title="Custom filter">
          ⊞
        </button>
      </div>
      <div class="si-filter-active" id="siFilterActive" style="display:none">
        <span id="siFilterBadge"></span>
        <button class="si-filter-clear" onclick="DateFilter.clearFilter()">✕</button>
      </div>
    </div>

    <!-- Filter modal -->
    <div class="si-modal-backdrop" id="siModalBackdrop" style="display:none" onclick="DateFilter.closeFilter()">
      <div class="si-modal" onclick="event.stopPropagation()">
        <div class="si-modal-header">
          <span class="si-modal-title">Filter & Compare</span>
          <button class="si-modal-close" onclick="DateFilter.closeFilter()">✕</button>
        </div>
        <div class="si-modal-body">
          <div class="si-modal-section-title">Custom date range</div>
          <div class="si-modal-date-row">
            <div class="si-modal-date-group">
              <label class="si-modal-label">From</label>
              <input type="date" id="siCustomFrom" class="si-modal-date-input">
            </div>
            <div class="si-modal-date-group">
              <label class="si-modal-label">To</label>
              <input type="date" id="siCustomTo" class="si-modal-date-input">
            </div>
          </div>
          <button class="si-modal-apply" onclick="DateFilter.applyCustom()">Apply range</button>
          <div class="si-modal-divider"></div>
          <div class="si-modal-section-title">Compare mode</div>
          <div class="si-modal-coming">
            Compare two periods side by side — coming soon
          </div>
        </div>
      </div>
    </div>`;
}

// ── Active chip highlight ────────────────────────────────────────
function markActive(key) {
  document.querySelectorAll('.si-chip').forEach(b =>
    b.classList.toggle('si-chip-active', b.getAttribute('data-fk') === key)
  );
}

// ── Badge (active period strip) ──────────────────────────────────
function updateBadge(label, count) {
  const bar   = document.getElementById('siFilterActive');
  const badge = document.getElementById('siFilterBadge');
  if (!bar) return;
  if (label === 'All Data') { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  badge.textContent = `${label} · ${count.toLocaleString('en-IN')} transactions`;
}

// ── Re-run analysis + re-render ──────────────────────────────────
function rerender(filtered) {
  const saved = window.__SI_SAVED__;
  if (!saved) return;
  const R = Analysis.runAll(filtered, Ingestion.JEWELLERY_CONFIG, saved.mappingData.mapping);
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

// ── Modal open / close ───────────────────────────────────────────
function openFilter() {
  const backdrop = document.getElementById('siModalBackdrop');
  if (backdrop) backdrop.style.display = 'flex';
}

function closeFilter() {
  const backdrop = document.getElementById('siModalBackdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function applyCustom() {
  const from = document.getElementById('siCustomFrom')?.value;
  const to   = document.getElementById('siCustomTo')?.value;
  if (!from || !to) { alert('Please select both From and To dates.'); return; }
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T23:59:59');
  if (start > end) { alert('From date must be before To date.'); return; }

  const label = `${fmtDateShort(start)} – ${fmtDateShort(end)}`;
  _state = { type:'custom', key:'custom', label, start, end };
  markActive('custom');
  const filtered = filterRows(window.__SI_TRANSACTIONS__, _state);
  updateBadge(label, filtered.length);
  rerender(filtered);
  closeFilter();
}

function fmtDateShort(d) {
  return d.toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric' });
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

  _state = { type, key, label, start: fs ? new Date(fs) : null, end: fe ? new Date(fe) : null };
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

window.DateFilter = { init, onChip, clearFilter, openFilter, closeFilter, applyCustom };
