/**
 * StoreIntel PWA — Opportunity Report Helpers
 * Version: app_opp_v56.js
 * Date:    2026-07-25
 * Platform: Mobile PWA — engine/ folder
 *
 * What this file handles:
 *   - Mapping template: upload, save, validate, display label
 *   - Teal CSS variables + upload UI styles (auto-injected)
 *   - oppHandleMappingUpload() — called from index.html button
 *   - oppClearMapping()        — called from index.html button
 *
 * What this file does NOT handle (lives in app.js generate()):
 *   - NP file selection (_oppStoreFile, _oppFileBuffer)
 *   - Running the Opp pipeline (ingestOpportunity → runAll → renderOppReport)
 *   - Showing/hiding the Opp section (oppExpandSection)
 *
 * Dependencies loaded before this:
 *   engine/ingestion_opp_v1.1.js  → parseOppMappingTemplate(), ingestOpportunity()
 *   engine/analysis_opp_v1.1.js   → runAll()
 *   engine/renderer_opp_v1.0.js   → renderOppReport(), oppInjectCSS()
 *
 * Standing rules:
 *   R1 — Versioned: app_opp_v55.js
 *   R2 — Output identical to Web opp pipeline
 *   R3 — Sector-neutral core
 *   R4 — Jewellery active, Leather/Apparel ready via sector param
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// MAPPING TEMPLATE — upload, validate, display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate saved mapping on load — clear if corrupt (0 fields).
 * Called from oppExpandSection() in app.js when section is opened.
 */
function _oppValidateSavedMapping() {
  const saved = localStorage.getItem('si_opp_mapping_b64');
  if (!saved) return;
  try {
    const check = parseOppMappingTemplate(saved);
    if (check.filledCount === 0) {
      localStorage.removeItem('si_opp_mapping_b64');
      console.log('[OPP v55] Cleared invalid saved mapping (0 fields)');
    }
  } catch (e) {
    localStorage.removeItem('si_opp_mapping_b64');
  }
}

/**
 * Update the mapping status label in the upload section.
 * @param {string} filename  - filename if just uploaded (optional)
 * @param {number} count     - fields mapped (optional)
 */
function _oppUpdateMappingLabel(filename, count) {
  const el = document.getElementById('opp-mapping-label');
  if (!el) return;
  const saved = localStorage.getItem('si_opp_mapping_b64');
  if (filename && count > 0) {
    el.textContent = '✅ ' + filename + ' — ' + count + ' fields mapped';
    el.style.color = '#4ABFBF';
  } else if (saved && typeof parseOppMappingTemplate === 'function') {
    try {
      const check = parseOppMappingTemplate(saved);
      if (check.filledCount > 0) {
        el.textContent = '✅ Mapping ready (' + check.filledCount + ' fields)';
        el.style.color = '#4ABFBF';
      } else {
        el.textContent = 'No mapping template — auto-detection will be used';
        el.style.color = 'rgba(255,255,255,0.4)';
      }
    } catch(e) {
      el.textContent = 'No mapping template — auto-detection will be used';
      el.style.color = 'rgba(255,255,255,0.4)';
    }
  } else {
    el.textContent = 'No mapping template — auto-detection will be used';
    el.style.color = 'rgba(255,255,255,0.4)';
  }
}

/**
 * Handle mapping template file upload from index.html button.
 * Uses readAsDataURL — safe for binary XLSX (btoa fails on bytes > 255).
 */
function oppHandleMappingUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result.split(',')[1];
    localStorage.setItem('si_opp_mapping_b64', base64);
    const tmpl = parseOppMappingTemplate(base64);
    _oppUpdateMappingLabel(file.name, tmpl.filledCount);
    console.log('[OPP v55] Mapping template saved:', tmpl.filledCount, 'fields');
  };
  reader.readAsDataURL(file);
}

/**
 * Clear saved mapping template from localStorage.
 */
function oppClearMapping() {
  localStorage.removeItem('si_opp_mapping_b64');
  const input = document.getElementById('opp-mapping-input');
  if (input) input.value = '';
  _oppUpdateMappingLabel();
}


// ─────────────────────────────────────────────────────────────────────────────
// CSS — teal variables + upload section styles
// Auto-injected into <head> on script load.
// ─────────────────────────────────────────────────────────────────────────────

(function injectOppStyles() {
  if (document.getElementById('opp-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'opp-ui-styles';
  style.textContent = `
    :root {
      --teal: #1A7A7A;
      --teal-mid: #1f6060;
      --teal-dark: #0f3a3a;
      --teal-light: #4ABFBF;
      --teal-bg: rgba(26,122,122,0.15);
    }

    /* ── Report toggle bar ──────────────────────────────── */
    #report-toggle-bar {
      display: none;
      background: var(--navy2, #1a2e4a);
      padding: 8px 16px;
      gap: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .rpt-toggle-btn {
      flex: 1;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1.5px solid rgba(74,191,191,0.3);
      background: transparent;
      color: var(--teal-light, #4ABFBF);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.2px;
    }
    .rpt-toggle-btn.active {
      background: var(--teal, #1A7A7A);
      border-color: var(--teal, #1A7A7A);
      color: #fff;
    }
    .rpt-toggle-btn:not(.active):hover {
      background: rgba(74,191,191,0.1);
    }

    /* ── Opportunity expand toggle ──────────────────────── */
    .btn-opp-toggle {
      width: 100%;
      padding: 13px 16px;
      background: rgba(26,122,122,0.15);
      border: 1.5px dashed var(--teal-light, #4ABFBF);
      border-radius: 10px;
      color: var(--teal-light, #4ABFBF);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s;
    }
    .btn-opp-toggle.opp-toggle-active {
      background: var(--teal, #1A7A7A);
      color: #fff;
      border-style: solid;
      border-color: var(--teal, #1A7A7A);
    }

    /* ── Expanded section: uses inline styles only ──────── */
    /* .opp-expanded-wrap intentionally empty — controlled inline */

    /* ── Mapping status ─────────────────────────────────── */
    .opp-mapping-row {
      display: flex;
      align-items: center;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 7px;
      padding: 9px 12px;
      margin-bottom: 10px;
    }
    .opp-mapping-label-text {
      flex: 1;
      font-size: inherit;
      font-family: inherit;
      color: rgba(255,255,255,0.5);
    }
    .opp-mapping-label-text.opp-mapping-label-ok {
      color: var(--teal-light, #4ABFBF);
    }

    /* ── Selected file indicator ────────────────────────── */
    .opp-file-selected {
      margin-top: 8px;
      padding: 9px 12px;
      background: rgba(26,107,69,0.3);
      border: 1px solid rgba(110,232,168,0.3);
      border-radius: 7px;
      font-size: 12px;
      color: #6de8a8;
      font-weight: 600;
    }
    .opp-file-selected.hidden { display: none; }

    /* ── Opportunity Report container ───────────────────── */
    #opp-report-container { min-height: 60vh; }

    /* ── Opp report internal nav teal overrides ─────────── */
    .opp-tab-btn.active {
      color: var(--teal-light, #4ABFBF) !important;
      border-bottom-color: var(--teal, #1A7A7A) !important;
    }

    /* ── Mapping review tab switcher ────────────────────── */
    .mapping-review-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
    }
    .mr-tab {
      flex: 1;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1.5px solid rgba(255,255,255,0.12);
      background: transparent;
      color: rgba(255,255,255,0.5);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s;
    }
    .mr-tab.active {
      background: var(--teal, #1A7A7A);
      border-color: var(--teal, #1A7A7A);
      color: #fff;
    }
    .mr-tab:not(.active):hover {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.8);
    }

    /* ── Report toggle pill (v56) ───────────────────────── */
    #report-toggle-bar {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      background: var(--navy2, #1a2e4a);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .rpt-toggle-pill {
      display: inline-flex;
      background: rgba(255,255,255,0.07);
      border-radius: 20px;
      padding: 3px;
      gap: 2px;
    }
    .rpt-pill-btn {
      padding: 6px 14px;
      border-radius: 17px;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.5);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s;
      white-space: nowrap;
    }
    .rpt-pill-btn.active {
      background: var(--teal, #1A7A7A);
      color: #fff;
    }
    .rpt-pill-btn:not(.active):hover {
      color: rgba(255,255,255,0.8);
    }
  `;
  document.head.appendChild(style);
})();