const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Determine DB path: always prefer Electron's userData folder (survives exe updates),
// fall back to project root only in pure dev-server mode.
let dbPath;
let isElectron = false;
try {
  const { app } = require('electron');
  dbPath = path.join(app.getPath('userData'), 'kms_local_data.sqlite');
  isElectron = true;
} catch (e) {
  dbPath = path.join(__dirname, 'kms_local_data.sqlite');
}

// ONE-TIME MIGRATION: silently attempt to promote a richer local DB to AppData.
// Wrapped in try/catch — paths inside ASAR bundles can't be stat'd and must not crash.
if (isElectron) {
  try {
    // process.resourcesPath points to the app's resources folder (outside ASAR)
    const resourcesDir = process.resourcesPath || '';
    const projectRootDb = path.join(resourcesDir, '..', 'kms_local_data.sqlite');
    const appdataSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const projectSize  = fs.existsSync(projectRootDb) ? fs.statSync(projectRootDb).size : 0;
    if (projectSize > appdataSize + 4096) {
      fs.copyFileSync(projectRootDb, dbPath);
      console.log(`[DB] Migrated project DB (${projectSize}b) → AppData (${appdataSize}b)`);
    }
  } catch(e) {
    // Non-fatal — continue with whichever DB exists at dbPath
  }
}


const db = new Database(dbPath);


// Performance / concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    category TEXT,
    url TEXT,
    title TEXT,
    description TEXT,
    markdownBody TEXT,
    date_added INTEGER,
    source TEXT,
    paperLink TEXT
  )
`);

// 🚀 Automatic Schema Migration for Existing Users
try {
  db.exec("ALTER TABLE links ADD COLUMN markdownBody TEXT DEFAULT ''");
} catch (e) {}
try {
  db.exec("ALTER TABLE links ADD COLUMN paperLink TEXT DEFAULT ''");
} catch (e) {}
try {
  db.exec("ALTER TABLE links ADD COLUMN type TEXT DEFAULT 'url'");
} catch (e) {}
try {
  db.exec("ALTER TABLE links ADD COLUMN filePath TEXT DEFAULT ''");
} catch (e) {}
try {
  db.exec("ALTER TABLE links ADD COLUMN confidence INTEGER DEFAULT 0");
} catch (e) {}

// Dynamic Settings Table (for custom Categories, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

const defaultCategories = [];

try {
  const existingCats = db.prepare('SELECT value FROM settings WHERE key = ?').get('categories');
  if (!existingCats) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('categories', JSON.stringify(defaultCategories));
  }
  
  const onboarded = db.prepare('SELECT value FROM settings WHERE key = ?').get('onboarding_complete');
  if (!onboarded) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('onboarding_complete', '"false"');
  }
} catch (e) {
  console.error("Migration error initializing categories:", e);
}

// Adaptive Learning Table
db.exec(`
  CREATE TABLE IF NOT EXISTS learned_rules (
    domain TEXT,
    category TEXT,
    hits INTEGER DEFAULT 1,
    PRIMARY KEY (domain, category)
  )
`);

// Connector Configurations (user credentials per connector)
db.exec(`
  CREATE TABLE IF NOT EXISTS connector_configs (
    connector_id TEXT PRIMARY KEY,
    config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 0
  )
`);

// Routes (user-defined flows: category → connector actions)
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    action_order INTEGER DEFAULT 0,
    connector_id TEXT NOT NULL,
    connector_config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_title TEXT,
    entity_url TEXT,
    category TEXT,
    connector TEXT,
    message TEXT,
    timestamp INTEGER
  )
`);

// Dedicated registry for "Unsorted" links — a record for posterity, fully
// separate from the main `links` inbox and never routed to any connector.
db.exec(`
  CREATE TABLE IF NOT EXISTS unsorted_archive (
    url TEXT PRIMARY KEY,
    title TEXT,
    last_visit INTEGER,
    visits INTEGER DEFAULT 1,
    archived_at INTEGER,
    bucket TEXT DEFAULT 'Unsorted'
  )
`);
try { db.exec("ALTER TABLE unsorted_archive ADD COLUMN bucket TEXT DEFAULT 'Unsorted'"); } catch (e) {}

// Pages the user deleted — never re-swept, so curation survives re-runs.
db.exec(`CREATE TABLE IF NOT EXISTS excluded_urls (url TEXT PRIMARY KEY, excluded_at INTEGER)`);

const stmts = {
  insert: db.prepare(`
    INSERT OR REPLACE INTO links (id, category, url, title, description, markdownBody, date_added, source, paperLink, type, filePath, confidence)
    VALUES (@id, @category, @url, @title, @description, @markdownBody, @date_added, @source, @paperLink, @type, @filePath, @confidence)
  `),
  getAll: db.prepare('SELECT * FROM links ORDER BY date_added DESC'),
  getById: db.prepare('SELECT * FROM links WHERE id = ?'),
  delete: db.prepare('DELETE FROM links WHERE id = ?'),
  update: db.prepare(`
    UPDATE links 
    SET category = COALESCE(@category, category),
        title = COALESCE(@title, title),
        url = COALESCE(@url, url),
        description = COALESCE(@description, description),
        markdownBody = COALESCE(@markdownBody, markdownBody),
        paperLink = COALESCE(@paperLink, paperLink),
        type = COALESCE(@type, type),
        filePath = COALESCE(@filePath, filePath)
    WHERE id = @id
  `),
  getLearnedRules: db.prepare('SELECT domain, category, hits FROM learned_rules'),
  upsertLearnedRule: db.prepare(`
    INSERT INTO learned_rules (domain, category, hits) VALUES (@domain, @category, 1)
    ON CONFLICT(domain, category) DO UPDATE SET hits = hits + 1
  `)
};

module.exports = {
  db,
  
  addLink: (obj) => {
    stmts.insert.run({
        id: obj.id,
        category: obj.category || '',
        url: obj.url || '',
        title: obj.title || '',
        description: obj.description || '',
        markdownBody: obj.markdownBody || '',
        date_added: obj.date_added || Math.floor(Date.now() / 1000),
        source: obj.source || '',
        paperLink: obj.paperLink || '',
        type: obj.type || 'url',
        filePath: obj.filePath || '',
        confidence: obj.confidence || 0
    });
  },

  addLinkBatch: (linksArray) => {
    const insertMany = db.transaction((links) => {
      for (const obj of links) {
        stmts.insert.run({
          id: obj.id,
          category: obj.category || '',
          url: obj.url || '',
          title: obj.title || '',
          description: obj.description || '',
          markdownBody: obj.markdownBody || '',
          date_added: obj.date_added || Math.floor(Date.now() / 1000),
          source: obj.source || '',
          paperLink: obj.paperLink || '',
          type: obj.type || 'url',
          filePath: obj.filePath || '',
          confidence: obj.confidence || 0
        });
      }
    });
    insertMany(linksArray);
  },

  addLink: (obj) => {
    stmts.insert.run({
      id: obj.id,
      category: obj.category || '',
      url: obj.url || '',
      title: obj.title || '',
      description: obj.description || '',
      markdownBody: obj.markdownBody || '',
      date_added: obj.date_added || Math.floor(Date.now() / 1000),
      source: obj.source || '',
      paperLink: obj.paperLink || '',
      type: obj.type || 'url',
      filePath: obj.filePath || '',
      confidence: obj.confidence || 0
    });
  },

  getAllLinks: () => {
    return stmts.getAll.all();
  },

  getLinkById: (id) => {
    return stmts.getById.get(id);
  },

  deleteLink: (id) => {
    stmts.delete.run(id);
  },

  updateLink: (id, updates) => {
    stmts.update.run({
      id: id,
      category: updates.category !== undefined ? updates.category : null,
      title: updates.title !== undefined ? updates.title : null,
      url: updates.url !== undefined ? updates.url : null,
      description: updates.description !== undefined ? updates.description : null,
      markdownBody: updates.markdownBody !== undefined ? updates.markdownBody : null,
      paperLink: updates.paperLink !== undefined ? updates.paperLink : null,
      type: updates.type !== undefined ? updates.type : null,
      filePath: updates.filePath !== undefined ? updates.filePath : null
    });
    return stmts.getById.get(id);
  },

  getLearnedRules: () => stmts.getLearnedRules.all(),
  upsertLearnedRule: (domain, category) => {
    stmts.upsertLearnedRule.run({ domain, category });
  },

  logAction: (title, url, category, connector, message) => {
    db.prepare('INSERT INTO action_logs (entity_title, entity_url, category, connector, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
      title || '', url || '', category || '', connector || '', message || '', Math.floor(Date.now() / 1000)
    );
  },
  getLogs: () => {
    return db.prepare('SELECT * FROM action_logs ORDER BY timestamp DESC LIMIT 500').all();
  },

  // === Dynamic Settings & Categories ===
  getSetting: (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  },
  
  setSetting: (key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  },
  
  getCategories: () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('categories');
    return row ? JSON.parse(row.value) : [];
  },

  saveCategories: (categories) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('categories', JSON.stringify(categories));
  },

  // === Connector Configs ===
  getConnectorConfig: (connectorId) => {
    return db.prepare('SELECT * FROM connector_configs WHERE connector_id = ?').get(connectorId);
  },
  getAllConnectorConfigs: () => {
    return db.prepare('SELECT * FROM connector_configs').all();
  },
  saveConnectorConfig: (connectorId, config, enabled) => {
    db.prepare(`
      INSERT INTO connector_configs (connector_id, config, enabled) VALUES (?, ?, ?)
      ON CONFLICT(connector_id) DO UPDATE SET config = excluded.config, enabled = excluded.enabled
    `).run(connectorId, JSON.stringify(config), enabled ? 1 : 0);
  },

  // === Routes (Flows) ===
  getRoutes: () => {
    return db.prepare('SELECT * FROM routes ORDER BY category, action_order').all();
  },
  getRoutesForCategory: (category) => {
    return db.prepare('SELECT * FROM routes WHERE category = ? AND enabled = 1 ORDER BY action_order').all(category);
  },
  addRoute: (category, connectorId, connectorConfig = {}, actionOrder = 0) => {
    return db.prepare(`
      INSERT INTO routes (category, connector_id, connector_config, action_order) VALUES (?, ?, ?, ?)
    `).run(category, connectorId, JSON.stringify(connectorConfig), actionOrder);
  },
  updateRoute: (id, updates) => {
    const fields = [];
    const values = [];
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    if (updates.connector_id !== undefined) { fields.push('connector_id = ?'); values.push(updates.connector_id); }
    if (updates.connector_config !== undefined) { fields.push('connector_config = ?'); values.push(JSON.stringify(updates.connector_config)); }
    if (updates.action_order !== undefined) { fields.push('action_order = ?'); values.push(updates.action_order); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    values.push(id);
    if (fields.length > 0) {
      db.prepare(`UPDATE routes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  },
  deleteRoute: (id) => {
    db.prepare('DELETE FROM routes WHERE id = ?').run(id);
  },

  // === Deduplication ===
  // Returns true if the URL is already in the inbox OR has a successful export log.
  // Normalises the URL (strips trailing slash, lowercases scheme+host) before comparing.
  isAlreadyProcessed: (url) => {
    if (!url) return false;
    let normalised = url.trim().replace(/\/$/, '');
    try { const u = new URL(normalised); normalised = u.href.replace(/\/$/, ''); } catch(e) {}
    // In inbox right now?
    const inInbox = db.prepare('SELECT 1 FROM links WHERE url = ? LIMIT 1').get(normalised);
    if (inInbox) return true;
    // Already exported successfully?
    const exported = db.prepare(
      "SELECT 1 FROM action_logs WHERE entity_url = ? AND message = 'Success' LIMIT 1"
    ).get(normalised);
    return !!exported;
  },

  // === Unsorted registry (posterity record, separate from everything else) ===
  addUnsortedBatch: (rows) => {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO unsorted_archive (url, title, last_visit, visits, archived_at, bucket) VALUES (@url, @title, @last_visit, @visits, @archived_at, @bucket)'
    );
    const many = db.transaction((arr) => { for (const r of arr) stmt.run(r); });
    many(rows);
  },
  getUnsorted: (limit = 2000) => db.prepare('SELECT * FROM unsorted_archive ORDER BY last_visit DESC LIMIT ?').all(limit),
  getUnsortedCount: () => db.prepare('SELECT COUNT(*) AS n FROM unsorted_archive').get().n,

  // === Exclusions (deleted pages are never re-swept) ===
  addExclusion: (url) => { if (url) db.prepare('INSERT OR IGNORE INTO excluded_urls (url, excluded_at) VALUES (?, ?)').run(url, Math.floor(Date.now() / 1000)); },
  isExcluded: (url) => !!db.prepare('SELECT 1 FROM excluded_urls WHERE url = ? LIMIT 1').get(url),

  // Wipe a previous sweep so it can be re-run cleanly. Keeps learned_rules
  // (your corrections) and excluded_urls (your deletions).
  clearSweep: () => {
    const links = db.prepare("DELETE FROM links WHERE source = 'history-sweep'").run().changes;
    const archive = db.prepare('DELETE FROM unsorted_archive').run().changes;
    return { links, archive };
  }
};
