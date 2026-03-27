require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const cheerio = require('cheerio');
const { classifyLink, loadLearnedRules, recordCorrection } = require('./classifier');
const { fetchAndExtractMetadata } = require('./fetcher');
const db = require('./db');
const connectorRegistry = require('./connectors');

// Boot the adaptive learning engine from persistent SQLite memory
loadLearnedRules(db);

const app = express();
const PORT = 4000;

// Security: Restrict CORS to prevent malicious websites from stealing local PII bookmarks
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    // Allow Electron local file UI and Chrome Extensions (which have 'chrome-extension://' origin)
    // and standard localhost / LAN frontend requests
    if (origin.startsWith('chrome-extension://') || origin === 'file://' || origin.startsWith('http://localhost') || origin.startsWith('http://192.168.') || origin === 'null') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy for security'), false);
  }
}));
app.use(express.json());

// Serve the compiled React application so Android Phones can install the PWA directly from the .exe
const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Set up Multer for file upload
const upload = multer({ dest: 'uploads/' });

// SQLite Database is used via db.js

// Helper from index.js
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

// === SETTINGS API (Credential Management for Open-Source Users) ===
const ENV_PATH = path.join(__dirname, '.env');

app.get('/api/settings', (req, res) => {
  // Return which integrations are configured (masked values for security)
  res.json({
    zotero: {
      configured: !!(process.env.ZOTERO_API_KEY && process.env.ZOTERO_USER_ID),
      userId: process.env.ZOTERO_USER_ID || ''
    },
    notion: {
      configured: !!process.env.NOTION_API_KEY,
      databaseId: process.env.NOTION_DATABASE_ID || ''
    },
    instapaper: {
      configured: !!(process.env.INSTAPAPER_USERNAME && process.env.INSTAPAPER_PASSWORD),
      username: process.env.INSTAPAPER_USERNAME || ''
    },
    obsidian: {
      configured: !!process.env.OBSIDIAN_VAULT_PATH,
      path: process.env.OBSIDIAN_VAULT_PATH || ''
    },
    paperpile: {
      configured: !!process.env.PAPERPILE_SYNC_PATH,
      path: process.env.PAPERPILE_SYNC_PATH || ''
    }
  });
});

app.post('/api/settings', (req, res) => {
  const fields = req.body;
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'Invalid payload' });

  // Read existing .env, update/add fields, write back
  let envContent = '';
  try { envContent = fs.readFileSync(ENV_PATH, 'utf8'); } catch (e) {}

  const envLines = envContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const envMap = {};
  for (const line of envLines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) envMap[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
  }

  // Merge new values (only overwrite non-empty)
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') {
      envMap[key] = value;
      process.env[key] = value; // Hot-reload into running process
    }
  }

  // Write back
  const newEnvContent = Object.entries(envMap).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, newEnvContent);

  res.json({ success: true, message: 'Settings saved! Integrations are now active.' });
});

// === CONNECTORS API ===
// List all available connectors with their config status
app.get('/api/connectors', (req, res) => {
  const available = connectorRegistry.getAll();
  const saved = db.getAllConnectorConfigs();
  const savedMap = {};
  saved.forEach(s => { savedMap[s.connector_id] = s; });

  const result = available.map(c => ({
    ...c,
    enabled: savedMap[c.connector_id] ? !!savedMap[c.connector_id].enabled : false,
    configured: savedMap[c.connector_id] ? true : false
  }));
  res.json(result);
});

// Save connector config
app.post('/api/connectors/:id/config', (req, res) => {
  const { id } = req.params;
  const { config, enabled } = req.body;
  db.saveConnectorConfig(id, config || {}, enabled !== undefined ? enabled : true);
  res.json({ success: true });
});

// Test connector credentials
app.post('/api/connectors/:id/test', async (req, res) => {
  const { id } = req.params;
  const { config } = req.body;
  const result = await connectorRegistry.testConnector(id, config || {});
  res.json(result);
});

// === ROUTES (FLOWS) API ===
// List all routes
app.get('/api/routes', (req, res) => {
  const routes = db.getRoutes();
  res.json(routes.map(r => ({
    ...r,
    connector_config: JSON.parse(r.connector_config || '{}')
  })));
});

// Create route
app.post('/api/routes', (req, res) => {
  const { category, connector_id, connector_config, action_order } = req.body;
  if (!category || !connector_id) return res.status(400).json({ error: 'category and connector_id required' });
  const result = db.addRoute(category, connector_id, connector_config || {}, action_order || 0);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Update route
app.put('/api/routes/:id', (req, res) => {
  const { id } = req.params;
  db.updateRoute(parseInt(id), req.body);
  res.json({ success: true });
});

// Delete route
app.delete('/api/routes/:id', (req, res) => {
  const { id } = req.params;
  db.deleteRoute(parseInt(id));
  res.json({ success: true });
});

// 1. EXTENSION INGEST ENDPOINT
app.post('/api/ingest', async (req, res) => {
  const { url, title } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const meta = await fetchAndExtractMetadata(url);
    let bestTitle = title || meta.title || url;
    let category = classifyLink(url, bestTitle, meta.description);
    let finalUrl = url;

    // SCIENTIFIC NEWS AUTOMATION: If a deep-linked DOI paper is found, overwrite the news article
    // and upgrade the item to an Academic Article immediately.
    if (category === 'Scientific News/Press Release' && meta.paperLink) {
      finalUrl = meta.paperLink;
      category = classifyLink(finalUrl, bestTitle, meta.description);
      bestTitle = `[News Extracted] ${bestTitle}`;
    }

    const resultObj = {
      id: Date.now().toString(),
      category,
      url: finalUrl,
      title: bestTitle,
      description: meta.description,
      markdownBody: meta.markdownBody || '',
      date_added: Math.floor(Date.now() / 1000),
      source: 'extension'
    };

    db.addLink(resultObj);
    res.json({ success: true, message: `Routed link to ${category}`, resultObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. FILE UPLOAD ENDPOINT (Processes bulk Chrome Bookmark HTML Files)
app.post('/api/upload-bookmarks', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const html = fs.readFileSync(req.file.path, 'utf-8');
    const $ = cheerio.load(html);

    const linksToProcess = [];
    $('a').each((i, el) => {
      const url = $(el).attr('href');
      const bookmarkTitle = $(el).text();
      const addDate = $(el).attr('add_date');
      if (url && url.startsWith('http')) {
        linksToProcess.push({ url, bookmarkTitle, addDate });
      }
    });

    // 🚀 LAZY INGESTION (BATCH): Skips downloading HTML upfront to reduce RAM usage and relies on atomic transactions to commit 10,000 links in ms.
    const batchData = linksToProcess.map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      category: classifyLink(item.url, item.bookmarkTitle, ''),
      url: item.url,
      title: item.bookmarkTitle || 'Untitled Bookmark',
      date_added: item.addDate,
      source: 'upload'
    }));

    db.addLinkBatch(batchData);

    console.log(`[Lazy Ingest] Swiftly dumped ${linksToProcess.length} bookmarks directly into the database.`);

    // Immediately resolve the front-end fetch so the user sees success
    res.json({ success: true, count: linksToProcess.length, message: `Instantly ingested ${linksToProcess.length} items without heavy fetching!` });
    
    setTimeout(() => {
      try { fs.unlinkSync(req.file.path) } catch(e){}
    }, 1000);
  } catch (err) {
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// 2.5 NATIVE CHROME DIRECT SYNCHRONIZATION (Mobile Bookmarks)
app.post('/api/sync-chrome', async (req, res) => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return res.status(400).json({ error: 'Cannot find Windows AppData bounds.' });

    const chromePaths = [
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 2', 'Bookmarks')
    ];

    let bmkPath = chromePaths.find(p => require('fs').existsSync(p));
    if (!bmkPath) return res.status(404).json({ error: 'Google Chrome Bookmarks file not found. Ensure Chrome is installed natively.' });

    const rawData = require('fs').readFileSync(bmkPath, 'utf8');
    const bookmarks = JSON.parse(rawData);

    const extractedLinks = [];
    
    // Recursive Folder Search
    function traverse(node) {
      if (node.type === 'folder' && node.name === 'KMS Input') {
        extractUrls(node);
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    }
    
    // Recursively pull all URLs within the matched folder
    function extractUrls(node) {
      if (node.type === 'url') extractedLinks.push({ url: node.url, title: node.name, date_added: node.date_added });
      if (node.children) node.children.forEach(extractUrls);
    }

    if (bookmarks.roots) Object.values(bookmarks.roots).forEach(traverse);

    if (extractedLinks.length === 0) {
      return res.json({ success: true, message: 'Could not find any links inside a "KMS Input" bookmark directory.', count: 0 });
    }

    // Deduplication Engine (O(n) fast array filter)
    const existing = db.getAllLinks().map(l => l.url);
    const newLinks = extractedLinks.filter(l => !existing.includes(l.url));

    if (newLinks.length === 0) {
      return res.json({ success: true, message: `Found ${extractedLinks.length} links inside 'KMS Input', but they are already tracked in your Inbox.`, count: 0 });
    }

    const batchData = newLinks.map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      category: classifyLink(item.url, item.title, ''),
      url: item.url,
      title: item.title,
      date_added: Math.floor(Date.now() / 1000),
      source: 'chrome-sync'
    }));

    db.addLinkBatch(batchData);
    
    res.json({ success: true, message: `Magically extracted ${newLinks.length} new mobile bookmarks from Chrome Sync!`, count: newLinks.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server crashed reading physical Chrome DB: ' + err.message });
  }
});

// 3. ADD SINGLE LINK MANUALLY
app.post('/api/links', (req, res) => {
  const { url, title } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  const category = classifyLink(url, title || '', '');
  const linkObj = {
    id: Math.random().toString(36).substr(2, 9),
    category, url, title: title || url,
    date_added: Math.floor(Date.now() / 1000), source: 'manual'
  };
  db.addLink(linkObj);
  res.json({ success: true, link: linkObj });
});

// 4. GET LINKS (For the Frontend UI)
app.get('/api/links', (req, res) => {
  res.json(db.getAllLinks()); // Fetch directly from SQLite
});

// 4. UPDATE CATEGORY OR DETAILS
app.put('/api/links/:id', (req, res) => {
  const { id } = req.params;
  const { category, title, url, description } = req.body;
  const link = db.getLinkById(id);
  if (link) {
    // 🧠 Adaptive Learning: If the user manually changed the category, record it as a correction
    if (category && category !== link.category) {
      recordCorrection(db, link.url, category);
    }
    const updated = db.updateLink(id, req.body);
    res.json({ success: true, link: updated });
  } else {
    res.status(404).json({ error: 'Link not found' });
  }
});

// 5. DELETE/REMOVE LINK
app.delete('/api/links/:id', (req, res) => {
  const { id } = req.params;
  db.deleteLink(id);
  res.json({ success: true });
});

app.post('/api/links/mass-delete', (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Missing itemIds array' });
  itemIds.forEach(id => db.deleteLink(id));
  res.json({ success: true, count: itemIds.length });
});

app.post('/api/links/mass-category', (req, res) => {
  const { itemIds, category } = req.body;
  if (!Array.isArray(itemIds) || !category) return res.status(400).json({ error: 'Missing parameters' });
  itemIds.forEach(id => {
    const link = db.getLinkById(id);
    if (link && link.category !== category) {
      recordCorrection(db, link.url, category);
    }
    db.updateLink(id, { category });
  });
  res.json({ success: true, count: itemIds.length });
});

const { exportToZotero, exportToNotion, exportToInstapaper, exportToObsidian, exportToPaperpile, mirrorToGoogleDrive } = require('./export-engine');

let isExportRunning = false;
let cancelExportSignal = false;
let pendingBookmarkMoves = []; // Array of { url, title, category }

// Extension endpoints natively parsing Chrome Sync commands autonomously
app.get('/api/get-pending-bookmarks', (req, res) => {
   res.json(pendingBookmarkMoves);
});

app.post('/api/clear-pending-bookmarks', (req, res) => {
   const { urls } = req.body || { urls: [] };
   pendingBookmarkMoves = pendingBookmarkMoves.filter(item => !urls.includes(item.url));
   res.json({ success: true });
});

app.post('/api/export/cancel', (req, res) => {
  if (isExportRunning) {
    cancelExportSignal = true;
    res.json({ success: true, message: 'Panic Stop triggered! Halting mass export safely.' });
  } else {
    res.json({ success: false, message: 'No export currently running.' });
  }
});

// 6. EXPORT / PUSH TO APIS
app.post('/api/export', async (req, res) => {
  try {
    const { itemIds, notionDbId, instapaperPassword } = req.body;
    const exported = [];
    
    // We keep a temporary list to loop through so we don't mutate during async logic
    const allLinks = db.getAllLinks();
    const itemsToProcess = allLinks.filter(l => itemIds.includes(l.id));

    isExportRunning = true;
    cancelExportSignal = false;

    // Map categories to clean KMS Output folder names
    function outputFolderName(cat) {
      const map = {
        'Article/PDF': 'Articles',
        'Book': 'Books',
        'Instapaper/Read Later': 'Read It Later',
        'Scientific News/Press Release': 'Articles',
        'Shopping': 'Shopping',
        'Tool/App/Service': 'Tools',
        'Event/Theater': 'Events',
        'Job Listing': 'Opportunities'
      };
      return map[cat] || cat.replace(/\//g, ' - ');
    }

    for (const link of itemsToProcess) {
      if (cancelExportSignal) {
        console.log('[Export Server] User triggered Panic Stop. Halting loop.');
        break;
      }

      let pushed = false;
      let cat = link.category || '';
      let folderCat = 'Articles'; // Default output folder

      // === SCIENTIFIC NEWS: Deep multi-layer paper extraction ===
      // ALWAYS routes to Zotero as Article. DOI/paper URL is bonus enrichment.
      if (cat === 'Scientific News/Press Release') {
        console.log(`[Sci-News] Deep-scanning for original paper: ${link.title}...`);
        let paperUrl = null;
        
        try {
          const axios = require('axios');
          const resp = await axios.get(link.url, { timeout: 8000 });
          const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

          // === LAYER 1: Explicit DOI strings anywhere in the page ===
          const doiMatch = html.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
          if (doiMatch) {
            paperUrl = `https://doi.org/${doiMatch[1]}`;
            console.log(`  [L1] Found raw DOI: ${doiMatch[1]}`);
          }

          // === LAYER 2: href links pointing to known academic journal domains ===
          if (!paperUrl) {
            const academicHrefDomains = [
              'nature.com/articles', 'science.org/doi', 'sciencedirect.com/science/article',
              'cell.com/cell', 'thelancet.com/journals', 'nejm.org/doi', 'bmj.com/content',
              'pnas.org/doi', 'aps.org/doi', 'journals.sagepub.com', 'tandfonline.com/doi',
              'springer.com/article', 'wiley.com/doi', 'ieee.org/document',
              'frontiersin.org/articles', 'mdpi.com/', 'biorxiv.org/content',
              'medrxiv.org/content', 'arxiv.org/abs', 'jstor.org/stable',
              'acm.org/doi', 'jamanetwork.com/journals', 'academic.oup.com/article',
              'projectmuse.jhu.edu', 'ssrn.com/abstract', 'pubmed.ncbi.nlm.nih.gov',
              'researchgate.net/publication'
            ];
            const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
            let hrefMatch;
            while ((hrefMatch = hrefRegex.exec(html)) !== null) {
              const href = hrefMatch[1];
              if (academicHrefDomains.some(d => href.includes(d))) {
                paperUrl = href.startsWith('http') ? href : `https://${href}`;
                console.log(`  [L2] Found academic journal link: ${paperUrl}`);
                break;
              }
            }
          }

          // === LAYER 3: Scan near "Source", "Reference", "Study", "Published in" sections ===
          if (!paperUrl) {
            // Grab text around citation-indicator keywords and look for URLs within 500 chars
            const citationKeywords = /(?:source|reference|original\s+(?:study|paper|article|research)|published\s+in|citation|read\s+the\s+(?:paper|study)|journal\s+reference|doi)[:\s]*/gi;
            let citMatch;
            while ((citMatch = citationKeywords.exec(html)) !== null) {
              const nearbyChunk = html.substring(citMatch.index, citMatch.index + 500);
              // Look for a URL in that chunk
              const urlInChunk = nearbyChunk.match(/https?:\/\/[^\s"'<>]+/i);
              if (urlInChunk) {
                const candidate = urlInChunk[0].replace(/[,.)]+$/, ''); // strip trailing punctuation
                // Verify it's not just the same news site linking to itself
                const originalDomain = new URL(link.url).hostname;
                try {
                  const candidateDomain = new URL(candidate).hostname;
                  if (candidateDomain !== originalDomain) {
                    paperUrl = candidate;
                    console.log(`  [L3] Found URL near citation section: ${paperUrl}`);
                    break;
                  }
                } catch (e) {}
              }
            }
          }

          // === LAYER 4: Look for any .edu link or doi.org link in the entire page ===
          if (!paperUrl) {
            const eduOrDoi = html.match(/href\s*=\s*["'](https?:\/\/[^"']*(?:\.edu\/|doi\.org\/)[^"']*)["']/i);
            if (eduOrDoi) {
              paperUrl = eduOrDoi[1];
              console.log(`  [L4] Found .edu/doi.org link: ${paperUrl}`);
            }
          }

          // Apply the best result we found
          if (paperUrl) {
            link.url = paperUrl;
            link.title = `[Paper Found] ${link.title}`;
            db.updateLink(link.id, { url: paperUrl, title: link.title });
          } else {
            console.log(`  -> No paper reference found. Sending news URL to Zotero as-is.`);
          }
        } catch (e) {
          console.log(`  -> HTTP fetch failed: ${e.message}. Sending original URL to Zotero as-is.`);
        }
        // ALWAYS convert to Article/PDF and route to Zotero — no exceptions
        cat = 'Article/PDF';
        db.updateLink(link.id, { category: 'Article/PDF' });
      }

      // Now route based on the (possibly updated) category
      folderCat = outputFolderName(cat);

      // === MODULAR ROUTE EXECUTION ===
      // Look up user-defined routes for this category
      const routes = db.getRoutesForCategory(cat);

      if (routes.length > 0) {
        // User has configured custom flows — execute each connector in order
        for (const route of routes) {
          // Merge route-level config with saved connector config
          const savedConfig = db.getConnectorConfig(route.connector_id);
          const baseConfig = savedConfig ? JSON.parse(savedConfig.config || '{}') : {};
          const routeConfig = JSON.parse(route.connector_config || '{}');
          const mergedConfig = { ...baseConfig, ...routeConfig };

          const ok = await connectorRegistry.execute(route.connector_id, link, mergedConfig);
          if (ok) pushed = true;
        }
      } else {
        // LEGACY FALLBACK: No routes configured — use hardcoded defaults
        // (This ensures backward compat for existing users who haven't set up flows yet)
        const { exportToZotero, exportToInstapaper } = require('./export-engine');
        if (cat === 'Article/PDF' || cat === 'Book') {
          await exportToZotero(link);
          pushed = true;
        } else if (cat === 'Instapaper/Read Later') {
          await exportToInstapaper(link, instapaperPassword);
          pushed = true;
        } else {
          pushed = true; // Shopping, Tools, Events, Jobs — just bookmark backup
        }
      }

      if (pushed) {
        exported.push(link.id);
        // Queue for Chrome Extension to create/move bookmarks into KMS Output
        pendingBookmarkMoves.push({ url: link.url, title: link.title, category: folderCat });
      }
    }

    // Remove fully exported items from inbox
    exported.forEach(id => db.deleteLink(id));
    
    res.json({ 
      success: true, 
      message: cancelExportSignal 
        ? `Export halted early. Synchronized ${exported.length} items to your vaults.`
        : `Successfully synchronized ${exported.length} items to your vaults!`,
      exported 
    });
  } catch (err) {
    console.error("[Export Error Hook]", err);
    res.status(500).json({ error: err.message || 'Server crashed during export logic' });
  } finally {
    isExportRunning = false;
    cancelExportSignal = false;
  }
});

// 7. CHROME BIDIRECTIONAL READ/SYNC
app.post('/api/chrome-tabs', async (req, res) => {
  const { tabs } = req.body;
  if (!tabs || !Array.isArray(tabs)) return res.status(400).json({ error: 'Missing tabs array' });
  
  const newLinks = [];
  await asyncPool(5, tabs, async (tab) => {
    if (tab.url.startsWith('http')) {
      try {
        const meta = await fetchAndExtractMetadata(tab.url);
        let bestTitle = tab.title || meta.title;
        let category = classifyLink(tab.url, bestTitle, meta.description);
        let finalUrl = tab.url;

        if (category === 'Scientific News/Press Release' && meta.paperLink) {
          finalUrl = meta.paperLink;
          category = classifyLink(finalUrl, bestTitle, meta.description);
          bestTitle = `[News Extracted] ${bestTitle}`;
        }

        const linkObj = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          category,
          url: finalUrl,
          title: bestTitle,
          description: meta.description || '',
          markdownBody: meta.markdownBody || '',
          date_added: Math.floor(Date.now() / 1000),
          source: 'chrome-mass-tabs'
        };
        db.addLink(linkObj);
        console.log(`[Background] Processed queued tab: ${linkObj.title}`);
      } catch (e) {
        console.error(`[Background Error] ${e.message}`);
      }
    }
  }).catch(e => console.error(`[Pool Crash] ${e.message}`));

  // Immediately release the UI
  res.json({ success: true, count: tabs.length, message: `Queued ${tabs.length} active tabs for deep background extraction!` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[KMS Auto-Router] Backend running on http://0.0.0.0:${PORT} - Available on Local Network`);
});
