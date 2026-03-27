const axios = require('axios');

module.exports = {
  id: 'webhook',
  name: 'Webhook (Custom)',
  icon: '🔗',
  description: 'Send link data to any URL via HTTP POST — ultimate flexibility',
  category: 'webhook',
  configFields: [
    { key: 'url', label: 'Webhook URL', type: 'url', required: true, hint: 'Any URL that accepts POST requests (e.g. Make, Zapier, n8n)' },
    { key: 'headers', label: 'Custom Headers (JSON)', type: 'textarea', required: false, hint: '{"Authorization": "Bearer xxx"}' },
    { key: 'template', label: 'Body Template', type: 'select', required: false, options: ['default', 'slack', 'discord'], default: 'default' }
  ],

  test: async (config) => {
    const resp = await axios.post(config.url, { test: true, source: 'routster' }, {
      headers: config.headers ? JSON.parse(config.headers) : {},
      timeout: 8000
    });
    return { message: `Webhook responded with status ${resp.status}` };
  },

  execute: async (link, config) => {
    let body;
    const template = config.template || 'default';

    if (template === 'slack') {
      body = { text: `📌 *${link.title}*\n${link.url}\n_Category: ${link.category}_` };
    } else if (template === 'discord') {
      body = { content: `📌 **${link.title}**\n${link.url}\n*Category: ${link.category}*` };
    } else {
      body = {
        title: link.title,
        url: link.url,
        category: link.category,
        description: link.description || '',
        source: 'routster',
        timestamp: new Date().toISOString()
      };
    }

    await axios.post(config.url, body, {
      headers: config.headers ? JSON.parse(config.headers) : { 'Content-Type': 'application/json' }
    });
    console.log(`[Webhook] Sent: ${link.title} → ${config.url}`);
  }
};
