import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';

export default function ActionLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/logs`);
      setLogs(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const recoverToZotero = async () => {
    setRecovering(true);
    setRecoveryResult(null);
    try {
      const { data } = await axios.post(`${API_BASE}/recover-to-zotero`);
      setRecoveryResult({ ok: true, msg: data.message });
    } catch (e) {
      setRecoveryResult({ ok: false, msg: e.response?.data?.error || e.message });
    } finally {
      setRecovering(false);
    }
  };

  const extractorSuccesses = logs.filter(
    l => l.connector === 'academic_extractor' && l.message === 'Success'
  ).length;

  if (loading && logs.length === 0) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Loading history...</div>;
  }

  return (
    <div>
      <h2 style={{ margin: '8px 0 6px 0' }}>📄 Action History</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
        A system-wide permanent record of all background executions and categorization flows.
      </p>

      {/* ── ZOTERO RECOVERY BANNER ─────────────────────────────────────────── */}
      {extractorSuccesses > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(16,185,129,0.06))',
          border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
              🎓 {extractorSuccesses} academic papers extracted from history
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>
              {recoveryResult
                ? (recoveryResult.ok ? `✅ ${recoveryResult.msg}` : `❌ ${recoveryResult.msg}`)
                : 'Send all extracted paper URLs directly to Zotero — no re-upload needed.'}
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap', minWidth: '175px' }}
            onClick={recoverToZotero}
            disabled={recovering || recoveryResult?.ok}
          >
            {recovering ? '⏳ Sending...' : recoveryResult?.ok ? '✅ Done' : '📚 Recover to Zotero'}
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="empty-state">No actions have been logged yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="links-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Title / URL</th>
                <th>Category</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isSkipped = log.message?.includes('Skipped');
                const isError   = log.message?.includes('Error') || log.message?.includes('Fail');
                const isSuccess = log.message === 'Success';
                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(log.timestamp * 1000).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{log.entity_title || 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                        {log.entity_url}
                      </div>
                    </td>
                    <td><span className="pill pill-category">{log.category}</span></td>
                    <td>
                      <span className="pill" style={{ background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>
                        {log.connector}
                      </span>
                    </td>
                    <td style={{
                      color: isSuccess ? '#3fb950' : isError ? '#ff7b72' : isSkipped ? 'var(--text-secondary)' : 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}>
                      {log.message}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
