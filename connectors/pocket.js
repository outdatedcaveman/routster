const axios = require('axios');

module.exports = {
  id: 'pocket',
  name: 'Pocket',
  icon: '🔖',
  description: 'Mozilla\'s read-it-later service',
  category: 'readlater',
  configFields: [
    { key: 'consumerKey', label: 'Consumer Key', type: 'text', required: true, hint: 'Register an app at getpocket.com/developer' },
    { key: 'accessToken', label: 'Access Token', type: 'password', required: true, hint: 'Obtained via Pocket OAuth flow' }
  ],

  test: async (config) => {
    const resp = await axios.post('https://getpocket.com/v3/get', {
      consumer_key: config.consumerKey,
      access_token: config.accessToken,
      count: 1
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    return { message: 'Connected to Pocket!' };
  },

  execute: async (link, config) => {
    await axios.post('https://getpocket.com/v3/add', {
      consumer_key: config.consumerKey,
      access_token: config.accessToken,
      url: link.url,
      title: link.title,
      tags: link.category || ''
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log(`[Pocket] Saved: ${link.title}`);
  }
};
