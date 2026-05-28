require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { classifyLink, loadLearnedRules, recordCorrection } = require('./classifier');
const { fetchAndExtractMetadata } = require('./fetcher');
const db = require('./db');
const connectorRegistry = require('./connectors');
const { initializeTriggers } = require('./trigger-engine');


// Boot the adaptive learning engine from persistent SQLite memory
loadLearnedRules(db);

// Initialize Data Pullers and Developer Plugins
initializeTriggers();

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
app.use(express.json({ limit: '50mb' }));

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

// === OPEN DEVELOPER API (External Ingestion Webhook) ===
// Connect any 3rd party service! POST directly to this endpoint from external scripts/apps
app.post('/api/open/ingest', async (req, res) => {
  try {
    const { url, title, description, rawContent, type = 'text', secret } = req.body;
    console.log(`[Open API] Received remote webhook ping: ${title || url}`);

    // Dedup: don't re-ingest URLs already processed or already in inbox
    if (url && db.isAlreadyProcessed(url)) {
      return res.status(200).json({ success: true, duplicate: true, message: 'URL already processed.' });
    }

    const category = classifyLink(url || '', title || '', description || rawContent || '');
    const newId = Date.now().toString();
    db.addLink({
      id: newId, url: url || '', title: title || 'External Webhook Feed',
      description: description || '', markdownBody: rawContent || '',
      category, type
    });

    res.status(200).json({ success: true, id: newId, routedCategory: category });
  } catch (err) {
    console.error('[Open API Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// === APP CONFIG & SYSTEM STATE API ===
app.get('/api/app-state', (req, res) => {
  const onboarded = db.getSetting('onboarding_complete') || 'false';
  res.json({ onboarding_complete: onboarded === 'true' });
});

app.post('/api/app-state', (req, res) => {
  const { onboarding_complete } = req.body;
  if (onboarding_complete !== undefined) {
    db.setSetting('onboarding_complete', onboarding_complete ? 'true' : 'false');
  }
  res.json({ success: true });
});

// === COMPREHENSIVE SETTINGS API ===
app.get('/api/all-settings', (req, res) => {
  res.json({
    general: {
      language: db.getSetting('language') || 'en',
      theme: db.getSetting('theme') || 'light',
      defaultCategory: db.getSetting('default_category') || 'Uncategorized',
      serverPort: PORT,
      version: require('./package.json').version || '1.2.0'
    },
    classifier: {
      confidenceThreshold: db.getSetting('confidence_threshold') || 45,
      fallbackBehavior: db.getSetting('fallback_behavior') || 'uncategorized',
      enableFilenameHints: db.getSetting('enable_filename_hints') !== false,
      enableAdaptiveLearning: db.getSetting('enable_adaptive_learning') !== false
    },
    api: {
      apiSecret: db.getSetting('api_secret') || '',
      allowedOrigins: db.getSetting('allowed_origins') || '*',
      webhookUrl: `http://localhost:${PORT}/api/open/ingest`,
      autoClassifyWebhook: db.getSetting('auto_classify_webhook') !== false
    },
    triggers: {
      pollingInterval: db.getSetting('trigger_polling_interval') || 300,
      enabledTriggers: db.getSetting('enabled_triggers') || []
    },
    data: {
      dbPath: require('path').resolve(db.db.name),
      totalLinks: db.getAllLinks().length,
      totalRoutes: db.getRoutes().length,
      learnedRules: db.getLearnedRules().length
    }
  });
});

app.patch('/api/all-settings', (req, res) => {
  const { section, key, value } = req.body;
  const settingMap = {
    'general.language': 'language',
    'general.theme': 'theme',
    'general.defaultCategory': 'default_category',
    'classifier.confidenceThreshold': 'confidence_threshold',
    'classifier.fallbackBehavior': 'fallback_behavior',
    'classifier.enableFilenameHints': 'enable_filename_hints',
    'classifier.enableAdaptiveLearning': 'enable_adaptive_learning',
    'api.apiSecret': 'api_secret',
    'api.allowedOrigins': 'allowed_origins',
    'api.autoClassifyWebhook': 'auto_classify_webhook',
    'triggers.pollingInterval': 'trigger_polling_interval',
    'triggers.enabledTriggers': 'enabled_triggers'
  };
  const fullKey = `${section}.${key}`;
  const dbKey = settingMap[fullKey];
  if (dbKey) {
    db.setSetting(dbKey, value);
    res.json({ success: true, key: dbKey, value });
  } else {
    res.status(400).json({ error: `Unknown setting: ${fullKey}` });
  }
});

app.get('/api/export-db', (req, res) => {
  const data = {
    links: db.getAllLinks(),
    categories: db.getCategories(),
    categoryRules: db.getSetting('category_rules') || {},
    routes: db.getRoutes(),
    learnedRules: db.getLearnedRules(),
    connectorConfigs: db.getAllConnectorConfigs(),
    exportDate: new Date().toISOString()
  };
  res.setHeader('Content-Disposition', 'attachment; filename=routster_backup.json');
  res.json(data);
});

app.post('/api/clear-data', (req, res) => {
  const { target } = req.body;
  if (target === 'links') {
    db.db.prepare('DELETE FROM links').run();
  } else if (target === 'learned_rules') {
    db.db.prepare('DELETE FROM learned_rules').run();
  } else if (target === 'routes') {
    db.db.prepare('DELETE FROM routes').run();
  }
  res.json({ success: true, cleared: target });
});

// === CATEGORIES API ===
app.get('/api/categories', (req, res) => {
  try {
    // Merge: settings list + all categories used in routes + all categories seen in links
    // This ensures the UI always shows every category regardless of where it was created.
    const saved = db.getCategories() || [];
    const fromRoutes = db.db.prepare("SELECT DISTINCT category FROM routes WHERE category IS NOT NULL AND category != ''").all().map(r => r.category);
    const fromLinks  = db.db.prepare("SELECT DISTINCT category FROM links  WHERE category IS NOT NULL AND category != '' AND category != 'Uncategorized'").all().map(r => r.category);
    const merged = [...new Set([...saved, ...fromRoutes, ...fromLinks])].sort();
    res.json(merged);
  } catch(e) {
    console.error('[categories API]', e.message);
    res.json(db.getCategories() || []);  // safe fallback
  }
});

app.post('/api/categories', (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories must be an array' });
  db.saveCategories(categories);
  res.json({ success: true });
});

app.delete('/api/categories/:name', (req, res) => {
  const catName = req.params.name;
  let cats = db.getCategories();
  cats = cats.filter(c => c !== catName);
  db.saveCategories(cats);
  db.db.prepare('DELETE FROM routes WHERE category = ?').run(catName); // Also delete associated routes
  res.json({ success: true });
});

app.put('/api/categories/:oldName', (req, res) => {
  const oldName = req.params.oldName;
  const { newName } = req.body;
  
  let cats = db.getCategories();
  const idx = cats.indexOf(oldName);
  if (idx !== -1 && newName) {
    cats[idx] = newName;
    db.saveCategories(cats);
    db.db.prepare('UPDATE routes SET category = ? WHERE category = ?').run(newName, oldName);
    db.db.prepare('UPDATE links SET category = ? WHERE category = ?').run(newName, oldName);
  }
  res.json({ success: true });
});

// === CUSTOM ACTIONS API ===
// Ensure the custom_actions table exists (idempotent)
db.db.exec(`
  CREATE TABLE IF NOT EXISTS custom_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '⚡',
    description TEXT,
    type TEXT DEFAULT 'webhook',
    url TEXT NOT NULL,
    method TEXT DEFAULT 'POST',
    headers TEXT DEFAULT '{}',
    body_template TEXT DEFAULT ''
  )
`);

app.get('/api/custom-actions', (req, res) => {
  const rows = db.db.prepare('SELECT * FROM custom_actions ORDER BY id').all();
  res.json(rows);
});

app.post('/api/custom-actions', (req, res) => {
  const { name, icon, description, type, url, method, headers, body_template } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const result = db.db.prepare(
    'INSERT INTO custom_actions (name, icon, description, type, url, method, headers, body_template) VALUES (?,?,?,?,?,?,?,?)'
  ).run(name, icon || '⚡', description || '', type || 'webhook', url, method || 'POST', headers || '{}', body_template || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/custom-actions/:id', (req, res) => {
  const { name, icon, description, type, url, method, headers, body_template } = req.body;
  db.db.prepare(
    'UPDATE custom_actions SET name=?, icon=?, description=?, type=?, url=?, method=?, headers=?, body_template=? WHERE id=?'
  ).run(name, icon || '⚡', description || '', type || 'webhook', url, method || 'POST', headers || '{}', body_template || '', req.params.id);
  res.json({ success: true });
});

app.delete('/api/custom-actions/:id', (req, res) => {
  db.db.prepare('DELETE FROM custom_actions WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Execute a custom action against a link (used by export pipeline)
async function executeCustomAction(caId, link) {
  const axios = require('axios');
  const ca = db.db.prepare('SELECT * FROM custom_actions WHERE id=?').get(caId);
  if (!ca) return false;
  try {
    const interpolate = (str) => str
      .replace(/\{\{title\}\}/g, link.title || '')
      .replace(/\{\{url\}\}/g, link.url || '')
      .replace(/\{\{category\}\}/g, link.category || '')
      .replace(/\{\{description\}\}/g, link.description || '');

    const headers = JSON.parse(ca.headers || '{}');
    const body = ca.body_template ? interpolate(ca.body_template) : JSON.stringify({ title: link.title, url: link.url, category: link.category });

    await axios({ method: ca.method || 'POST', url: ca.url, headers, data: body, timeout: 15000 });
    console.log(`[CustomAction] ✅ "${ca.name}" fired for: ${link.title}`);
    return true;
  } catch (e) {
    console.error(`[CustomAction] ❌ "${ca.name}" failed: ${e.message}`);
    return false;
  }
}



// === ZOTERO RECOVERY ENDPOINT ===
// Sends already-extracted paper URLs from action_logs directly to Zotero.
// NO re-extraction — the log URLs are the result of prior extraction runs.
// Titles stay exactly as stored; no prefixes or metadata appended.
app.post('/api/recover-to-zotero', async (req, res) => {
  try {
    const apiKey = process.env.ZOTERO_API_KEY;
    const userId = process.env.ZOTERO_USER_ID;
    if (!apiKey || !userId) {
      return res.status(400).json({ error: 'Zotero not configured. Check your .env file.' });
    }
    const collectionName = process.env.ZOTERO_COLLECTION || 'Routster Inbox';
    const zoteroHeaders = { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // Get or create collection
    let collectionKey = null;
    const colRes = await axios.get(`https://api.zotero.org/users/${userId}/collections`, { headers: zoteroHeaders });
    const existing = colRes.data.find(c => c.data.name === collectionName);
    if (existing) {
      collectionKey = existing.key;
    } else {
      const cr = await axios.post(`https://api.zotero.org/users/${userId}/collections`,
        [{ name: collectionName }], { headers: zoteroHeaders });
      collectionKey = cr.data.successful?.['0']?.key;
    }

    // Fetch log rows — use the URLs as-is, no re-extraction
    const rows = db.db.prepare(
      "SELECT * FROM action_logs WHERE connector = 'academic_extractor' AND message = 'Success' ORDER BY timestamp DESC"
    ).all();
    if (rows.length === 0) return res.json({ success: true, sent: 0, message: 'No academic extractor logs found.' });

    // Only include rows with actual paper URLs (doi.org, arxiv, etc.)
    const PAPER_URL_PATTERN = /doi\.org|arxiv\.org|biorxiv\.org|medrxiv\.org|pubmed\.ncbi|nature\.com\/articles|sciencedirect|pnas\.org|science\.org\/doi|nejm\.org|frontiersin|cell\.com|acs\.org\/doi|jstor\.org|springer|wiley\.com\/doi/i;
    const paperRows = rows.filter(r => PAPER_URL_PATTERN.test(r.entity_url));
    const skipped = rows.length - paperRows.length;

    // Build Zotero items — clean titles only, no extra metadata
    let sent = 0;
    const BATCH = 25;
    for (let i = 0; i < paperRows.length; i += BATCH) {
      const batch = paperRows.slice(i, i + BATCH);
      const items = batch.map(r => {
        const doiMatch = r.entity_url.match(/doi\.org\/(10\.\d{4,}\/[^?\s&"#<>]+)/i);
        const doi = doiMatch ? doiMatch[1].replace(/[/.,)]+$/, '') : null;
        const item = {
          itemType: doi ? 'journalArticle' : 'webpage',
          title: (r.entity_title || r.entity_url).replace(/^\[Extracted Paper\]\s*/i, '').trim(),
          url: r.entity_url,
          collections: collectionKey ? [collectionKey] : []
        };
        if (doi && doi.length < 100) item.DOI = doi;
        return item;
      });

      try {
        await axios.post(`https://api.zotero.org/users/${userId}/items`, items, { headers: zoteroHeaders });
        sent += items.length;
        console.log(`[Recovery] Batch sent: ${sent}/${paperRows.length}`);
      } catch(e) {
        console.error(`[Recovery] Batch failed: ${e.message}`);
        // Try items one-by-one to isolate bad DOIs
        for (const item of items) {
          try {
            await axios.post(`https://api.zotero.org/users/${userId}/items`, [item], { headers: zoteroHeaders });
            sent++;
          } catch(e2) {
            console.warn(`[Recovery] Skipped "${item.title}": ${e2.message}`);
          }
          await new Promise(r => setTimeout(r, 150));
        }
      }
      await new Promise(r => setTimeout(r, 500)); // Zotero rate limit
    }

    db.logAction('Zotero Recovery', '', 'Science News', 'zotero', `Recovered ${sent} papers`);
    res.json({ success: true, sent, skipped, message: `Sent ${sent} papers to "${collectionName}" (${skipped} news-page items skipped — no paper URL in logs).` });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// === CATEGORY RULES API ===




app.get('/api/category-rules', (req, res) => {
  res.json(db.getSetting('category_rules') || {});
});

app.post('/api/category-rules', (req, res) => {
  const { category, rules } = req.body;
  if (!category) return res.status(400).json({ error: 'category name required' });
  const allRules = db.getSetting('category_rules') || {};
  allRules[category] = rules;
  db.setSetting('category_rules', allRules);
  res.json({ success: true });
});

// === LOGS API ===
app.get('/api/logs', (req, res) => {
  try {
    const logs = db.getLogs();
    res.json(logs);
  } catch(e) {
    res.status(500).json({error: e.message});
  }
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

// 1. EXTENSION & UNIVERSAL INGEST ENDPOINT (Supports URL, Text Notes, DOIs, and Files)
app.post('/api/ingest', upload.single('file'), async (req, res) => {
  try {
    const { title, url, type, textContent, parseLinks } = req.body;
    let inputType = type || (req.file ? 'file' : (url ? 'url' : 'text'));
    let finalUrl = url || '';
    let bestTitle = title || '';
    let description = textContent || '';
    let markdownBody = '';
    let category = '';
    let localPath = req.file ? req.file.path : '';
    let paperLink = '';

    // Auto-detect DOIs in URLs
    if (inputType === 'url' && (finalUrl.includes('doi.org/') || finalUrl.match(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i))) {
      inputType = 'doi';
    }

    if (inputType === 'url' || inputType === 'doi') {
      if (!finalUrl) return res.status(400).json({ error: 'URL is required for URL imports' });
      const meta = await fetchAndExtractMetadata(finalUrl);
      bestTitle = title || meta.title || finalUrl;
      description = meta.description || description;
      markdownBody = meta.markdownBody || '';
      paperLink = meta.paperLink || '';

      category = classifyLink(finalUrl, bestTitle, description);

      if (category.toLowerCase().includes('news') && paperLink) {
        finalUrl = paperLink;
        category = 'Articles';
        bestTitle = `[Extracted Paper] ${bestTitle}`;
      }
    } else if (inputType === 'file') {
      bestTitle = title || (req.file ? req.file.originalname : 'Uploaded File');
      const ext = path.extname(bestTitle).toLowerCase();
      
      if (req.body.parseLinks === 'true') {
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const urls = fileContent.match(/https?:\/\/[^\s"',]+|10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi) || [];
        if (urls.length > 0) {
          const batchData = urls.map(u => ({
            id: Math.random().toString(36).substr(2, 9),
            category: classifyLink(u, 'Extracted Link', ''),
            url: u,
            title: `[Extracted] ${u}`,
            date_added: Math.floor(Date.now() / 1000),
            source: 'bulk-extraction'
          }));
          db.addLinkBatch(batchData);
          try { fs.unlinkSync(req.file.path) } catch(e){}
          return res.json({ success: true, message: `Successfully extracted and routed ${urls.length} links from file!` });
        }
      }
      category = classifyLink('', bestTitle, `File type: ${ext}\nContext: ${description}`);
    } else if (inputType === 'text') {
      bestTitle = title || `Note Snapshot ${new Date().toLocaleString()}`;
      
      if (parseLinks) {
         const urls = textContent.match(/https?:\/\/[^\s"',]+|10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi) || [];
         if (urls.length > 0) {
            const batchData = urls.map(u => ({
              id: Math.random().toString(36).substr(2, 9),
              category: classifyLink(u, 'Extracted Link', ''),
              url: u,
              title: `[Extracted] ${u}`,
              date_added: Math.floor(Date.now() / 1000),
              source: 'bulk-extraction'
            }));
            db.addLinkBatch(batchData);
            return res.json({ success: true, message: `Successfully extracted and routed ${urls.length} links from text!` });
         }
      }
      
      category = classifyLink('', bestTitle, description);
      markdownBody = description; // treat text content as full body
    }

    const resultObj = {
      id: Date.now().toString(),
      type: inputType,
      category,
      url: finalUrl,
      title: bestTitle,
      description,
      markdownBody,
      filePath: localPath,
      paperLink: paperLink,
      date_added: Math.floor(Date.now() / 1000),
      source: req.body.source || 'extension'
    };

    db.addLink(resultObj);
    res.json({ success: true, message: `Routed ${inputType} to ${category}` });
  } catch (err) {
    console.error('Ingestion Error:', err);
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

// Locate + read the user's live Chrome bookmark folders (used to train the classifier).
function readChromeBookmarks() {
  const lad = process.env.LOCALAPPDATA || '';
  const base = path.join(lad, 'Google', 'Chrome', 'User Data');
  const candidates = ['Default', 'Profile 1', 'Profile 2', 'Profile 3'].map(p => path.join(base, p, 'Bookmarks'));
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Could not find Chrome bookmarks to train from (looked in Default/Profile folders).');
  return JSON.parse(fs.readFileSync(found, 'utf8'));
}

// 3. DEEP HISTORY SWEEP (trained): learn the user's categories + fingerprints from
// their live bookmark folders, classify an uploaded history export with a confidence
// score, and STAGE the keepers in the inbox (source='history-sweep') for review.
// Nothing is routed onward until the user runs the export pipeline.
app.post('/api/sweep-history', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const trainer = require('./bookmark_trainer');
    const analyzer = require('./link_analyzer');
    const { parseAndDedupe, displayTitle } = require('./history_sweep');
    const threshold = (req.body.threshold !== undefined && req.body.threshold !== '') ? Number(req.body.threshold) : 8;

    // a) Train from the user's bookmark folders (their own filing = ground truth).
    const model = trainer.trainModel(readChromeBookmarks());

    // b) Fine-tune Routster's config — additive, with a reversible backup of prior rules.
    const prevCats = db.getCategories() || [];
    const prevRules = db.getSetting('category_rules') || {};
    db.setSetting('category_rules_backup_' + Date.now(), prevRules);
    const allCats = [...analyzer.PRIORITY, 'Trash', 'Unsorted'];
    const categoriesAdded = allCats.filter(c => !prevCats.includes(c));
    db.saveCategories(Array.from(new Set([...prevCats, ...allCats])));
    db.setSetting('category_rules', { ...prevRules, ...model.categoryRules });
    // Seed only the priority-category domain rules the user themselves established.
    const seedRule = db.db.prepare('INSERT OR REPLACE INTO learned_rules (domain, category, hits) VALUES (?, ?, ?)');
    let domainRulesSeeded = 0;
    for (const [domain, rule] of Object.entries(model.domainRules)) {
      if (analyzer.PRIORITY.includes(rule.category)) { seedRule.run(domain, rule.category, 5); domainRulesSeeded++; }
    }
    // Fold YOUR corrections (learned_rules from manual recategorisations) into the
    // model as authoritative priority-category domain rules — the algo learns from your edits.
    for (const lr of db.getLearnedRules()) {
      if (analyzer.PRIORITY.includes(lr.category) && lr.hits >= 2) model.domainRules[lr.domain] = { category: lr.category, purity: 0.95 };
    }

    // c) Parse + dedupe; analyze EVERY link. Only DEFINITIVE matches for the four
    //    priority categories are staged for review; Trash + Unsorted go to the
    //    registry (posterity record, never routed). Nothing is dropped.
    const { rawEntries, unique } = parseAndDedupe(req.file.path);
    const now = Math.floor(Date.now() / 1000);
    const perBucket = {};
    const batch = [];
    const archiveBatch = [];
    let skippedDuplicates = 0, trashCount = 0, unsortedCount = 0, excludedSkipped = 0;
    for (const item of unique) {
      if (db.isExcluded(item.url)) { excludedSkipped++; continue; }
      const r = analyzer.analyze(item.url, item.title, model, threshold);
      if (r.category === 'Trash' || r.category === 'Unsorted') {
        if (r.category === 'Trash') trashCount++; else unsortedCount++;
        archiveBatch.push({ url: item.url, title: displayTitle(item.url, item.title), last_visit: item.lastVisit || now, visits: item.visits, archived_at: now, bucket: r.category });
        continue;
      }
      if (db.isAlreadyProcessed(item.url)) { skippedDuplicates++; continue; }
      perBucket[r.category] = (perBucket[r.category] || 0) + 1;
      batch.push({
        id: 'hsw_' + Math.random().toString(36).substr(2, 9),
        category: r.category,
        url: item.url,
        title: displayTitle(item.url, item.title),
        description: `History sweep · ${r.via} · ${item.visits} visit(s)`,
        confidence: r.confidence,
        date_added: item.lastVisit || now,
        source: 'history-sweep',
      });
    }
    if (batch.length) db.addLinkBatch(batch);
    if (archiveBatch.length) db.addUnsortedBatch(archiveBatch);

    setTimeout(() => { try { fs.unlinkSync(req.file.path); } catch (e) {} }, 1000);

    res.json({
      success: true,
      stats: { rawEntries, uniqueUrls: unique.length, kept: batch.length, trash: trashCount, unsorted: unsortedCount, perBucket },
      staged: batch.length, trashArchived: trashCount, unsortedArchived: unsortedCount, skippedDuplicates, excludedSkipped, categoriesAdded, domainRulesSeeded, threshold,
    });
  } catch (err) {
    console.error('[History Sweep] error:', err);
    res.status(500).json({ error: err.message || 'Failed to sweep history file' });
  }
});

// The Unsorted registry — posterity record of links that matched no category.
app.get('/api/unsorted', (req, res) => {
  try { res.json({ count: db.getUnsortedCount(), items: db.getUnsorted(100000) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear a previous sweep (staged links + Unsorted/Trash registry) for a clean re-run.
app.post('/api/clear-sweep', (req, res) => {
  try { res.json({ success: true, ...db.clearSweep() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Get Chrome Bookmarks folder tree paths
app.get('/api/chrome/folders', (req, res) => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return res.json([]);
    const chromePaths = [
      require('path').join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
      require('path').join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks')
    ];
    let bmkPath = chromePaths.find(p => require('fs').existsSync(p));
    if (!bmkPath) return res.json([]);

    const bookmarks = JSON.parse(require('fs').readFileSync(bmkPath, 'utf8'));
    let paths = [];

    function traverseForFolders(node, currentPath) {
      if (node.type === 'folder') {
        const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
        paths.push({ label: fullPath, root: currentPath ? currentPath.split('/')[0] : node.name, path: fullPath });
        if (node.children) {
          node.children.forEach(c => traverseForFolders(c, fullPath));
        }
      }
    }
    
    // Process roots
    if (bookmarks.roots?.bookmark_bar) traverseForFolders(bookmarks.roots.bookmark_bar, 'bookmark_bar');
    if (bookmarks.roots?.other) traverseForFolders(bookmarks.roots.other, 'other');
    if (bookmarks.roots?.synced) traverseForFolders(bookmarks.roots.synced, 'synced');

    res.json(paths);
  } catch (e) {
    res.json([]);
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

    // Deduplication Engine using universal checks (Inbox + Export Logs)
    const newLinks = [];
    let skipped = 0;
    for (const l of extractedLinks) {
      if (db.isAlreadyProcessed(l.url)) {
        skipped++;
      } else {
        newLinks.push(l);
      }
    }

    if (newLinks.length === 0) {
      return res.json({ success: true, message: `Found ${extractedLinks.length} links inside 'KMS Input', but they are already tracked in your Inbox or have been previously exported (${skipped} skipped).`, count: 0 });
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
  if (db.isAlreadyProcessed(url)) {
    return res.json({ success: true, duplicate: true, message: 'URL already in inbox or previously exported.' });
  }
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
  const link = db.getLinkById(id);
  if (link && link.url) db.addExclusion(link.url); // remember so re-sweeps don't re-add it
  db.deleteLink(id);
  res.json({ success: true });
});

app.post('/api/links/mass-delete', (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Missing itemIds array' });
  itemIds.forEach(id => { const l = db.getLinkById(id); if (l && l.url) db.addExclusion(l.url); db.deleteLink(id); });
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

app.post('/api/links/mass-reclassify', (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Missing itemIds' });
  itemIds.forEach(id => {
    const link = db.getLinkById(id);
    if (link) {
      const newCategory = classifyLink(link.url, link.title || '', link.description || '');
      db.updateLink(id, { category: newCategory });
    }
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

      // Preserve original URL before any connector mutations (like academic_extractor replacing it with DOI)
      link.originalUrl = link.url;

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

          try {
            let ok;
            if (route.connector_id.startsWith('custom_')) {
              // User-defined custom action (webhook/API)
              const caId = parseInt(route.connector_id.replace('custom_', ''), 10);
              ok = await executeCustomAction(caId, link);
            } else {
              ok = await connectorRegistry.execute(route.connector_id, link, mergedConfig);
            }
            if (ok) {
              pushed = true;
              db.logAction(link.title, link.url, cat, route.connector_id, 'Success');
            } else {
              db.logAction(link.title, link.url, cat, route.connector_id, 'Failed / Skipped');
            }
          } catch (err) {
            db.logAction(link.title, link.url, cat, route.connector_id, `Error: ${err.message}`);
          }

        }

        // === SCIENCE NEWS FAN-OUT ===
        // academic_extractor attached the referenced papers/books on link._extracted;
        // route EACH through the real Articles/Books connectors (Zotero + KMS Output bookmarks).
        if (cat === 'Science News' && Array.isArray(link._extracted) && link._extracted.length) {
          for (const ex of link._extracted) {
            const child = {
              id: 'sci_' + Math.random().toString(36).substr(2, 9),
              url: ex.url,
              title: ex.title || ex.url,
              category: ex.type,                 // 'Articles' | 'Books' → correct Zotero/bookmark folder
              description: `Extracted from Science News: ${link.originalUrl || link.url}`,
              _paperFound: true
            };
            try {
              await connectorRegistry.execute('zotero', child, {});
              db.logAction(child.title, child.url, ex.type, 'zotero', 'Success (sci-extract)');
            } catch (e) { db.logAction(child.title, child.url, ex.type, 'zotero', `Error: ${e.message}`); }
            try {
              await connectorRegistry.execute('chrome_bookmarks', child, { clean_input: 'false' });
              db.logAction(child.title, child.url, ex.type, 'chrome_bookmarks', 'Success (sci-extract)');
            } catch (e) { db.logAction(child.title, child.url, ex.type, 'chrome_bookmarks', `Error: ${e.message}`); }
          }
          console.log(`[Sci Fan-out] Routed ${link._extracted.length} extracted item(s) from "${link.title}".`);
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
        pendingBookmarkMoves.push({ url: link.url, originalUrl: link.originalUrl || link.url, title: link.title, category: folderCat });
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

  let added = 0, skipped = 0;
  const newLinks = [];
  await asyncPool(5, tabs, async (tab) => {
    if (!tab.url.startsWith('http')) return;
    // Dedup: skip URLs already in inbox or previously exported
    if (db.isAlreadyProcessed(tab.url)) {
      skipped++;
      console.log(`[Chrome Import] Skipped duplicate: ${tab.url}`);
      return;
    }
    try {
      const meta = await fetchAndExtractMetadata(tab.url);
      const bestTitle = tab.title || meta.title;
      const category = classifyLink(tab.url, bestTitle, meta.description);
      const linkObj = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        category,
        url: tab.url,
        title: bestTitle,  // clean title — no prefixes
        description: meta.description || '',
        markdownBody: meta.markdownBody || '',
        date_added: Math.floor(Date.now() / 1000),
        source: 'chrome-mass-tabs'
      };
      db.addLink(linkObj);
      newLinks.push(linkObj);
      added++;
      console.log(`[Chrome Import] Added: ${linkObj.title}`);
    } catch (e) {
      console.error(`[Chrome Import Error] ${e.message}`);
    }
  }).catch(e => console.error(`[Pool Crash] ${e.message}`));

  res.json({ success: true, added, skipped, message: `Imported ${added} new links (${skipped} duplicates skipped).` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[KMS Auto-Router] Backend running on http://0.0.0.0:${PORT} - Available on Local Network`);
});
