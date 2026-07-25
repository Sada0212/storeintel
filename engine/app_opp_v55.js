/**
 * StoreIntel PWA — Opportunity Report Helpers
 * Version: app_opp_v55.js
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
function _oppUpdateMappingLabel(filename = '', count = 0) {
  const el = document.getElementById('opp-mapping-label');
  if (!el) return;
  const saved = localStorage.getItem('si_opp_mapping_b64');
  if (filename && count > 0) {
    el.textContent = `✅ ${filename} — ${count} fields mapped`;
    el.style.color = 'var(--teal,#4ABFBF)';
  } else if (saved) {
    try {
      const check = parseOppMappingTemplate(saved);
      if (check.filledCount > 0) {
        el.textContent = `✅ Mapping loaded (${check.filledCount} fields)`;
        el.style.color = 'var(--teal,#4ABFBF)';
      } else {
        el.textContent = 'No mapping template — auto-detection will be used';
        el.style.color = '#888';
      }
    } catch (e) {
      el.textContent = 'No mapping template — auto-detection will be used';
      el.style.color = 'var(--grey,#888)';
    }
  } else {
    el.textContent = 'No mapping template — auto-detection will be used';
    el.style.color = '#888';
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
      --teal-bg: #e6f4f4;
    }
    /* Opportunity Report container */
    #opp-report-container { display:none; }

    /* Toggle button — uses PWA dark theme vars */
    .btn-opp-toggle {
      width: 100%;
      padding: 13px 16px;
      background: rgba(26,122,122,0.15);
      border: 1.5px dashed var(--teal, #1A7A7A);
      border-radius: 10px;
      color: var(--teal-light, #4ABFBF);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s;
    }
    .btn-opp-toggle:hover,
    .btn-opp-toggle.opp-toggle-active {
      background: rgba(26,122,122,0.28);
      border-style: solid;
    }

    /* Expanded section — dark theme aware */
    .opp-expanded-wrap {
      margin-top: 10px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(26,122,122,0.35);
      border-radius: 10px;
      padding: 14px;
    }

    /* Mapping status row */
    .opp-mapping-row {
      display: flex;
      align-items: center;
      background: rgba(255,255,255,0.06);
      border-radius: 7px;
      padding: 9px 12px;
      margin-bottom: 10px;
    }
    .opp-mapping-label-text {
      flex: 1;
      font-size: 12px;
      color: var(--grey, #888);
    }
    .opp-mapping-label-ok {
      color: var(--teal-light, #4ABFBF) !important;
    }

    /* Drop zone — inherits .upload-zone from style.css */
    .opp-drop-zone {
      border-color: var(--teal, #1A7A7A) !important;
    }
    .opp-drop-zone .upload-zone-text {
      color: var(--teal-light, #4ABFBF);
    }

    /* Selected file indicator */
    .opp-file-selected {
      margin-top: 8px;
      padding: 8px 12px;
      background: rgba(26,107,69,0.25);
      border-radius: 6px;
      font-size: 12px;
      color: #6de8a8;
      font-weight: 600;
    }
    .opp-file-selected.hidden { display: none; }

    /* Opportunity tab in tab bar */
    #tab-btn-opp { border-color: var(--teal, #1A7A7A); }
    #tab-btn-opp.active { color: var(--teal-light, #4ABFBF) !important; }

    /* Opp tab nav active state uses teal */
    .opp-tab-btn.active {
      color: var(--teal-light) !important;
      border-bottom-color: var(--teal) !important;
    }
  `;
  document.head.appendChild(style);
})();
