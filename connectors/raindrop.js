const axios = require('axios');

module.exports = {
  id: 'raindrop',
  name: 'Raindrop.io',
  icon: '🌧️',
  description: 'Beautiful bookmark manager with collections',
  category: 'storage',
  configFields: [
    { key: 'accessToken', label: 'API Token', type: 'password', required: true, hint: 'Create a test token at app.raindrop.io/settings/integrations' }
  ],

  test: async (config) => {
    const resp = await axios.get('https://api.raindrop.io/rest/v1/user', {
      headers: { 'Authorization': `Bearer ${config.accessToken}` },
      timeout: 8000
    });
    return { message: `Connected as: ${resp.data.user.fullName}` };
  },

  execute: async (link, config) => {
    await axios.post('https://api.raindrop.io/rest/v1/raindrop', {
      link: link.url,
      title: link.title,
      excerpt: link.description || '',
      tags: [link.category || 'routster']
    }, {
      headers: { 'Authorization': `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }
    });
    console.log(`[Raindrop] Saved: ${link.title}`);
  }
};
