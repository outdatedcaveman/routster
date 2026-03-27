const fs = require('fs');
const path = require('path');

module.exports = {
  id: 'obsidian',
  name: 'Obsidian (Local Vault)',
  icon: '💎',
  description: 'Save links as Markdown files in your local Obsidian vault',
  category: 'notes',
  configFields: [
    { key: 'vaultPath', label: 'Vault Inbox Path', type: 'text', required: true, hint: 'Absolute path to your vault Inbox folder' }
  ],

  test: async (config) => {
    if (!fs.existsSync(config.vaultPath)) throw new Error(`Path not found: ${config.vaultPath}`);
    return { message: `Vault found at ${config.vaultPath}` };
  },

  execute: async (link, config) => {
    const vaultPath = config.vaultPath;
    if (!fs.existsSync(vaultPath)) {
      console.log(`[Obsidian] Vault not found at ${vaultPath}, skipping.`);
      return;
    }
    const safeTitle = (link.title || 'Untitled').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const mdContent = `---
title: "${link.title}"
url: "${link.url}"
category: "${link.category || ''}"
date_saved: "${new Date().toISOString()}"
---

# ${link.title}

[Original Link](${link.url})
> ${link.description || 'No description available.'}

---
${link.markdownBody || '*(No article text extracted)*'}
`;
    fs.writeFileSync(path.join(vaultPath, `${safeTitle}.md`), mdContent);
    console.log(`[Obsidian] Created: ${safeTitle}.md`);
  }
};
