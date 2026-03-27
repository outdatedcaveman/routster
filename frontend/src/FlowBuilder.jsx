import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';

const CATEGORIES = [
  'Article/PDF', 'Book', 'Scientific News/Press Release',
  'Instapaper/Read Later', 'Shopping', 'Tool/App/Service',
  'Event/Theater', 'Job Listing'
];

export default function FlowBuilder() {
  const [connectors, setConnectors] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [configuring, setConfiguring] = useState(null); // connector being configured
  const [configForm, setConfigForm] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [addingRoute, setAddingRoute] = useState(null); // category being assigned a new route

  const fetchData = async () => {
    try {
      const [cRes, rRes] = await Promise.all([
        axios.get(`${API_BASE}/connectors`),
        axios.get(`${API_BASE}/routes`)
      ]);
      setConnectors(cRes.data);
      setRoutes(rRes.data);
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

  const addRoute = async (category, connectorId) => {
    const existingCount = routes.filter(r => r.category === category).length;
    await axios.post(`${API_BASE}/routes`, {
      category,
      connector_id: connectorId,
      action_order: existingCount
    });
    setAddingRoute(null);
    fetchData();
  };

  const deleteRoute = async (id) => {
    await axios.delete(`${API_BASE}/routes/${id}`);
    fetchData();
  };

  // Group routes by category
  const routesByCategory = {};
  CATEGORIES.forEach(c => { routesByCategory[c] = []; });
  routes.forEach(r => {
    if (!routesByCategory[r.category]) routesByCategory[r.category] = [];
    routesByCategory[r.category].push(r);
  });

  const getConnectorInfo = (id) => connectors.find(c => c.id === id) || { name: id, icon: '🔌' };

  return (
    <div className="flows-container">
      {/* CONNECTORS GRID */}
      <h2 style={{ margin: '0 0 16px 0' }}>
        <span style={{ background: 'linear-gradient(90deg, #58a6ff, #bc8cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          🔌 Connectors
        </span>
      </h2>
      <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '16px' }}>
        Configure your service credentials. Each connector can be used in multiple flows below.
      </p>
      <div className="connectors-grid">
        {connectors.map(c => (
          <div key={c.id} className={`connector-card ${c.configured ? 'configured' : ''}`}>
            <div className="connector-header">
              <span className="connector-icon">{c.icon}</span>
              <span className="connector-name">{c.name}</span>
              {c.configured && <span className="badge-ok">✓</span>}
            </div>
            <p className="connector-desc">{c.description}</p>
            <button className="btn-sm" onClick={() => {
              setConfiguring(c.id);
              setConfigForm({});
              setTestResult(null);
            }}>
              {c.configured ? '⚙️ Reconfigure' : '🔧 Set up'}
            </button>
          </div>
        ))}
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
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    className="input-base"
                    placeholder={field.default || ''}
                    value={configForm[field.key] || ''}
                    onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                  />
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
        {CATEGORIES.map(cat => (
          <div key={cat} className="flow-row">
            <div className="flow-category">
              <span className="flow-cat-label">When category =</span>
              <strong>{cat}</strong>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-actions">
              {routesByCategory[cat].length === 0 && (
                <span className="no-actions">No actions (will use default)</span>
              )}
              {routesByCategory[cat].map((route, idx) => {
                const info = getConnectorInfo(route.connector_id);
                return (
                  <div key={route.id} className="flow-action-chip">
                    <span>{info.icon} {info.name}</span>
                    <button className="chip-delete" onClick={() => deleteRoute(route.id)}>×</button>
                  </div>
                );
              })}
              <button className="btn-add-action" onClick={() => setAddingRoute(addingRoute === cat ? null : cat)}>
                + Add
              </button>
              {addingRoute === cat && (
                <div className="action-picker">
                  {connectors.filter(c => c.configured).map(c => (
                    <button key={c.id} className="picker-option" onClick={() => addRoute(cat, c.id)}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                  {connectors.filter(c => c.configured).length === 0 && (
                    <p style={{ color: '#8b949e', fontSize: '12px', padding: '8px' }}>
                      Configure a connector above first!
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
