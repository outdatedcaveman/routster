/**
 * Routster Connector Loader
 * Auto-discovers and registers all connector modules.
 */
const registry = require('./registry');

// Load all built-in connectors
const connectors = [
  require('./zotero'),
  require('./instapaper'),
  require('./notion'),
  require('./obsidian'),
  require('./pocket'),
  require('./raindrop'),
  require('./readwise'),
  require('./webhook'),
  require('./local_storage'),
  require('./google_drive'),
  require('./custom_connector'),
  require('./open_api'),
  require('./chrome_bookmarks'),
  require('./academic_extractor')
];

connectors.forEach(c => registry.register(c));

console.log(`[Connectors] Loaded ${connectors.length} connectors: ${connectors.map(c => c.name).join(', ')}`);

module.exports = registry;
