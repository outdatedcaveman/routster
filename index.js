const fs = require('fs');
const cheerio = require('cheerio');
const { classifyLink } = require('./classifier');
const { fetchAndExtractMetadata } = require('./fetcher');

// Helper to run promises with a concurrency limit
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function main() {
  const filePath = process.argv[2] || 'sample_bookmarks.html';
  console.log(`\n\n[KMS Auto-Router Orchestrator]`);
  console.log(`Loading bookmarks from: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File ${filePath} not found.`);
    process.exit(1);
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  // Parse bookmarks
  const linksToProcess = [];
  $('a').each((i, el) => {
    const url = $(el).attr('href');
    const bookmarkTitle = $(el).text();
    const addDate = $(el).attr('add_date');
    if (url && url.startsWith('http')) {
      linksToProcess.push({ url, bookmarkTitle, addDate });
    }
  });

  console.log(`Found ${linksToProcess.length} valid links to process.`);
  
  console.log(`Starting asynchronous processing pipeline...\n==========================================`);
  const results = [];

  await asyncPool(5, linksToProcess, async (link) => {
    // 1. Fetch metadata
    console.log(`[Worker] Fetching metadata for -> ${link.url}`);
    const meta = await fetchAndExtractMetadata(link.url);

    // 2. Classify
    const bestTitle = meta.title || link.bookmarkTitle;
    const category = classifyLink(link.url, bestTitle, meta.description);

    const resultObj = {
      category,
      url: link.url,
      title: bestTitle,
      description: meta.description,
      date_added: link.addDate,
      fetch_success: meta.success
    };

    results.push(resultObj);
  });

  // Group by category for routing
  const groupedResults = results.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr);
    return acc;
  }, {});

  console.log(`\n==========================================\n[KMS Routing Action Plan Output]\n==========================================`);
  
  for (const [category, links] of Object.entries(groupedResults)) {
    console.log(`\n📂 ROUTE DESTINATION: [${category}] (${links.length} items)`);
    console.log(`---------------------------------------------------------`);
    links.forEach(l => {
      console.log(`  🔗 ${l.title || l.url}`);
      console.log(`  🌐 ${l.url}`);
    });
  }

  // Dump to JSON so Zotero/Obsidian/Tauri scripts can pick it up
  fs.writeFileSync('routed_bookmarks.json', JSON.stringify(groupedResults, null, 2));
  console.log(`\n\n✅ Actionable data saved to routed_bookmarks.json. Connect this payload to your destination APIs.`);
}

main().catch(console.error);
