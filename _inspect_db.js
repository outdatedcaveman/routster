const path = require('path');
const Database = require('./node_modules/better-sqlite3');

const projectDb = new Database('./kms_local_data.sqlite');
const appdataDb = new Database('C:/Users/bruno/AppData/Roaming/Routster/kms_local_data.sqlite');

function inspect(label, db) {
  console.log('\n=== ' + label + ' ===');
  try {
    const cats = db.prepare("SELECT value FROM settings WHERE key='categories'").get();
    console.log('categories:', cats ? cats.value : 'NONE');
  } catch(e) { console.log('categories err:', e.message); }
  try {
    const routes = db.prepare('SELECT DISTINCT category FROM routes').all();
    console.log('route categories:', JSON.stringify(routes.map(r => r.category)));
  } catch(e) { console.log('routes err:', e.message); }
  try {
    const nLinks = db.prepare('SELECT count(*) as n FROM links').get();
    console.log('links count:', nLinks.n);
  } catch(e) { console.log('links err:', e.message); }
}

inspect('PROJECT DB (dev fallback - kms_local_data.sqlite in project root)', projectDb);
inspect('APPDATA DB (Electron packaged exe path)', appdataDb);
