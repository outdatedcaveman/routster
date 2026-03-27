/**
 * Routster Connector Registry
 * Central hub that manages all available connectors and their configs.
 */

const connectors = new Map();

function register(connector) {
  if (!connector.id || !connector.name || !connector.execute) {
    throw new Error(`Invalid connector: must have id, name, and execute()`);
  }
  connectors.set(connector.id, connector);
}

function get(id) {
  return connectors.get(id);
}

function getAll() {
  return Array.from(connectors.values()).map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon || '🔌',
    description: c.description || '',
    category: c.category || 'other',
    configFields: c.configFields || []
  }));
}

async function testConnector(id, config) {
  const connector = connectors.get(id);
  if (!connector) return { success: false, error: 'Connector not found' };
  if (!connector.test) return { success: true, message: 'No test available (assumed OK)' };
  try {
    const result = await connector.test(config);
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function execute(id, link, config) {
  const connector = connectors.get(id);
  if (!connector) {
    console.log(`[Registry] Connector "${id}" not found, skipping.`);
    return false;
  }
  try {
    await connector.execute(link, config);
    return true;
  } catch (e) {
    console.error(`[Registry] ${connector.name} failed: ${e.message}`);
    return false;
  }
}

module.exports = { register, get, getAll, testConnector, execute };
