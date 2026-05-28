const Database = require('better-sqlite3');
const appDataPath = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'Routster', 'kms_local_data.sqlite');
const db = new Database(appDataPath);

const categories = [
  'Articles', 
  'Books', 
  'Shopping', 
  'Send to Instapaper/Read it Later', 
  'Tools',
  'Academic Profile/Reference',
  'Events',
  'Job Listings'
];

db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .run('categories', JSON.stringify(categories));

db.prepare('DELETE FROM routes').run(); // wipe generic empty routes if any

const addRoute = db.prepare('INSERT INTO routes (category, connector_id, connector_config, action_order) VALUES (?, ?, ?, ?)');

// Restore mapping
addRoute.run('Articles', 'zotero', '{}', 0);
addRoute.run('Books', 'zotero', '{}', 0);
addRoute.run('Send to Instapaper/Read it Later', 'instapaper', '{}', 0);
addRoute.run('Academic Profile/Reference', 'notion', JSON.stringify({ databaseId: 'notion-refs-db' }), 0);

addRoute.run('Shopping', 'local_disk', JSON.stringify({ destinationFolder: 'Shopping' }), 0);
addRoute.run('Events', 'local_disk', JSON.stringify({ destinationFolder: 'Events' }), 0);
addRoute.run('Job Listings', 'local_disk', JSON.stringify({ destinationFolder: 'Jobs' }), 0);
addRoute.run('Tools', 'local_disk', JSON.stringify({ destinationFolder: 'Tools' }), 0);

console.log("Restored successfully to AppData/Roaming/Routster/kms_local_data.sqlite");
