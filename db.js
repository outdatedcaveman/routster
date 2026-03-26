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
  }
};
