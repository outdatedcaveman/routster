// === KMS Auto-Router Background Service Worker ===
// Handles: (1) Offline queue flushing, (2) Bookmark moves to KMS Output

chrome.alarms.create("kms-poller", { periodInMinutes: 0.1 }); // Every 6 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "kms-poller") {
        // Job 1: Flush offline queue (links saved while desktop app was off)
        flushOfflineQueue();
        
        // Job 2: Process pending bookmark moves from export pipeline
        fetch('http://localhost:4000/api/get-pending-bookmarks')
            .then(res => res.ok ? res.json() : [])
            .then(pending => {
                if (pending && pending.length > 0) executeBookmarkMoves(pending);
            })
            .catch(() => {}); // Server offline — silently skip
    }
});

// ============================================================
// OFFLINE QUEUE FLUSHER
// When user captures links while desktop app is off, they're stored
// in chrome.storage.local. This function retries sending them.
// ============================================================
async function flushOfflineQueue() {
    const data = await chrome.storage.local.get({ offlineQueue: [] });
    const queue = data.offlineQueue;
    if (queue.length === 0) return;

    const remaining = [];

    for (const item of queue) {
        try {
            const resp = await fetch('http://localhost:4000/api/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: item.url, title: item.title })
            });
            if (resp.ok) {
                console.log(`[Offline Sync] Flushed: ${item.title}`);
            } else {
                remaining.push(item); // Server rejected — keep for retry
            }
        } catch (e) {
            remaining.push(item); // Server still offline — keep entire remainder
            break; // Stop trying — server is down, save bandwidth
        }
    }

    await chrome.storage.local.set({ offlineQueue: remaining });
    if (remaining.length === 0 && queue.length > 0) {
        console.log(`[Offline Sync] Successfully flushed all ${queue.length} queued links!`);
    }
}

// ============================================================
// BOOKMARK MOVES TO KMS OUTPUT
// After export completes, the server queues items here for the
// extension to organize into Chrome Bookmarks under KMS Output.
// ============================================================
async function executeBookmarkMoves(pendingItems) {
    if (!pendingItems || pendingItems.length === 0) return;

    let outputFolderId = await getOrCreateFolder("KMS Output", '1');
    let inputFolders = await new Promise(res => chrome.bookmarks.search({ title: "KMS Input" }, res));
    let inputFolderDir = inputFolders.find(f => !f.url);

    const urlsProcessed = [];

    // Collect all nodes inside KMS Input (if it exists)
    let allInputNodes = [];
    if (inputFolderDir) {
        async function collectNodes(parentId) {
            const children = await new Promise(res => chrome.bookmarks.getChildren(parentId, res));
            for (const child of children) {
                if (child.url) allInputNodes.push(child);
                else await collectNodes(child.id);
            }
        }
        await collectNodes(inputFolderDir.id);
    }

    // Map, Move, or Create
    for (const item of pendingItems) {
        let categoryFolderId = await getOrCreateFolder(item.category, outputFolderId);

        const matchingNode = allInputNodes.find(n => 
            n.url === item.url || 
            (item.originalUrl && n.url === item.originalUrl) ||
            n.url.replace(/\/$/, '') === item.url.replace(/\/$/, '') ||
            (item.originalUrl && n.url.replace(/\/$/, '') === item.originalUrl.replace(/\/$/, ''))
        );

        
        if (matchingNode) {
            // From Chrome Android: Move out of KMS Input into KMS Output
            await new Promise(res => chrome.bookmarks.update(matchingNode.id, { title: item.title }, res));
            await new Promise(res => chrome.bookmarks.move(matchingNode.id, { parentId: categoryFolderId }, res));
        } else {
            // From HTML Upload / Manual / Extension: Create new bookmark in Output
            const globalMatches = await new Promise(res => chrome.bookmarks.search({ url: item.url }, res));
            const existsInOutput = globalMatches.some(n => n.parentId === categoryFolderId);
            
            if (!existsInOutput) {
                await new Promise(res => chrome.bookmarks.create({ parentId: categoryFolderId, title: item.title, url: item.url }, res));
            }
        }
        urlsProcessed.push(item.url);
    }

    await finishQueue(urlsProcessed);
}

function getOrCreateFolder(folderName, parentId) {
    return new Promise((resolve) => {
        chrome.bookmarks.search({ title: folderName }, (results) => {
            const matches = results.filter(r => !r.url && r.parentId === parentId);
            if (matches.length > 0) {
                resolve(matches[0].id);
            } else {
                chrome.bookmarks.create({ parentId: parentId, title: folderName }, (newFolder) => {
                    resolve(newFolder.id);
                });
            }
        });
    });
}

async function finishQueue(urls) {
    if (urls.length === 0) return;
    await fetch('http://localhost:4000/api/clear-pending-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
    });
}
