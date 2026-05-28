import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' }, { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' }, { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
  { code: 'ru', name: 'Русский' }, { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' }, { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' }, { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' }, { code: 'vi', name: 'Tiếng Việt' }
];

export default function Settings({ darkMode, setDarkMode }) {
  const [settings, setSettings] = useState(null);
  const [activeSection, setActiveSection] = useState('general');
  const [toast, setToast] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/all-settings`);
      setSettings(data);
    } catch (e) { console.error(e); }
  };

  const updateSetting = async (section, key, value) => {
    try {
      await axios.patch(`${API_BASE}/all-settings`, { section, key, value });
      setSettings(prev => ({
        ...prev,
        [section]: { ...prev[section], [key]: value }
      }));
      showToast(`Updated: ${key}`);
    } catch (e) { showToast('Error saving setting'); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleExportDB = () => {
    window.open(`${API_BASE}/export-db`, '_blank');
    showToast('Database exported!');
  };

  const handleClearData = async (target) => {
    try {
      await axios.post(`${API_BASE}/clear-data`, { target });
      setConfirmAction(null);
      fetchSettings();
      showToast(`Cleared: ${target}`);
    } catch (e) { showToast('Error clearing data'); }
  };

  if (!settings) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading settings...</div>;

  const sections = [
    { id: 'general', icon: '🎛️', label: 'General' },
    { id: 'classifier', icon: '🧠', label: 'Classifier' },
    { id: 'api', icon: '🔌', label: 'API & Webhooks' },
    { id: 'triggers', icon: '⏱️', label: 'Triggers' },
    { id: 'data', icon: '💾', label: 'Data & Storage' },
    { id: 'advanced', icon: '🔧', label: 'Advanced' },
    { id: 'about', icon: 'ℹ️', label: 'About' }
  ];

  const SettingRow = ({ label, hint, children }) => (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>{label}</label>
      {hint && <small style={{ display: 'block', color: 'var(--text-hint)', fontSize: '12px', marginBottom: '6px' }}>{hint}</small>}
      {children}
    </div>
  );

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
        background: value ? 'var(--accent-green)' : 'var(--surface-border)',
        position: 'relative', transition: 'background 0.2s'
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: value ? '25px' : '3px',
        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: '24px', minHeight: '500px' }}>
      {/* Sidebar */}
      <div style={{
        width: '200px', flexShrink: 0,
        background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '8px'
      }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeSection === s.id ? 'var(--bg-hover)' : 'transparent',
              color: activeSection === s.id ? 'var(--accent-main)' : 'var(--text-secondary)',
              fontWeight: activeSection === s.id ? 600 : 400, fontSize: '14px',
              textAlign: 'left', transition: 'all 0.15s'
            }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* GENERAL */}
        {activeSection === 'general' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>🎛️ General Settings</h2>
            <SettingRow label="Language" hint="Interface language for Routster">
              <select
                className="input-base"
                value={settings.general.language}
                onChange={e => updateSetting('general', 'language', e.target.value)}
                style={{ width: '280px' }}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </SettingRow>
            <SettingRow label="Theme" hint="Choose light (beige/orange) or dark (forest green)">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button className={`btn ${!darkMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDarkMode(false); updateSetting('general', 'theme', 'light'); }} style={{ fontSize: '13px', padding: '8px 16px' }}>☀️ Light</button>
                <button className={`btn ${darkMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDarkMode(true); updateSetting('general', 'theme', 'dark'); }} style={{ fontSize: '13px', padding: '8px 16px' }}>🌙 Dark</button>
              </div>
            </SettingRow>
            <SettingRow label="Default Category" hint="Fallback category when classifier has no match">
              <input
                className="input-base"
                value={settings.general.defaultCategory}
                onChange={e => updateSetting('general', 'defaultCategory', e.target.value)}
                style={{ width: '280px' }}
              />
            </SettingRow>
          </div>
        )}

        {/* CLASSIFIER */}
        {activeSection === 'classifier' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>🧠 Classifier Engine</h2>
            <SettingRow label="Confidence Threshold" hint={`NLP score threshold (0-100). Current: ${settings.classifier.confidenceThreshold}. Lower = more aggressive matching.`}>
              <input
                type="range" min="0" max="100"
                value={settings.classifier.confidenceThreshold}
                onChange={e => updateSetting('classifier', 'confidenceThreshold', parseInt(e.target.value))}
                style={{ width: '280px' }}
              />
              <span style={{ marginLeft: '12px', fontWeight: 600, color: 'var(--accent-main)' }}>{settings.classifier.confidenceThreshold}%</span>
            </SettingRow>
            <SettingRow label="Fallback Behavior" hint="What happens when no category matches with enough confidence">
              <select
                className="input-base"
                value={settings.classifier.fallbackBehavior}
                onChange={e => updateSetting('classifier', 'fallbackBehavior', e.target.value)}
                style={{ width: '280px' }}
              >
                <option value="uncategorized">Mark as "Uncategorized"</option>
                <option value="first">Assign to first eligible category</option>
                <option value="ask">Ask user (manual review)</option>
              </select>
            </SettingRow>
            <SettingRow label="Filename Keyword Hints" hint="Extract category hints from filenames (e.g. 'Recording' → Audio)">
              <Toggle value={settings.classifier.enableFilenameHints} onChange={v => updateSetting('classifier', 'enableFilenameHints', v)} />
            </SettingRow>
            <SettingRow label="Adaptive Learning" hint="Learn from your manual corrections to improve future classifications">
              <Toggle value={settings.classifier.enableAdaptiveLearning} onChange={v => updateSetting('classifier', 'enableAdaptiveLearning', v)} />
            </SettingRow>
          </div>
        )}

        {/* API & WEBHOOKS */}
        {activeSection === 'api' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>🔌 API & Webhooks</h2>
            <SettingRow label="Webhook Endpoint" hint="Use this URL to send data into Routster from external apps, iOS Shortcuts, Python scripts, etc.">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input className="input-base" value={settings.api.webhookUrl} readOnly style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }} />
                <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '8px 12px' }}
                  onClick={() => { navigator.clipboard.writeText(settings.api.webhookUrl); showToast('Copied!'); }}
                >📋 Copy</button>
              </div>
            </SettingRow>
            <SettingRow label="API Secret Token" hint="Protect your endpoint. External callers must include this as 'secret' in the JSON body.">
              <input
                type="password"
                className="input-base"
                value={settings.api.apiSecret}
                placeholder="Leave empty for no auth"
                onChange={e => updateSetting('api', 'apiSecret', e.target.value)}
                style={{ width: '350px' }}
              />
            </SettingRow>
            <SettingRow label="Allowed CORS Origins" hint="Comma-separated list. Use * for any origin.">
              <input
                className="input-base"
                value={settings.api.allowedOrigins}
                onChange={e => updateSetting('api', 'allowedOrigins', e.target.value)}
                style={{ width: '350px' }}
              />
            </SettingRow>
            <SettingRow label="Auto-classify Webhook Items" hint="Run the NLP classifier on every item received via the webhook">
              <Toggle value={settings.api.autoClassifyWebhook} onChange={v => updateSetting('api', 'autoClassifyWebhook', v)} />
            </SettingRow>
            <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>📖 Quick API Usage:</strong>
              <pre style={{ marginTop: '8px', padding: '12px', background: 'var(--surface-bg)', borderRadius: '8px', overflow: 'auto', fontSize: '12px', color: 'var(--text-primary)', border: '1px solid var(--surface-border)' }}>
{`curl -X POST ${settings.api.webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","title":"My Link"${settings.api.apiSecret ? ',"secret":"YOUR_SECRET"' : ''}}'`}
              </pre>
            </div>
          </div>
        )}

        {/* TRIGGERS */}
        {activeSection === 'triggers' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>⏱️ Automation Triggers</h2>
            <SettingRow label="Polling Interval (seconds)" hint="How often trigger plugins check for new data (RSS, email, etc.)">
              <input
                type="number"
                className="input-base"
                value={settings.triggers.pollingInterval}
                onChange={e => updateSetting('triggers', 'pollingInterval', parseInt(e.target.value))}
                style={{ width: '160px' }}
                min="30" max="3600"
              />
            </SettingRow>
            <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>💡 Creating Custom Triggers</strong>
              <p style={{ marginTop: '8px' }}>Drop <code>.js</code> files into the <code>/triggers</code> folder. Each plugin must export a <code>poll()</code> function returning an array of items. They are auto-loaded on startup.</p>
            </div>
          </div>
        )}

        {/* DATA & STORAGE */}
        {activeSection === 'data' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>💾 Data & Storage</h2>
            <SettingRow label="Database Location" hint="SQLite database file path">
              <input className="input-base" value={settings.data.dbPath} readOnly style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }} />
            </SettingRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', margin: '20px 0' }}>
              <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-main)' }}>{settings.data.totalLinks}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Items in Inbox</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-main)' }}>{settings.data.totalRoutes}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active Routes</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-main)' }}>{settings.data.learnedRules}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Learned Rules</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleExportDB} style={{ fontSize: '13px' }}>📦 Export Database</button>
              <button className="btn btn-secondary" style={{ fontSize: '13px', color: 'var(--accent-red)' }}
                onClick={() => setConfirmAction('links')}>🗑️ Clear All Links</button>
              <button className="btn btn-secondary" style={{ fontSize: '13px', color: 'var(--accent-red)' }}
                onClick={() => setConfirmAction('learned_rules')}>🧹 Reset Learned Rules</button>
              <button className="btn btn-secondary" style={{ fontSize: '13px', color: 'var(--accent-red)' }}
                onClick={() => setConfirmAction('routes')}>⚠️ Clear All Routes</button>
            </div>
            {confirmAction && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--accent-red)', fontWeight: 600, margin: 0 }}>⚠️ Are you sure you want to clear "{confirmAction}"? This cannot be undone. Export first!</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button className="btn" style={{ background: 'var(--accent-red)', color: 'white', fontSize: '13px' }}
                    onClick={() => handleClearData(confirmAction)}>Yes, clear it</button>
                  <button className="btn btn-secondary" style={{ fontSize: '13px' }}
                    onClick={() => setConfirmAction(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADVANCED */}
        {activeSection === 'advanced' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>🔧 Advanced</h2>
            <SettingRow label="Server Port" hint="The local Express server port. Requires restart to apply.">
              <input className="input-base" value={settings.general.serverPort} readOnly style={{ width: '120px' }} />
              <small style={{ marginLeft: '8px', color: 'var(--text-hint)' }}>(edit in package.json or .env)</small>
            </SettingRow>
            <SettingRow label="Trigger Plugin Directory" hint="Path where .js trigger plugins are auto-loaded from">
              <input className="input-base" value="./triggers/" readOnly style={{ width: '280px', fontFamily: 'monospace' }} />
            </SettingRow>
            <SettingRow label="Connector Plugin Directory" hint="Path where connector modules are registered">
              <input className="input-base" value="./connectors/" readOnly style={{ width: '280px', fontFamily: 'monospace' }} />
            </SettingRow>
            <SettingRow label="Reset Onboarding" hint="Show the welcome screen again on next launch">
              <button className="btn btn-secondary" style={{ fontSize: '13px' }}
                onClick={async () => { await axios.post(`${API_BASE}/app-state`, { onboarding_complete: false }); showToast('Onboarding will show on next launch'); }}>
                🔄 Reset Onboarding
              </button>
            </SettingRow>
          </div>
        )}

        {/* ABOUT */}
        {activeSection === 'about' && (
          <div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>ℹ️ About Routster</h2>
            <div style={{ padding: '24px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-main), var(--accent-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 8px 0' }}>Routster</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 16px 0' }}>Universal, local-first automation engine for knowledge management</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>Version:</strong> {settings.general.version}</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>License:</strong> MIT</span>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <a href="https://github.com/outdatedcaveman/routster" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '13px', textDecoration: 'none' }}>⭐ GitHub</a>
                <a href="https://github.com/outdatedcaveman/routster/issues" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '13px', textDecoration: 'none' }}>🐛 Report Issue</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast">✅ {toast}</div>}
    </div>
  );
}
