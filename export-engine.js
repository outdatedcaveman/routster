const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Helper to get or create Zotero Collection
 */
async function getOrCreateZoteroCollection(userId, apiKey, collectionName) {
  try {
    const res = await axios.get(`https://api.zotero.org/users/${userId}/collections`, {
      headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}` }
    });
    const existing = res.data.find(c => c.data.name === collectionName);
    if (existing) return existing.key;

    const createRes = await axios.post(`https://api.zotero.org/users/${userId}/collections`, [{ name: collectionName }], {
      headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    return createRes.data.successful["0"].key;
  } catch (err) {
    console.error('[Zotero] Failed to get/create collection: ' + (err.response?.data || err.message));
    return null;
  }
}

/**
 * Crossref Enrichment
 */
async function enrichForZotero(link) {
  let zoteroItem = {
    itemType: "webpage",
    title: link.title,
    url: link.url,
    abstractNote: link.description || ""
  };

  let doiMatch = null;
  const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;
  // Use the url which contains the DOI (assigned by fetcher.js)
  if (link.url) {
     const match = link.url.match(doiRegex);
     if (match) doiMatch = match[1];
  }

  if (doiMatch) {
    try {
      const resp = await axios.get(`https://api.crossref.org/works/${doiMatch}`, { timeout: 8000 });
      const work = resp.data.message;
      
      zoteroItem.itemType = "journalArticle";
      zoteroItem.DOI = doiMatch;
      
      if (work.title && work.title[0]) zoteroItem.title = work.title[0];
      if (work['container-title'] && work['container-title'][0]) zoteroItem.publicationTitle = work['container-title'][0];
      
      // Map authors properly
      if (work.author && Array.isArray(work.author)) {
        zoteroItem.creators = work.author.map(a => ({
          creatorType: "author",
          firstName: a.given || "",
          lastName: a.family || ""
        })).filter(a => a.firstName || a.lastName); // prevent empties
      }

      // Extract publication date
      const published = work['published-print'] || work['published-online'] || work.published;
      if (published && published['date-parts'] && published['date-parts'][0]) {
         zoteroItem.date = published['date-parts'][0].join('-');
      }
    } catch (e) {
      console.log(`[Zotero Enricher] Crossref failed for ${doiMatch}: ${e.message}`);
    }
  }

  return zoteroItem;
}

/**
 * Zotero API Client
 */
async function exportToZotero(link, targetCollectionName = "KMS Inbox") {
  const ZOTERO_API_KEY = process.env.ZOTERO_API_KEY;
  const ZOTERO_USER_ID = process.env.ZOTERO_USER_ID;
  if (!ZOTERO_API_KEY || !ZOTERO_USER_ID) {
    console.log('[Zotero] Missing keys, skipping item: ' + link.url);
    return false;
  }
  
  const collectionKey = await getOrCreateZoteroCollection(ZOTERO_USER_ID, ZOTERO_API_KEY, targetCollectionName);
  const zoteroItem = await enrichForZotero(link);

  if (collectionKey) {
    zoteroItem.collections = [collectionKey];
  }

  try {
    await axios.post(`https://api.zotero.org/users/${ZOTERO_USER_ID}/items`, [zoteroItem], {
      headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${ZOTERO_API_KEY}`, 'Content-Type': 'application/json' }
    });
    console.log(`[Zotero] Successfully added ${link.title} to folder ${targetCollectionName}`);
    return true;
  } catch (err) {
    console.error(`[Zotero API Error] ${JSON.stringify(err.response?.data || err.message)}`);
    return false;
  }
}

/**
 * Notion API Client (Dynamic Database support)
 */
async function exportToNotion(link, targetDatabaseId) {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_API_KEY) return false;

  // Use the dynamically provided DB ID, or fall back to the env if the user ever sets a default
  const dbId = targetDatabaseId || process.env.NOTION_DATABASE_ID;
  if (!dbId) {
    console.log('[Notion] No database selected for export.');
    return false;
  }

  try {
    await axios.post('https://api.notion.com/v1/pages', {
      parent: { database_id: dbId },
      properties: {
        "Name": { title: [{ text: { content: link.title || 'Untitled' } }] },
        "URL": { url: link.url },
        "Category": { select: { name: link.category || 'Uncategorized' } }
      }
    }, {
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28'
      }
    });
    console.log(`[Notion] Inserted row for ${link.title}`);
    return true;
  } catch (err) {
    console.error(`[Notion API Error] ${err.response?.data?.message || err.message}`);
    return false;
  }
}

/**
 * Instapaper Simple Add API (Secure In-Memory Password version)
 */
async function exportToInstapaper(link, securePassword) {
  const INSTAPAPER_USER = process.env.INSTAPAPER_USERNAME;
  // Fall back to env ONLY if they explicitly choose to still use it, otherwise use injected memory payload
  const pass = securePassword || process.env.INSTAPAPER_PASSWORD;
  
  if (!INSTAPAPER_USER || !pass) {
    console.log('[Instapaper] Credentials missing from secure memory. Skipping.');
    return false;
  }

  try {
    const params = new URLSearchParams();
    params.append('username', INSTAPAPER_USER);
    params.append('password', pass);
    params.append('url', link.url);
    params.append('title', link.title);
    params.append('selection', link.description || '');

    await axios.post('https://www.instapaper.com/api/add', params.toString());
    console.log(`[Instapaper] Bookmarked ${link.title}`);
    return true;
  } catch (err) {
    console.error(`[Instapaper Error] ${err.message}`);
    return false;
  }
}

/**
 * Obsidian via Local File System Sync (Google Drive synced folder)
 */
async function exportToObsidian(link) {
  const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || path.join(process.env.USERPROFILE || '', 'Google Drive', 'Obsidian', 'Inbox');
  
  if (!fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    console.log(`[Obsidian] Vault not found at ${OBSIDIAN_VAULT_PATH}, skipping markdown generation.`);
    return false;
  }

  const titleStr = link.title || link.url || 'Untitled';
  const safeTitle = titleStr.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
  const mdContent = `---
title: "${titleStr}"
url: "${link.url}"
category: "${link.category || ''}"
date_saved: "${new Date().toISOString()}"
---

# ${titleStr}

[Original Link](${link.url})
> ${link.description || 'No description available.'}

---
${link.markdownBody ? link.markdownBody : '*(No article text extracted)*'}
`;

  try {
    fs.writeFileSync(path.join(OBSIDIAN_VAULT_PATH, `${safeTitle}.md`), mdContent);
    console.log(`[Obsidian] Markdown created locally for ${link.title}`);
    return true;
  } catch (err) {
    console.error(`[Obsidian Error] ${err.message}`);
    return false;
  }
}

/**
 * Paperpile 
 * Paperpile doesn't expose a public API, but it automatically ingests RIS/BibTeX exports placed in a specific Google Drive folder.
 */
async function exportToPaperpile(link) {
    const PAPERPILE_DRIVE_PATH = process.env.PAPERPILE_SYNC_PATH || path.join(process.env.USERPROFILE || '', 'Google Drive', 'Paperpile', 'Inbox');
    
    if (!fs.existsSync(PAPERPILE_DRIVE_PATH)) return false;

    const risContent = `TY  - ELEC\nTI  - ${link.title}\nUR  - ${link.url}\nAB  - ${link.description || ''}\nER  - \n`;
    try {
        fs.writeFileSync(path.join(PAPERPILE_DRIVE_PATH, `export_${Date.now()}.ris`), risContent);
        return true;
    } catch (e) { return false; }
}

/**
 * Universal Backup Mirror (Google Drive JSONL Append)
 * Creates an offline, searchable archive of every processed link, guaranteeing backup across machines.
 */
async function mirrorToGoogleDrive(link) {
  const DRIVE_BACKUP_PATH = process.env.DRIVE_BACKUP_PATH || path.join(process.env.USERPROFILE || '', 'Google Drive', 'KMS_Mirror');
  
  if (!fs.existsSync(DRIVE_BACKUP_PATH)) {
    try {
      fs.mkdirSync(DRIVE_BACKUP_PATH, { recursive: true });
    } catch(e) {
      console.log(`[Backup Mirror] Directory failed: ${e.message}`);
      return false;
    }
  }

  const logFile = path.join(DRIVE_BACKUP_PATH, 'kms_universal_backup.jsonl');
  
  try {
    const backupObj = {
      id: link.id,
      title: link.title,
      url: link.url,
      category: link.category,
      date_exported: new Date().toISOString(),
      description: link.description || '',
      markdownBody: link.markdownBody || ''
    };
    
    fs.appendFileSync(logFile, JSON.stringify(backupObj) + '\\n');
    console.log(`[Backup Mirror] Permanently archived ${link.title} to master file.`);
    return true;
  } catch (err) {
    console.error(`[Backup Mirror] Append Error: ${err.message}`);
    return false;
  }
}

module.exports = { 
  exportToZotero, 
  exportToNotion, 
  exportToInstapaper, 
  exportToObsidian,
  exportToPaperpile,
  mirrorToGoogleDrive
};
