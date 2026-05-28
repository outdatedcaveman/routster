import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';
import './FlowBuilder.css';
import FlowBuilder from './FlowBuilder';
import Settings from './Settings';
import Onboarding from './Onboarding';
import ActionLogs from './ActionLogs';
import CategorySelect from './CategorySelect';
import UnsortedViewer from './UnsortedViewer';

const API_BASE = 'http://localhost:4000/api';

const getEmoji = (c) => {
  const cat = c?.toLowerCase() || '';
  if (cat.includes('article') || cat.includes('pdf')) return '📄';
  if (cat.includes('book')) return '📚';
  if (cat.includes('shopping')) return '🛒';
  if (cat.includes('event')) return '📅';
  if (cat.includes('job')) return '💼';
  if (cat.includes('github') || cat.includes('repo')) return '💻';
  if (cat.includes('scholar') || cat.includes('reference') || cat.includes('academic')) return '🎓';
  if (cat.includes('instapaper') || cat.includes('read later') || cat.includes('read it later')) return '☕';
  if (cat.includes('science') || cat.includes('press release') || cat.includes('news')) return '🔬';
  if (cat.includes('tool') || cat.includes('app') || cat.includes('service')) return '🛠️';
  if (cat.includes('video') || cat.includes('watch')) return '🎥';
  if (cat.includes('podcast') || cat.includes('audio')) return '🎧';
  return '🔗';
};

function App() {
  const [links, setLinks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [manualLink, setManualLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('inbox');
  const [onboarded, setOnboarded] = useState(true); // Default true avoids flash, checked via API
  const [dragActive, setDragActive] = useState(false);
  const [parseLinks, setParseLinks] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('routster_dark') === 'true');

  // Deep History Sweep
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);
  const [sweepDrag, setSweepDrag] = useState(false);
  const [sweepThreshold, setSweepThreshold] = useState(8);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [minConfidence, setMinConfidence] = useState(0);
  const [confSort, setConfSort] = useState('none'); // 'none' | 'desc' | 'asc'
  const [lastIndex, setLastIndex] = useState(null);
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', url: '' });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('theme-dark');
    } else {
      document.documentElement.classList.remove('theme-dark');
    }
    localStorage.setItem('routster_dark', darkMode ? 'true' : 'false'); // persist across launches
  }, [darkMode]);

  const fetchLinks = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/links`);
      setLinks(data);
      // Always refresh categories alongside links so FlowBuilder additions appear immediately
      fetchCategories();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/categories`);
      setCategories(data);
    } catch (err) { }
  };

  const getSettings = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/app-state`);
      setOnboarded(data.onboarding_complete);
    } catch(err) { }
  };

  useEffect(() => {
    // 1. Check for incoming PWA share intent from Android
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    const sharedTitle = params.get('title') || 'Shared from Android';
    
    if (sharedUrl && window.location.pathname.includes('/share')) {
      setLoading(true);
      axios.post(`${API_BASE}/ingest`, { url: sharedUrl, title: sharedTitle })
        .then(() => {
          showToast(`Shared "${sharedTitle}" successfully captured!`);
          window.history.replaceState({}, document.title, "/"); // clean URL
          fetchLinks();
        })
        .finally(() => setLoading(false));
    }

    // 2. Initial fetch & polling setup
    fetchLinks();
    fetchCategories();
    getSettings();

    const interval = setInterval(fetchLinks, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('bookmarkFile', file);
    try {
      await axios.post(`${API_BASE}/upload-bookmarks`, formData);
      await fetchLinks();
      showToast('Bookmarks successfully processed!');
    } catch (err) { } finally { setLoading(false); }
  };

  const handleUniversalIngest = async () => {
    if (!manualLink) return;
    setLoading(true);
    try {
      const isUrl = manualLink.startsWith('http') || manualLink.includes('.org') || manualLink.match(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i);
      
      await axios.post(`${API_BASE}/ingest`, { 
        type: isUrl && !parseLinks ? 'url' : 'text', 
        [isUrl && !parseLinks ? 'url' : 'textContent']: manualLink,
        parseLinks
      });
      setManualLink('');
      showToast('Item successfully captured and routed!');
      fetchLinks();
    } catch (e) { showToast('Error adding item'); } finally { setLoading(false); }
  };

  const handleUniversalFileDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    let successCount = 0;

    try {
      await Promise.allSettled(Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'file');
        if (parseLinks) formData.append('parseLinks', 'true');
        await axios.post(`${API_BASE}/ingest`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
        successCount++;
      }));

      showToast(`Successfully ingested ${successCount} file(s)!`);
      fetchLinks();
    } catch (e) {
      showToast('Error uploading files');
    } finally {
      if (e.target && e.target.value) e.target.value = ''; // Reset input to allow re-uploading the same files
      setLoading(false);
    }
  };

  const handleSelect = (id) => {
    const newSel = new Set(selected);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelected(newSel);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelected(new Set(filteredLinks.map(l => l.id)));
    else setSelected(new Set());
  };

  const handleCategoryChange = async (id, newCat) => {
    try {
      await axios.put(`${API_BASE}/links/${id}`, { category: newCat });
      fetchLinks();
    } catch (e) { console.error('Failed to update category') }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/links/${id}`);
      showToast('Link deleted');
      fetchLinks();
    } catch (e) { console.error('Failed to delete') }
  };

  const handleMassDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Permanently delete ${selected.size} items?`)) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/links/mass-delete`, { itemIds: Array.from(selected) });
      setSelected(new Set());
      showToast(`Deleted ${selected.size} items`);
      fetchLinks();
    } catch (e) { showToast('Error mass deleting'); } finally { setLoading(false); }
  };

  const handleMassCategory = async (e) => {
    const newCat = e.target.value;
    if (!newCat || selected.size === 0) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/links/mass-category`, { itemIds: Array.from(selected), category: newCat });
      setSelected(new Set());
      showToast(`Updated ${selected.size} items to ${newCat}`);
      fetchLinks();
    } catch (err) { showToast('Error updating categories'); } finally { setLoading(false); }
  };

  const handleMassReclassify = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    showToast('Re-scanning selected items...');
    try {
      await axios.post(`${API_BASE}/links/mass-reclassify`, { itemIds: Array.from(selected) });
      setSelected(new Set());
      showToast(`Reclassified ${selected.size} items`);
      fetchLinks();
    } catch (err) { showToast('Error reclassifying items'); } finally { setLoading(false); }
  };

  const initEdit = (link) => {
    setEditingId(link.id);
    setEditForm({ title: link.title, url: link.url });
  };

  const saveEdit = async (id) => {
    try {
      await axios.put(`${API_BASE}/links/${id}`, editForm);
      setEditingId(null);
      showToast('Link updated successfully');
      fetchLinks();
    } catch (e) { console.error('Failed to update link') }
  };

  const [notionDbId, setNotionDbId] = useState('');
  const [instapaperPassword, setInstapaperPassword] = useState('');

  const handleExport = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      const payload = { 
        itemIds: Array.from(selected),
        notionDbId: notionDbId || undefined,
        instapaperPassword: instapaperPassword || undefined 
      };
      const { data } = await axios.post(`${API_BASE}/export`, payload);
      showToast(data.message);
      setSelected(new Set());
      fetchLinks();
    } catch (e) {
      showToast(e.response?.data?.error || 'Export failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelExport = async () => {
    try {
      const { data } = await axios.post(`${API_BASE}/export/cancel`);
      showToast(data.message);
    } catch(e) { }
  };

  const handleChromeSync = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/sync-chrome`);
      showToast(data.message);
      if (data.count > 0) fetchLinks();
    } catch(e) {
      showToast(e.response?.data?.error || 'Chrome sync error');
    } finally {
      setLoading(false);
    }
  };

  const handleHistorySweep = async (fileList) => {
    const file = fileList && fileList[0];
    if (!file) return;
    setSweeping(true);
    setSweepResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('threshold', sweepThreshold);
      const { data } = await axios.post(`${API_BASE}/sweep-history`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSweepResult(data);
      showToast(`Swept ${data.stats.uniqueUrls} unique links · staged ${data.staged} for review`);
      fetchLinks();
    } catch (e) {
      showToast(e.response?.data?.error || 'History sweep failed');
    } finally {
      setSweeping(false);
    }
  };

  const handleClearSweep = async () => {
    if (!window.confirm('Remove all previously swept links (staged + the Unsorted/Trash registry) so you can re-run cleanly?\n\nYour bookmark-learned corrections and your exclusions are kept.')) return;
    try {
      const { data } = await axios.post(`${API_BASE}/clear-sweep`);
      setSweepResult(null);
      showToast(`Cleared ${data.links} staged + ${data.archive} archived. Ready for a fresh sweep.`);
      fetchLinks();
    } catch (e) { showToast('Clear failed'); }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  let filteredLinks = links.filter(l => {
    const matchSearch = l.title?.toLowerCase().includes(search.toLowerCase()) || l.url?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'All' || l.category === filterCat;
    const matchSource = sourceFilter === 'All' || l.source === sourceFilter;
    const matchConf = (l.confidence || 0) >= minConfidence;
    return matchSearch && matchCat && matchSource && matchConf;
  });
  if (confSort !== 'none') {
    filteredLinks = [...filteredLinks].sort((a, b) =>
      confSort === 'desc' ? (b.confidence || 0) - (a.confidence || 0) : (a.confidence || 0) - (b.confidence || 0));
  }

  if (!onboarded) {
    return <Onboarding onComplete={() => setOnboarded(true)} />;
  }

  return (
    <div className="app-container">
      <header className="header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="app-title">Routster</h1>
        <button 
          className="btn btn-secondary" 
          onClick={() => setDarkMode(!darkMode)}
          title="Toggle Dark Mode"
          style={{ fontSize: '1.2rem', padding: '10px 14px' }}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {toast && <div className="toast">✅ {toast}</div>}

      <div className="tab-nav">
        <button className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`} onClick={() => setActiveTab('inbox')}>
          📥 Inbox
        </button>
        <button className={`tab-btn ${activeTab === 'flows' ? 'active' : ''}`} onClick={() => setActiveTab('flows')}>
          ⚡ Flows
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📄 History
        </button>
        <button className={`tab-btn ${activeTab === 'sweep' ? 'active' : ''}`} onClick={() => setActiveTab('sweep')}>
          🧹 Deep Sweep
        </button>
        <button className={`tab-btn ${activeTab === 'unsorted' ? 'active' : ''}`} onClick={() => setActiveTab('unsorted')}>
          🗃️ Unsorted
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          ⚙️ Settings
        </button>
      </div>

      {activeTab === 'flows' && (
        <div className="glass-panel">
          <FlowBuilder />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="glass-panel">
          <Settings darkMode={darkMode} setDarkMode={setDarkMode} />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="glass-panel">
          <ActionLogs />
        </div>
      )}

      {activeTab === 'sweep' && (
        <div className="glass-panel">
          <h2 style={{ marginTop: 0 }}>🧹 Deep History Sweep</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
            Drop a browser-history export. Routster learns from your bookmark folders, then sorts links into the
            six priority categories — <strong>Articles, Books, Science News, References, Data &amp; Tools, Content &amp; News</strong> —
            using strict, structural signals (DOI / publisher / repository / ISBN / science outlet / encyclopedia / code repo / longform),
            so only confident matches are <strong>staged in the Inbox for review</strong>. Obvious junk goes to
            <strong> Trash</strong>; anything not confidently a priority category goes to <strong>Unsorted</strong>.
            Both are archived (browse them in the 🗃️ Unsorted tab) and routed nowhere. Nothing is sent to
            Zotero/Notion/etc. until you run the export pipeline. Accepts Google&nbsp;Takeout <code>History.json</code>,
            a raw Chrome <code>History</code> file, or bookmark HTML — all processed locally.
          </p>

          <div style={{ maxWidth: 460, margin: '4px 0 18px' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Wikipedia → References strictness: <strong>{sweepThreshold}</strong> <span style={{ opacity: 0.8 }}>(higher = only clearly theory/science Wikipedia pages count as References)</span>
            </label>
            <input type="range" min="0" max="20" step="1" value={sweepThreshold}
              onChange={e => setSweepThreshold(Number(e.target.value))} style={{ width: '100%', display: 'block', marginTop: 6 }} />
          </div>

          <div
            className={`controls-row universal-ingest-container ${sweepDrag ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setSweepDrag(true); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setSweepDrag(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setSweepDrag(false); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setSweepDrag(false); handleHistorySweep(e.dataTransfer.files); }}
            style={{ flexDirection: 'column', alignItems: 'center', padding: '32px', textAlign: 'center' }}
          >
            <p style={{ margin: '0 0 12px 0', fontWeight: 'bold' }}>
              {sweeping ? '⏳ Sweeping your history… large files can take a moment.' : 'Drag a history file here, or choose one:'}
            </p>
            <input type="file" id="sweep-file" style={{ display: 'none' }} onChange={(e) => handleHistorySweep(e.target.files)} />
            <label htmlFor="sweep-file" className="btn btn-primary" style={{ cursor: 'pointer' }}>
              {sweeping ? '⏳ Working…' : '📂 Choose History File'}
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={handleClearSweep} disabled={sweeping}>♻️ Clear previous sweep results (for a fresh re-run)</button>
          </div>

          {sweepResult && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 8 }}>Results</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                Parsed <strong>{sweepResult.stats.rawEntries.toLocaleString()}</strong> visits →{' '}
                <strong>{sweepResult.stats.uniqueUrls.toLocaleString()}</strong> unique links · staged for review:{' '}
                <strong>{sweepResult.staged.toLocaleString()}</strong> · Unsorted:{' '}
                <strong>{(sweepResult.unsortedArchived || 0).toLocaleString()}</strong> · Trash:{' '}
                <strong>{(sweepResult.trashArchived || 0).toLocaleString()}</strong>
                {sweepResult.skippedDuplicates ? ` · ${sweepResult.skippedDuplicates} already in your inbox` : ''}.
              </p>
              {sweepResult.domainRulesSeeded != null && (
                <p style={{ color: 'var(--text-muted)', margin: '0 0 12px 0', fontSize: 13 }}>
                  🎓 Trained from your bookmark folders · {sweepResult.domainRulesSeeded.toLocaleString()} domain rules learned · threshold {sweepResult.threshold}. Sort or filter by the <strong>Confidence</strong> column in the Inbox.
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(sweepResult.stats.perBucket).map(([cat, n]) => (
                  <span key={cat} style={{ padding: '6px 12px', borderRadius: 16, background: 'rgba(127,127,127,0.15)' }}>
                    {getEmoji(cat)} {cat}: <strong>{n}</strong>
                  </span>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => { setSourceFilter('history-sweep'); setActiveTab('inbox'); }}>
                👀 Review staged links in Inbox →
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'unsorted' && <UnsortedViewer apiBase={API_BASE} />}

      {activeTab === 'inbox' && (<><div className="glass-panel">
        <div className="controls-row">
          <input 
            type="text" 
            placeholder="🔍 Search titles or URLs..." 
            className="input-base search-bar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          
          <CategorySelect
            className="full-width"
            value={filterCat}
            options={[{ value: 'All', label: '🔍 All Categories' }, ...categories.map(c => ({ value: c, label: `${getEmoji(c)} ${c}` }))]}
            onChange={val => setFilterCat(val)}
          />

          <CategorySelect
            className="full-width"
            value={sourceFilter}
            options={[{ value: 'All', label: '🗂️ All Sources' }, { value: 'history-sweep', label: '🧹 From History Sweep' }]}
            onChange={val => setSourceFilter(val)}
          />

          <div className="flex-group" style={{ alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Min confidence: <strong>{minConfidence}%</strong></label>
            <input type="range" min="0" max="100" step="5" value={minConfidence} onChange={e => setMinConfidence(Number(e.target.value))} />
          </div>
        </div>

        <div 
          className={`controls-row universal-ingest-container ${dragActive ? 'drag-active' : ''}`} 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
          onDrop={handleUniversalFileDrop}
          style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '20px' }}
        >
          <div className="flex-group" style={{ flexDirection: 'column', width: '100%' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#8b949e', fontWeight: 'bold' }}>
              Universal Ingestion (Links, Blocks of Text, DOIs)
            </p>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <textarea 
                placeholder="Paste a URL, an academic DOI, or a raw text note here... Or drag-and-drop a .docx, .xlsx, .pdf file over this box." 
                value={manualLink}
                onChange={e => setManualLink(e.target.value)}
                className="input-base"
                style={{ flex: 1, resize: 'vertical', minHeight: '60px', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', width: '100%', justifyContent: 'space-between' }}>
              <div className="flex-group">
                <input type="file" id="universal-file" multiple style={{display:'none'}} onChange={handleUniversalFileDrop} />
                <label htmlFor="universal-file" className="btn btn-outline" style={{cursor: 'pointer'}}>
                  {loading ? '⏳' : '📎 Choose File'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input type="checkbox" id="parseLinks" checked={parseLinks} onChange={e => setParseLinks(e.target.checked)} />
                  <label htmlFor="parseLinks" style={{ cursor: 'pointer' }}>Extract & route individual links</label>
                </div>
                <button className="btn btn-primary" onClick={handleChromeSync} disabled={loading} style={{background: 'linear-gradient(135deg, #10b981, #059669)'}}>
                  🔄 Pull from Chrome
                </button>
              </div>
              <button className="btn btn-primary" onClick={handleUniversalIngest} disabled={!manualLink || loading}>
                🚀 Send to Pipeline
              </button>
            </div>
          </div>
        </div>

        <div className="controls-row" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '20px', background: 'rgba(0,0,0,0.2)', margin: '-24px', marginTop: '0', padding: '24px' }}>
          <div className="flex-group">
            {selected.size > 0 && (
              <>
                <CategorySelect
                  className="toolbar"
                  value=""
                  placeholder="🏷️ Match Category..."
                  options={[...categories.map(c => ({ value: c, label: c })), { value: 'Uncategorized', label: 'Unknown/Other' }]}
                  onChange={val => handleMassCategory({ target: { value: val } })}
                />
                <button className="btn btn-primary" onClick={handleMassReclassify} style={{background: 'linear-gradient(135deg, #a855f7, #6b21a8)', color: '#fff'}}>
                  🤖 Auto Re-classify ({selected.size})
                </button>
                <button className="btn btn-delete" onClick={handleMassDelete}>
                  🗑️ Delete ({selected.size})
                </button>
              </>
            )}
            <button className="btn btn-export" onClick={handleExport} disabled={selected.size === 0 || loading}>
              {loading ? '📤 Syncing Vaults...' : `📤 Run Export Pipeline (${selected.size})`}
            </button>
            {loading && <button className="btn btn-delete" onClick={handleCancelExport} style={{background:'#b91c1c'}}>🛑 Panic Stop Sync</button>}
          </div>
        </div>
      </div>

      <div className="controls-row" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {filteredLinks.length.toLocaleString()} links · click a checkbox then Shift-click another to select everything in between · the header checkbox selects all
      </div>

      <div className="table-wrapper" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="cell-checkbox">
                <input 
                  type="checkbox" 
                  checked={filteredLinks.length > 0 && selected.size === filteredLinks.length}
                  onChange={handleSelectAll}
                />
              </th>
              <th className="cell-icon">Type</th>
              <th className="cell-title">Title & Source</th>
              <th className="cell-category">Integration</th>
              <th onClick={() => setConfSort(confSort === 'desc' ? 'asc' : 'desc')} style={{ width: '110px', textAlign: 'center', cursor: 'pointer' }} title="Sort by confidence">
                Confidence {confSort === 'desc' ? '▼' : confSort === 'asc' ? '▲' : '⇅'}
              </th>
              <th style={{width: '90px', textAlign: 'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLinks.length === 0 ? (
              <tr><td colSpan="6" style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>No links found in the Inbox queue.</td></tr>
            ) : filteredLinks.map((link, idx) => (
              <tr key={link.id} className={`row ${selected.has(link.id) ? 'selected' : ''}`}>
                <td className="cell-checkbox">
                  <input type="checkbox" checked={selected.has(link.id)} readOnly onClick={(e) => {
                    const newSel = new Set(selected);
                    if (e.shiftKey && lastIndex !== null) {
                      const [a, b] = [Math.min(lastIndex, idx), Math.max(lastIndex, idx)];
                      for (let i = a; i <= b; i++) if (filteredLinks[i]) newSel.add(filteredLinks[i].id);
                    } else if (newSel.has(link.id)) { newSel.delete(link.id); } else { newSel.add(link.id); }
                    setSelected(newSel); setLastIndex(idx);
                  }} />
                </td>
                <td className="cell-icon" style={{textAlign: 'center'}}>{getEmoji(link.category)}</td>
                <td className="cell-title">
                  {editingId === link.id ? (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '5px'}}>
                      <input 
                        type="text" 
                        value={editForm.title} 
                        onChange={e => setEditForm({...editForm, title: e.target.value})} 
                        className="input-base"
                      />
                      <input 
                        type="text" 
                        value={editForm.url} 
                        onChange={e => setEditForm({...editForm, url: e.target.value})} 
                        className="input-base"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="title-text">{link.title || link.url}</div>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-url">{link.url}</a>
                    </>
                  )}
                </td>
                <td className="cell-category">
                  <CategorySelect
                    value={link.category || 'Uncategorized'}
                    options={[
                      ...categories.map(c => ({ value: c, label: `${getEmoji(c)} ${c}` })),
                      ...(!categories.includes(link.category) && link.category && link.category !== 'Uncategorized' ? [{ value: link.category, label: link.category }] : []),
                      { value: 'Uncategorized', label: '❓ Unknown/Other' }
                    ]}
                    onChange={val => handleCategoryChange(link.id, val)}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  {link.confidence ? (
                    <span style={{ display: 'inline-block', minWidth: 42, padding: '3px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff',
                      background: link.confidence >= 75 ? '#16a34a' : link.confidence >= 50 ? '#ca8a04' : '#dc2626' }}>
                      {link.confidence}%
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center', padding: '24px 10px'}}>
                  {editingId === link.id ? (
                    <>
                      <button onClick={() => saveEdit(link.id)} className="action-btn" title="Save">✅</button>
                      <button onClick={() => setEditingId(null)} className="action-btn" title="Cancel">❌</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => initEdit(link)} className="action-btn" title="Edit Entity">✏️</button>
                      <button onClick={() => handleDelete(link.id)} className="action-btn" title="Delete Entity">🗑️</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></>)}
    </div>
  );
}

export default App;
