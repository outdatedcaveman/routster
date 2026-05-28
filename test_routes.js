const Database = require('better-sqlite3');
const dbs = [
  require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'routster', 'kms_local_data.sqlite'),
  require('path').join(__dirname, 'kms_local_data.sqlite')
];
for(let p of dbs) {
  try {
    const db = new Database(p);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`\n--- DB: ${p} ---`);
    console.log("Tables:", tables.map(t => t.name).join(', '));
    if(tables.find(t=>t.name==='routes')) {
      console.log("Routes count:", db.prepare("SELECT count(*) as c FROM routes").get().c);
      console.log("Routes:", db.prepare("SELECT * FROM routes").all());
    }
  } catch(e) {
    console.log(`\n--- DB Error: ${p} ---`, e.message);
  }
}
