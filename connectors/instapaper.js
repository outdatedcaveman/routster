const axios = require('axios');

module.exports = {
  id: 'instapaper',
  name: 'Instapaper',
  icon: '📖',
  description: 'Read-it-later service for long-form articles',
  category: 'readlater',
  configFields: [
    { key: 'username', label: 'Email', type: 'email', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true }
  ],

  test: async (config) => {
    const params = new URLSearchParams();
    params.append('username', config.username);
    params.append('password', config.password);
    const resp = await axios.post('https://www.instapaper.com/api/authenticate', params.toString(), { timeout: 8000 });
    if (resp.status === 200) return { message: 'Authentication successful!' };
    throw new Error('Invalid credentials');
  },

  execute: async (link, config) => {
    const params = new URLSearchParams();
    params.append('username', config.username);
    params.append('password', config.password);
    params.append('url', link.url);
    params.append('title', link.title);
    params.append('selection', link.description || '');

    await axios.post('https://www.instapaper.com/api/add', params.toString());
    console.log(`[Instapaper] Bookmarked: ${link.title}`);
  }
};
