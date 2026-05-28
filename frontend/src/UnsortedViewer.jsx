import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Read-only viewer for the Unsorted registry: filter, sort, and export.
// Its only purpose is inspection/posterity — these links are never routed.
export default function UnsortedViewer({ apiBase }) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('All'); // All | Unsorted | Trash
  const [sortKey, setSortKey] = useState('last_visit'); // last_visit | visits | title | url
  const [sortDir, setSortDir] = useState('desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/unsorted`);
      setItems(data.items || []);
      setCount(data.count || 0);
    } catch (e) { /* backend not ready */ } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s * 1000); return isNaN(d) ? '—' : d.toLocaleDateString(); };
  const toggleSort = (key) => { if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDir('desc'); } };
  const arrow = (key) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';

  let rows = items.filter(it =>
    (bucket === 'All' || (it.bucket || 'Unsorted') === bucket) &&
    ((it.title || '').toLowerCase().includes(search.toLowerCase()) ||
     (it.url || '').toLowerCase().includes(search.toLowerCase())));
  rows = [...rows].sort((a, b) => {
    if (sortKey === 'title' || sortKey === 'url') {
      const av = (a[sortKey] || '').toLowerCase(), bv = (b[sortKey] || '').toLowerCase();
      return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    const av = a[sortKey] || 0, bv = b[sortKey] || 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const download = (filename, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  const exportJSON = () => download('unsorted_registry.json', JSON.stringify(rows, null, 2), 'application/json');
  const exportCSV = () => {
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['title,url,visits,last_visit_iso,archived_at_iso'];
    for (const r of rows) lines.push([
      esc(r.title), esc(r.url), esc(r.visits),
      esc(r.last_visit ? new Date(r.last_visit * 1000).toISOString() : ''),
      esc(r.archived_at ? new Date(r.archived_at * 1000).toISOString() : ''),
    ].join(','));
    download('unsorted_registry.csv', lines.join('\n'), 'text/csv');
  };

  return (
    <div className="glass-panel">
      <h2 style={{ marginTop: 0 }}>🗃️ Unsorted Registry</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
        A posterity record of every processed link that matched none of your categories — kept with its
        metadata (visit count, last-visit date) and routed nowhere else. Showing{' '}
        <strong>{rows.length.toLocaleString()}</strong> of <strong>{count.toLocaleString()}</strong> records.
      </p>

      <div className="controls-row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="flex-group" style={{ gap: 4 }}>
          {['All', 'Unsorted', 'Trash'].map(b => (
            <button key={b} className={`btn ${bucket === b ? 'btn-primary' : 'btn-outline'}`} onClick={() => setBucket(b)}>
              {b === 'Trash' ? '🗑️ Trash' : b === 'Unsorted' ? '🗃️ Unsorted' : 'All'}
            </button>
          ))}
        </div>
        <input className="input-base search-bar" placeholder="🔍 Filter by title or URL..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-outline" onClick={fetchData} disabled={loading}>{loading ? '⏳' : '🔄 Refresh'}</button>
        <button className="btn btn-primary" onClick={exportCSV} disabled={!rows.length}>⬇️ Export CSV</button>
        <button className="btn btn-primary" onClick={exportJSON} disabled={!rows.length}>⬇️ Export JSON</button>
      </div>

      <div className="table-wrapper" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('title')} style={{ cursor: 'pointer' }}>Title / URL{arrow('title')}</th>
              <th style={{ width: 80, textAlign: 'center' }}>Type</th>
              <th onClick={() => toggleSort('visits')} style={{ cursor: 'pointer', width: 90, textAlign: 'center' }}>Visits{arrow('visits')}</th>
              <th onClick={() => toggleSort('last_visit')} style={{ cursor: 'pointer', width: 150, textAlign: 'center' }}>Last visit{arrow('last_visit')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{loading ? 'Loading…' : 'Registry is empty — run a history sweep first.'}</td></tr>
            ) : rows.slice(0, 1000).map((r, i) => (
              <tr key={r.url || i} className="row">
                <td className="cell-title">
                  <div className="title-text">{r.title || r.url}</div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="link-url">{r.url}</a>
                </td>
                <td style={{ textAlign: 'center' }} title={r.bucket || 'Unsorted'}>{(r.bucket || 'Unsorted') === 'Trash' ? '🗑️' : '🗃️'}</td>
                <td style={{ textAlign: 'center' }}>{r.visits}</td>
                <td style={{ textAlign: 'center' }}>{fmtDate(r.last_visit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 1000 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>Showing first 1,000 rows — Export covers the full filtered set.</p>}
      </div>
    </div>
  );
}
