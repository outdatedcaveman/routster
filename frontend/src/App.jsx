import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';

const API_BASE = 'http://localhost:4000/api';

const CATEGORIES = [
  'Article/PDF', 'Book', 'Scientific News/Press Release', 
  'Instapaper/Read Later', 'Shopping', 'Tool/App/Service', 
  'Event/Theater', 'Job Listing'
];

const getEmoji = (c) => {
  const cat = c?.toLowerCase() || '';
  if (cat.includes('article') || cat.includes('pdf')) return '📄';
  if (cat.includes('book')) return '📚';
  if (cat.includes('shopping')) return '🛒';
  if (cat.includes('event')) return '📅';
  if (cat.includes('job')) return '💼';
  if (cat.includes('github') || cat.includes('repo')) return '💻';
  if (cat.includes('scholar') || cat.includes('reference')) return '🎓';
  if (cat.includes('instapaper') || cat.includes('quanta') || cat.includes('read')) return '☕';
  return '🔗';
};

function App() {
  const [links, setLinks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [manualLink, setManualLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', url: '' });

  const fetchLinks = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/links`);
      setLinks(data);
    } catch (err) {
      console.error(err);
    }
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

  const handleManualAdd = async () => {
    if (!manualLink) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/links`, { url: manualLink });
      setManualLink('');
      showToast('Link added to inbox successfully!');
      fetchLinks();
    } catch (e) { showToast('Error adding link'); } finally { setLoading(false); }
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const filteredLinks = links.filter(l => {
    const matchSearch = l.title?.toLowerCase().includes(search.toLowerCase()) || l.url?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'All' || l.category === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="app-container">
      <header className="header" style={{ marginBottom: '20px' }}>
        <h1 className="app-title">Routster</h1>
      </header>

      {toast && <div className="toast">✅ {toast}</div>}

      <div className="glass-panel">
        <div className="controls-row">
          <input 
            type="text" 
            placeholder="🔍 Search titles or URLs..." 
            className="input-base search-bar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          
          <select 
            value={filterCat} 
            onChange={(e) => setFilterCat(e.target.value)}
            className="input-base"
          >
            <option value="All">🔍 All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{getEmoji(c)} {c}</option>)}
          </select>
        </div>

        <div className="controls-row" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '20px' }}>
          <div className="flex-group">
            <input 
              type="text" 
              placeholder="Paste a single URL to ingest manually..." 
              value={manualLink}
              onChange={e => setManualLink(e.target.value)}
              className="input-base manual-input"
            />
            <button className="btn btn-primary" onClick={handleManualAdd} disabled={!manualLink || loading}>
              ➕ Add URL
            </button>
          </div>

          <div className="flex-group">
            <button className="btn btn-primary" onClick={handleChromeSync} disabled={loading} style={{background: 'linear-gradient(135deg, #10b981, #059669)'}}>
              🔄 Pull 'KMS Input' from Mobile Chrome
            </button>
            <input type="file" id="file-upload" style={{display:'none'}} accept=".html" onChange={handleFileUpload} />
            <label htmlFor="file-upload" className="btn btn-outline" style={{cursor: 'pointer'}}>
              {loading ? '⏳ Processing...' : '☁️ Upload HTML Bookmarks'}
            </label>
          </div>
        </div>

        <div className="controls-row" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '20px', background: 'rgba(0,0,0,0.2)', margin: '-24px', marginTop: '0', padding: '24px' }}>
          <div className="flex-group">
            <input 
               type="text" 
               placeholder="Notion DB ID (Volatile)" 
               value={notionDbId}
               onChange={e => setNotionDbId(e.target.value)}
               className="input-base" style={{width: '200px'}}
            />
            <input 
               type="password" 
               placeholder="Instapaper Pass (Volatile)" 
               value={instapaperPassword}
               onChange={e => setInstapaperPassword(e.target.value)}
               className="input-base" style={{width: '200px'}}
            />
          </div>

          <div className="flex-group">
            {selected.size > 0 && (
              <>
                <select 
                  onChange={handleMassCategory}
                  value=""
                  className="input-base"
                >
                  <option value="" disabled>🏷️ Match Category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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

      <div className="table-wrapper">
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
              <th style={{width: '90px', textAlign: 'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLinks.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>No links found in the Inbox queue.</td></tr>
            ) : filteredLinks.map(link => (
              <tr key={link.id} className={`row ${selected.has(link.id) ? 'selected' : ''}`}>
                <td className="cell-checkbox">
                  <input type="checkbox" checked={selected.has(link.id)} onChange={() => handleSelect(link.id)} />
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
                  <select 
                    className="category-select"
                    value={link.category} 
                    onChange={(e) => handleCategoryChange(link.id, e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    {!CATEGORIES.includes(link.category) && <option value={link.category}>{link.category}</option>}
                  </select>
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
      </div>
    </div>
  );
}

export default App;
