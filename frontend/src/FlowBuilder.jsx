import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';



export default function FlowBuilder() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [connectors, setConnectors] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [configuring, setConfiguring] = useState(null);
  const [actionConfiguring, setActionConfiguring] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [configForm, setConfigForm] = useState({});
  const [catRuleForm, setCatRuleForm] = useState({});
  const [categoryRules, setCategoryRules] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [renameForm, setRenameForm] = useState('');
  const [bookmarkFolders, setBookmarkFolders] = useState([]);
  const [addingRoute, setAddingRoute] = useState(null);
  const [customActions, setCustomActions] = useState([]);
  const [showCustomActionForm, setShowCustomActionForm] = useState(false);
  const [editingCustomAction, setEditingCustomAction] = useState(null);
  const [customActionForm, setCustomActionForm] = useState({
    name: '', icon: '⚡', description: '', type: 'webhook',
    url: '', method: 'POST', headers: '', body_template: ''
  });

  const fetchData = async () => {
    try {
      const [cRes, rRes, catRes, rulesRes, caRes] = await Promise.all([
        axios.get(`${API_BASE}/connectors`),
        axios.get(`${API_BASE}/routes`),
        axios.get(`${API_BASE}/categories`),
        axios.get(`${API_BASE}/category-rules`),
        axios.get(`${API_BASE}/custom-actions`).catch(() => ({ data: [] }))
      ]);
      setConnectors(cRes.data);
      setRoutes(rRes.data);
      setCategories(catRes.data || []);
      setCategoryRules(rulesRes.data || {});
      setCustomActions(caRes.data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);

  const saveConfig = async (connectorId) => {
    await axios.post(`${API_BASE}/connectors/${connectorId}/config`, {
      config: configForm,
      enabled: true
    });
    setConfiguring(null);
    setConfigForm({});
    fetchData();
  };

  const testConnection = async (connectorId) => {
    setTestResult({ loading: true });
    try {
      const { data } = await axios.post(`${API_BASE}/connectors/${connectorId}/test`, { config: configForm });
      setTestResult(data);
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    }
  };

  const saveActionConfig = async () => {
    if (actionConfiguring.route) {
      await axios.put(`${API_BASE}/routes/${actionConfiguring.route.id}`, {
        connector_config: configForm
      });
    } else {
      const existingCount = routes.filter(r => r.category === actionConfiguring.category).length;
      await axios.post(`${API_BASE}/routes`, {
        category: actionConfiguring.category,
        connector_id: actionConfiguring.connectorId,
        connector_config: configForm,
        action_order: existingCount
      });
    }
    setActionConfiguring(null);
    setConfigForm({});
    fetchData();
  };

  const deleteRoute = async (id) => {
    await axios.delete(`${API_BASE}/routes/${id}`);
    fetchData();
  };

  // ── Custom Actions CRUD ────────────────────────────────────────────────────
  const saveCustomAction = async () => {
    if (!customActionForm.name.trim() || !customActionForm.url.trim()) return;
    if (editingCustomAction !== null) {
      await axios.put(`${API_BASE}/custom-actions/${editingCustomAction}`, customActionForm);
    } else {
      await axios.post(`${API_BASE}/custom-actions`, customActionForm);
    }
    setShowCustomActionForm(false);
    setEditingCustomAction(null);
    setCustomActionForm({ name: '', icon: '⚡', description: '', type: 'webhook', url: '', method: 'POST', headers: '', body_template: '' });
    fetchData();
  };

  const deleteCustomAction = async (id) => {
    if (confirm('Delete this custom action?')) {
      await axios.delete(`${API_BASE}/custom-actions/${id}`);
      fetchData();
    }
  };

  const startEditCustomAction = (ca) => {
    setCustomActionForm({ name: ca.name, icon: ca.icon || '⚡', description: ca.description || '', type: ca.type || 'webhook', url: ca.url || '', method: ca.method || 'POST', headers: ca.headers || '', body_template: ca.body_template || '' });
    setEditingCustomAction(ca.id);
    setShowCustomActionForm(true);
  };

  const deleteCategory = async (catName) => {
    if (confirm(`Are you sure you want to completely delete the category "${catName}" and all its flows?`)) {
      await axios.delete(`${API_BASE}/categories/${encodeURIComponent(catName)}`);
      fetchData();
    }
  };

  const submitRename = async (oldName) => {
    const newName = renameForm.trim();
    if (newName && newName !== oldName) {
      await axios.put(`${API_BASE}/categories/${encodeURIComponent(oldName)}`, { newName });
      fetchData();
    }
    setRenamingCategory(null);
    setRenameForm('');
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (!categories.includes(trimmed)) {
      setCatRuleForm({ mediaType: 'all', scanDepth: 'medium', threshold: 90 });
    } else {
      setCatRuleForm(categoryRules[trimmed] || {});
    }
    setEditingCategory(trimmed);
  };

  const saveCategoryRules = async () => {
    if (!categories.includes(editingCategory)) {
      const cats = [...categories, editingCategory];
      await axios.post(`${API_BASE}/categories`, { categories: cats });
    }
    await axios.post(`${API_BASE}/category-rules`, { category: editingCategory, rules: catRuleForm });
    if (editingCategory === newCategory.trim()) setNewCategory('');
    setEditingCategory(null);
    setCatRuleForm({});
    fetchData();
  };

  // Group routes by category
  const routesByCategory = {};
  categories.forEach(c => { routesByCategory[c] = []; });
  routes.forEach(r => {
    if (!routesByCategory[r.category]) routesByCategory[r.category] = [];
    routesByCategory[r.category].push(r);
  });

  const getConnectorInfo = (id) => {
    const builtIn = connectors.find(c => c.id === id);
    if (builtIn) return builtIn;
    const custom = customActions.find(c => `custom_${c.id}` === id || String(c.id) === id);
    if (custom) return { name: custom.name, icon: custom.icon || '⚡' };
    return { name: id, icon: '🔌' };
  };

  // Split by type: services need credentials; actions/processors are flow steps
  const SERVICE_CATEGORIES = ['reference', 'readlater', 'notes', 'storage', 'webhook', 'drive'];
  const serviceConnectors = connectors.filter(c => SERVICE_CATEGORIES.includes(c.category));
  const actionConnectors  = connectors.filter(c => !SERVICE_CATEGORIES.includes(c.category));

  const ConnectorCard = ({ c }) => (
    <div key={c.id} className={`connector-card ${c.configured ? 'configured' : ''}`}>
      <div className="connector-header">
        <span className="connector-icon">{c.icon}</span>
        <span className="connector-name">{c.name}</span>
        {c.configured && <span className="badge-ok">✓</span>}
      </div>
      <p className="connector-desc">{c.description}</p>
      {c.configFields && c.configFields.length > 0 ? (
        <button className="btn-sm" onClick={() => { setConfiguring(c.id); setConfigForm({}); setTestResult(null); }}>
          {c.configured ? '⚙️ Reconfigure' : '🔧 Set up'}
        </button>
      ) : (
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No config needed</span>
      )}
    </div>
  );

  return (
    <div className="flows-container">
      {/* ── INTEGRATIONS (credential-bearing services) ───────────────────── */}
      <h2 style={{ margin: '0 0 6px 0', color: 'var(--text-primary)' }}>🔌 Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
        Services that require credentials. Configure once, use in any flow.
      </p>
      <div className="connectors-grid">
        {serviceConnectors.map(c => <ConnectorCard key={c.id} c={c} />)}
      </div>

      {/* ── ACTIONS (built-in processors + custom webhooks) ─────────────── */}
      <div style={{ margin: '36px 0 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)' }}>⚡ Actions</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              Flow steps that process or route items. Add any of these to a category's pipeline below.
            </p>
          </div>
          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditingCustomAction(null); setCustomActionForm({ name: '', icon: '⚡', description: '', type: 'webhook', url: '', method: 'POST', headers: '', body_template: '' }); setShowCustomActionForm(true); }}>
            + Custom Action
          </button>
        </div>

        <div className="connectors-grid" style={{ marginTop: '14px' }}>
          {/* Built-in action connectors */}
          {actionConnectors.map(c => <ConnectorCard key={c.id} c={c} />)}
          {/* User-defined custom actions */}
          {customActions.map(ca => (
            <div key={`ca_${ca.id}`} className="connector-card configured">
              <div className="connector-header">
                <span className="connector-icon">{ca.icon || '⚡'}</span>
                <span className="connector-name">{ca.name}</span>
                <span className="badge-ok">{ca.type === 'webhook' ? 'Webhook' : 'API'}</span>
              </div>
              <p className="connector-desc">{ca.description || ca.url}</p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-sm" onClick={() => startEditCustomAction(ca)}>⚙️ Edit</button>
                <button className="btn-sm" style={{ color: '#ff7b72' }} onClick={() => deleteCustomAction(ca.id)}>🗑️ Delete</button>
              </div>
            </div>
          ))}
        </div>

        {showCustomActionForm && (
          <div className="modal-backdrop" onClick={() => setShowCustomActionForm(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
              <h3>{editingCustomAction !== null ? '⚙️ Edit' : '⚡ New'} Custom Action</h3>
              <div className="config-field">
                <label>Display Name *</label>
                <input className="input-base" placeholder="e.g. Send to Notion DB" value={customActionForm.name}
                  onChange={e => setCustomActionForm({ ...customActionForm, name: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="config-field" style={{ flex: '0 0 80px' }}>
                  <label>Icon</label>
                  <input className="input-base" placeholder="⚡" value={customActionForm.icon}
                    onChange={e => setCustomActionForm({ ...customActionForm, icon: e.target.value })} />
                </div>
                <div className="config-field" style={{ flex: 1 }}>
                  <label>Description</label>
                  <input className="input-base" placeholder="What does this action do?" value={customActionForm.description}
                    onChange={e => setCustomActionForm({ ...customActionForm, description: e.target.value })} />
                </div>
              </div>
              <div className="config-field">
                <label>Type</label>
                <select className="input-base" value={customActionForm.type}
                  onChange={e => setCustomActionForm({ ...customActionForm, type: e.target.value })}>
                  <option value="webhook">Webhook (HTTP POST/GET)</option>
                  <option value="api">Custom REST API</option>
                </select>
              </div>
              <div className="config-field">
                <label>URL *</label>
                <input className="input-base" placeholder="https://..." value={customActionForm.url}
                  onChange={e => setCustomActionForm({ ...customActionForm, url: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="config-field" style={{ flex: '0 0 100px' }}>
                  <label>Method</label>
                  <select className="input-base" value={customActionForm.method}
                    onChange={e => setCustomActionForm({ ...customActionForm, method: e.target.value })}>
                    <option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option>
                  </select>
                </div>
                <div className="config-field" style={{ flex: 1 }}>
                  <label>Headers (JSON)</label>
                  <input className="input-base" placeholder='{"Authorization": "Bearer ..."}' value={customActionForm.headers}
                    onChange={e => setCustomActionForm({ ...customActionForm, headers: e.target.value })} />
                </div>
              </div>
              <div className="config-field">
                <label>Body Template</label>
                <small className="field-hint">Use {'{{title}}'}, {'{{url}}'}, {'{{category}}'} as placeholders.</small>
                <textarea className="input-base" rows={4} placeholder='{"title": "{{title}}", "url": "{{url}}"}'
                  value={customActionForm.body_template}
                  onChange={e => setCustomActionForm({ ...customActionForm, body_template: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button className="btn btn-primary" onClick={saveCustomAction}>💾 Save Action</button>
                <button className="btn" onClick={() => setShowCustomActionForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONFIG MODAL */}
      {configuring && (() => {
        const conn = connectors.find(c => c.id === configuring);
        if (!conn) return null;
        return (
          <div className="modal-backdrop" onClick={() => setConfiguring(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>{conn.icon} Configure {conn.name}</h3>
              {conn.configFields.map(field => (
                <div key={field.key} className="config-field">
                  <label>{field.label} {field.required && <span style={{ color: '#f85149' }}>*</span>}</label>
                  {field.hint && <small className="field-hint">{field.hint}</small>}
                  {field.key === 'destination_path' && conn.id === 'chrome_bookmarks' ? (
                    <>
                      <input
                        list="chrome-folders-list"
                        className="input-base"
                        placeholder={field.default || ''}
                        value={configForm[field.key] || ''}
                        onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                      />
                      <datalist id="chrome-folders-list">
                        {bookmarkFolders.map(bf => (
                          <option key={bf.path} value={bf.path}>{bf.label}</option>
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      className="input-base"
                      placeholder={field.default || ''}
                      value={configForm[field.key] || ''}
                      onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-test" onClick={() => testConnection(configuring)}>
                  🧪 Test Connection
                </button>
                <button className="btn-save" onClick={() => saveConfig(configuring)}>
                  💾 Save
                </button>
              </div>
              {testResult && (
                <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.loading ? '⏳ Testing...' : testResult.success ? `✅ ${testResult.message}` : `❌ ${testResult.error}`}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ACTION SPECIFIC CONFIG MODAL */}
      {actionConfiguring && (() => {
        const conn = connectors.find(c => c.id === actionConfiguring.connectorId);
        if (!conn) return null;
        return (
          <div className="modal-backdrop" onClick={() => setActionConfiguring(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>{conn.icon} Action Settings ({actionConfiguring.category})</h3>
              <p style={{ color: '#8b949e', fontSize: '12px', marginBottom: '16px' }}>
                Overrides or supplements your global configuration for this specific action.
              </p>
              {conn.configFields.map(field => (
                <div key={field.key} className="config-field">
                  <label>{field.label} {field.required && <span style={{ color: '#f85149' }}>*</span>}</label>
                  {field.hint && <small className="field-hint">{field.hint}</small>}
                  {field.key === 'destination_path' && conn.id === 'chrome_bookmarks' ? (
                    <>
                      <input
                        list="chrome-folders-action-list"
                        className="input-base"
                        placeholder={field.default || ''}
                        value={configForm[field.key] || ''}
                        onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                      />
                      <datalist id="chrome-folders-action-list">
                        {bookmarkFolders.map(bf => (
                          <option key={bf.path} value={bf.path}>{bf.label}</option>
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      className="input-base"
                      placeholder={field.default || ''}
                      value={configForm[field.key] || ''}
                      onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setActionConfiguring(null)}>
                  Cancel
                </button>
                <button className="btn-save" onClick={saveActionConfig}>
                  💾 Save Action
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CATEGORY RULES MODAL */}
      {editingCategory && (
        <div className="modal-backdrop" onClick={() => setEditingCategory(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>✨ Semantic Rules: {editingCategory}</h3>
            <p style={{ color: '#8b949e', fontSize: '12px', marginBottom: '16px' }}>
              Define how the engine identifies files and links for this category.
            </p>
            
            <div className="config-field">
              <label>Semantic Prompt / Description</label>
              <small className="field-hint">Used by the ML engine to cluster meaning.</small>
              <textarea
                className="input-base"
                style={{ resize: 'vertical', minHeight: '60px', fontFamily: 'inherit' }}
                placeholder="e.g. Spreadsheets and PDFs relating to Q4 earnings, budgets, etc..."
                value={catRuleForm.prompt || ''}
                onChange={e => setCatRuleForm({...catRuleForm, prompt: e.target.value})}
              />
            </div>

            <div className="config-field">
              <label>Type</label>
              <select className="input-base" value={catRuleForm.mediaType || 'all'} onChange={e => setCatRuleForm({...catRuleForm, mediaType: e.target.value})}>
                <option value="all">Any (All formats)</option>
                <option value="text">Text (.txt, .md, .docx)</option>
                <option value="audio">Audio (.mp3, .wav)</option>
                <option value="image">Image (.png, .jpg, .webp)</option>
                <option value="video">Video (.mp4, .mkv)</option>
                <option value="data">Data (.csv, .xml, .json, .orc, .tsv, .hdf5)</option>
                <option value="links">Links (.html, urls)</option>
                <option value="other">Other (Unspecified)</option>
              </select>
            </div>

            <div className="config-field">
              <label>Depth</label>
              <select className="input-base" value={catRuleForm.scanDepth || 'medium'} onChange={e => setCatRuleForm({...catRuleForm, scanDepth: e.target.value})}>
                <option value="low">Low (Title and format string parsing)</option>
                <option value="medium">Medium (Metadata extraction)</option>
                <option value="high">High (Full-entry semantic parsing)</option>
              </select>
            </div>

            <div className="config-field">
              <label>Auto-Route Confidence Threshold: {catRuleForm.threshold || 90}%</label>
              <input 
                type="range" 
                min="50" max="100" 
                value={catRuleForm.threshold || 90} 
                onChange={e => setCatRuleForm({...catRuleForm, threshold: parseInt(e.target.value)})}
                style={{ width: '100%' }}
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingCategory(null)}>Cancel</button>
              <button className="btn-save" onClick={saveCategoryRules}>💾 Save Rules</button>
            </div>
          </div>
        </div>
      )}

      {/* FLOW BUILDER */}
      <h2 style={{ margin: '32px 0 16px 0' }}>
        <span style={{ background: 'linear-gradient(90deg, #3fb950, #58a6ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ⚡ Flows
        </span>
      </h2>
      <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '16px' }}>
        Define what happens when a link is classified into each category. Add multiple actions per category — they run in order.
      </p>

      <div className="flows-list">
        {categories.map(cat => (
          <div key={cat} className="flow-row">
            <div className="flow-category">
              <span className="flow-cat-label">When category =</span>
              {renamingCategory === cat ? (
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <input 
                    autoFocus
                    className="input-base" 
                    style={{ padding: '4px 8px', fontSize: '13px', minWidth: '120px', flex: 1 }}
                    value={renameForm}
                    onChange={e => setRenameForm(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitRename(cat);
                      if (e.key === 'Escape') setRenamingCategory(null);
                    }}
                  />
                  <button className="chip-delete" onClick={() => submitRename(cat)}>✅</button>
                  <button className="chip-delete" onClick={() => setRenamingCategory(null)}>❌</button>
                </div>
              ) : (
                <>
                  <strong style={{ display: 'block', wordBreak: 'break-word', paddingRight: '8px' }}>{cat}</strong>
                  <div className="flow-cat-actions">
                    <button 
                      className="chip-delete" 
                      title="Configure Semantic Rules"
                      onClick={() => {
                        setCatRuleForm(categoryRules[cat] || {});
                        setEditingCategory(cat);
                      }}
                    >
                      ⚙️
                    </button>
                    <button 
                      className="chip-delete" 
                      title="Rename Category"
                      onClick={() => {
                        setRenameForm(cat);
                        setRenamingCategory(cat);
                      }}
                    >
                      ✏️
                    </button>
                    <button 
                      className="chip-delete" 
                      style={{ color: '#ff7b72' }}
                      title="Delete Category"
                      onClick={() => deleteCategory(cat)}
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-actions">
              {(!routesByCategory[cat] || routesByCategory[cat].length === 0) && (
                <span className="no-actions">No actions (will use default)</span>
              )}
              {routesByCategory[cat] && routesByCategory[cat].map((route, idx) => {
                const info = getConnectorInfo(route.connector_id);
                return (
                  <div key={route.id} className="flow-action-chip">
                    <span>{info.icon} {info.name}</span>
                    <button className="chip-delete" title="Configure Action specific path" onClick={() => {
                      setConfigForm(route.connector_config || {});
                      setActionConfiguring({ category: cat, connectorId: route.connector_id, route });
                    }}>⚙️</button>
                    <button className="chip-delete" onClick={() => deleteRoute(route.id)}>×</button>
                  </div>
                );
              })}
              <button className="btn-add-action" onClick={() => setAddingRoute(addingRoute === cat ? null : cat)}>
                + Add
              </button>
              {addingRoute === cat && (
                <div className="action-picker">
                  {connectors.map(c => (
                    <button key={c.id} className="picker-option" onClick={() => {
                      setConfigForm({});
                      setActionConfiguring({ category: cat, connectorId: c.id, route: null });
                      setAddingRoute(null);
                    }}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                  {customActions.length > 0 && (
                    <>
                      <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--surface-border)', marginTop: '4px' }}>CUSTOM</div>
                      {customActions.map(ca => (
                        <button key={`ca_${ca.id}`} className="picker-option" onClick={() => {
                          setConfigForm({ _custom_action_id: ca.id });
                          setActionConfiguring({ category: cat, connectorId: `custom_${ca.id}`, route: null });
                          setAddingRoute(null);
                        }}>
                          {ca.icon || '⚡'} {ca.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* ADD NEW CATEGORY UI */}
        <div className="flow-row" style={{ border: '1px dashed rgba(88, 166, 255, 0.3)' }}>
          <div className="flow-category" style={{ display: 'flex', gap: '8px' }}>
             <input 
               type="text" 
               className="input-base" 
               placeholder="✨ New Category Name..." 
               value={newCategory}
               onChange={(e) => setNewCategory(e.target.value)}
               onKeyDown={(e) => { if(e.key === 'Enter') handleAddCategory() }}
               style={{ flex: 1 }}
             />
             <button className="btn btn-primary" onClick={handleAddCategory}>Add</button>
          </div>
        </div>

      </div>
    </div>
  );
}
