const fs = require('fs');
const path = require('path');

/**
 * Google Drive Sync Connector
 * Mirrors processed files into a Google Drive folder (via the local Desktop sync client).
 * This works with Google's "Drive for Desktop" app which maps a local folder to Drive.
 */
module.exports = {
  id: 'google_drive',
  name: 'Google Drive',
  icon: '☁️',
  description: 'Sync files to Google Drive via the local Drive for Desktop folder. Requires Google Drive for Desktop installed.',
  configFields: [
    {
      key: 'drive_path',
      label: 'Google Drive Local Sync Path',
      hint: 'e.g. G:\\My Drive\\Routster or C:\\Users\\Name\\Google Drive\\Routster',
      required: true
    },
    {
      key: 'create_subfolder',
      label: 'Create Subfolder? (none / category / date)',
      hint: '"none" = files go straight into the Drive folder. "category" = subfolder per category.',
      default: 'category'
    },
    {
      key: 'rename_rule',
      label: 'Rename Files? (none / clean / prefix)',
      hint: '"none" = keep original. "clean" = sanitize chars. "prefix" = prepend category.',
      default: 'clean'
    }
  ],

  test: async (config) => {
    if (!config.drive_path) return { success: false, error: 'Google Drive path is required.' };
    if (!fs.existsSync(config.drive_path)) {
      return { success: false, error: `Path does not exist: ${config.drive_path}. Make sure Google Drive for Desktop is installed and syncing.` };
    }
    return { success: true, message: 'Google Drive folder found and accessible!' };
  },

  execute: async (entity, config) => {
    if (!config.drive_path) throw new Error("Google Drive path not configured.");

    let targetDir = config.drive_path;
    const mode = (config.create_subfolder || 'none').toLowerCase().trim();
    const safeCat = (entity.category || 'Uncategorized').replace(/[/\\?%*:|"<>]/g, '_');

    if (mode === 'category') {
      targetDir = path.join(config.drive_path, safeCat);
    } else if (mode === 'date') {
      const d = new Date();
      targetDir = path.join(config.drive_path, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    function cleanName(name, ext) {
      const renameMode = (config.rename_rule || 'none').toLowerCase().trim();
      const pureTitle = name.replace(new RegExp(`\\${ext}$`, 'i'), '').trim();
      const safeTitle = pureTitle.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 120);
      if (renameMode === 'prefix') return `${safeCat} - ${safeTitle}${ext}`;
      if (renameMode === 'clean') return `${safeTitle.replace(/\s+/g, '_')}${ext}`;
      return `${safeTitle}${ext}`;
    }

    let finalFilePath;

    if (entity.type === 'file' && entity.filePath && fs.existsSync(entity.filePath)) {
      const ext = path.extname(entity.filePath) || path.extname(entity.title) || '';
      const filename = cleanName(entity.title || `File_${Date.now()}`, ext);
      finalFilePath = path.join(targetDir, filename);
      fs.copyFileSync(entity.filePath, finalFilePath); // Always copy to Drive
    } else if (entity.type === 'text') {
      const filename = cleanName(entity.title || `Note_${Date.now()}`, '.md');
      finalFilePath = path.join(targetDir, filename);
      fs.writeFileSync(finalFilePath, entity.markdownBody || entity.description || 'Empty note');
    } else {
      // For URLs, write to manifest
      finalFilePath = path.join(targetDir, 'Links_Manifest.json');
      let manifest = [];
      if (fs.existsSync(finalFilePath)) {
        try { manifest = JSON.parse(fs.readFileSync(finalFilePath, 'utf8')); } catch (e) { manifest = []; }
      }
      manifest.push({
        title: entity.title, url: entity.url,
        description: entity.description || '', category: entity.category,
        timestamp: new Date().toISOString()
      });
      fs.writeFileSync(finalFilePath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    return { success: true, path: finalFilePath };
  }
};
