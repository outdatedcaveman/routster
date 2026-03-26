document.addEventListener('DOMContentLoaded', () => {
  const titleDisplay = document.getElementById('title-display');
  const btn = document.getElementById('send-btn');
  const statusEl = document.getElementById('status');
  const queueCountEl = document.getElementById('queue-count');
  let currentTab = null;

  // Show offline queue count on popup open
  chrome.storage.local.get({ offlineQueue: [] }, (data) => {
    const count = data.offlineQueue.length;
    if (count > 0) {
      queueCountEl.textContent = `📦 ${count} link${count > 1 ? 's' : ''} queued offline, waiting for sync...`;
      queueCountEl.style.display = 'block';
    }
  });

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    currentTab = tabs[0];
    titleDisplay.textContent = currentTab.title;
  });

  // === SEND SINGLE TAB ===
  btn.addEventListener('click', async () => {
    if (!currentTab) return;
    btn.disabled = true;
    btn.textContent = 'Routing...';
    statusEl.textContent = '';
    
    const linkData = { url: currentTab.url, title: currentTab.title };

    try {
      const response = await fetch('http://localhost:4000/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkData)
      });

      const data = await response.json();
      if (response.ok) {
        statusEl.style.color = '#3fb950';
        statusEl.textContent = `✅ Routed to: ${data.resultObj.category}`;
        btn.textContent = 'Routed!';
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err) {
      // SERVER OFFLINE → Queue locally for later sync
      await queueOffline(linkData);
      statusEl.style.color = '#d29922';
      statusEl.textContent = '📦 Queued offline! Will sync when app is running.';
      btn.textContent = 'Queued!';
      setTimeout(() => window.close(), 2000);
    }
  });

  // === VACUUM ALL TABS ===
  document.getElementById('mass-capture-btn').addEventListener('click', async () => {
    const massBtn = document.getElementById('mass-capture-btn');
    massBtn.disabled = true;
    massBtn.textContent = 'Vacuuming...';
    statusEl.textContent = '';

    chrome.tabs.query({ currentWindow: true }, async (tabs) => {
      const validTabs = tabs.filter(t => t.url && t.url.startsWith('http'));
      if (validTabs.length === 0) return;

      const tabData = validTabs.map(t => ({ url: t.url, title: t.title }));

      try {
        const response = await fetch('http://localhost:4000/api/chrome-tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabs: tabData })
        });
        
        if (response.ok) {
          statusEl.style.color = '#3fb950';
          statusEl.textContent = `✅ Bulk routed ${validTabs.length} tabs!`;
          massBtn.textContent = 'Finished';
          chrome.tabs.remove(validTabs.map(t => t.id));
        }
      } catch (err) {
        // SERVER OFFLINE → Queue all tabs locally
        for (const tab of tabData) {
          await queueOffline(tab);
        }
        statusEl.style.color = '#d29922';
        statusEl.textContent = `📦 Queued ${tabData.length} tabs offline! Will sync when app runs.`;
        massBtn.textContent = 'Queued!';
        // Don't close tabs when offline — user might want them open
      }
    });
  });
});

// Queue a link into chrome.storage.local with deduplication
async function queueOffline(linkData) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ offlineQueue: [] }, (data) => {
      const queue = data.offlineQueue;
      // Deduplicate by URL
      if (!queue.some(item => item.url === linkData.url)) {
        queue.push({ url: linkData.url, title: linkData.title, queuedAt: Date.now() });
        chrome.storage.local.set({ offlineQueue: queue }, resolve);
      } else {
        resolve();
      }
    });
  });
}
