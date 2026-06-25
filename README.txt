============================================================
  StoreIntel PWA — Shell v1.0
============================================================

WHAT THIS IS
------------
The skeleton of the StoreIntel Progressive Web App.
All screens, routing, install prompt, service worker, and
offline caching are wired up and working.

The analysis engine (Excel parsing + calculations) is
stubbed — it will be replaced module by module in Phase 2.


FILES
-----
index.html      Main app — all 4 screens in one file
style.css       Full brand-matched mobile CSS
app.js          Shell logic: routing, file pick, SW, install
sw.js           Service worker — offline-first caching
manifest.json   PWA identity (name, icon, theme color)
icons/          Brand icons (amber tile + black tile)


HOW TO TEST LOCALLY (5 minutes)
---------------------------------
You need HTTPS or localhost for the service worker to run.

Option A — Python (quickest):
  cd storeintel-pwa
  python -m http.server 8080
  Open http://localhost:8080 in Chrome

Option B — VS Code Live Server:
  Right-click index.html → Open with Live Server

Option C — Node:
  npx serve .
  Open the URL shown


HOW TO DEPLOY (free, permanent)
---------------------------------
Option A — Cloudflare Pages (recommended for India):
  1. Push this folder to a GitHub repo
  2. Go to pages.cloudflare.com → Connect to Git
  3. Select the repo → deploy
  Done. Gets a free .pages.dev URL + free SSL.

Option B — Vercel:
  npx vercel
  Follow the prompts. Gets a .vercel.app URL.

Option C — Netlify:
  Drag and drop this folder at app.netlify.com
  Done in 30 seconds.

All three are free. No server to manage. Auto-HTTPS.


WHAT WORKS RIGHT NOW
----------------------
✓  4-screen flow: Home → Processing → Report → Error
✓  File picker with drag-and-drop + tap
✓  Store name input with validation
✓  Sector selector (Jewellery / Retail / Restaurant / Hotel)
✓  Processing screen with progress bar
✓  Offline detection (Online/Offline status indicator)
✓  Service worker — app caches itself, works offline after
✓  PWA install prompt ("Add to Home Screen" banner)
✓  Auto-update notification when new version deployed
✓  Toast notifications
✓  Error screen with retry
✓  Brand colors: Navy #0f1b2d + Amber #c9973a
✓  Mobile-first CSS, works on any phone


WHAT COMES NEXT (Phase 2 — engine modules)
--------------------------------------------
1. libs/xlsx.full.min.js   — SheetJS for Excel parsing
   libs/chart.min.js       — Chart.js for charts

2. engine/ingestion.js     — replaces stubIngest()
   Read Excel → detect columns → normalise rows
   Port of: ingestion.py + column_detector.py

3. engine/analysis.js      — replaces stubAnalysis()
   Sales, staff, RFM, discount, weekly trend
   Port of: analysis.py + jewellery_metrics.py

4. engine/insights.js      — rule-based callouts
   Port of: insights.py

5. engine/renderer.js      — replaces renderReport()
   Build KPI grid + section cards
   Port of: renderer.py (mobile-adapted, no tabs)

Each module can be dropped in independently.
The stub functions in app.js show exactly where each
module plugs in.


ADDING SHEETJS OFFLINE
------------------------
Download: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
Save as: libs/xlsx.full.min.js
Uncomment in sw.js PRECACHE_URLS and index.html script tag.
Then in ingestion.js: const wb = XLSX.read(arrayBuffer, {type:'array'});


PRIVACY NOTE
-------------
The file the user picks never leaves their device.
No server. No upload. No cloud.
All computation runs in the browser tab.
This is the same promise as the desktop EXE.

============================================================
