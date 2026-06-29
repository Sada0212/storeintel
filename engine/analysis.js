/* StoreIntel — analysis.js
   Port of analysis.py: AnalysisEngine
   Runs on normalised rows from ingestion.js.
   No pandas. Pure JS array operations.
*/
'use strict';

const Analysis = (() => {

  // ── HELPERS ───────────────────────────────────────────────────
  function sum(rows, field) {
    return rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);
  }
  function avg(rows, field) {
    const s = sum(rows, field);
    return rows.length ? s / rows.length : 0;
  }
  function groupBy(rows, field) {
    const map = {};
    for (const r of rows) {
      const key = r[field] ?? 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }
  function uniq(rows, field) {
    return new Set(rows.map(r => r[field]).filter(Boolean)).size;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function pct(num, den) { return den ? round2(num / den * 100) : 0; }

  // ── EXECUTIVE SUMMARY ─────────────────────────────────────────
  function executiveSummary(rows) {
    const sales   = rows.filter(r => r.is_sale !== false);
    const returns = rows.filter(r => r.is_sale === false);

    const grossUcp  = sum(sales, 'gross_value');
    const retAmt    = sum(returns, 'gross_value');
    const netUcp    = grossUcp + retAmt; // returns are negative
    const grossDisc = sum(sales, 'discount_amount');
    const retDisc   = sum(returns, 'discount_amount');
    const netDisc   = grossDisc + retDisc;
    const discPct   = grossUcp ? netDisc / grossUcp * 100 : 0;
    const cmTxns    = sales.length;
    const grnTxns   = returns.length;
    const custSet   = new Set(sales.map(r => r.customer_name).filter(n => n && n !== 'Unknown'));
    const avgTxn    = cmTxns ? grossUcp / cmTxns : 0;
    const totalWt   = sum(sales, 'weight');

    const dates  = sales.map(r => r.transaction_date).filter(Boolean).sort();
    const dateMin = dates[0] || null;
    const dateMax = dates[dates.length - 1] || null;

    return {
      gross_ucp:   grossUcp,  ret_amt:  retAmt,   net_ucp:  netUcp,
      gross_disc:  grossDisc, net_disc: netDisc,  disc_pct: round2(discPct),
      cm_txns:     cmTxns,    grn_txns: grnTxns,
      unique_cust: custSet.size,
      avg_txn:     Math.round(avgTxn),
      total_wt:    round2(totalWt),
      date_min:    dateMin,   date_max: dateMax,
    };
  }

  // ── CATEGORY ANALYSIS ─────────────────────────────────────────
  function categoryAnalysis(rows) {
    const netTotal = sum(rows, 'gross_value');
    const groups   = groupBy(rows, 'category_l1');
    const result   = [];

    for (const [cat, grp] of Object.entries(groups)) {
      const sales   = grp.filter(r => r.is_sale !== false);
      const returns = grp.filter(r => r.is_sale === false);
      const gross   = sum(sales, 'gross_value');
      const ret     = sum(returns, 'gross_value');
      const net     = gross + ret;
      const disc    = sum(sales, 'discount_amount');
      const txns    = sales.length;
      const wt      = sum(sales, 'weight');

      result.push({
        category:      cat,
        txns,
        gross:         Math.round(gross),
        ret:           Math.round(ret),
        net:           Math.round(net),
        discount:      Math.round(disc),
        disc_pct:      pct(disc, gross),
        net_share_pct: pct(net, netTotal),
        avg_txn:       txns ? Math.round(gross / txns) : 0,
        weight:        round2(wt),
      });
    }

    return result.sort((a, b) => b.net - a.net);
  }

  // ── STAFF PERFORMANCE ─────────────────────────────────────────
  function staffPerformance(rows) {
    const netTotal = sum(rows, 'gross_value');
    const groups   = groupBy(rows, 'staff_name');
    const result   = [];

    for (const [name, grp] of Object.entries(groups)) {
      const sales   = grp.filter(r => r.is_sale !== false);
      const returns = grp.filter(r => r.is_sale === false);
      const gross   = sum(sales, 'gross_value');
      const ret     = sum(returns, 'gross_value');
      const net     = gross + ret;
      const disc    = sum(sales, 'discount_amount');
      const txns    = sales.length;
      const custs   = uniq(sales, 'customer_name');

      // Rows with zero discount
      const noDiscTxns = sales.filter(r => {
        const d = parseFloat(r.discount_amount) || 0;
        const g = parseFloat(r.gross_value) || 0;
        return g > 0 ? (d / g * 100) === 0 : true;
      }).length;

      result.push({
        staff_name:    name,
        txns,
        gross:         Math.round(gross),
        net:           Math.round(net),
        ret:           Math.round(ret),
        discount:      Math.round(disc),
        disc_pct:      pct(disc, gross),
        net_share_pct: pct(net, netTotal),
        avg_txn:       txns ? Math.round(gross / txns) : 0,
        customers:     custs,
        no_disc_txns:  noDiscTxns,
      });
    }

    return result.sort((a, b) => b.net - a.net);
  }

  // ── DISCOUNT HEALTH ───────────────────────────────────────────
  function discountHealth(rows, config) {
    const sales = rows.filter(r => r.is_sale !== false);

    // Add disc_pct per row
    const enriched = sales.map(r => {
      const g = parseFloat(r.gross_value) || 0;
      const d = parseFloat(r.discount_amount) || 0;
      return { ...r, disc_pct_row: g > 0 ? d / g * 100 : 0 };
    });

    const grossTotal = sum(enriched, 'gross_value');

    const cfgBands = (config && config.discount_bands) ? config.discount_bands : [
      { label: '0% (No Discount)', min: 0,    max: 0   },
      { label: '0.1% to 3%',       min: 0.01, max: 3   },
      { label: '3.1% to 5%',       min: 3.01, max: 5   },
      { label: '5.1% to 7%',       min: 5.01, max: 7   },
      { label: '7.1% to 10%',      min: 7.01, max: 10  },
      { label: '10%+ (High)',       min: 10.01,max: 999 },
    ];

    const bands = cfgBands.map(b => {
      const subset = enriched.filter(r =>
        b.min === 0 && b.max === 0
          ? r.disc_pct_row === 0
          : r.disc_pct_row >= b.min && r.disc_pct_row <= b.max
      );
      const ucp  = sum(subset, 'gross_value');
      const disc = sum(subset, 'discount_amount');
      return {
        band:     b.label,
        txns:     subset.length,
        ucp:      Math.round(ucp),
        ucp_pct:  pct(ucp, grossTotal),
        disc:     Math.round(disc),
      };
    });

    // By staff
    const staffGroups = groupBy(enriched, 'staff_name');
    const byStaff = Object.entries(staffGroups).map(([name, grp]) => {
      const noD   = grp.filter(r => r.disc_pct_row === 0).length;
      const withD = grp.filter(r => r.disc_pct_row > 0).length;
      const withDRows = grp.filter(r => r.disc_pct_row > 0);
      const avgD  = withDRows.length ? avg(withDRows, 'disc_pct_row') : 0;
      return {
        staff_name:           name,
        no_disc:              noD,
        with_disc:            withD,
        no_disc_pct:          noD + withD > 0 ? Math.round(noD / (noD + withD) * 100) : 0,
        avg_disc_when_given:  round2(avgD),
        total_disc:           Math.round(sum(grp, 'discount_amount')),
      };
    });

    // By category
    const catGroups = groupBy(enriched, 'category_l1');
    const byCat = Object.entries(catGroups).map(([cat, grp]) => {
      const ucp  = sum(grp, 'gross_value');
      const disc = sum(grp, 'discount_amount');
      return {
        category:  cat,
        no_disc:   grp.filter(r => r.disc_pct_row === 0).length,
        with_disc: grp.filter(r => r.disc_pct_row > 0).length,
        disc:      Math.round(disc),
        disc_pct:  pct(disc, ucp),
      };
    });

    return { bands, by_staff: byStaff, by_cat: byCat };
  }

  // ── WEEKLY TREND ──────────────────────────────────────────────
  function weeklyTrend(rows) {
    const sales = rows.filter(r => r.is_sale !== false && r.transaction_date);

    // Get ISO week from date string YYYY-MM-DD
    function getISOWeek(dateStr) {
      const d  = new Date(dateStr);
      const day = d.getDay() || 7; // Monday=1, Sunday=7
      d.setDate(d.getDate() + 4 - day);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return { year: d.getFullYear(), week };
    }

    function getWeekStart(dateStr) {
      const d   = new Date(dateStr);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() + 1 - day); // Monday
      return d.toISOString().slice(0, 10);
    }

    function fmtShort(dateStr) {
      const [y, m, dd] = dateStr.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${parseInt(dd)} ${months[parseInt(m)-1]}`;
    }

    const weekMap = {};
    for (const r of sales) {
      const { year, week } = getISOWeek(r.transaction_date);
      const key  = `${year}-${String(week).padStart(2,'0')}`;
      const wkStart = getWeekStart(r.transaction_date);
      if (!weekMap[key]) weekMap[key] = { year, week, wkStart, rows: [] };
      weekMap[key].rows.push(r);
    }

    return Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { year, week, wkStart, rows: grp }]) => {
        const wkStartD = new Date(wkStart);
        const wkEndD   = new Date(wkStart);
        wkEndD.setDate(wkEndD.getDate() + 6);
        const wkEnd = wkEndD.toISOString().slice(0, 10);
        const ucp  = sum(grp, 'gross_value');
        const txns = grp.length;
        return {
          week:    `Wk ${week}, ${year} (${fmtShort(wkStart)}–${fmtShort(wkEnd)})`,
          txns,
          ucp:     Math.round(ucp),
          avg_txn: txns ? Math.round(ucp / txns) : 0,
        };
      });
  }

  // ── TIME OF SALE ──────────────────────────────────────────────
  function timeOfSale(rows, config) {
    const allSales = rows.filter(r => r.is_sale !== false);
    const sales = allSales.filter(r => r.transaction_hour != null);
    console.log('[S3] total sales:', allSales.length,
      '| with hour:', sales.length,
      '| sample hours:', sales.slice(0,3).map(r=>r.transaction_hour),
      '| sample raw time:', allSales.slice(0,3).map(r=>r.transaction_time));
    if (!sales.length) return [];

    const openH   = (config && config.store_open_hour)  || 10;
    const closeH  = (config && config.store_close_hour) || 22;
    const window  = (config && config.time_window_hours)|| 2;
    const grossTotal = sum(sales, 'gross_value');

    function fmtH(h) {
      if (h === 12) return '12 PM';
      return h < 12 ? `${h} AM` : `${h - 12} PM`;
    }

    const slots = [];
    for (let h = openH; h < closeH; h += window) {
      const subset = sales.filter(r => r.transaction_hour >= h && r.transaction_hour < h + window);
      const ucp    = sum(subset, 'gross_value');
      slots.push({
        period:  `${fmtH(h)} – ${fmtH(h + window)}`,
        txns:    subset.length,
        ucp:     Math.round(ucp),
        pct:     pct(ucp, grossTotal),
        avg_txn: subset.length ? Math.round(ucp / subset.length) : 0,
      });
    }
    return slots;
  }

  // ── TOP CUSTOMERS ─────────────────────────────────────────────
  function customerAnalysis(rows, config) {
    const netTotal = sum(rows, 'gross_value');
    const hvThresh = (config && config.high_value_threshold) || 100000;
    const groups   = groupBy(rows, 'customer_name');

    const custRows = Object.entries(groups).map(([name, grp]) => {
      const sales   = grp.filter(r => r.is_sale !== false);
      const returns = grp.filter(r => r.is_sale === false);
      const net     = sum(grp, 'gross_value');
      const ret     = sum(returns, 'gross_value');
      const txns    = sales.length;
      return {
        customer_name: name, txns, net: Math.round(net), ret: Math.round(ret),
        share_pct: pct(net, netTotal),
      };
    });

    const top10 = [...custRows].sort((a, b) => b.net - a.net).slice(0, 10);

    const sales    = rows.filter(r => r.is_sale !== false);
    const hvAll    = sales.filter(r => (parseFloat(r.gross_value) || 0) >= hvThresh);
    const hvTop10  = [...hvAll]
      .sort((a, b) => (parseFloat(b.gross_value) || 0) - (parseFloat(a.gross_value) || 0))
      .slice(0, 10)
      .map(r => ({
        date:          r.transaction_date,
        customer_name: r.customer_name,
        staff_name:    r.staff_name,
        category:      r.category_l1,
        ucp:           Math.round(parseFloat(r.gross_value) || 0),
      }));

    return {
      top_customers:       top10,
      high_value_txns:     hvTop10,
      high_value_threshold: hvThresh,
      high_value_total_count: hvAll.length,
      total_customers:     custRows.length,
    };
  }

  // ── RUN ALL ───────────────────────────────────────────────────
  function runAll(rows, config) {
    return {
      summary:    executiveSummary(rows),
      category:   categoryAnalysis(rows),
      staff:      staffPerformance(rows),
      discount:   discountHealth(rows, config),
      weekly:     weeklyTrend(rows),
      time_of_sale: timeOfSale(rows, config),
      customers:  customerAnalysis(rows, config),
    };
  }

  return { runAll, executiveSummary, categoryAnalysis, staffPerformance,
           discountHealth, weeklyTrend, timeOfSale, customerAnalysis };

})();

window.Analysis = Analysis;

// ─────────────────────────────────────────────────────────────────
// RFM + ACTION CENTER
// Port of rfm_analysis() + purchase_pattern_analysis() +
// customer_intelligence() + _score_churn() + _select_action()
// ─────────────────────────────────────────────────────────────────

const RFM = (() => {

  // ── SEGMENT RULES (same as Python) ──────────────────────────
  function getSegment(r, f, m) {
    if (r>=4 && f>=4 && m>=4) return 'Champion';
    if (r>=4 && m>=4)          return 'High Value';
    if (r<=2 && m>=4)          return 'At Risk — High Value';
    if (r<=2 && f>=3)          return 'At Risk — Loyal';
    if (r>=4 && f===1)         return 'New Customer';
    if (f>=4)                  return 'Loyal';
    if (r<=1)                  return 'Lost';
    return 'Needs Attention';
  }

  function getPriority(seg) {
    if (seg.includes('At Risk')) return 1;
    if (seg === 'Champion' || seg === 'High Value') return 2;
    if (seg === 'Loyal' || seg === 'New Customer')  return 3;
    return 4;
  }

  // ── QUINTILE SCORING — port of pd.qcut(col.rank(method='first'), 5) ──
  function qcutScore(values, reverse = false) {
    const n = values.length;
    if (n === 0) return [];

    // Step 1: rank with method='first' (ties broken by original order)
    const indexed = values.map((v, i) => ({ v, i }));
    // Stable sort — JS sort is stable in modern engines
    indexed.sort((a, b) => a.v - b.v || a.i - b.i);
    const ranks = new Array(n);
    indexed.forEach(({ i }, rank) => { ranks[i] = rank + 1; }); // 1-based

    // Step 2: assign quintile 1-5 based on rank
    // Same as pd.qcut with 5 equal-width rank buckets
    const scores = new Array(n);
    for (let i = 0; i < n; i++) {
      let score = Math.ceil(ranks[i] / n * 5);
      score = Math.min(5, Math.max(1, score));
      scores[i] = reverse ? (6 - score) : score;
    }
    return scores;
  }

  // ── PURCHASE PATTERN ─────────────────────────────────────────
  function purchasePattern(txns, refDateStr) {
    const refDate = new Date(refDateStr);
    const sorted  = [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const lastDate = new Date(sorted[sorted.length - 1].transaction_date);
    const daysSinceLast = Math.round((refDate - lastDate) / 86400000);
    const avgSpend = txns.reduce((s, r) => s + (parseFloat(r.gross_value)||0), 0) / txns.length;
    const lastSpend = parseFloat(sorted[sorted.length-1].gross_value) || 0;

    const base = {
      txn_count:       txns.length,
      days_since_last: daysSinceLast,
      last_vs_avg_spend: avgSpend > 0 ? Math.round(lastSpend / avgSpend * 100) / 100 : 1,
    };

    if (sorted.length < 2) {
      return { ...base, pattern: 'insufficient_data' };
    }

    // Intervals between purchases in days
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i-1].transaction_date);
      const b = new Date(sorted[i].transaction_date);
      intervals.push((b - a) / 86400000);
    }
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const daysUntilDue = Math.round(avgInterval - daysSinceLast);

    // Spend trend (if 4+ transactions)
    let spendTrend = 'unknown';
    if (sorted.length >= 4) {
      const half = Math.floor(sorted.length / 2);
      const firstHalfAvg  = sorted.slice(0, half).reduce((s,r) => s+(parseFloat(r.gross_value)||0), 0) / half;
      const secondHalfAvg = sorted.slice(half).reduce((s,r) => s+(parseFloat(r.gross_value)||0), 0) / (sorted.length - half);
      if (secondHalfAvg > firstHalfAvg * 1.1)      spendTrend = 'growing';
      else if (secondHalfAvg < firstHalfAvg * 0.9) spendTrend = 'declining';
      else                                           spendTrend = 'stable';
    }

    // Next purchase estimate
    const nextDate = new Date(lastDate.getTime() + avgInterval * 86400000);

    return {
      ...base,
      pattern:          'established',
      avg_interval_days: Math.round(avgInterval),
      spend_trend:       spendTrend,
      days_until_due:    daysUntilDue,
      overdue:           daysUntilDue < 0,
      next_purchase_est: nextDate.toISOString().slice(0, 10),
    };
  }

  // ── CHURN SCORING (Engine C) ──────────────────────────────────
  function scoreChurn(pattern, rScore, lastVsAvg, spendTrend, recentReturn, churnThreshold) {
    let riskScore = 0;
    const signals = [];

    if (pattern.pattern === 'established') {
      const avgInterval  = pattern.avg_interval_days || 0;
      const daysSince    = pattern.days_since_last || 0;
      const overdueRatio = avgInterval > 0 ? daysSince / avgInterval : 0;
      if (overdueRatio > 2.0) {
        riskScore += 40;
        signals.push(`Overdue by ${overdueRatio.toFixed(1)}× their usual ${avgInterval}-day interval`);
      } else if (overdueRatio > 1.5) {
        riskScore += 20;
        signals.push(`Starting to stretch beyond their usual ${avgInterval}-day interval`);
      }
    } else {
      const daysSince = pattern.days_since_last || 0;
      if (daysSince > churnThreshold * 1.3) {
        riskScore += 40;
        signals.push(`No repeat purchase in ${daysSince} days — well beyond the ${churnThreshold}-day norm`);
      } else if (daysSince > churnThreshold) {
        riskScore += 20;
        signals.push(`No repeat purchase in ${daysSince} days — beyond the ${churnThreshold}-day norm`);
      }
    }

    if (lastVsAvg != null && lastVsAvg < 0.5) {
      riskScore += 20;
      signals.push('Last purchase was less than half their usual spend');
    }
    if (spendTrend === 'declining') {
      riskScore += 20;
      signals.push('Spend has been declining');
    }
    if (rScore <= 2) {
      riskScore += 15;
      signals.push('Recency score has dropped');
    }
    if (recentReturn) {
      riskScore += 10;
      signals.push('Recent return on file — may indicate dissatisfaction');
    }

    const riskLevel = riskScore >= 60 ? 'CRITICAL'
                    : riskScore >= 35 ? 'HIGH'
                    : riskScore >= 15 ? 'MEDIUM'
                    : 'LOW';

    return { risk_score: riskScore, risk_level: riskLevel, signals };
  }

  // ── ACTION SELECTION (Engine D) ───────────────────────────────
  const ACTION_TEMPLATES = {
    at_risk_high_value: {
      channel: 'Phone call — owner personally', timing: 'Within 48 hours',
      message: (name, cat, days) =>
        `Hi ${name}, it's been a while since your last visit. We have new arrivals in ${cat} we think you'd love — would you like to come in for a look?`,
      why: 'A personal call signals they matter; high lifetime value justifies owner reaching out directly.',
    },
    at_risk_general: {
      channel: 'WhatsApp with image', timing: 'Within 7 days',
      message: (name, cat) =>
        `Hi ${name}! It's been a while. New arrivals in ${cat} just landed — thought of you. Want a quick preview?`,
      why: 'Lower-cost touch for at-risk customers below the high-value threshold.',
    },
    due_soon: {
      channel: 'WhatsApp', timing: 'Today',
      message: (name, cat) =>
        `Hi ${name}, something new arrived in ${cat} — worth a look?`,
      why: 'Customer is statistically due to buy again soon based on their own purchase pattern.',
    },
    promising_new: {
      channel: 'WhatsApp', timing: 'Within 21 days of first purchase',
      message: (name, cat) =>
        `Hi ${name}, thank you for your recent purchase. New arrivals in ${cat} complement what you selected — want a preview?`,
      why: 'A second purchase converts a one-time buyer into a loyal customer.',
    },
    vip: {
      channel: 'Personal invite', timing: 'This month',
      message: (name, cat) =>
        `Hi ${name}! You're one of our most valued customers — early access to our new ${cat} collection, before it's announced.`,
      why: 'Recognises loyalty and reduces risk of losing them on their next big purchase.',
    },
    default: {
      channel: 'WhatsApp or call', timing: 'This month',
      message: (name, cat, days) =>
        `Hi ${name}, it's been ${days} days since your last visit. We'd love to see you again.`,
      why: null,
    },
  };

  function selectAction(cust, hvThresh) {
    const riskLevel  = cust.risk_level || 'LOW';
    const seg        = cust.segment || '';
    const monetary   = cust.monetary || 0;
    const daysUntil  = cust.days_until_due;
    const name       = cust.customer_name || 'valued customer';
    const cat        = cust.preferred_cat || 'our latest collection';
    const days       = Math.round(cust.recency_days || 0);

    let key, priority;
    if (riskLevel === 'CRITICAL' && monetary >= hvThresh) { key = 'at_risk_high_value'; priority = 1; }
    else if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') { key = 'at_risk_general'; priority = riskLevel === 'CRITICAL' ? 1 : 2; }
    else if (daysUntil != null && daysUntil >= 0 && daysUntil <= 7) { key = 'due_soon'; priority = 2; }
    else if (seg === 'New Customer')  { key = 'promising_new'; priority = 3; }
    else if (seg === 'Champion' || seg === 'High Value') { key = 'vip'; priority = 3; }
    else { key = 'default'; priority = 4; }

    const tmpl = ACTION_TEMPLATES[key];
    return {
      key, priority,
      channel: tmpl.channel,
      timing:  tmpl.timing,
      message: tmpl.message(name, cat, days),
      why:     tmpl.why,
      reason:  cust.signals ? cust.signals.join('; ') : '',
    };
  }

  // ── MAIN: RFM ANALYSIS ────────────────────────────────────────
  function rfmAnalysis(rows, config) {
    const sales   = rows.filter(r => r.is_sale !== false);
    const returns = rows.filter(r => r.is_sale === false);

    if (!sales.length) return { available: false, reason: 'No sales data' };

    const hvThresh       = (config && config.high_value_threshold) || 100000;
    const churnThreshold = 180;

    // Group by customer name — filter same way Python does (exclude null/blank/Unknown)
    const custMap = {};
    for (const r of sales) {
      const raw = r.customer_name;
      if (!raw) continue;
      const key = String(raw).trim();
      // Skip blank, Unknown, generic placeholders, purely numeric IDs
      if (!key || key.toLowerCase() === 'unknown' || key === '-' ||
          key === 'N/A' || key === 'NA' || key === 'CASH' ||
          key === 'RETAIL' || key === 'WALK IN' || key === 'WALK-IN' ||
          key === 'WALKIN' || /^\d+$/.test(key)) continue;
      if (!custMap[key]) custMap[key] = [];
      custMap[key].push(r);
    }

    const custNames = Object.keys(custMap);
    if (!custNames.length) return { available: false, reason: 'No named customers' };

    // Reference date = latest transaction date
    const allDates = sales.map(r => r.transaction_date).filter(Boolean).sort();
    const refDate  = allDates[allDates.length - 1];

    // Build per-customer metrics
    const custData = custNames.map(name => {
      const txns      = custMap[name];
      const monetary  = txns.reduce((s, r) => s + (parseFloat(r.gross_value)||0), 0);
      const frequency = txns.length;
      const lastDate  = txns.map(r => r.transaction_date).filter(Boolean).sort().pop();
      const recencyDays = lastDate
        ? Math.round((new Date(refDate) - new Date(lastDate)) / 86400000)
        : 999;

      // Preferred category
      const catCounts = {};
      txns.forEach(r => { if (r.category_l1) catCounts[r.category_l1] = (catCounts[r.category_l1]||0)+1; });
      const preferredCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';

      // Preferred staff
      const staffCounts = {};
      txns.forEach(r => { if (r.staff_name) staffCounts[r.staff_name] = (staffCounts[r.staff_name]||0)+1; });
      const preferredStaff = Object.entries(staffCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';

      return { customer_name: name, monetary, frequency, recency_days: recencyDays,
               preferred_cat: preferredCat, staff_name: preferredStaff, txns };
    });

    // Score R, F, M using quintiles
    const rScores = qcutScore(custData.map(c => c.recency_days), true); // reverse: lower days = higher score
    const fScores = qcutScore(custData.map(c => c.frequency));
    const mScores = qcutScore(custData.map(c => c.monetary));

    // Set of customers who returned items
    const returnedNames = new Set(returns.map(r => r.customer_name).filter(Boolean));

    // Segment + enrich each customer
    const segmentCounts = {};
    const riskCounts    = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    const enriched = custData.map((c, i) => {
      const r = rScores[i], f = fScores[i], m = mScores[i];
      const seg      = getSegment(r, f, m);
      const pattern  = purchasePattern(c.txns, refDate);
      const recentRet = returnedNames.has(c.customer_name);
      const churn    = scoreChurn(pattern, r, pattern.last_vs_avg_spend,
                                   pattern.spend_trend, recentRet, churnThreshold);
      const enrichedC = {
        ...c, r_score: r, f_score: f, m_score: m,
        segment: seg,
        ...pattern, ...churn,
      };
      const action = selectAction(enrichedC, hvThresh);
      enrichedC.action        = action.message;
      enrichedC.action_detail = action;
      enrichedC.priority      = action.priority;

      segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
      riskCounts[churn.risk_level]++;

      return enrichedC;
    });

    // Sort by priority then monetary desc
    enriched.sort((a, b) => a.priority - b.priority || b.monetary - a.monetary);

    return {
      available:    true,
      customers:    enriched,
      segments:     segmentCounts,
      risk_summary: riskCounts,
    };
  }

  return { rfmAnalysis };
})();

// Add rfm to Analysis.runAll
const _origRunAll = Analysis.runAll;
Analysis.runAll = function(rows, config) {
  const results = _origRunAll(rows, config);
  results.rfm   = RFM.rfmAnalysis(rows, config);
  return results;
};

window.RFM = RFM;

// ─────────────────────────────────────────────────────────────────
// EXTENDED ANALYSIS — E2, C3, C4, Cu1, Cu3, Cu4, Cu5, S3
// ─────────────────────────────────────────────────────────────────

const AnalysisExtended = (() => {

  function toNum(v) { return parseFloat(v) || 0; }
  function sum(rows, f) { return rows.reduce((s,r) => s + toNum(r[f]), 0); }
  function groupBy(rows, f) {
    const m = {};
    for (const r of rows) { const k = r[f]??'Unknown'; (m[k]=m[k]||[]).push(r); }
    return m;
  }

  // ── E2 SCORECARD ─────────────────────────────────────────────
  function scorecard(rows, config) {
    const sales   = rows.filter(r => r.is_sale !== false);
    const returns = rows.filter(r => r.is_sale === false);
    const gross   = sum(sales, 'gross_value');
    const disc    = sum(sales, 'discount_amount');
    const discPct = gross > 0 ? disc/gross*100 : 0;
    const txns    = sales.length;
    const hvThresh = (config&&config.high_value_threshold)||100000;
    const hvTxns  = sales.filter(r => toNum(r.gross_value) >= hvThresh);
    const checks  = [];

    // Discount
    if (discPct <= 5)      checks.push({status:'good', label:'Healthy Discount Rate', detail:`${discPct.toFixed(1)}% — well controlled`});
    else if (discPct <= 10) checks.push({status:'warn', label:'Discount Rate Elevated', detail:`${discPct.toFixed(1)}% — watch this`});
    else                   checks.push({status:'bad',  label:'High Discount Rate', detail:`${discPct.toFixed(1)}% — above 10% threshold`});

    // Returns
    if (returns.length === 0) checks.push({status:'good', label:'No Returns', detail:'Clean month'});
    else if (returns.length <= 2) checks.push({status:'warn', label:`${returns.length} Return(s)`, detail:'Monitor closely'});
    else checks.push({status:'bad', label:`${returns.length} Returns`, detail:'Higher than expected'});

    // HV transactions
    if (hvTxns.length >= 5)      checks.push({status:'good', label:`${hvTxns.length} High-Value Sales`, detail:`Above ₹${(hvThresh/1000).toFixed(0)}K`});
    else if (hvTxns.length >= 1) checks.push({status:'warn', label:`${hvTxns.length} High-Value Sale(s)`, detail:'Target 5+ next month'});
    else                         checks.push({status:'bad',  label:'No High-Value Sales', detail:`None above ₹${(hvThresh/1000).toFixed(0)}K`});

    // Avg ticket
    const avg = txns > 0 ? gross/txns : 0;
    if (avg >= 50000)      checks.push({status:'good', label:'Strong Avg Ticket', detail:`₹${Math.round(avg/1000)}K per transaction`});
    else if (avg >= 20000) checks.push({status:'warn', label:'Moderate Avg Ticket', detail:`₹${Math.round(avg/1000)}K — room to grow`});
    else                   checks.push({status:'bad',  label:'Low Avg Ticket', detail:`₹${Math.round(avg/1000)}K — push premium`});

    return { checks };
  }

  // ── C3 GOLD & MAKING (from mapped columns) ───────────────────
  function goldAnalysis(rows) {
    const sales = rows.filter(r => r.is_sale !== false);
    const hasWeight  = sales.some(r => toNum(r.weight) > 0);
    const hasMaking  = sales.some(r => toNum(r.making_charges) > 0);
    const hasKarat   = sales.some(r => r.extra_field && String(r.extra_field).trim());
    if (!hasWeight && !hasMaking && !hasKarat) return { available: false };

    const gross      = sum(sales, 'gross_value');
    const totalWt    = sum(sales, 'weight');
    const totalMc    = sum(sales, 'making_charges');
    const totalWaste = sum(sales, 'wastage');

    const result = {
      available:    true,
      total_gross_wt:    Math.round(totalWt * 10) / 10,
      avg_gross_wt:      sales.length > 0 ? Math.round(totalWt / sales.length * 10) / 10 : 0,
      total_making:      Math.round(totalMc),
      making_pct:        gross > 0 ? Math.round(totalMc/gross*1000)/10 : 0,
      total_wastage:     Math.round(totalWaste),
      wastage_pct:       gross > 0 ? Math.round(totalWaste/gross*1000)/10 : 0,
    };

    // By karatage
    if (hasKarat) {
      const ktGroups = groupBy(sales, 'extra_field');
      result.by_karatage = Object.entries(ktGroups)
        .filter(([k]) => k && k !== 'Unknown')
        .map(([kt, grp]) => ({
          kt, count: grp.length,
          revenue:   Math.round(sum(grp,'gross_value')),
          rev_share: gross > 0 ? Math.round(sum(grp,'gross_value')/gross*1000)/10 : 0,
          weight:    Math.round(sum(grp,'weight')*10)/10,
        }))
        .sort((a,b) => b.revenue - a.revenue);
    }
    return result;
  }

  // ── C4 DIAMOND & STONE ───────────────────────────────────────
  function diamondAnalysis(rows) {
    const sales = rows.filter(r => r.is_sale !== false);
    const hasDiaWt  = sales.some(r => toNum(r.diamond_weight_ct) > 0);
    const hasDiaVal = sales.some(r => toNum(r.diamond_value) > 0);
    if (!hasDiaWt && !hasDiaVal) return { available: false };

    const gross    = sum(sales, 'gross_value');
    const diaWt    = sum(sales, 'diamond_weight_ct');
    const diaVal   = sum(sales, 'diamond_value');
    const diaCount = sum(sales, 'diamond_count');

    return {
      available:     true,
      total_wt_ct:   Math.round(diaWt * 100) / 100,
      total_value:   Math.round(diaVal),
      dia_pct:       gross > 0 ? Math.round(diaVal/gross*1000)/10 : 0,
      total_count:   Math.round(diaCount),
      avg_rate_ct:   diaWt > 0 ? Math.round(diaVal/diaWt) : 0,
    };
  }

  // ── Cu1 HIGH-VALUE TRANSACTIONS ──────────────────────────────
  function highValueTxns(rows, config) {
    const hvThresh = (config&&config.high_value_threshold)||100000;
    const sales    = rows.filter(r => r.is_sale !== false);
    return sales
      .filter(r => toNum(r.gross_value) >= hvThresh)
      .sort((a,b) => toNum(b.gross_value) - toNum(a.gross_value))
      .slice(0, 10)
      .map(r => ({
        date:          r.transaction_date,
        customer_name: r.customer_name,
        staff_name:    r.staff_name,
        category:      r.category_l1,
        ucp:           Math.round(toNum(r.gross_value)),
      }));
  }

  // ── Cu3 CONCENTRATION ────────────────────────────────────────
  function concentration(rows) {
    const sales  = rows.filter(r => r.is_sale !== false);
    const groups = groupBy(sales, 'customer_name');
    const custs  = Object.entries(groups)
      .filter(([k]) => k && k !== 'Unknown')
      .map(([name, txns]) => ({ name, revenue: sum(txns,'gross_value') }))
      .sort((a,b) => b.revenue - a.revenue);

    if (!custs.length) return { available: false };
    const total = custs.reduce((s,c)=>s+c.revenue, 0);
    const n     = custs.length;

    function revShare(topN) {
      return total > 0 ? custs.slice(0,topN).reduce((s,c)=>s+c.revenue,0)/total*100 : 0;
    }

    const top10pct  = Math.max(1, Math.ceil(n * 0.10));
    const top20pct  = Math.max(1, Math.ceil(n * 0.20));
    const top50pct  = Math.max(1, Math.ceil(n * 0.50));

    return {
      available:         true,
      total_customers:   n,
      top10pct_count:    top10pct,
      top10pct_revenue:  Math.round(revShare(top10pct)*10)/10,
      top20pct_count:    top20pct,
      top20pct_revenue:  Math.round(revShare(top20pct)*10)/10,
      top50pct_count:    top50pct,
      top50pct_revenue:  Math.round(revShare(top50pct)*10)/10,
    };
  }

  // ── Cu4 FREQUENCY DISTRIBUTION ───────────────────────────────
  function frequencyDistribution(rows) {
    const sales  = rows.filter(r => r.is_sale !== false);
    const groups = groupBy(sales, 'customer_name');
    const custs  = Object.entries(groups)
      .filter(([k]) => k && k !== 'Unknown')
      .map(([name, txns]) => ({ name, visits: txns.length, revenue: sum(txns,'gross_value') }));

    if (!custs.length) return { available: false };
    const total     = custs.reduce((s,c)=>s+c.revenue,0);
    const totalCust = custs.length;

    const bands = [
      { label: 'One-time',      min:1, max:1  },
      { label: 'Occasional',    min:2, max:3  },
      { label: 'Regular',       min:4, max:6  },
      { label: 'Loyal (7+)',    min:7, max:999 },
    ].map(b => {
      const grp = custs.filter(c => c.visits >= b.min && c.visits <= b.max);
      const rev = grp.reduce((s,c)=>s+c.revenue,0);
      return {
        label:      b.label,
        count:      grp.length,
        cust_pct:   totalCust > 0 ? Math.round(grp.length/totalCust*1000)/10 : 0,
        revenue:    Math.round(rev),
        rev_pct:    total > 0 ? Math.round(rev/total*1000)/10 : 0,
      };
    });

    const onetime = custs.filter(c=>c.visits===1);
    const repeat  = custs.filter(c=>c.visits>1);
    const oneRev  = onetime.reduce((s,c)=>s+c.revenue,0);
    const repRev  = repeat.reduce((s,c)=>s+c.revenue,0);

    return {
      available: true,
      bands,
      repeat_split: {
        one_time_count:       onetime.length,
        one_time_revenue_pct: total > 0 ? Math.round(oneRev/total*1000)/10 : 0,
        repeat_count:         repeat.length,
        repeat_revenue_pct:   total > 0 ? Math.round(repRev/total*1000)/10 : 0,
      }
    };
  }

  // ── Cu5 DEMOGRAPHICS ─────────────────────────────────────────
  function demographics(rows) {
    const sales    = rows.filter(r => r.is_sale !== false);
    const hasCity  = sales.some(r => r.customer_city && String(r.customer_city).trim());
    const hasState = sales.some(r => r.customer_state && String(r.customer_state).trim());
    console.log('[Cu5] hasCity:', hasCity, 'hasState:', hasState,
      '| sample city:', sales.slice(0,3).map(r=>r.customer_city));
    if (!hasCity && !hasState) return { available: false };

    const total = sum(sales, 'gross_value');
    function rollup(field) {
      const g = groupBy(sales.filter(r=>r[field]&&String(r[field]).trim()), field);
      return Object.entries(g).map(([label,grp])=>({
        label,
        revenue:      Math.round(sum(grp,'gross_value')),
        revenue_pct:  total>0 ? Math.round(sum(grp,'gross_value')/total*1000)/10 : 0,
        customer_count: new Set(grp.map(r=>r.customer_name)).size,
      })).sort((a,b)=>b.revenue-a.revenue);
    }

    return {
      available: true,
      by_city:   hasCity  ? rollup('customer_city')  : [],
      by_state:  hasState ? rollup('customer_state') : [],
    };
  }

  // ── E3 STORE METRICS (generic extra fields summary) ─────────
  function storeMetrics(rows, mapping) {
    const sales = rows.filter(r => r.is_sale !== false);
    if (!sales.length) return [];
    const gross = sum(sales, 'gross_value');

    // Fields to show in E3 (not shown elsewhere)
    const SHOW = [
      {field:'net_value',   label:'Net Amount',       type:'money'},
      {field:'tax_amount',  label:'GST / Tax',         type:'money'},
      {field:'metal_value', label:'Metal Value',       type:'money'},
      {field:'quantity',    label:'Pieces Sold',       type:'qty'},
      {field:'gold_rate',   label:'Gold Rate (avg)',   type:'rate'},
    ];

    const result = [];
    for (const {field, label, type} of SHOW) {
      const hasMapped = mapping && mapping[field];
      const hasData   = sales.some(r => toNum(r[field]) > 0);
      if (!hasMapped || !hasData) continue;

      const total = sum(sales, field);
      const avg   = sales.length > 0 ? total / sales.length : 0;

      if (type === 'money') {
        result.push({ label, total: Math.round(total), avg: Math.round(avg),
          pct: gross > 0 ? Math.round(total/gross*1000)/10 : 0, type });
      } else if (type === 'qty') {
        result.push({ label, total: Math.round(total), avg: Math.round(avg*10)/10, type });
      } else if (type === 'rate') {
        // For rates use average not sum
        result.push({ label, total: Math.round(avg), avg: Math.round(avg), type });
      }
    }
    return result;
  }

  // ── C6 UNLOCK GUIDE ──────────────────────────────────────────
  function unlockGuide(rows, mapping) {
    const sales = rows.filter(r => r.is_sale !== false);
    const missing = [];

    const checks = [
      { field:'making_charges', label:'Making Charges',
        benefit:'See making charge % of revenue and per-gram rate per RSO' },
      { field:'metal_value',    label:'Metal Value',
        benefit:'Understand metal vs making vs stone breakdown of each sale' },
      { field:'diamond_weight_ct', label:'Diamond Weight',
        benefit:'Diamond intensity analysis, rate per carat, net gold weight' },
      { field:'customer_city',  label:'Customer City',
        benefit:'Revenue by geography — which areas drive most sales' },
      { field:'gold_rate',      label:'Gold Rate',
        benefit:'Track gold rate fluctuation impact on revenue' },
      { field:'quantity',       label:'Pieces Sold',
        benefit:'Pieces per transaction, volume vs value analysis' },
    ];

    for (const {field, label, benefit} of checks) {
      const isMapped = mapping && mapping[field];
      const hasData  = isMapped && sales.some(r => toNum(r[field]) > 0 || (r[field] && String(r[field]).trim()));
      if (!hasData) {
        missing.push({ label, benefit, mapped: !!isMapped });
      }
    }
    return missing;
  }

  // ── QUARTERLY TREND ──────────────────────────────────────────
  function quarterlyTrend(rows) {
    const sales = rows.filter(r => r.is_sale !== false && r.transaction_date);
    const qtrs  = {};
    for (const r of sales) {
      const [y, m] = r.transaction_date.split('-');
      const q = Math.ceil(parseInt(m) / 3);
      const key = `${y}-Q${q}`;
      if (!qtrs[key]) qtrs[key] = { key, label:`Q${q} ${y}`, rows:[] };
      qtrs[key].rows.push(r);
    }
    return Object.values(qtrs).sort((a,b)=>a.key.localeCompare(b.key)).map(({label,rows:g})=>({
      label, ucp: Math.round(sum(g,'gross_value')), txns: g.length,
      avg_txn: g.length > 0 ? Math.round(sum(g,'gross_value')/g.length) : 0,
      customers: new Set(g.map(r=>r.customer_name).filter(n=>n&&n!=='Unknown')).size,
    }));
  }

  // ── SEASONALITY (best/worst by month name) ───────────────────
  function seasonality(rows) {
    const sales = rows.filter(r => r.is_sale !== false && r.transaction_date);
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const byMonth = {};
    for (const r of sales) {
      const m = parseInt(r.transaction_date.split('-')[1]) - 1;
      const name = MONTHS[m];
      if (!byMonth[name]) byMonth[name] = { label:name, months:0, ucp:0, txns:0 };
      byMonth[name].ucp  += toNum(r.gross_value);
      byMonth[name].txns += 1;
      byMonth[name].months = 1; // count distinct occurrences separately
    }
    // Count distinct year-months per month name for averaging
    const ymByName = {};
    for (const r of sales) {
      const parts = r.transaction_date.split('-');
      const name  = MONTHS[parseInt(parts[1])-1];
      const ym    = `${parts[0]}-${parts[1]}`;
      if (!ymByName[name]) ymByName[name] = new Set();
      ymByName[name].add(ym);
    }
    return Object.values(byMonth).map(m => ({
      ...m,
      occurrences: (ymByName[m.label]||new Set()).size,
      avg_ucp: Math.round(m.ucp / ((ymByName[m.label]||new Set()).size || 1)),
    })).sort((a,b) => MONTHS.indexOf(a.label) - MONTHS.indexOf(b.label));
  }

  // ── MONTHLY TREND ─────────────────────────────────────────────────
  function monthlyTrend(rows) {
    const sales = rows.filter(r => r.is_sale !== false && r.transaction_date);
    console.log('[Trends] total sales for monthly:', sales.length,
      '| sample dates:', sales.slice(0,3).map(r=>r.transaction_date));
    const months = {};
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (const r of sales) {
      const [y,m] = r.transaction_date.split('-');
      const key   = `${y}-${m}`;
      if (!months[key]) months[key] = { key, label:`${MONTH_NAMES[parseInt(m)-1]} ${y}`, rows:[] };
      months[key].rows.push(r);
    }
    return Object.values(months).sort((a,b)=>a.key.localeCompare(b.key)).map(({label,rows:grp})=>({
      label,
      ucp:     Math.round(sum(grp,'gross_value')),
      txns:    grp.length,
      avg_txn: grp.length > 0 ? Math.round(sum(grp,'gross_value')/grp.length) : 0,
      customers: new Set(grp.map(r=>r.customer_name).filter(n=>n&&n!=='Unknown')).size,
    }));
  }

  // ── RUN ALL EXTENDED ─────────────────────────────────────────
  function runExtended(rows, config, mapping) {
    return {
      scorecard:      scorecard(rows, config),
      gold:           goldAnalysis(rows),
      diamond:        diamondAnalysis(rows),
      hv_txns:        highValueTxns(rows, config),
      concentration:  concentration(rows),
      frequency:      frequencyDistribution(rows),
      demographics:   demographics(rows),
      monthly_trend:  monthlyTrend(rows),
      quarterly_trend:quarterlyTrend(rows),
      seasonality:    seasonality(rows),
      store_metrics:  storeMetrics(rows, mapping),
      unlock_guide:   unlockGuide(rows, mapping),
    };
  }

  return { runExtended };
})();

window.AnalysisExtended = AnalysisExtended;

// Patch Analysis.runAll to include extended
const _origRunAll2 = Analysis.runAll;
Analysis.runAll = function(rows, config, mapping) {
  const results    = _origRunAll2(rows, config);
  results.extended = AnalysisExtended.runExtended(rows, config, mapping);
  return results;
};
