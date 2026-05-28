const Database = require('better-sqlite3');
const appDataPath = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'Routster', 'kms_local_data.sqlite');
const db = new Database(appDataPath);

// Categories
const cats = db.prepare("SELECT value FROM settings WHERE key='categories'").get();
let catArr = [];
if (cats) {
  catArr = JSON.parse(cats.value);
}

const addRoute = db.prepare('INSERT INTO routes (category, connector_id, connector_config, action_order) VALUES (?, ?, ?, ?)');

for (let c of catArr) {
  // Insert chrome_bookmarks as the final action natively deleting from KMS Input and adding to KMS Output
  const curRoutes = db.prepare('SELECT action_order FROM routes WHERE category = ?').all(c);
  const nextOrder = curRoutes.length;
  
  // They wanted "KMS Output" in "Outros Favoritos"
  addRoute.run(c, 'chrome_bookmarks', JSON.stringify({
    base_folder: 'other',
    parent_folder: 'KMS Output',
    clean_input: 'true'
  }), nextOrder);
}

console.log("Added Save to Chrome Bookmarks action to all categories.");
