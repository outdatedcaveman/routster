const axios = require('axios');

module.exports = {
  id: 'zotero',
  name: 'Zotero',
  icon: '📚',
  description: 'Reference manager for academic papers and books',
  category: 'reference',
  configFields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, hint: 'Get yours at zotero.org/settings/keys' },
    { key: 'userId', label: 'User ID', type: 'text', required: true, hint: 'Visible at zotero.org/settings/keys' },
    { key: 'collection', label: 'Target Collection', type: 'text', required: false, default: 'Routster Inbox' }
  ],

  test: async (config) => {
    const resp = await axios.get(`https://api.zotero.org/users/${config.userId}/collections`, {
      headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${config.apiKey}` },
      timeout: 8000
    });
    return { message: `Connected! Found ${resp.data.length} collections.` };
  },

  execute: async (link, config) => {
    const apiKey = config.apiKey;
    const userId = config.userId;
    const collectionName = config.collection || 'Routster Inbox';

    // Get or create collection
    let collectionKey = null;
    try {
      const res = await axios.get(`https://api.zotero.org/users/${userId}/collections`, {
        headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}` }
      });
      const existing = res.data.find(c => c.data.name === collectionName);
      if (existing) {
        collectionKey = existing.key;
      } else {
        const createRes = await axios.post(`https://api.zotero.org/users/${userId}/collections`,
          [{ name: collectionName }],
          { headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
        );
        collectionKey = createRes.data.successful["0"].key;
      }
    } catch (e) {
      console.error(`[Zotero] Collection error: ${e.message}`);
    }

    // Enrich via Crossref if DOI is present
    let zoteroItem = { itemType: "webpage", title: link.title, url: link.url, abstractNote: link.description || "" };
    const doiMatch = link.url.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
    if (doiMatch) {
      try {
        const resp = await axios.get(`https://api.crossref.org/works/${doiMatch[1]}`, { timeout: 8000 });
        const work = resp.data.message;
        zoteroItem.itemType = "journalArticle";
        zoteroItem.DOI = doiMatch[1];
        if (work.title && work.title[0]) zoteroItem.title = work.title[0];
        if (work['container-title'] && work['container-title'][0]) zoteroItem.publicationTitle = work['container-title'][0];
        if (work.author && Array.isArray(work.author)) {
          zoteroItem.creators = work.author.map(a => ({
            creatorType: "author", firstName: a.given || "", lastName: a.family || ""
          })).filter(a => a.firstName || a.lastName);
        }
        const published = work['published-print'] || work['published-online'] || work.published;
        if (published && published['date-parts'] && published['date-parts'][0]) {
          zoteroItem.date = published['date-parts'][0].join('-');
        }
      } catch (e) {}
    }

    if (collectionKey) zoteroItem.collections = [collectionKey];

    await axios.post(`https://api.zotero.org/users/${userId}/items`, [zoteroItem], {
      headers: { 'Zotero-API-Version': 3, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    console.log(`[Zotero] Added: ${link.title}`);
  }
};
