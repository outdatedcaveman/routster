/**
 * Routster Open API / Macro Connector
 * Configures the program's own inbound API endpoint and allows creating automation macros.
 * Macros are reusable one-click actions that chain multiple operations.
 */
const db = require('../db');

module.exports = {
  id: 'open_api',
  name: 'Routster Open API & Macros',
  icon: '🔓',
  description: 'Configure the program\'s inbound API. Set auth secrets, allowed origins, and create reusable macros.',
  configFields: [
    {
      key: 'api_secret',
      label: 'API Secret Token',
      hint: 'Protect your /api/open/ingest endpoint. External callers must include this as "secret" in the request body.',
      type: 'password'
    },
    {
      key: 'allowed_origins',
      label: 'Allowed Origins (comma-separated)',
      hint: 'CORS origins allowed to call your API. "*" for any. e.g. http://localhost:3000, https://myapp.com',
      default: '*'
    },
    {
      key: 'auto_classify',
      label: 'Auto-classify incoming? (true / false)',
      hint: '"true" = run the NLP classifier on every webhook item. "false" = just dump to inbox as Uncategorized.',
      default: 'true'
    },
    {
      key: 'macro_1_name',
      label: 'Macro 1: Name',
      hint: 'A short label for this macro, e.g. "Quick Save Article"'
    },
    {
      key: 'macro_1_action',
      label: 'Macro 1: Action Chain',
      hint: 'Comma-separated connector IDs to execute in order. e.g. "local_storage,google_drive"'
    },
    {
      key: 'macro_2_name',
      label: 'Macro 2: Name',
      hint: 'e.g. "Research Pipeline"'
    },
    {
      key: 'macro_2_action',
      label: 'Macro 2: Action Chain',
      hint: 'e.g. "zotero,obsidian,google_drive"'
    }
  ],

  test: async (config) => {
    const macros = [];
    if (config.macro_1_name && config.macro_1_action) macros.push(config.macro_1_name);
    if (config.macro_2_name && config.macro_2_action) macros.push(config.macro_2_name);
    return {
      success: true,
      message: `API endpoint active at /api/open/ingest. ${macros.length} macro(s) configured: ${macros.join(', ') || 'none'}.`
    };
  },

  execute: async (entity, config) => {
    // This connector doesn't "execute" outbound — it configures inbound behavior.
    // Its settings are read by the server.js /api/open/ingest handler.
    return { success: true, message: 'Open API settings applied. Macros are available via the API.' };
  }
};
