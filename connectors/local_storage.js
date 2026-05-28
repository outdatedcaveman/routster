const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Local Storage Organizer Connector
 * Moves/Copies ingested files directly into the user's configured folder.
 * Optionally renames files using pattern variables.
 */
module.exports = {
  id: 'local_storage',
  name: 'Local Disk Organizer',
  icon: '🗂️',
  description: 'Move or copy files into local folders. Optionally rename them with rules.',
  configFields: [
    {
      key: 'base_path',
      label: 'Destination Folder',
      hint: 'Files go directly here. e.g. C:\\Users\\Name\\Desktop\\MY_FOLDER',
      required: true
    },
    {
      key: 'create_subfolder',
      label: 'Create Subfolder? (none / category / date / custom)',
      hint: '"none" = files go straight into destination. "category" = auto-creates a subfolder per category. "date" = YYYY-MM subfolder. "custom" = use the pattern below.',
      default: 'none'
    },
    {
      key: 'subfolder_pattern',
      label: 'Custom Subfolder Pattern (only if "custom" above)',
      hint: 'Variables: {Category}, {YYYY}, {MM}, {Type}',
      default: ''
    },
    {
      key: 'rename_rule',
      label: 'Rename Files? (none / clean / prefix / pattern)',
      hint: '"none" = keep original name. "clean" = sanitize special chars. "prefix" = prepend category. "pattern" = use the pattern below.',
      default: 'none'
    },
    {
      key: 'rename_pattern',
      label: 'Rename Pattern (only if "pattern" above)',
      hint: 'Variables: {Title}, {Category}, {Date}, {YYYY}, {MM}, {DD}, {Ext}. Example: {YYYY}-{MM}-{DD}_{Category}_{Title}',
      default: ''
    },
    {
      key: 'preserve_original',
      label: 'Preserve Original? (true / false)',
      hint: '"true" = copies the file (keeps original). "false" = moves it.',
      default: 'true'
    },
    {
      key: 'save_urls_as',
      label: 'Save Links As',
      hint: '"json_manifest" = Append to a JSON list. "url_files" = Create individual Windows Shortcuts (.url). "html_bookmark" = Append to Chrome-compatible HTML Bookmarks.',
      default: 'json_manifest'
    }
  ],

  test: async (config) => {
    if (!config.base_path) return { success: false, error: 'Destination folder is required.' };
    if (!fs.existsSync(config.base_path)) {
      return { success: false, error: `Folder does not exist: ${config.base_path}` };
    }
    return { success: true, message: 'Folder found and accessible!' };
  },

  execute: async (entity, config) => {
    if (!config.base_path) throw new Error("Local Storage destination path not configured.");

    const basePath = config.base_path;
    const subfolderMode = (config.create_subfolder || 'none').toLowerCase().trim();

    // --- Resolve destination directory ---
    let targetDir = basePath;

    if (subfolderMode !== 'none') {
      const d = new Date();
      const safeCat = (entity.category || 'Uncategorized').replace(/[/\\?%*:|"<>]/g, '_');
      let sub = '';

      if (subfolderMode === 'category') {
        sub = safeCat;
      } else if (subfolderMode === 'date') {
        sub = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (subfolderMode === 'custom' && config.subfolder_pattern) {
        sub = config.subfolder_pattern
          .replace(/\{YYYY\}/g, d.getFullYear())
          .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'))
          .replace(/\{Category\}/g, safeCat)
          .replace(/\{Type\}/g, entity.type || 'url');
      }

      if (sub) targetDir = path.join(basePath, sub);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // --- Resolve filename ---
    function buildFilename(originalName, ext) {
      const renameMode = (config.rename_rule || 'none').toLowerCase().trim();
      const d = new Date();
      const safeCat = (entity.category || 'Uncategorized').replace(/[/\\?%*:|"<>]/g, '_');
      const pureTitle = originalName.replace(new RegExp(`\\${ext}$`, 'i'), '').trim();
      const safeTitle = pureTitle.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 120);

      if (renameMode === 'none') {
        return `${safeTitle}${ext}`;
      } else if (renameMode === 'clean') {
        return `${safeTitle.replace(/\s+/g, '_')}${ext}`;
      } else if (renameMode === 'prefix') {
        return `${safeCat} - ${safeTitle}${ext}`;
      } else if (renameMode === 'pattern' && config.rename_pattern) {
        const result = config.rename_pattern
          .replace(/\{Title\}/g, safeTitle)
          .replace(/\{Category\}/g, safeCat)
          .replace(/\{Date\}/g, d.toISOString().split('T')[0])
          .replace(/\{YYYY\}/g, d.getFullYear())
          .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'))
          .replace(/\{DD\}/g, String(d.getDate()).padStart(2, '0'))
          .replace(/\{Ext\}/g, ext);
        // If pattern doesn't include {Ext}, append it
        return result.endsWith(ext) ? result : `${result}${ext}`;
      }
      return `${safeTitle}${ext}`;
    }

    let finalFilePath;

    // SCENARIO 1: Physical file
    if (entity.type === 'file' && entity.filePath && fs.existsSync(entity.filePath)) {
      const ext = path.extname(entity.filePath) || path.extname(entity.title) || '';
      const originalName = entity.title || `File_${Date.now()}`;
      const filename = buildFilename(originalName, ext);
      finalFilePath = path.join(targetDir, filename);

      if (config.preserve_original === 'false') {
        fs.renameSync(entity.filePath, finalFilePath);
      } else {
        fs.copyFileSync(entity.filePath, finalFilePath);
      }
    }
    // SCENARIO 2: Text note
    else if (entity.type === 'text') {
      const originalName = entity.title || `Note_${Date.now()}`;
      const filename = buildFilename(originalName, '.md');
      finalFilePath = path.join(targetDir, filename);
      fs.writeFileSync(finalFilePath, entity.markdownBody || entity.description || 'Empty note');
    }
    // SCENARIO 3: URLs — attempt PDF download or append to manifest
    else {
      let downloadedPaper = false;

      if (entity.paperLink && entity.paperLink.includes('pdf')) {
        try {
          const response = await axios.get(entity.paperLink, { responseType: 'arraybuffer', timeout: 8000 });
          const originalName = entity.title || `Paper_${Date.now()}`;
          const filename = buildFilename(originalName, '.pdf');
          finalFilePath = path.join(targetDir, filename);
          fs.writeFileSync(finalFilePath, response.data);
          downloadedPaper = true;
        } catch (e) { console.error('[Local Storage] Failed to download PDF:', e.message); }
      } else if (entity.url && entity.url.includes('arxiv.org/abs/')) {
        try {
          const pdfUrl = entity.url.replace('abs', 'pdf') + '.pdf';
          const response = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 8000 });
          const originalName = entity.title || `Arxiv_${Date.now()}`;
          const filename = buildFilename(originalName, '.pdf');
          finalFilePath = path.join(targetDir, filename);
          fs.writeFileSync(finalFilePath, response.data);
          downloadedPaper = true;
        } catch (e) { console.error('[Local Storage] Failed to download ArXiv PDF:', e.message); }
      }

      if (!downloadedPaper) {
        const mode = (config.save_urls_as || 'json_manifest').trim().toLowerCase();

        if (mode === 'url_files') {
          const originalName = entity.title || `Bookmark_${Date.now()}`;
          const filename = buildFilename(originalName, '.url');
          finalFilePath = path.join(targetDir, filename);
          const urlContent = `[InternetShortcut]\r\nURL=${entity.url}\r\n`;
          fs.writeFileSync(finalFilePath, urlContent, 'utf8');
        } 
        else if (mode === 'html_bookmark') {
          finalFilePath = path.join(targetDir, 'Bookmarks.html');
          const epoch = Math.floor(Date.now() / 1000);
          const safeTitle = (entity.title || entity.url || '').replace(/</g, '&lt;');
          const linkLine = `    <DT><A HREF="${entity.url}" ADD_DATE="${epoch}">${safeTitle}</A>\n`;

          if (!fs.existsSync(finalFilePath)) {
            const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated bookmark list. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>KMS Bookmarks Export</H1>
<DL><p>
`;
            fs.writeFileSync(finalFilePath, header + linkLine, 'utf8');
          } else {
            fs.appendFileSync(finalFilePath, linkLine, 'utf8');
          }
        } 
        else {
          // json_manifest fallback
          finalFilePath = path.join(targetDir, 'Links_Manifest.json');
          let manifest = [];
          if (fs.existsSync(finalFilePath)) {
            try { manifest = JSON.parse(fs.readFileSync(finalFilePath, 'utf8')); } catch (e) { manifest = []; }
          }
          manifest.push({
            title: entity.title,
            url: entity.url,
            paperLink: entity.paperLink || null,
            description: entity.description || '',
            category: entity.category,
            timestamp: new Date().toISOString()
          });
          fs.writeFileSync(finalFilePath, JSON.stringify(manifest, null, 2), 'utf8');
        }
      }
    }

    return { success: true, path: finalFilePath };
  }
};
