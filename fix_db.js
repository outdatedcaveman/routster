const Database = require('better-sqlite3');
const appDataPath = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'Routster', 'kms_local_data.sqlite');
const db = new Database(appDataPath);

// Fix connector_json
const routes = db.prepare("SELECT id, connector_config FROM routes WHERE connector_id = 'local_disk'").all();

for (let r of routes) {
  const cfg = JSON.parse(r.connector_config);
  const newConfig = {
    base_path: `C:\\KMS_Exports\\${cfg.destinationFolder}`,
    create_subfolder: 'none',
    rename_rule: 'clean',
    save_urls_as: 'url_files'
  };
  db.prepare("UPDATE routes SET connector_id = 'local_storage', connector_config = ? WHERE id = ?").run(JSON.stringify(newConfig), r.id);
}
console.log("Fixed connector IDs and config structures.");
