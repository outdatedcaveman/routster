const fs = require('fs');

/**
 * MOCK ROUTER
 * This script demonstrates how you use the output of index.js
 * to send your links to their final homes via API.
 */
function sendToZotero(links) {
  console.log(`\n📚 Sending ${links.length} items to Zotero/Paperpile API...`);
  links.forEach(l => console.log(`   -> POST /api/items : ${l.url}`));
}

function sendToNotion(links, databaseId) {
  console.log(`\n📝 Sending ${links.length} items to Notion Database [${databaseId}]...`);
  links.forEach(l => console.log(`   -> POST https://api.notion.com/v1/pages : ${l.title}`));
}

function sendToInstapaper(links) {
  console.log(`\n📰 Sending ${links.length} items to Instapaper/ReadLater Queue...`);
  links.forEach(l => console.log(`   -> POST /api/add : ${l.url}`));
}

function sendToLocalTauriDB(links, category) {
  console.log(`\n🗄️ Saving ${links.length} ${category} links to local SQLite / Vector DB...`);
  links.forEach(l => console.log(`   -> INSERT INTO links (title, url, category) VALUES (...)`));
}

function executeRouting(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing payload: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  console.log(`[KMS Auto-Router Executor] Deploying to external services...`);

  if (data['Article/PDF']) sendToZotero(data['Article/PDF']);
  if (data['Book']) sendToZotero(data['Book']); 
  
  if (data['Instapaper/Read Later']) sendToInstapaper(data['Instapaper/Read Later']);
  if (data['Quanta']) sendToInstapaper(data['Quanta']); // Or send to a specific Notion Quanta board

  if (data['Reference Portal/Academic Profile']) sendToNotion(data['Reference Portal/Academic Profile'], 'notion-refs-db');

  if (data['Shopping']) sendToLocalTauriDB(data['Shopping'], 'Shopping');
  if (data['Event/Theater']) sendToLocalTauriDB(data['Event/Theater'], 'Events');
  if (data['Job Listing']) sendToLocalTauriDB(data['Job Listing'], 'Jobs');
  if (data['GitHub Repo']) sendToLocalTauriDB(data['GitHub Repo'], 'Tools');

  console.log(`\n✅ Routing Complete!`);
}

// Run it!
executeRouting('routed_bookmarks.json');
