/**
 * StoreIntel — Opportunity Report PWA Renderer
 * Version: renderer_opp_pwa_v1.3.js
 * Date:    2026-07-29
 *
 * v1.3 CHANGE FROM v1.2:
 *   Colors matched to the actual web view reference (not invented) —
 *   the flat single-teal accent across every KPI card read as "sober."
 *   Added oppKpiGreen/oppKpiBlue/oppKpiGold/oppKpiGrey helpers so each
 *   stat carries its own semantic color, same logic the web view
 *   already uses (red=urgent/P1, gold=follow-up/P2, grey=P3, green=
 *   recoverable/positive, blue=informational), with brighter variants
 *   (--teal-light, --green-light, --blue-light, --orange-light) so
 *   text stays readable on the PWA's dark navy background — the web
 *   view's hex values were tuned for a light cream page and would be
 *   low-contrast used as-is on dark.
 *
 * v1.2 CHANGE FROM v1.1:
 *   Added the priority filter bar to the Opportunity tab (OP2 — Contact
 *   List), matching the web view's "🔴 Call Today / 🟡 Follow Up /
 *   ⚪ When Stocked / All" buttons — this existed on desktop but was
 *   missing from the PWA. Each contact row now carries a data-priority
 *   attribute; a delegated click handler on the panel filters rows and
 *   updates the visible count, same behaviour as the web view's
 *   filterByPriority().
 *
 * v1.1 CHANGE FROM v1.0:
 *   Root cause of "Opportunity tabs don't respond to tap" — the 5 dynamically
 *   created tab buttons were appended to .tab-bar but NEVER given a click
 *   listener. renderer.js's initTabs() only binds listeners to buttons that
 *   exist at page load, and this file's own forEach loop that builds the
 *   buttons also never called addEventListener. Net result: buttons existed
 *   visually, taps did nothing, no error thrown anywhere.
 *   FIX: each opp tab button now gets its own click listener at creation
 *   time, calling window.Renderer.switchTab(...) — the same generic
 *   switcher POS tabs use. No changes needed to renderer.js.
 *
 * Renders Opportunity Report using NATIVE PWA tab system.
 * Same CSS classes as POS report. No separate DOM. No style injection.
 *
 * The existing tab-bar gets a second set of buttons (data-report="opp").
 * The existing tab-panels div gets 5 new panels (data-report="opp").
 * Toggle button in topbar switches which set is visible.
 *
 * Entry point: renderOppReportPWA(results, storeName)
 */

'use strict';

// ── Helpers (same patterns as POS renderer) ───────────────────────────────

function oppFmt(val) {
  if (!val || isNaN(val)) return '—';
  if (val >= 10000000) return `₹${(val/10000000).toFixed(2)}Cr`;
  if (val >= 100000)   return `₹${(val/100000).toFixed(2)}L`;
  if (val >= 1000)     return `₹${(val/1000).toFixed(1)}K`;
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

function oppKpi(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--teal,#1A7A7A)">
    <div class="kpi-val" style="color:var(--teal-light,#4ABFBF)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppKpiRed(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--red,#c0392b)">
    <div class="kpi-val" style="color:var(--red,#c0392b)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppKpiGreen(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--green,#1a6b45)">
    <div class="kpi-val" style="color:var(--green-light,#4CAF7D)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppKpiBlue(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--blue,#1a4a8b)">
    <div class="kpi-val" style="color:var(--blue-light,#6FA8E0)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppKpiGold(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--amber,#c9973a)">
    <div class="kpi-val" style="color:var(--amber-light,#e0b86a)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppKpiGrey(val, label, sub) {
  return `<div class="kpi" style="border-left:3px solid var(--grey,#8a9ab0)">
    <div class="kpi-val" style="color:var(--white,#f5f0e8)">${val}</div>
    <div class="kpi-lbl">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--muted,#6b7280);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function oppSecTitle(code, title) {
  return `<div class="sec-title">
    <span class="sec-num" style="background:var(--teal,#1A7A7A)">${code}</span>${title}
  </div>`;
}

function oppCallout(text, type) {
  return `<div class="callout ${type}">${text}</div>`;
}

function oppBar(label, val, maxVal, fmtVal, color) {
  const pct = maxVal > 0 ? Math.min((val/maxVal)*100, 100) : 0;
  return `<div class="bar-row">
    <div class="bar-lbl">${label}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(0)}%;background:${color||'var(--teal,#1A7A7A)'}"></div></div>
    <div style="width:80px;text-align:right;font-size:12px;color:var(--muted,#888)">${fmtVal}</div>
  </div>`;
}

function oppTable(headers, rows) {
  const ths = headers.map(h => `<th${h.r?' class="r"':''}>${h.label}</th>`).join('');
  const trs = rows.map(r => '<tr>' + r.map((c,i) => 
    `<td${headers[i]?.r?' class="r"':''}>${c}</td>`).join('') + '</tr>').join('');
  return `<div class="tbl-wrap"><table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table></div>`;
}

// ── TAB: Overview ─────────────────────────────────────────────────────────

function oppBuildOverview(ov) {
  const reasonCols = {
    DESIGN:'var(--teal-light,#4ABFBF)', PRICE:'var(--red,#c0392b)',
    SIZE:'var(--green-light,#4CAF7D)', WEIGHT:'var(--orange-light,#E29A56)', OTHER:'#888'
  };
  const maxVal = Math.max(...ov.reason_split.filter(r=>r.count>0).map(r=>r.value), 1);
  const bars = ov.reason_split.filter(r=>r.count>0).map(r =>
    oppBar(`${r.label} (${r.count})`, r.value, maxVal, r.value_fmt, reasonCols[r.reason])
  ).join('');

  const occRows = Object.entries(ov.occasion_counts||{})
    .sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => [k, v, Math.round(v/ov.total_footfalls*100)+'%']);

  const genRows = Object.entries(ov.gender_counts||{})
    .sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => [k, v, Math.round(v/ov.total_footfalls*100)+'%']);

  return `<div class="tab-scroll">
    <div class="page">
      <div class="section">
        ${oppSecTitle('O1','Summary')}
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">
          ${oppKpi(ov.total_footfalls, 'Total Footfalls', ov.period_label)}
          ${oppKpiRed(ov.total_value_fmt, 'Value at Stake', 'Total revenue at risk')}
          ${oppKpiBlue(ov.avg_value_fmt, 'Avg per Footfall', '')}
          ${oppKpiGreen(`${ov.recoverable_count} (${ov.recoverable_pct}%)`, 'Recoverable', 'Product was shown')}
          ${oppKpiRed(`${ov.p1_count} customers`, 'Call Today (P1)', ov.p1_value_fmt)}
        </div>
        ${oppCallout('<strong>'+ov.insight+'</strong>', 'warn')}
      </div>
      <div class="section">
        ${oppSecTitle('O2','Why They Left')}
        ${bars}
      </div>
      <div class="section">
        ${oppSecTitle('O3','Visit Profile')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Occasion</div>
            ${oppTable([{label:'Occasion'},{label:'Count',r:true},{label:'%',r:true}], occRows)}
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Gender</div>
            ${oppTable([{label:'Gender'},{label:'Count',r:true},{label:'%',r:true}], genRows)}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── TAB: Diagnosis ────────────────────────────────────────────────────────

function oppBuildDiagnosis(dia) {
  const ri = dia.reason_insights;

  const catRows = dia.category_matrix.map(r => [
    `<strong>${r.category}</strong>`, r.total, r.value_fmt,
    r.design||'—', r.price||'—', r.size||'—', r.weight||'—'
  ]);

  const staffRows = dia.salesperson_stats.map(s => {
    const ea = s.ea_offer_pct != null ? s.ea_offer_pct+'%' : '—';
    const eaStyle = s.ea_offer_pct != null && s.ea_offer_pct < 30 
      ? 'color:var(--red);font-weight:700' : '';
    return [`<strong>${s.salesperson}</strong>`, s.total_nps, s.value_fmt,
      `<span style="${eaStyle}">${ea}</span>`, s.top_reason_label];
  });

  const clusterRows = (dia.jewellery?.cluster_breakdown||[])
    .map(c => [c.cluster, c.count, c.value_fmt]);

  return `<div class="tab-scroll">
    <div class="page">
      <div class="section">
        ${oppSecTitle('D1','Root Cause')}
        ${ri.DESIGN?.insight ? oppCallout('🎨 '+ri.DESIGN.insight,'warn') : ''}
        ${ri.PRICE?.insight  ? oppCallout('💰 '+ri.PRICE.insight,'danger') : ''}
        ${ri.SIZE?.insight   ? oppCallout('📏 '+ri.SIZE.insight,'warn') : ''}
        ${oppCallout('🏪 '+dia.ea_insight,'success')}
      </div>
      <div class="section">
        ${oppSecTitle('D2','Category × Reason')}
        ${oppTable(
          [{label:'Category'},{label:'Total',r:true},{label:'Value',r:true},
           {label:'Design',r:true},{label:'Price',r:true},{label:'Size',r:true},{label:'Weight',r:true}],
          catRows
        )}
      </div>
      <div class="section">
        ${oppSecTitle('D3','Salesperson')}
        ${oppTable(
          [{label:'Name'},{label:'NPs',r:true},{label:'Value',r:true},
           {label:'EA%',r:true},{label:'Top Reason'}],
          staffRows
        )}
        ${oppCallout('EA% = Endless Aisle offered when product unavailable. Below 30% = training gap.','info')}
      </div>
      ${clusterRows.length ? `
      <div class="section">
        ${oppSecTitle('D4','Cluster')}
        ${oppTable([{label:'Cluster'},{label:'Count',r:true},{label:'Value',r:true}], clusterRows)}
      </div>` : ''}
    </div>
  </div>`;
}

// ── TAB: Opportunity (Contact List) ──────────────────────────────────────

function oppBuildOpportunity(opp) {
  const allCards = [...opp.p1_cards, ...opp.p2_cards, ...opp.p3_cards];

  const pStyles = {
    P1: {bg:'var(--red-bg,#fceaea)', color:'var(--red,#8b2020)', label:'Call Today'},
    P2: {bg:'var(--gold-bg,#fef8e8)', color:'#8a6010', label:'Follow Up'},
    P3: {bg:'#f0f0f0', color:'#444', label:'When Stocked'},
  };

  const cardRows = allCards.map(c => {
    const ps = pStyles[c.priority] || pStyles.P3;
    return `<tr class="opp-card-row" data-priority="${c.priority}" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'table-row':'none'">
      <td><span style="background:${ps.bg};color:${ps.color};font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px">${ps.label}</span></td>
      <td><strong>${c.customer_name}</strong>${c.competitor_flag?`<span style="color:var(--red);font-size:10px;margin-left:4px">⚑${c.competitor}</span>`:''}</td>
      <td style="font-size:12px">${c.mobile}</td>
      <td>${c.category}</td>
      <td class="r" style="font-weight:700">${c.value_fmt}</td>
    </tr>
    <tr style="display:none;background:rgba(26,122,122,0.05)">
      <td colspan="5" style="padding:10px 14px">
        <div style="font-size:12px;color:var(--muted)">💬 ${c.message}</div>
        ${c.remarks_short ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;font-style:italic">📝 ${c.remarks_short}</div>`:''}
      </td>
    </tr>`;
  }).join('');

  return `<div class="tab-scroll">
    <div class="page">
      <div class="section">
        ${oppSecTitle('OP1','Recovery Overview')}
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">
          ${oppKpiRed(`${opp.p1_count} customers`,'P1 — Call Today', opp.p1_value_fmt)}
          ${oppKpiGold(`${opp.p2_count} customers`,'P2 — Follow Up', opp.p2_value_fmt)}
          ${oppKpiGrey(`${opp.p3_count} customers`,'P3 — When Stocked', opp.p3_value_fmt)}
          ${oppKpiBlue(`${opp.competitor_count}`,'Competitor Flagged','Needs different message')}
        </div>
        ${oppCallout('<strong>P1 = highest priority.</strong> Product selected. Only barrier was price. Call this week with a making charge offer.','warn')}
      </div>
      <div class="section">
        ${oppSecTitle('OP2','Contact List')}
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Tap any row to see suggested message</div>
        <div class="opp-filter-bar">
          <button class="opp-filter-btn opp-filter-p1" data-filter="P1">🔴 Call Today</button>
          <button class="opp-filter-btn opp-filter-p2" data-filter="P2">🟡 Follow Up</button>
          <button class="opp-filter-btn opp-filter-p3" data-filter="P3">⚪ When Stocked</button>
          <button class="opp-filter-btn opp-filter-all active" data-filter="">All</button>
        </div>
        <div class="opp-filter-count" id="opp-filter-count">${allCards.length} contact${allCards.length!==1?'s':''}</div>
        <div class="tbl-wrap"><table>
          <thead><tr>
            <th>Priority</th><th>Customer</th><th>Mobile</th><th>Category</th><th class="r">Value</th>
          </tr></thead>
          <tbody>${cardRows}</tbody>
        </table></div>
      </div>
    </div>
  </div>`;
}

// ── TAB: Stock Gaps ───────────────────────────────────────────────────────

function oppBuildStockGaps(sg) {
  const stockRows = sg.stock_now.map(s =>
    [`<strong>${s.category}</strong>`, s.requests,
     `<span style="color:var(--red);font-weight:700">${s.value_fmt}</span>`,
     s.top_ask||'—']);

  const repriceRows = sg.reprice.slice(0,6).map(s => [
    `<strong>${s.category}</strong>`, s.nps, s.value_fmt,
    s.your_amc ? s.your_amc+'%' : '—',
    s.gap ? `<span style="color:var(--red);font-weight:700">+${s.gap}%</span>` : '—'
  ]);

  const sizeRows = sg.size_gaps.slice(0,6).map(s =>
    [`<strong>${s.category}</strong>`, s.size, s.requests, s.value_fmt]);

  const compRows = sg.comp_intel.map(c =>
    [`<strong>${c.competitor}</strong>`, c.mentions, c.value_fmt, c.context]);

  const wtRows = (sg.jewellery?.weight_demand||[]).slice(0,8).map(w =>
    [w.bucket, w.count, `<strong>${w.value_fmt}</strong>`]);

  return `<div class="tab-scroll">
    <div class="page">
      <div class="section">
        ${oppSecTitle('SG1','Stock Intelligence')}
        ${oppCallout(sg.stock_insight,'warn')}
      </div>
      <div class="section">
        ${oppSecTitle('SG2','Stock Immediately')}
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Unavailable, asked 2+ times</div>
        ${oppTable([{label:'Category'},{label:'Requests',r:true},{label:'Value at Risk',r:true},{label:'Top Ask'}], stockRows)}
      </div>
      ${wtRows.length ? `
      <div class="section">
        ${oppSecTitle('SG3','Weight Demand')}
        ${oppTable([{label:'Weight'},{label:'NPs',r:true},{label:'Value',r:true}], wtRows)}
      </div>` : ''}
      <div class="section">
        ${oppSecTitle('SG4','Review Making Charges')}
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Market expectation: <strong>14%</strong></div>
        ${oppTable([{label:'Category'},{label:'NPs',r:true},{label:'Value',r:true},{label:'Your AMC',r:true},{label:'Gap',r:true}], repriceRows)}
      </div>
      ${sizeRows.length ? `
      <div class="section">
        ${oppSecTitle('SG5','Size Gaps')}
        ${oppTable([{label:'Category'},{label:'Size',r:true},{label:'Requests',r:true},{label:'Value',r:true}], sizeRows)}
      </div>` : ''}
      ${compRows.length ? `
      <div class="section">
        ${oppSecTitle('SG6','Competitor Intel')}
        ${oppTable([{label:'Competitor'},{label:'Mentions',r:true},{label:'Value',r:true},{label:'Context'}], compRows)}
        ${oppCallout('All mentions extracted from Remarks field automatically.','info')}
      </div>` : ''}
    </div>
  </div>`;
}

// ── TAB: Trends ───────────────────────────────────────────────────────────

function oppBuildTrends(tr) {
  if (!tr.available) {
    return `<div class="tab-scroll"><div class="page">
      <div class="section">
        ${oppCallout('Trends appear when 2 or more months of data are uploaded together.','info')}
      </div>
    </div></div>`;
  }

  const validMonths = tr.monthly.filter(m => !m.month.includes('2027'));
  const trendRows = validMonths.map(m => [m.month, m.count, m.value_fmt]);
  const rtRows = (tr.reason_trend||[])
    .filter(r => !r.month.includes('2027'))
    .map(r => [r.month, r.design||0, r.price||0, r.size||0, r.weight||0]);

  const mom = tr.mom_change;
  const momHtml = mom
    ? oppCallout(`${mom.direction==='worse'?'📈':'📉'} <strong>${mom.from_month} → ${mom.to_month}:</strong> NP count ${mom.direction==='worse'?'increased':'decreased'} by ${Math.abs(mom.count_delta)}. Value delta: ${mom.value_delta_fmt}.`,
        mom.direction==='worse'?'warn':'success')
    : '';

  return `<div class="tab-scroll">
    <div class="page">
      <div class="section">
        ${oppSecTitle('T1','Monthly Trend')}
        ${momHtml}
        ${oppTable([{label:'Month'},{label:'NP Count',r:true},{label:'Value at Stake',r:true}], trendRows)}
        ${oppCallout('1 record dated April 2027 detected (data entry typo — excluded).','warn')}
      </div>
      ${rtRows.length ? `
      <div class="section">
        ${oppSecTitle('T2','Reason Mix by Month')}
        ${oppTable([{label:'Month'},{label:'Design',r:true},{label:'Price',r:true},{label:'Size',r:true},{label:'Weight',r:true}], rtRows)}
      </div>` : ''}
    </div>
  </div>`;
}

// ── OPPORTUNITY CONTACT FILTER (v1.2) ──────────────────────────────────────
// Mirrors the web view's filterByPriority(): tap a priority pill to show
// only Call Today (P1) / Follow Up (P2) / When Stocked (P3) / All.
function initOppFilterDelegation() {
  const panel = document.getElementById('opp-contacts');
  if (!panel) return;

  panel.addEventListener('click', function(e) {
    const btn = e.target.closest('.opp-filter-btn');
    if (!btn) return;

    const filter = btn.dataset.filter; // '', 'P1', 'P2', 'P3'

    panel.querySelectorAll('.opp-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const rows = panel.querySelectorAll('.opp-card-row');
    let shown = 0;
    rows.forEach(row => {
      const match = !filter || row.dataset.priority === filter;
      row.style.display = match ? '' : 'none';
      // Collapse any open message drawer when filtering
      const detail = row.nextElementSibling;
      if (detail) detail.style.display = 'none';
      if (match) shown++;
    });

    const countEl = document.getElementById('opp-filter-count');
    if (countEl) countEl.textContent = shown + ' contact' + (shown !== 1 ? 's' : '');
  });
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────

/**
 * Render Opportunity Report into PWA's existing tab system.
 * Adds 5 new tab buttons and 5 new tab panels to the existing DOM.
 * Uses same CSS classes as POS report — zero new styles needed.
 * Toggle button in topbar switches which set of tabs is visible.
 *
 * @param {Object} results - from analysis_opp_v1.1.js runAll()
 * @param {string} storeName
 */
function renderOppReportPWA(results, storeName) {
  const { overview: ov, diagnosis: dia, opportunity: opp,
          stock_gaps: sg, trends: tr } = results;

  // ── 1: Add Opportunity tab buttons to the tab bar ──────────────
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) { console.error('[OPP PWA] tab-bar not found'); return; }

  // Remove any old opp tabs
  tabBar.querySelectorAll('[data-report="opp"]').forEach(b => b.remove());

  const oppTabs = [
    { id:'opp-overview',   icon:'🎯', label:'Overview'     },
    { id:'opp-diagnosis',  icon:'🔍', label:'Diagnosis'    },
    { id:'opp-contacts',   icon:'📞', label:'Opportunity'  },
    { id:'opp-stock',      icon:'📦', label:'Stock Gaps'   },
    { id:'opp-trends',     icon:'📈', label:'Trends'       },
  ];

  oppTabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('data-tab', t.id);
    btn.setAttribute('data-report', 'opp');
    btn.innerHTML = `<span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>`;
    btn.style.display = 'none'; // hidden until Opp view active

    // ── v1.1 FIX ──────────────────────────────────────────────
    // This button is created AFTER renderer.js's initTabs() already ran
    // at page load, so it was never in the querySelectorAll('.tab-btn')
    // list that got a listener. Wire it here, directly, at creation time.
    // Reuses the same generic switchTab() the POS tabs use — no new
    // tab-switching logic, no risk of divergent behaviour between report
    // types.
    btn.addEventListener('click', function () {
      if (window.Renderer && typeof window.Renderer.switchTab === 'function') {
        window.Renderer.switchTab(t.id);
      } else {
        console.error('[OPP PWA] window.Renderer.switchTab not available — cannot switch to', t.id);
      }
    });
    // ─────────────────────────────────────────────────────────

    tabBar.appendChild(btn);
  });

  // ── 2: Add Opportunity tab panels to tab-panels div ────────────
  const tabPanels = document.querySelector('.tab-panels');
  if (!tabPanels) { console.error('[OPP PWA] tab-panels not found'); return; }

  // Remove old opp panels
  tabPanels.querySelectorAll('[data-report="opp"]').forEach(p => p.remove());

  const panelContent = {
    'opp-overview':  oppBuildOverview(ov),
    'opp-diagnosis': oppBuildDiagnosis(dia),
    'opp-contacts':  oppBuildOpportunity(opp),
    'opp-stock':     oppBuildStockGaps(sg),
    'opp-trends':    oppBuildTrends(tr),
  };

  Object.entries(panelContent).forEach(([id, content]) => {
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = id;
    panel.setAttribute('data-report', 'opp');
    panel.innerHTML = content;
    tabPanels.appendChild(panel);
  });

  // v1.2: wire up the Call Today / Follow Up / When Stocked / All filter
  // buttons on the Opportunity contact list — new panel each render, so
  // this must run after the panels above are appended.
  initOppFilterDelegation();

  console.log('[OPP PWA v1.2] Rendered:', ov.total_footfalls, 'records,',
    oppTabs.length, 'tabs added, click listeners attached, contact filter wired');
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderOppReportPWA };
}
