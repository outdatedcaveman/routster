const Database = require('better-sqlite3');
const db = new Database(require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'routster', 'kms_local_data.sqlite'));
console.log("Categories:", db.prepare("SELECT * FROM categories").all());
try {
  console.log("Flows:", db.prepare("SELECT * FROM flows").all());
} catch(e) {}
console.log("Connectors:", Object.keys(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'connectors'").get()?.value || "{}")));
