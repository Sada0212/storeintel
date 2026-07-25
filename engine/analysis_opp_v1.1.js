/**
 * StoreIntel — Opportunity Report Analysis Engine
 * Version: analysis_opp_v1.1.js
 * Date:    2026-07-07 (v1.1: np_rso → np_salesperson)
 * Platform: Mobile PWA (Vanilla JS, runs in-browser)
 *
 * Purpose:
 *   Takes clean rows from ingestion_opp_v1.1.js and computes all
 *   metrics for the 5-tab Opportunity Report:
 *     Tab 1 — Overview     : headline KPIs + reason split + insight
 *     Tab 2 — Diagnosis    : root cause ranked + category matrix +
 *                            salesperson pattern + EA gap + insights
 *     Tab 3 — Opportunity  : prioritised contact list P1/P2/P3
 *                            with suggested message per customer
 *     Tab 4 — Stock Gaps   : demand signals — stock now / reprice /
 *                            size depth / competitor intel
 *     Tab 5 — Trends       : monthly trend (only if 2+ months)
 *
 * Mirrors:
 *   opp_analysis_v1.1.py (Web Python) — identical output structure.
 *   Any difference = parity defect (R2).
 *
 * Standing rules:
 *   R1 — Versioned: analysis_opp_v1.1.js
 *   R2 — Output structure identical to opp_analysis_v1.1.py
 *   R3 — Sector-neutral core. Jewellery additive.
 *   R4 — Jewellery first. Leather/Apparel defined, not yet active.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — mirrors opp_analysis_v1.1.py
// ─────────────────────────────────────────────────────────────────────────────

const AMC_MARKET_BENCHMARK = 14.0;
const STOCK_GAP_MIN_REQUESTS = 2;

const P1_LABEL = 'Call Today';
const P2_LABEL = 'Follow Up';
const P3_LABEL = 'When Stocked';

const REASON_LABELS = {
  DESIGN:       'Design Gap',
  PRICE:        'Making Charges / Price',
  SIZE:         'Size Not Available',
  WEIGHT:       'Weight Not Available',
  AVAILABILITY: 'Product Not in Store',
  OTHER:        'Other',
};

const COMPETITOR_CONTEXT = {
  TANISHQ:      'Design benchmark',
  GRT:          'Price benchmark',
  MALABAR:      'Price / service benchmark',
  LALITHA:      'Price benchmark',
  KALYAN:       'Price benchmark',
  LOCAL:        'Price benchmark (local unorganised)',
  'LOCAL STORE':'Price benchmark (local unorganised)',
  HIDESIGN:     'Design / brand benchmark',
  BAGGIT:       'Price benchmark',
};

// Specific demand patterns scanned in remarks
const DEMAND_PATTERNS = [
  /SOUTH\s+SCREW/i, /COUPLE\s+RING/i, /KASU\s+MAL[AI]/i,
  /ANTIC\s+NECKLACE/i, /U\s+TYPE\s+HARAM/i, /BABY\s+BANGLE/i,
  /ROSE\s+GOLD/i, /MMTC/i, /PLATINUM\s+(?:RING|CHAIN|BANGLE)/i,
  /SILVER\s+(?:ANKLET|RING)/i, /SNAKE\s+CHAIN/i, /KADA\s+BANGLE/i,
  /NORMAL\s+SCREW/i, /FANCY\s+CHAIN/i, /CZ\s+(?:STONE|JEWEL)/i,
  /RUBY\s+STONE/i, /VINAYAGAR\s+RING/i, /ROPE\s+CHAIN/i,
  /BALL\s+(?:TYPE\s+)?CHAIN/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS — mirrors opp_analysis_v1.1.py helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtINR(v) {
  if (v >= 1e7)  return `₹${(v/1e7).toFixed(2)}Cr`;
  if (v >= 1e5)  return `₹${(v/1e5).toFixed(2)}L`;
  if (v >= 1e3)  return `₹${(v/1e3).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

function pct(part, total, dec = 0) {
  if (!total) return 0;
  return +((part / total) * 100).toFixed(dec);
}

function groupBy(rows, key) {
  const m = {};
  for (const r of rows) {
    const k = r[key] ?? '__null__';
    if (!m[k]) m[k] = [];
    m[k].push(r);
  }
  return m;
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0);
}

function extractDemandSignals(rows) {
  const counter = {};
  for (const r of rows) {
    const rem = (r.np_remarks || '').toUpperCase();
    for (const pat of DEMAND_PATTERNS) {
      const label = pat.source.replace(/\\s\+/g,' ').replace(/[()]/g,'').trim();
      if (pat.test(rem)) counter[label] = (counter[label] || 0) + 1;
    }
  }
  return Object.entries(counter).sort((a,b)=>b[1]-a[1]);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

function computeOverview(rows, validation) {
  const total      = rows.length;
  const totalValue = sumField(rows, 'np_value');
  const avgValue   = total > 0 ? totalValue / total : 0;

  const shownRows  = rows.filter(r => r.np_product_shown === true);
  const p1Rows     = rows.filter(r => r.np_product_shown === true && r.np_reason === 'PRICE');

  const reasonCounts = {}, reasonValues = {};
  for (const r of rows) {
    reasonCounts[r.np_reason] = (reasonCounts[r.np_reason] || 0) + 1;
    reasonValues[r.np_reason] = (reasonValues[r.np_reason] || 0) + r.np_value;
  }

  const reasonSplit = Object.entries(REASON_LABELS).map(([reason, label]) => {
    const count = reasonCounts[reason] || 0;
    const value = reasonValues[reason] || 0;
    return { reason, label, count, value: Math.round(value), value_fmt: fmtINR(value), pct: pct(count, total) };
  });

  const newCount    = rows.filter(r => r.np_customer_type === 'NEW').length;
  const oldCount    = rows.filter(r => r.np_customer_type === 'RETURNING').length;
  const genderCounts= {}, occasionCounts = {};
  for (const r of rows) {
    if (r.np_gender)  genderCounts[r.np_gender]  = (genderCounts[r.np_gender]  || 0) + 1;
    if (r.np_occasion)occasionCounts[r.np_occasion]=(occasionCounts[r.np_occasion]||0)+1;
  }

  const p1Value     = sumField(p1Rows, 'np_value');
  const recValue    = sumField(shownRows,'np_value');

  const insight = `${fmtINR(p1Value)} is recoverable this week — ${p1Rows.length} customers ` +
    `selected a product but walked away on making charges alone. ` +
    `One targeted call campaign can convert these.`;

  return {
    total_footfalls:       total,
    total_value:           Math.round(totalValue),
    total_value_fmt:       fmtINR(totalValue),
    avg_value:             Math.round(avgValue),
    avg_value_fmt:         fmtINR(avgValue),
    recoverable_count:     shownRows.length,
    recoverable_value:     Math.round(recValue),
    recoverable_value_fmt: fmtINR(recValue),
    recoverable_pct:       pct(shownRows.length, total),
    p1_count:              p1Rows.length,
    p1_value:              Math.round(p1Value),
    p1_value_fmt:          fmtINR(p1Value),
    reason_split:          reasonSplit,
    new_count:             newCount,
    old_count:             oldCount,
    new_pct:               pct(newCount, total),
    gender_counts:         genderCounts,
    occasion_counts:       occasionCounts,
    period_label:          validation.period_label || '',
    insight,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — DIAGNOSIS
// ─────────────────────────────────────────────────────────────────────────────

function computeDiagnosis(rows, sector = 'jewellery') {
  const total = rows.length;

  // Category × Reason matrix
  const catGroups  = groupBy(rows, 'np_category');
  const categoryMatrix = Object.entries(catGroups)
    .sort((a,b) => sumField(b[1],'np_value') - sumField(a[1],'np_value'))
    .map(([cat, grp]) => {
      const row = { category: cat, total: grp.length,
                    value: Math.round(sumField(grp,'np_value')),
                    value_fmt: fmtINR(sumField(grp,'np_value')) };
      for (const r of Object.keys(REASON_LABELS))
        row[r.toLowerCase()] = grp.filter(x=>x.np_reason===r).length;
      return row;
    });

  // Salesperson pattern
  const salespersonStats = Object.entries(groupBy(rows, 'np_salesperson'))
    .map(([sp, grp]) => {
      const unavail  = grp.filter(r => r.np_product_shown === false);
      const eaOffered= unavail.filter(r => r.np_alternate_offered === true).length;
      const reasonCt = {};
      for (const r of grp) reasonCt[r.np_reason] = (reasonCt[r.np_reason]||0)+1;
      const topReason = Object.entries(reasonCt).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
      return {
        salesperson:        sp,
        total_nps:          grp.length,
        value:              Math.round(sumField(grp,'np_value')),
        value_fmt:          fmtINR(sumField(grp,'np_value')),
        product_shown_pct:  pct(grp.filter(r=>r.np_product_shown===true).length, grp.length),
        ea_offer_pct:       unavail.length > 0 ? pct(eaOffered, unavail.length) : null,
        top_reason:         topReason,
        top_reason_label:   REASON_LABELS[topReason] || topReason,
      };
    })
    .sort((a,b) => b.value - a.value);

  // EA gap
  const unavailRows = rows.filter(r => r.np_product_shown === false);
  const eaGapRows   = unavailRows.filter(r => r.np_alternate_offered === false);
  const eaGapValue  = sumField(eaGapRows, 'np_value');
  const eaGapPct    = pct(eaGapRows.length, unavailRows.length);
  const eaInsight   = `${eaGapRows.length} customers left when product was unavailable ` +
    `and no alternate was offered. That is ${eaGapPct}% of all unavailable-product NPs ` +
    `where Endless Aisle was never used. Staff training on EA is the lowest-cost recovery action available.`;

  // Per-reason insights
  const designRows  = rows.filter(r => r.np_reason === 'DESIGN');
  const designCats  = {}; 
  for (const r of designRows) designCats[r.np_category]=(designCats[r.np_category]||0)+r.np_value;
  const topDesignCat   = Object.entries(designCats).sort((a,b)=>b[1]-a[1])[0];
  const demandSigs     = extractDemandSignals(designRows);
  const topAsk         = demandSigs[0]?.[0] || 'specific designs';
  const designPct      = pct(designRows.length, total);
  const designValue    = sumField(designRows, 'np_value');

  const priceRows   = rows.filter(r => r.np_reason === 'PRICE');
  const amcValues   = rows.map(r=>r.np_amc_pct).filter(v=>v!=null&&v>0);
  const storeAMC    = amcValues.length ? +(amcValues.reduce((a,b)=>a+b,0)/amcValues.length).toFixed(1) : 18.0;
  const amcGap      = +(storeAMC - AMC_MARKET_BENCHMARK).toFixed(1);
  const priceValue  = sumField(priceRows,'np_value');
  const compInPrice = priceRows.flatMap(r=>(r.np_competitor_ref||'').split(',').map(c=>c.trim()).filter(Boolean));
  const compCt      = {};
  for (const c of compInPrice) compCt[c]=(compCt[c]||0)+1;
  const topComp     = Object.entries(compCt).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Local stores';

  const sizeRows    = rows.filter(r => r.np_reason === 'SIZE');
  const sizeCats    = {};
  for (const r of sizeRows) sizeCats[r.np_category]=(sizeCats[r.np_category]||0)+1;
  const topSizeCat  = Object.entries(sizeCats).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
  const sizeCodes   = {};
  for (const r of sizeRows) if(r.np_size) sizeCodes[r.np_size]=(sizeCodes[r.np_size]||0)+1;
  const topSize     = Object.entries(sizeCodes).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

  const weightRows  = rows.filter(r => r.np_reason === 'WEIGHT');
  const weightCats  = {};
  for (const r of weightRows) weightCats[r.np_category]=(weightCats[r.np_category]||0)+r.np_value;
  const topWeightCat= Object.entries(weightCats).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

  const reasonInsights = {
    DESIGN: {
      count: designRows.length,
      value: Math.round(designValue), value_fmt: fmtINR(designValue),
      pct: designPct,
      top_category:    topDesignCat?.[0] || '—',
      top_cat_value:   Math.round(topDesignCat?.[1] || 0),
      top_cat_value_fmt: fmtINR(topDesignCat?.[1] || 0),
      top_ask: topAsk,
      product_not_available_count: designRows.filter(r=>r.np_product_shown===false).length,
      insight: `${designPct}% of lost footfall is a design gap. These customers came with intent. ` +
               `Stocking ${topAsk} alone could recover ${fmtINR(topDesignCat?.[1]||0)} in missed sales.`,
    },
    PRICE: {
      count: priceRows.length,
      value: Math.round(priceValue), value_fmt: fmtINR(priceValue),
      pct: pct(priceRows.length, total),
      store_amc: storeAMC, market_benchmark: AMC_MARKET_BENCHMARK, amc_gap: amcGap,
      top_competitor: topComp,
      insight: `Your average AMC is ${storeAMC}% — customers expect ${AMC_MARKET_BENCHMARK}%. ` +
               `The ${amcGap}% gap cost you ${fmtINR(priceValue)} across ${priceRows.length} customers ` +
               `in this period. ${topComp} was mentioned as the price reference.`,
    },
    SIZE: {
      count: sizeRows.length,
      value: Math.round(sumField(sizeRows,'np_value')), value_fmt: fmtINR(sumField(sizeRows,'np_value')),
      pct: pct(sizeRows.length, total),
      top_category: topSizeCat, top_size: topSize,
      insight: sizeRows.length > 0
        ? `${sizeRows.length} customers needed a size you did not have. ` +
          `The most requested missing size is ${topSize} in ${topSizeCat}. Quick restock fix.`
        : null,
    },
    WEIGHT: {
      count: weightRows.length,
      value: Math.round(sumField(weightRows,'np_value')), value_fmt: fmtINR(sumField(weightRows,'np_value')),
      pct: pct(weightRows.length, total),
      top_category: topWeightCat, insight: null,
    },
  };

  // Jewellery-specific extras
  let jewelleryExtras = {};
  if (sector === 'jewellery') {
    const karatCt = {};
    for (const r of rows) if (r.np_karat) karatCt[r.np_karat]=(karatCt[r.np_karat]||0)+1;
    const clusterGroups = groupBy(rows,'np_cluster');
    const clusterBreakdown = Object.entries(clusterGroups)
      .map(([cl,grp])=>({ cluster:cl, count:grp.length,
                          value:Math.round(sumField(grp,'np_value')),
                          value_fmt:fmtINR(sumField(grp,'np_value')) }))
      .sort((a,b)=>b.value-a.value);
    jewelleryExtras = { karat_demand: karatCt, cluster_breakdown: clusterBreakdown };
  }

  return {
    category_matrix: categoryMatrix,
    salesperson_stats: salespersonStats,
    ea_gap_count:    eaGapRows.length,
    ea_gap_pct:      eaGapPct,
    ea_gap_value:    Math.round(eaGapValue),
    ea_gap_value_fmt:fmtINR(eaGapValue),
    ea_insight:      eaInsight,
    reason_insights: reasonInsights,
    jewellery:       jewelleryExtras,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — OPPORTUNITY (Contact List)
// ─────────────────────────────────────────────────────────────────────────────

function computeOpportunity(rows) {
  function buildCard(r, priority, priorityLabel) {
    const hasComp = !!(r.np_competitor_ref);
    const cat     = r.np_category || '';
    const name    = r.np_customer_name || 'there';

    let message;
    if (hasComp) {
      message = `Hi ${name}, we understand you've seen options elsewhere. ` +
                `We'd love to show you what makes ours different — could we arrange a quick visit?`;
    } else if (priority === 'P1') {
      message = `Hi ${name}, we have a special making charge offer this week on ` +
                `${cat ? cat.charAt(0)+cat.slice(1).toLowerCase() : 'the item you liked'}. ` +
                `Would you like to come back and take another look?`;
    } else if (priority === 'P2') {
      message = `Hi ${name}, we just received new designs in ` +
                `${cat ? cat.charAt(0)+cat.slice(1).toLowerCase() : 'your category of interest'} ` +
                `— thought of you. Worth a quick visit?`;
    } else {
      message = `Hi ${name}, good news — the ` +
                `${cat ? cat.charAt(0)+cat.slice(1).toLowerCase() : 'item'} ` +
                `you were looking for is now available. Shall we keep one aside for you?`;
    }

    const remarks = r.np_remarks || '';
    return {
      priority, priority_label: priorityLabel,
      customer_name:    r.np_customer_name || '—',
      mobile:           r.np_mobile || '—',
      salesperson:      r.np_salesperson || '—',
      team:             r.np_team || '—',
      category:         cat || '—',
      occasion:         r.np_occasion || '—',
      value:            Math.round(r.np_value || 0),
      value_fmt:        fmtINR(r.np_value || 0),
      reason:           r.np_reason,
      reason_label:     REASON_LABELS[r.np_reason] || r.np_reason,
      np_date:          r.np_date || '',
      remarks_short:    remarks.length > 120 ? remarks.slice(0,120)+'…' : remarks,
      competitor_flag:  hasComp,
      competitor:       r.np_competitor_ref || '',
      message,
      customer_type:    r.np_customer_type || '—',
    };
  }

  const p1 = rows.filter(r=>r.np_product_shown===true && r.np_reason==='PRICE')
                 .sort((a,b)=>b.np_value-a.np_value).map(r=>buildCard(r,'P1',P1_LABEL));
  const p2 = rows.filter(r=>r.np_product_shown===true && r.np_reason==='DESIGN')
                 .sort((a,b)=>b.np_value-a.np_value).map(r=>buildCard(r,'P2',P2_LABEL));
  const p3 = rows.filter(r=>r.np_product_shown===false)
                 .sort((a,b)=>b.np_value-a.np_value).map(r=>buildCard(r,'P3',P3_LABEL));

  return {
    p1_cards: p1, p2_cards: p2, p3_cards: p3,
    p1_count: p1.length, p2_count: p2.length, p3_count: p3.length,
    p1_value: Math.round(sumField(p1,'value')), p1_value_fmt: fmtINR(sumField(p1,'value')),
    p2_value: Math.round(sumField(p2,'value')), p2_value_fmt: fmtINR(sumField(p2,'value')),
    p3_value: Math.round(sumField(p3,'value')), p3_value_fmt: fmtINR(sumField(p3,'value')),
    total_cards: p1.length+p2.length+p3.length,
    competitor_count: [...p1,...p2,...p3].filter(c=>c.competitor_flag).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — STOCK GAPS
// ─────────────────────────────────────────────────────────────────────────────

function computeStockGaps(rows, sector = 'jewellery') {
  // Stock Now — unavailable product, grouped by category
  const unavail    = rows.filter(r=>r.np_product_shown===false);
  const unavailCat = groupBy(unavail,'np_category');
  const stockNow   = Object.entries(unavailCat)
    .map(([cat,grp])=>({
      category: cat, requests: grp.length,
      value: Math.round(sumField(grp,'np_value')),
      value_fmt: fmtINR(sumField(grp,'np_value')),
      top_ask: extractDemandSignals(grp)[0]?.[0]?.replace(/\\s\+/g,' ') || null,
      action: 'Stock immediately',
    }))
    .filter(r=>r.requests >= STOCK_GAP_MIN_REQUESTS)
    .sort((a,b)=>b.value-a.value);

  // Reprice — PRICE NPs by category with AMC data
  const priceRows = rows.filter(r=>r.np_reason==='PRICE');
  const priceCat  = groupBy(priceRows,'np_category');
  const reprice   = Object.entries(priceCat).map(([cat,grp])=>{
    const amcs    = grp.map(r=>r.np_amc_pct).filter(v=>v!=null&&v>0);
    const amcMean = amcs.length ? +(amcs.reduce((a,b)=>a+b,0)/amcs.length).toFixed(1) : null;
    return {
      category: cat, nps: grp.length,
      value: Math.round(sumField(grp,'np_value')), value_fmt: fmtINR(sumField(grp,'np_value')),
      your_amc: amcMean, market_amc: AMC_MARKET_BENCHMARK,
      gap: amcMean != null ? +(amcMean-AMC_MARKET_BENCHMARK).toFixed(1) : null,
      action: `Review making charge — customers expect ${AMC_MARKET_BENCHMARK}%`,
    };
  }).sort((a,b)=>b.value-a.value);

  // Size depth
  const sizeRows  = rows.filter(r=>r.np_reason==='SIZE');
  const sizeCat   = groupBy(sizeRows,'np_category');
  const sizeGaps  = [];
  for (const [cat,grp] of Object.entries(sizeCat)) {
    const sizeCt = {};
    for (const r of grp) if(r.np_size) sizeCt[r.np_size]=(sizeCt[r.np_size]||0)+1;
    for (const [sz,cnt] of Object.entries(sizeCt)) {
      const val = sumField(grp.filter(r=>r.np_size===sz),'np_value');
      sizeGaps.push({ category:cat, size:sz, requests:cnt,
                      value:Math.round(val), value_fmt:fmtINR(val), action:'Add size to inventory' });
    }
  }
  sizeGaps.sort((a,b)=>b.value-a.value);

  // Competitor intel
  const compCounter = {};
  for (const r of rows.filter(r=>r.np_competitor_ref)) {
    for (const comp of r.np_competitor_ref.split(',').map(c=>c.trim()).filter(Boolean)) {
      if (!compCounter[comp]) compCounter[comp]={count:0,value:0,categories:new Set()};
      compCounter[comp].count++;
      compCounter[comp].value += r.np_value||0;
      if (r.np_category) compCounter[comp].categories.add(r.np_category);
    }
  }
  const compIntel = Object.entries(compCounter)
    .sort((a,b)=>b[1].value-a[1].value)
    .map(([comp,d])=>({
      competitor: comp, mentions: d.count,
      value: Math.round(d.value), value_fmt: fmtINR(d.value),
      context: COMPETITOR_CONTEXT[comp] || 'Benchmark comparison',
      categories: [...d.categories],
    }));

  const topItem   = stockNow[0];
  const stockInsight = topItem
    ? `Your NP register contains ${stockNow.length} distinct demand signals worth ` +
      `${fmtINR(stockNow.reduce((s,x)=>s+x.value,0))} in total. The top item — ` +
      `${topItem.category} — was requested ${topItem.requests} times with ` +
      `${topItem.value_fmt} at stake and zero stock today.`
    : '';

  // Jewellery weight demand
  let jewelleryExtras = {};
  if (sector === 'jewellery') {
    const buckets = [
      {label:'0–2g',min:0,max:2},{label:'2–4g',min:2,max:4},{label:'4–8g',min:4,max:8},
      {label:'8–16g',min:8,max:16},{label:'16–24g',min:16,max:24},{label:'24–32g',min:24,max:32},
      {label:'32–48g',min:32,max:48},{label:'48–64g',min:48,max:64},{label:'64–80g',min:64,max:80},
      {label:'80g+',min:80,max:Infinity},
    ];
    const weightDemand = buckets.map(b=>{
      const grp = rows.filter(r=>r.np_weight_g!=null&&r.np_weight_g>b.min&&r.np_weight_g<=b.max);
      return { bucket:b.label, count:grp.length,
               value:Math.round(sumField(grp,'np_value')), value_fmt:fmtINR(sumField(grp,'np_value')) };
    }).filter(b=>b.count>0).sort((a,b)=>b.value-a.value);
    jewelleryExtras = { weight_demand: weightDemand };
  }

  return { stock_now:stockNow, reprice, size_gaps:sizeGaps, comp_intel:compIntel,
           stock_insight:stockInsight, jewellery:jewelleryExtras };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — TRENDS
// ─────────────────────────────────────────────────────────────────────────────

function computeTrends(rows) {
  const months = [...new Set(rows.map(r=>r.np_month).filter(Boolean))].sort();
  if (months.length < 2) return { available: false, months_found: months.length };

  const monthGroups = groupBy(rows,'np_month');
  const monthly     = months.map(m=>{
    const grp = monthGroups[m] || [];
    return { month:m, count:grp.length,
             value:Math.round(sumField(grp,'np_value')), value_fmt:fmtINR(sumField(grp,'np_value')) };
  });

  const reasonTrend = months.map(m=>{
    const grp = monthGroups[m]||[];
    const row = {month:m};
    for (const r of Object.keys(REASON_LABELS))
      row[r.toLowerCase()] = grp.filter(x=>x.np_reason===r).length;
    return row;
  });

  const last2 = monthly.slice(-2);
  const momChange = last2.length===2 ? {
    from_month: last2[0].month, to_month: last2[1].month,
    count_delta: last2[1].count - last2[0].count,
    value_delta: last2[1].value - last2[0].value,
    value_delta_fmt: fmtINR(Math.abs(last2[1].value - last2[0].value)),
    direction: last2[1].count > last2[0].count ? 'worse' : 'better',
  } : null;

  return { available:true, months_found:months.length, monthly, reason_trend:reasonTrend, mom_change:momChange };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — runAll()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all 5 analysis modules.
 * Returns single results object — the only function renderer_opp_v1.0.js needs.
 * Output structure mirrors opp_analysis_v1.1.py run_all() (R2).
 *
 * @param {Array}  cleanRows  - from ingestion_opp_v1.1.js ingestOpportunity()
 * @param {Object} validation - from ingestion_opp_v1.1.js validateOpp()
 * @param {string} sector     - 'jewellery' | 'leather' | 'apparel'
 * @returns {Object} results
 */
function runAll(cleanRows, validation, sector = 'jewellery') {
  return {
    overview:    computeOverview(cleanRows, validation),
    diagnosis:   computeDiagnosis(cleanRows, sector),
    opportunity: computeOpportunity(cleanRows),
    stock_gaps:  computeStockGaps(cleanRows, sector),
    trends:      computeTrends(cleanRows),
    meta: {
      sector,
      total_records:  cleanRows.length,
      period_label:   validation.period_label || '',
      engine_version: 'analysis_opp_v1.1',
    },
  };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAll, computeOverview, computeDiagnosis,
                     computeOpportunity, computeStockGaps, computeTrends };
}
