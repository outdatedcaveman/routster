const fs = require('fs');
const path = require('path');

function getChromeBookmarksPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const chromePaths = [
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks'),
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 2', 'Bookmarks')
  ];
  return chromePaths.find(p => fs.existsSync(p));
}

function findOrCreateFolder(parent, folderName) {
  if (!parent.children) parent.children = [];
  let folder = parent.children.find(c => c.type === 'folder' && c.name === folderName);
  if (!folder) {
    folder = {
      date_added: String(Math.floor(Date.now() * 1000)), // Chrome uses microseconds sync epoch, but roughly this works
      date_last_used: "0",
      date_modified: "0",
      guid: require('crypto').randomUUID(),
      id: Math.floor(Math.random() * 1000000).toString(),
      name: folderName,
      type: "folder",
      children: []
    };
    parent.children.push(folder);
  }
  return folder;
}

module.exports = {
  id: 'chrome_bookmarks',
  name: 'Save to Chrome Bookmarks',
  icon: '⭐',
  description: 'Saves and sorts links natively into your Chrome Bookmarks (KMS Output folders).',
  configFields: [
    {
      key: 'destination_path',
      label: 'Destination Full Path',
      hint: 'Example: "other/KMS Output/{Category}" or "bookmark_bar/Research". Valid roots: other (Outros Favoritos), bookmark_bar, synced.',
      default: 'other/KMS Output/{Category}'
    },
    {
      key: 'clean_input',
      label: 'Clean up KMS Input?',
      hint: 'If true, we will try to remove the original unsorted bookmark from "KMS Input" to prevent duplicates.',
      default: 'true'
    }
  ],

  test: async (config) => {
    const bmkPath = getChromeBookmarksPath();
    if (!bmkPath) return { success: false, error: 'Google Chrome Bookmarks file not found.' };
    return { success: true, message: 'Successfully found Chrome Bookmarks file: ' + bmkPath };
  },

  execute: async (entity, config) => {
    const bmkPath = getChromeBookmarksPath();
    if (!bmkPath) throw new Error("Chrome Bookmarks file not found on this system.");

    const rawData = fs.readFileSync(bmkPath, 'utf8');
    const bookmarks = JSON.parse(rawData);

    // 1. Traverse and Optionally Delete from "KMS Input"
    if (config.clean_input === 'true') {
      function removeFromInput(node) {
        if (node.type === 'folder' && node.name === 'KMS Input' && node.children) {
          node.children = node.children.filter(c => c.url !== entity.url);
        } else if (node.children) {
          node.children.forEach(removeFromInput);
        }
      }
      Object.values(bookmarks.roots).forEach(removeFromInput);
    }

    // 2. Parse destination path
    const rawPath = config.destination_path || 'other/KMS Output/{Category}';
    const catName = (entity.category || 'Uncategorized').replace(/[/\\?%*:|"<>]/g, '_');
    const finalPath = rawPath.replace(/\{Category\}/g, catName);
    
    const parts = finalPath.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) throw new Error("Invalid destination_path");

    const rootNodeKey = parts.shift();
    let currentFolder = bookmarks.roots[rootNodeKey];
    if (!currentFolder) throw new Error(`Root node not found: ${rootNodeKey}. Use: other, bookmark_bar, or synced.`);

    // Recursively step through the path creating folders
    for (const folderName of parts) {
      currentFolder = findOrCreateFolder(currentFolder, folderName);
    }

    // 3. Prevent duplicate in destination
    if (currentFolder.children.some(c => c.url === entity.url)) {
      return { success: true, message: `Already exists in ${finalPath}.` };
    }

    // 4. Append Bookmark
    currentFolder.children.push({
      date_added: String(Math.floor(Date.now() * 1000)),
      guid: require('crypto').randomUUID(),
      id: Math.floor(Math.random() * 10000000).toString(),
      name: entity.title || entity.url,
      type: "url",
      url: entity.url
    });

    fs.writeFileSync(bmkPath, JSON.stringify(bookmarks, null, 2), 'utf8');

    return { success: true, path: bmkPath, message: `Sorted natively to: ${finalPath}` };
  }
};
