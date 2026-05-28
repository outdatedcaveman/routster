const Database = require('better-sqlite3');
const dbs = [
  require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'routster', 'kms_local_data.sqlite'),
  require('path').join(__dirname, 'kms_local_data.sqlite')
];
for(let p of dbs) {
  try {
    const db = new Database(p);
    const sets = db.prepare("SELECT * FROM settings").all();
    console.log(`\n--- DB: ${p} ---`);
    for(let row of sets) {
      console.log(row.key, '-> length', row.value.length);
    }
    const links = db.prepare("SELECT count(*) as c FROM links").get();
    console.log("links:", links.c);
  } catch(e) {
    console.log(`\n--- DB Error: ${p} ---`, e.message);
  }
}
