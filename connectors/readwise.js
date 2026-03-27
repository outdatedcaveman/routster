const axios = require('axios');

module.exports = {
  id: 'readwise',
  name: 'Readwise',
  icon: '📑',
  description: 'Highlight & reading tracker — save articles to your Readwise library',
  category: 'readlater',
  configFields: [
    { key: 'accessToken', label: 'Access Token', type: 'password', required: true, hint: 'Get yours at readwise.io/access_token' }
  ],

  test: async (config) => {
    const resp = await axios.get('https://readwise.io/api/v2/auth/', {
      headers: { 'Authorization': `Token ${config.accessToken}` },
      timeout: 8000
    });
    return { message: 'Connected to Readwise!' };
  },

  execute: async (link, config) => {
    await axios.post('https://readwise.io/api/v3/save/', {
      url: link.url,
      title: link.title,
      category: 'article',
      tags: [{ name: link.category || 'routster' }]
    }, {
      headers: { 'Authorization': `Token ${config.accessToken}`, 'Content-Type': 'application/json' }
    });
    console.log(`[Readwise] Saved: ${link.title}`);
  }
};
