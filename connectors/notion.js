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
    await axios.post('https://api.notion.com/v1/pages', {
      parent: { database_id: config.databaseId },
      properties: {
        "Name": { title: [{ text: { content: link.title || 'Untitled' } }] },
        "URL": { url: link.url },
        "Category": { select: { name: link.category || 'Uncategorized' } }
      }
    }, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Notion-Version': '2022-06-28' }
    });
    console.log(`[Notion] Inserted: ${link.title}`);
  }
};
