/* StoreIntel — renderer.js v4
   All tabs, all sections, clickable action modal.
*/
'use strict';

// ── FORMAT HELPERS ──────────────────────────────────────────────────
function fI(v) {
  v = parseFloat(v)||0; if(v<0) return '−'+fI(-v);
  if(v>=10000000) return `₹${(v/10000000).toFixed(2)}Cr`;
  if(v>=100000)   return `₹${(v/100000).toFixed(2)}L`;
  if(v>=1000)     return `₹${(v/1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}
function pct(n) { return (parseFloat(n)||0).toFixed(1)+'%'; }
function num(n) { return (parseInt(n)||0).toLocaleString('en-IN'); }
function fmtDate(s) {
  if(!s) return '—';
  const [y,m,d]=s.split('-');
  return `${parseInt(d)} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[parseInt(m)-1]} ${y}`;
}
function dc(d) { d=parseFloat(d)||0; return d>10?'var(--red)':d>5?'var(--amber)':'var(--green)'; }
function bar(v,mx) { return mx>0?Math.min(100,Math.round((parseFloat(v)||0)/mx*100)):0; }
function noData(msg) { return `<div class="no-data">${msg}</div>`; }
function sec(title,html) { return `<div class="ts"><div class="ts-title">${title}</div>${html}</div>`; }
function rrow(label,value,b,meta,bc) {
  return `<div class="r-row">
    <div class="r-row-top"><span class="r-label">${label}</span><span class="r-value">${value}</span></div>
    ${b!=null?`<div class="r-bar-track"><div class="r-bar-fill" style="width:${b}%;background:${bc||'var(--amber)'}"></div></div>`:''}
    ${meta?`<div class="r-meta">${meta}</div>`:''}
  </div>`;
}
function insight(text,type='') {
  return `<div class="r-insight${type?' r-insight-'+type:''}">${text}</div>`;
}

// ── TAB 1: SUMMARY ──────────────────────────────────────────────────
function renderSummary(R) {
  const s  = R.summary||{};
  const ex = R.extended||{};

  document.getElementById('kpi-zone').innerHTML = [
    {v:fI(s.gross_ucp),                          l:'Gross Sales'},
    {v:fI(s.net_ucp),                            l:'Net of Returns'},
    {v:num(s.cm_txns),                           l:'Bills'},
    {v:s.avg_pieces_per_bill>0?(+s.avg_pieces_per_bill).toFixed(2)+'x':'—', l:'Pieces / Bill'},
    {v:fI(s.avg_txn),                            l:'Avg Ticket / Bill'},
    {v:pct(s.disc_pct),                          l:'Discount Rate'},
  ].map(({v,l})=>`<div class="kpi-card"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');

  // E2 Scorecard
  let scHtml = '';
  if (ex.scorecard && ex.scorecard.checks) {
    const good = ex.scorecard.checks.filter(c=>c.status==='good');
    const warn = ex.scorecard.checks.filter(c=>c.status==='warn');
    const bad  = ex.scorecard.checks.filter(c=>c.status==='bad');
    const col  = (items, color, icon) => items.map(c=>
      `<div class="sc-card" style="border-left:3px solid ${color}">
        <span>${icon}</span>
        <div><div class="sc-label" style="color:${color}">${c.label}</div>
        <div class="sc-detail">${c.detail}</div></div>
      </div>`).join('');
    scHtml = sec('E2 — Performance Scorecard',
      col(good,'var(--green)','✅') + col(warn,'var(--amber)','⚠️') + col(bad,'var(--red)','🚨')
    );
  }

  // Auto insights
  const cats  = R.category||[];
  const staff = R.staff||[];
  let ins = '';
  if(s.disc_pct>10) ins+=insight(`⚠️ Discount rate ${pct(s.disc_pct)} — above 10% threshold`,'warn');
  else if(s.disc_pct<3) ins+=insight(`✅ Healthy discount rate at ${pct(s.disc_pct)}`,'good');
  if(s.grn_txns>0) ins+=insight(`↩️ ${s.grn_txns} return${s.grn_txns>1?'s':''} this period`,'warn');
  if(cats[0]) ins+=insight(`📦 Top category: <strong>${cats[0].category}</strong> — ${pct(cats[0].net_share_pct)} of revenue`);
  if(staff.length>1&&staff[0].net>0){
    const gap=Math.round((staff[0].net-staff[staff.length-1].net)/staff[0].net*100);
    if(gap>40) ins+=insight(`📊 ${gap}% revenue gap between top and bottom RSO`,'warn');
  }

  // E3 Store Metrics
  let e3 = '';
  const sm = (ex.store_metrics||[]);
  if (sm.length) {
    const cardHtml = sm.map(m => {
      let val, sub;
      if (m.type === 'qty') {
        val = num(m.total);
        sub = `Avg ${m.avg} per txn`;
      } else if (m.type === 'rate' || m.type === 'rate_full') {
        val = m.type === 'rate_full'
          ? '₹' + m.total.toLocaleString('en-IN')
          : fI(m.total);
        sub = `Average this period`;
      } else {
        val = fI(m.total);
        sub = `Avg ${fI(m.avg)} per bill`;
      }
      const col = m.type === 'qty' ? 'var(--green)' : (m.type === 'rate' || m.type === 'rate_full') ? 'var(--amber)' : 'var(--blue)';
      return `<div style="background:var(--navy-light);border-radius:10px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:600;color:var(--grey);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${m.label}</div>
        <div style="font-size:20px;font-weight:700;color:${col};line-height:1.2">${val}</div>
        <div style="font-size:11px;color:var(--grey);margin-top:3px">${sub}</div>
      </div>`;
    }).join('');
    e3 = `<div style="padding:4px 0">
      <div style="font-size:13px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;padding-bottom:10px;border-bottom:2px solid var(--amber);margin-bottom:12px">E3 — Store Metrics</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cardHtml}</div>
    </div>`;
  }

  document.getElementById('tab-insights').innerHTML = (ins?sec('Key Insights',ins):'') + scHtml + e3;
}

// ── TAB 2: CATEGORY ─────────────────────────────────────────────────
function renderCategory(R) {
  const cats = R.category||[];
  const ex   = R.extended||{};
  if (!cats.length) return noData('No category data.');

  const maxNet = Math.max(...cats.map(c=>c.net),1);
  const c1 = sec('C1 — Revenue by Category',
    cats.map(c=>rrow(c.category, fI(c.net), bar(c.net,maxNet),
      `<span>${num(c.txns)} txns</span><span>${pct(c.net_share_pct)} share</span><span style="color:${dc(c.disc_pct)}">${pct(c.disc_pct)} disc</span><span>${c.weight>0?c.weight+'g':''}</span>`
    )).join('')
  );

  // C3 Gold & Making
  let c3 = '';
  const gold = ex.gold;
  if (gold && gold.available) {
    let goldRows = '';
    if(gold.total_gross_wt) goldRows += rrow('Total Gross Weight', gold.total_gross_wt+'g', null, `<span>Avg ${gold.avg_gross_wt}g per txn</span>`);
    if(gold.total_making)   goldRows += rrow('Making Charges', fI(gold.total_making), null,
      `<span>${pct(gold.making_pct)} of revenue</span>${gold.avg_making_rate_per_g?`<span>₹${gold.avg_making_rate_per_g}/g avg rate</span>`:''}`);
    if(gold.total_wastage)  goldRows += rrow('Wastage Charges', fI(gold.total_wastage), null, `<span>${pct(gold.wastage_pct)} of revenue</span>`);
    if(gold.by_karatage && gold.by_karatage.length) {
      const maxKtRev = Math.max(...gold.by_karatage.map(k=>k.revenue),1);
      goldRows += `<div class="r-sub-title">By Karatage</div>`;
      goldRows += gold.by_karatage.map(k=>rrow(k.kt+'KT', fI(k.revenue), bar(k.revenue,maxKtRev),
        `<span>${k.count} txns</span><span>${pct(k.rev_share)} share</span>${k.weight?`<span>${k.weight}g</span>`:''}`
      )).join('');
    }
    c3 = sec('C3 — Gold & Making Analysis', goldRows);
  }

  // C4 Diamond
  let c4 = '';
  const dia = ex.diamond;
  if (dia && dia.available) {
    let diaRows = '';
    if(dia.total_wt_ct)  diaRows += rrow('Total Diamond Weight', dia.total_wt_ct+'ct', null, '');
    if(dia.total_value)  diaRows += rrow('Diamond Value', fI(dia.total_value), null, `<span>${pct(dia.dia_pct)} of revenue</span>`);
    if(dia.avg_rate_ct)  diaRows += rrow('Avg Rate/Carat', fI(dia.avg_rate_ct), null, '');
    if(dia.total_count)  diaRows += rrow('Total Diamonds', num(dia.total_count), null, '');
    c4 = sec('C4 — Diamond & Stone Analysis', diaRows);
  }

  // C6 Unlock guide
  let c6 = '';
  const guide = (R.extended||{}).unlock_guide||[];
  if (guide.length) {
    c6 = sec('C6 — Unlock More Insights',
      guide.map(g => `
        <div class="r-row">
          <div class="r-row-top">
            <span class="r-label">📊 ${g.label}</span>
            <span class="r-value" style="font-size:10px;color:${g.mapped?'var(--amber)':'var(--grey)'}">
              ${g.mapped ? 'Map column' : 'Add to template'}
            </span>
          </div>
          <div class="r-meta"><span>${g.benefit}</span></div>
        </div>`).join('')
    );
  }

  return c1 + c3 + c4 + c6;
}

// ── TAB 3: STAFF ────────────────────────────────────────────────────
function renderStaff(R) {
  const staff  = R.staff||[];
  const weekly = R.weekly||[];
  const tos    = R.time_of_sale||[];
  if (!staff.length) return noData('No staff data.');

  const maxNet = Math.max(...staff.map(s=>s.net),1);
  const s1 = sec('S1 — RSO Performance',
    staff.map((s,i)=>rrow(
      `${i===0?'🥇 ':''}${s.staff_name}`, fI(s.net), bar(s.net,maxNet),
      `<span>${num(s.txns)} txns</span><span>${fI(s.avg_txn)} avg</span><span style="color:${dc(s.disc_pct)}">${pct(s.disc_pct)} disc</span><span>${s.customers} custs</span>`
    )).join('')
  );

  const maxUcp = Math.max(...weekly.map(w=>w.ucp),1);
  const s2 = weekly.length ? sec('S2 — Weekly Trend',
    weekly.map(w=>rrow(w.week, fI(w.ucp), bar(w.ucp,maxUcp),
      `<span>${num(w.txns)} txns</span><span>${fI(w.avg_txn)} avg</span>`
    )).join('')
  ) : '';

  // S3 Time of Sale
  let s3 = '';
  if (tos && tos.length > 0) {
    const maxTos = Math.max(...tos.map(t=>t.ucp),1);
    s3 = sec('S3 — Time of Sale',
      tos.map(t=>rrow(t.period, fI(t.ucp), bar(t.ucp,maxTos),
        `<span>${num(t.txns)} txns</span><span>${pct(t.pct)} of revenue</span><span>${fI(t.avg_txn)} avg</span>`,
        'var(--amber)'
      )).join('')
    );
  }

  return s1 + s2 + s3;
}

// ── TAB 4: DISCOUNT ─────────────────────────────────────────────────
function renderDiscount(R) {
  const disc = R.discount;
  if (!disc||!disc.bands) return noData('No discount data.');
  const maxT = Math.max(...disc.bands.map(b=>b.txns),1);

  const d1 = sec('D1 — Discount Bands',
    disc.bands.map(b=>rrow(b.band, `${num(b.txns)} txns`, bar(b.txns,maxT),
      `<span>${fI(b.ucp)} revenue</span><span>${pct(b.ucp_pct)} of sales</span>`,
      'var(--amber-dim)'
    )).join('')
  );

  const d2 = sec('D2 — By Salesperson',
    (disc.by_staff||[]).sort((a,b)=>b.total_disc-a.total_disc).map(s=>rrow(
      s.staff_name,
      `<span style="color:${dc(s.avg_disc_when_given)}">${pct(s.avg_disc_when_given)} avg</span>`,
      null,
      `<span>${s.no_disc} clean (${s.no_disc_pct}%)</span><span>total ${fI(s.total_disc)}</span>`
    )).join('')
  );

  const byCat = (disc.by_cat||[]).filter(c=>c.disc>0||c.no_disc>0||c.with_disc>0);
  const d3 = byCat.length ? sec('D3 — By Category',
    byCat.sort((a,b)=>b.disc-a.disc).map(c=>rrow(
      c.category,
      `<span style="color:${dc(c.disc_pct)}">${pct(c.disc_pct)}</span>`,
      null,
      `<span>${fI(c.disc)} total disc</span><span>${c.no_disc} no-disc txns</span>`
    )).join('')
  ) : '';

  return d1 + d2 + d3;
}

// ── TAB 5: CUSTOMERS ────────────────────────────────────────────────
function renderCustomers(R) {
  const custs = R.customers||{};
  const ex    = R.extended||{};
  let html    = '';

  // Cu1 High-value
  const hvTxns = ex.hv_txns||[];
  if (hvTxns.length) {
    html += sec('Cu1 — High-Value Transactions',
      hvTxns.map(t=>`
        <div class="r-row">
          <div class="r-row-top">
            <span class="r-label">${t.customer_name}</span>
            <span class="r-value" style="color:var(--amber)">${fI(t.ucp)}</span>
          </div>
          <div class="r-meta">
            <span>📅 ${fmtDate(t.date)}</span>
            <span>👤 ${t.staff_name}</span>
            <span>📦 ${t.category}</span>
          </div>
        </div>`).join('')
    );
  }

  // Cu2 Top 10
  const top10 = (custs.top_customers||[]);
  if (top10.length) {
    const maxNet = Math.max(...top10.map(c=>c.net),1);
    html += sec('Cu2 — Top 10 by Revenue',
      top10.map((c,i)=>rrow(`${i+1}. ${c.customer_name}`, fI(c.net), bar(c.net,maxNet),
        `<span>${num(c.txns)} visit${c.txns!==1?'s':''}</span><span>${pct(c.share_pct)} of revenue</span>`
      )).join('')
    );
  }

  // Cu3 Concentration
  const conc = ex.concentration;
  if (conc && conc.available) {
    html += sec('Cu3 — Customer Concentration',
      [
        {label:`Top 10% (${conc.top10pct_count} customers)`, pct:conc.top10pct_revenue},
        {label:`Top 20% (${conc.top20pct_count} customers)`, pct:conc.top20pct_revenue},
        {label:`Top 50% (${conc.top50pct_count} customers)`, pct:conc.top50pct_revenue},
      ].map(r=>`
        <div class="r-row">
          <div class="r-row-top"><span class="r-label">${r.label}</span><span class="r-value">${pct(r.pct)} of revenue</span></div>
          <div class="r-bar-track"><div class="r-bar-fill" style="width:${r.pct}%"></div></div>
        </div>`).join('') +
      (conc.top10pct_revenue > 60 ? insight('⚠️ High revenue concentration — top 10% drive over 60% of sales','warn') : '')
    );
  }

  // Cu4 Frequency
  const freq = ex.frequency;
  if (freq && freq.available) {
    const maxCount = Math.max(...freq.bands.map(b=>b.count),1);
    const rs = freq.repeat_split;
    html += sec('Cu4 — Purchase Frequency',
      freq.bands.map(b=>rrow(b.label, `${b.count} customers`, bar(b.count,maxCount),
        `<span>${pct(b.cust_pct)} of base</span><span>${pct(b.rev_pct)} of revenue</span>`
      )).join('') +
      (rs ? `<div class="r-sub-title" style="margin-top:10px">One-time vs Repeat</div>
        <div class="split-row">
          <div class="split-box">
            <div class="split-val">${pct(rs.one_time_revenue_pct)}</div>
            <div class="split-lbl">One-time revenue<br>${rs.one_time_count} customers</div>
          </div>
          <div class="split-box" style="border-color:var(--green)">
            <div class="split-val" style="color:var(--green)">${pct(rs.repeat_revenue_pct)}</div>
            <div class="split-lbl">Repeat revenue<br>${rs.repeat_count} customers</div>
          </div>
        </div>` : '')
    );
  }

  // Cu5 Demographics
  const demo = ex.demographics;
  console.log('[Cu5] available:', demo?.available, '| by_city:', (demo?.by_city||[]).length);
  if (demo && demo.available) {
    let demoHtml = '';
    if (demo.by_city && demo.by_city.length) {
      const maxC = Math.max(...demo.by_city.map(c=>c.revenue),1);
      demoHtml += `<div class="r-sub-title">By City</div>` +
        demo.by_city.slice(0,8).map(c=>rrow(c.label, fI(c.revenue), bar(c.revenue,maxC),
          `<span>${c.customer_count} customers</span><span>${pct(c.revenue_pct)} share</span>`
        )).join('');
    }
    if (demo.by_state && demo.by_state.length) {
      const maxS = Math.max(...demo.by_state.map(s=>s.revenue),1);
      demoHtml += `<div class="r-sub-title">By State</div>` +
        demo.by_state.slice(0,8).map(s=>rrow(s.label, fI(s.revenue), bar(s.revenue,maxS),
          `<span>${s.customer_count} customers</span><span>${pct(s.revenue_pct)} share</span>`
        )).join('');
    }
    if (demoHtml) html += sec('Cu5 — Customer Geography', demoHtml);
  }

  return html || noData('No customer data.');
}

// ── TAB 6: TRENDS ───────────────────────────────────────────────────
function renderTrends(R) {
  const ex      = R.extended||{};
  console.log('[Trends] monthly:', (ex.monthly_trend||[]).length,
    '| quarterly:', (ex.quarterly_trend||[]).length,
    '| seasonality:', (ex.seasonality||[]).length,
    '| weekly:', (R.weekly||[]).length,
    '| monthly sample:', (ex.monthly_trend||[]).slice(0,3).map(m=>m.label+':'+m.ucp));
  const weekly  = R.weekly||[];
  const monthly = ex.monthly_trend||[];
  const qtrs    = ex.quarterly_trend||[];
  const season  = ex.seasonality||[];
  let html = '';

  // T4 Monthly — show even for 1 month, compare callouts only for 2+
  if (monthly.length >= 1) {
    const maxM = Math.max(...monthly.map(m=>m.ucp),1);
    html += sec('T4 — Monthly Revenue',
      monthly.map(m=>rrow(m.label, fI(m.ucp), bar(m.ucp,maxM),
        `<span>${num(m.txns)} txns</span><span>${fI(m.avg_txn)} avg</span><span>${m.customers} custs</span>`
      )).join('')
    );
    if (monthly.length >= 2) {
      const best  = monthly.reduce((a,b)=>a.ucp>b.ucp?a:b);
      const worst = monthly.reduce((a,b)=>a.ucp<b.ucp?a:b);
      html += insight(`🏆 Best: <strong>${best.label}</strong> — ${fI(best.ucp)}`,'good');
      if (best.label !== worst.label)
        html += insight(`📉 Weakest: <strong>${worst.label}</strong> — ${fI(worst.ucp)}`);
    } else {
      html += insight(`ℹ️ Upload more months of data to compare trends and see best/weakest month analysis.`);
    }
  }

  // T2 Quarterly
  if (qtrs.length >= 2) {
    const maxQ = Math.max(...qtrs.map(q=>q.ucp),1);
    html += sec('T2 — Quarterly Revenue',
      qtrs.map(q=>rrow(q.label, fI(q.ucp), bar(q.ucp,maxQ),
        `<span>${num(q.txns)} txns</span><span>${fI(q.avg_txn)} avg</span>`
      )).join('')
    );
  }

  // T5 Seasonality — only if 2+ occurrences of same month
  const seasonData = season.filter(s=>s.occurrences>=2);
  if (seasonData.length >= 2) {
    const maxS = Math.max(...seasonData.map(s=>s.avg_ucp),1);
    html += sec('T5 — Seasonality (avg by month)',
      seasonData.map(s=>rrow(s.label, fI(s.avg_ucp), bar(s.avg_ucp,maxS),
        `<span>${s.occurrences} months of data</span><span>${num(s.txns)} total txns</span>`
      )).join('')
    );
    const bestS  = seasonData.reduce((a,b)=>a.avg_ucp>b.avg_ucp?a:b);
    const worstS = seasonData.reduce((a,b)=>a.avg_ucp<b.avg_ucp?a:b);
    html += insight(`🏆 Peak month: <strong>${bestS.label}</strong> — ${fI(bestS.avg_ucp)} avg`,'good');
    html += insight(`📉 Slow month: <strong>${worstS.label}</strong> — ${fI(worstS.avg_ucp)} avg`);
  }

  // Weekly fallback
  if (!html && weekly.length) {
    const maxW = Math.max(...weekly.map(w=>w.ucp),1);
    html += sec('Weekly Revenue Trend',
      weekly.map(w=>rrow(w.week, fI(w.ucp), bar(w.ucp,maxW),
        `<span>${num(w.txns)} txns</span><span>${fI(w.avg_txn)} avg</span>`
      )).join('')
    );
    html += `<div class="no-data" style="margin-top:8px">Upload multiple months of data to see monthly and quarterly trends.</div>`;
  }

  if (!html) html = noData('Not enough data for trend analysis.');
  return html;
}

// ── TAB 7: ACTION CENTER ────────────────────────────────────────────
const SEG = {
  'Champion':             {icon:'🏆',color:'#1a6b45'},
  'High Value':           {icon:'💎',color:'#1a4a8b'},
  'At Risk — High Value': {icon:'🚨',color:'#c0392b'},
  'At Risk — Loyal':      {icon:'⚠️',color:'#b85c1a'},
  'Loyal':                {icon:'⭐',color:'#c9973a'},
  'New Customer':         {icon:'🌱',color:'#2e7d32'},
  'Needs Attention':      {icon:'🔔',color:'#8a9ab0'},
  'Lost':                 {icon:'💤',color:'#555e6b'},
};

function makeCard(c, idx) {
  const s   = c.segment||'Needs Attention';
  const cfg = SEG[s]||{icon:'○',color:'var(--grey)'};
  const ad  = c.action_detail||{};
  const signals = (c.signals||[]).slice(0,2);
  return `
    <div class="action-card" data-action-idx="${idx}" data-segment="${s.trim()}"
         style="border-left-color:${cfg.color}">
      <div class="action-card-top">
        <div class="action-card-left">
          <div class="action-name">${c.customer_name}</div>
          <div class="action-seg" style="color:${cfg.color}">${cfg.icon} ${s}</div>
        </div>
        <div class="action-right">
          <div class="action-value">${fI(c.monetary)}</div>
          <div class="action-days">${c.recency_days||0}d ago</div>
        </div>
      </div>
      ${signals.length?`<div class="action-signals">${signals.map(sg=>`<span class="action-signal">⚑ ${sg}</span>`).join('')}</div>`:''}
      <div class="action-preview">${(ad.message||c.action||'').substring(0,80)}…</div>
      <div class="action-footer">
        <span class="action-pill">📱 ${ad.channel||'WhatsApp'}</span>
        <span class="action-pill">⏰ ${ad.timing||'This month'}</span>
        <span class="action-tap">Tap to open →</span>
      </div>
    </div>`;
}

function renderAction(rfm) {
  if (!rfm||!rfm.available)
    return noData('Not enough customer data for RFM. Need named customers with transactions.');

  const segs   = rfm.segments||{};
  const risk   = rfm.risk_summary||{};
  const atRisk = (risk.CRITICAL||0)+(risk.HIGH||0);
  const order  = ['At Risk — High Value','At Risk — Loyal','Champion','High Value',
                   'Loyal','New Customer','Needs Attention','Lost'];

  // Store all customers globally for filtering + modal
  window._rfmCustomers = rfm.customers||[];
  window._activeSegFilter = null;

  const pills = order.filter(s=>segs[s]).map(s=>{
    const cfg=SEG[s]||{icon:'○',color:'var(--grey)'};
    return `
      <div class="seg-pill seg-pill-filter" data-filter-seg="${s}"
           style="border-color:${cfg.color};cursor:pointer">
        <span style="font-size:11px;font-weight:600">${cfg.icon} ${s}</span>
        <span class="seg-count" style="color:${cfg.color}">${segs[s]}</span>
      </div>`;
  }).join('');

  const totalCusts = (rfm.customers||[]).length;
  const cards = (rfm.customers||[]).map((c,idx)=>makeCard(c,idx)).join('');

  return `<div class="seg-pills" id="seg-pills-grid">${pills}</div>` +
    `<div class="action-filter-bar">
       <span class="action-filter-label" id="action-filter-label">All ${totalCusts} customers — tap a tile to filter</span>
       <button class="action-filter-clear hidden" id="action-filter-clear">Clear filter ✕</button>
     </div>` +
    `<div id="action-cards-list">${cards}</div>`;
}

// ── ACTION MODAL ────────────────────────────────────────────────────
const ActionCenter = {
  _msg: '',

  init() {
    if (document.getElementById('action-modal')) return;
    const el = document.createElement('div');
    el.id = 'action-modal';
    el.className = 'modal-overlay hidden';
    el.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <div>
            <div class="modal-name" id="modal-name"></div>
            <div class="modal-seg"  id="modal-seg"></div>
          </div>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-stat-row" id="modal-stats"></div>
          <div class="modal-section-title">Risk signals</div>
          <div id="modal-signals"></div>
          <div class="modal-section-title">Recommended action</div>
          <div class="modal-channel-row" id="modal-channel"></div>
          <div class="modal-message" id="modal-message"></div>
          <div class="modal-why" id="modal-why"></div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn-whatsapp" id="modal-wa-btn">📱 Open WhatsApp</button>
          <button class="modal-btn-copy"     id="modal-copy-btn">📋 Copy Message</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if(e.target===el) this.close(); });
    document.getElementById('modal-close-btn').addEventListener('click', ()=>this.close());
    document.getElementById('modal-wa-btn').addEventListener('click', ()=>this.whatsapp());
    document.getElementById('modal-copy-btn').addEventListener('click', ()=>this.copy());
  },

  open(idx) {
    const c = (window._rfmCustomers||[])[idx];
    if (!c) { console.warn('[ActionCenter] no customer at', idx); return; }
    const seg = c.segment||'Needs Attention';
    const cfg = SEG[seg]||{icon:'○',color:'var(--grey)'};
    const ad  = c.action_detail||{};

    document.getElementById('modal-name').textContent = c.customer_name;
    document.getElementById('modal-seg').innerHTML =
      `<span style="color:${cfg.color}">${cfg.icon} ${seg}</span>`;

    document.getElementById('modal-stats').innerHTML = [
      {label:'Total Spent',  value:fI(c.monetary)},
      {label:'Visits',       value:c.frequency||1},
      {label:'Last Visit',   value:`${c.recency_days||0}d ago`},
      {label:'Buys',         value:c.preferred_cat||'—'},
    ].map(({label,value})=>
      `<div class="modal-stat">
        <div class="modal-stat-val">${value}</div>
        <div class="modal-stat-lbl">${label}</div>
      </div>`).join('');

    const signals = c.signals||[];
    document.getElementById('modal-signals').innerHTML = signals.length
      ? signals.map(s=>`<div class="modal-signal">⚑ ${s}</div>`).join('')
      : `<div style="color:var(--grey);font-size:12px">No specific risk signals detected.</div>`;

    document.getElementById('modal-channel').innerHTML =
      `<span class="action-pill">📱 ${ad.channel||'WhatsApp'}</span>
       <span class="action-pill">⏰ ${ad.timing||'This month'}</span>`;

    this._msg = ad.message||c.action||'';
    document.getElementById('modal-message').textContent = `"${this._msg}"`;
    document.getElementById('modal-why').textContent = ad.why ? `Why this works: ${ad.why}` : '';

    document.getElementById('action-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('action-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
  },

  whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(this._msg)}`, '_blank');
  },

  copy() {
    const btn = document.getElementById('modal-copy-btn');
    navigator.clipboard.writeText(this._msg)
      .then(()=>{ btn.textContent='✓ Copied!'; setTimeout(()=>btn.textContent='📋 Copy Message',2000); })
      .catch(()=>{
        const t=document.createElement('textarea');
        t.value=this._msg; document.body.appendChild(t); t.select();
        document.execCommand('copy'); document.body.removeChild(t);
        btn.textContent='✓ Copied!'; setTimeout(()=>btn.textContent='📋 Copy Message',2000);
      });
  },
};

// ── TAB SWITCHER ────────────────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const p=document.getElementById(id);
  if(p){ p.classList.add('active'); p.querySelector('.tab-scroll')?.scrollTo(0,0); }
  document.querySelector(`[data-tab="${id}"]`)?.classList.add('active');
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>switchTab(btn.dataset.tab));
  });
}

function filterActionCards(seg) {
  const cards   = document.querySelectorAll('#action-cards-list .action-card');
  const label   = document.getElementById('action-filter-label');
  const clearBtn= document.getElementById('action-filter-clear');
  const pills   = document.querySelectorAll('.seg-pill-filter');

  window._activeSegFilter = seg;

  // Update pill active states
  pills.forEach(p => {
    const isActive = p.dataset.filterSeg === seg;
    p.classList.toggle('seg-pill-active', isActive);
  });

  if (!seg) {
    // Show all
    cards.forEach(card => card.style.display = '');
    const total = (window._rfmCustomers||[]).length;
    if (label) label.textContent = `All customers (${total})`;
    if (clearBtn) clearBtn.classList.add('hidden');
  } else {
    // Filter
    let shown = 0;
    cards.forEach(card => {
      const match = (card.dataset.segment||"").trim() === seg.trim();
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    const cfg = SEG[seg]||{icon:'○'};
    if (label) label.textContent = `${cfg.icon} ${seg} — ${shown} customer${shown!==1?'s':''}`;
    if (clearBtn) clearBtn.classList.remove('hidden');
  }
}

function initActionDelegation() {
  const panel = document.getElementById('tab-action');
  if (!panel) return;
  if (panel._actionListenerAttached) return;
  panel._actionListenerAttached = true;

  panel.addEventListener('click', function(e) {
    // Card tap → open modal
    const card = e.target.closest('[data-action-idx]');
    if (card) {
      const idx = parseInt(card.dataset.actionIdx);
      console.log('[ActionCenter] card tapped idx:', idx);
      ActionCenter.open(idx);
      return;
    }

    // Pill tap → filter
    const pill = e.target.closest('.seg-pill-filter');
    if (pill) {
      const seg = (pill.dataset.filterSeg||"").trim();
      const current = window._activeSegFilter;
      // Tap same pill again → clear filter
      filterActionCards(current === seg ? null : seg);
      return;
    }

    // Clear button
    if (e.target.id === 'action-filter-clear') {
      filterActionCards(null);
    }
  });

  // Clear filter button (separate listener for safety)
  document.getElementById('action-filter-clear')?.addEventListener('click', () => {
    filterActionCards(null);
  });

  console.log('[ActionCenter] delegation attached');
}

// ── MAIN RENDER ─────────────────────────────────────────────────────
const Renderer = {
  render(R, storeName, period, confidence) {
    console.log('[Renderer v4] data check:',
      'cats:', (R.category||[]).length,
      'staff:', (R.staff||[]).length,
      'tos:', (R.time_of_sale||[]).length,
      'tos_has_data:', (R.time_of_sale||[]).some(t=>t.txns>0),
      'disc_by_cat:', (R.discount?.by_cat||[]).length,
      'rfm:', R.rfm?.available,
      'extended_keys:', Object.keys(R.extended||{})
    );
    console.log('[Renderer v4] start | cats:', (R.category||[]).length,
      '| staff:', (R.staff||[]).length, '| rfm:', R.rfm?.available);

    // Header
    document.getElementById('report-store').textContent  = storeName;
    document.getElementById('report-period').textContent = period;
    document.getElementById('report-badge').innerHTML    =
      confidence==='exact'
        ? `<span class="badge badge-green">✓ POS auto-detected</span>`
        : `<span class="badge badge-amber">✓ Mapping applied</span>`;

    // Init modal
    ActionCenter.init();

    // Render each tab
    renderSummary(R);
    document.getElementById('tab-category-content').innerHTML  = renderCategory(R);
    document.getElementById('tab-staff-content').innerHTML     = renderStaff(R);
    document.getElementById('tab-discount-content').innerHTML  = renderDiscount(R);
    document.getElementById('tab-customers-content').innerHTML = renderCustomers(R);
    document.getElementById('tab-trends-content').innerHTML    = renderTrends(R);
    document.getElementById('tab-action-content').innerHTML    = renderAction(R.rfm);
    initActionDelegation(); // must be AFTER innerHTML set

    switchTab('tab-summary');
    console.log('[Renderer v4] done');
  },
  initTabs,
  switchTab,
};

window.Renderer = Renderer;
window.ActionCenter = ActionCenter;
