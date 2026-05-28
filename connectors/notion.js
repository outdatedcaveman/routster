const axios = require('axios');

module.exports = {
  id: 'notion',
  name: 'Notion',
  icon: '📝',
  description: 'All-in-one workspace — save links as database entries',
  category: 'notes',
  configFields: [
    { key: 'apiKey', label: 'Integration Token', type: 'password', required: true, hint: 'Create at notion.so/my-integrations' },
    { key: 'databaseId', label: 'Target Database ID', type: 'text', required: true, hint: 'The 32-char ID from your database URL' }
  ],

  test: async (config) => {
    const resp = await axios.get('https://api.notion.com/v1/users/me', {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Notion-Version': '2022-06-28' },
      timeout: 8000
    });
    return { message: `Connected as: ${resp.data.name || 'Integration'}` };
  },

  execute: async (link, config) => {
    const properties = {
      "Name": { title: [{ text: { content: (link.title || 'Untitled').substring(0, 2000) } }] },
      "Category": { select: { name: (link.category || 'Uncategorized').substring(0, 100) } }
    };

    if (link.url) {
      properties["URL"] = { url: link.url };
    }

    const payload = {
      parent: { database_id: config.databaseId },
      properties: properties
    };

    // If it's a text note or has a description, add it to the page contents
    const bodyText = link.markdownBody || link.description || (link.type === 'file' ? `Target File: ${link.filePath}` : '');
    if (bodyText) {
      // Notion API limits blocks to 2000 chars. To keep it simple, we truncate the first block.
      payload.children = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: bodyText.substring(0, 2000) } }] }
        }
      ];
    }

    await axios.post('https://api.notion.com/v1/pages', payload, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Notion-Version': '2022-06-28' }
    });
    console.log(`[Notion] Inserted: ${link.title} (Type: ${link.type || 'url'})`);
  }
};
