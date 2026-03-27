const Database = require('better-sqlite3');
const path = require('path');

// Store database safely in the user's OS AppData folder so it survives app updates and bypasses the read-only ASAR bounds
let dbPath;
try {
  const { app } = require('electron');
  dbPath = path.join(app.getPath('userData'), 'kms_local_data.sqlite');
} catch (e) {
  dbPath = path.join(__dirname, 'kms_local_data.sqlite');
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

const stmts = {
  insert: db.prepare(`
    INSERT OR REPLACE INTO links (id, category, url, title, description, markdownBody, date_added, source, paperLink)
    VALUES (@id, @category, @url, @title, @description, @markdownBody, @date_added, @source, @paperLink)
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
        paperLink = COALESCE(@paperLink, paperLink)
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
        paperLink: obj.paperLink || ''
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
          paperLink: obj.paperLink || ''
        });
      }
    });
    insertMany(linksArray);
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
      paperLink: updates.paperLink !== undefined ? updates.paperLink : null
    });
    return stmts.getById.get(id);
  },

  getLearnedRules: () => {
    return stmts.getLearnedRules.all();
  },

  upsertLearnedRule: (domain, category) => {
    stmts.upsertLearnedRule.run({ domain, category });
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
  }
};
