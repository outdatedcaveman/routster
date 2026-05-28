const axios = require('axios');

/**
 * Custom Connector Builder
 * Allows users to create their own integrations by specifying a URL, method, headers, and body template.
 * Acts as a universal "make your own connector" for any REST API the user wants.
 */
module.exports = {
  id: 'custom_connector',
  name: 'Custom API Connector',
  icon: '🧩',
  description: 'Build your own connector to any REST API. Define URL, headers, and body template with variables.',
  configFields: [
    {
      key: 'endpoint_url',
      label: 'API Endpoint URL',
      hint: 'The full URL to send data to. e.g. https://api.example.com/v1/items',
      required: true
    },
    {
      key: 'method',
      label: 'HTTP Method (GET / POST / PUT)',
      hint: 'Usually POST for creating new records.',
      default: 'POST'
    },
    {
      key: 'auth_header',
      label: 'Authorization Header Value',
      hint: 'e.g. Bearer sk-abc123... or Basic dXNlcjpwYXNz',
      type: 'password'
    },
    {
      key: 'custom_headers',
      label: 'Extra Headers (JSON)',
      hint: 'e.g. {"X-Custom":"value"}. Optional.',
      default: '{}'
    },
    {
      key: 'body_template',
      label: 'Body Template (JSON with variables)',
      hint: 'Variables: {title}, {url}, {category}, {description}, {timestamp}. Example: {"text":"{title}","link":"{url}"}',
      required: true,
      default: '{"title":"{title}","url":"{url}","category":"{category}","description":"{description}"}'
    }
  ],

  test: async (config) => {
    if (!config.endpoint_url) return { success: false, error: 'Endpoint URL is required.' };
    try {
      new URL(config.endpoint_url);
      return { success: true, message: `Endpoint URL is valid: ${config.endpoint_url}` };
    } catch (e) {
      return { success: false, error: 'Invalid URL format.' };
    }
  },

  execute: async (entity, config) => {
    if (!config.endpoint_url) throw new Error("Custom connector endpoint not configured.");

    const method = (config.method || 'POST').toUpperCase();

    // Build headers
    const headers = { 'Content-Type': 'application/json' };
    if (config.auth_header) headers['Authorization'] = config.auth_header;
    try {
      const extra = JSON.parse(config.custom_headers || '{}');
      Object.assign(headers, extra);
    } catch (e) {}

    // Build body from template
    let bodyStr = config.body_template || '{}';
    bodyStr = bodyStr
      .replace(/\{title\}/g, entity.title || '')
      .replace(/\{url\}/g, entity.url || '')
      .replace(/\{category\}/g, entity.category || '')
      .replace(/\{description\}/g, (entity.description || '').replace(/"/g, '\\"'))
      .replace(/\{timestamp\}/g, new Date().toISOString());

    let body;
    try { body = JSON.parse(bodyStr); } catch (e) { body = { raw: bodyStr }; }

    const response = await axios({ method, url: config.endpoint_url, headers, data: body, timeout: 10000 });
    return { success: true, status: response.status, data: response.data };
  }
};
