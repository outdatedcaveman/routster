const fs = require('fs');
const path = require('path');
const db = require('./db');
const { classifyLink } = require('./classifier');

/**
 * TRIGGER ENGINE
 * This acts as the Universal Polling Engine for custom inputs (RSS, Mail, Webhooks).
 * Developers can drop new plugins into the /triggers/ directory to securely hook new inputs.
 */

const loadedTriggers = [];

async function initializeTriggers() {
  const triggersPath = path.join(__dirname, 'triggers');
  if (!fs.existsSync(triggersPath)) fs.mkdirSync(triggersPath);

  const files = fs.readdirSync(triggersPath);
  for (const file of files) {
    if (file.endsWith('.js')) {
      try {
        const trigger = require(path.join(triggersPath, file));
        if (trigger.init) {
          await trigger.init(processInputEntity);
          loadedTriggers.push(trigger.name || file);
          console.log(`[Trigger Engine] Loaded external input source: ${trigger.name || file}`);
        }
      } catch (err) {
        console.error(`[Trigger Engine] Failed to load trigger ${file}:`, err.message);
      }
    }
  }
}

/**
 * Universal Ingestion Callback
 * Triggers call this function whenever they capture new data (e.g. a new email, a new RSS post).
 */
async function processInputEntity(entity) {
  try {
    const { url, title, description, markdownBody, rawExt } = entity;
    
    // 1. Math scoring layer automatically categorizes without manual human mapping!
    const category = classifyLink(url, title || '', `Extension: ${rawExt || ''}\Context: ${description || markdownBody || ''}`);
    
    // 2. Persist to central DB
    const newId = Date.now().toString();
    db.addLink({
      id: newId,
      url: url || '',
      title: title || 'Incoming Automated Feed',
      description: description || '',
      markdownBody: markdownBody || '',
      category: category,
      type: entity.type || 'url'
    });
    
    console.log(`[Trigger Engine] Captured & Categorized new feed item: ${title} -> ${category}`);
  } catch (err) {
    console.error(`[Trigger Engine] Ingestion error:`, err);
  }
}

module.exports = { initializeTriggers };
