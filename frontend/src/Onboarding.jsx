import React, { useState } from 'react';
import axios from 'axios';
import './FlowBuilder.css'; // Reuse some aesthetics

const API_BASE = 'http://localhost:4000/api';

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [initialCategories, setInitialCategories] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    setLoading(true);
    try {
      // Parse initial categories
      const cats = initialCategories.split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
      if (cats.length > 0) {
        await axios.post(`${API_BASE}/categories`, { categories: cats });
      }

      await axios.post(`${API_BASE}/app-state`, { onboarding_complete: true });
      onComplete(); // Notify App.jsx
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {step === 1 && (
          <div className="onboarding-step fade-in">
            <h1>Welcome to Routster 🚀</h1>
            <p>Your universal, local-first automation engine.</p>
            <div className="onboarding-features">
              <div className="feat-box">
                <span className="feat-icon">🌐</span>
                <h3>Universal Ingestion</h3>
                <p>Drop Links, Text Notes, DOIs, and Files into your Inbox.</p>
              </div>
              <div className="feat-box">
                <span className="feat-icon">🧠</span>
                <h3>Categorization Engine</h3>
                <p>Automatically sorts inputs based on your own custom ontology.</p>
              </div>
              <div className="feat-box">
                <span className="feat-icon">⚙️</span>
                <h3>Smart Actions (Flows)</h3>
                <p>Send organized data to Notion, Zotero, or structure it automatically on your local hard drive.</p>
              </div>
            </div>
            <button className="btn-save btn-block mt-16" onClick={() => setStep(2)}>
              Get Started →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step fade-in">
            <h2>Define Your First Categories 🗂️</h2>
            <p>Routster doesn't assume anything. Start by telling it what types of inputs you want to track.</p>
            <p className="field-hint mb-16">Enter comma-separated names, e.g. "Work Invoices, Research Papers, Cool Apps, Read Later"</p>
            
            <textarea 
              className="input-base" 
              rows="4" 
              placeholder="Invoices, Recipes, Reading List..."
              value={initialCategories}
              onChange={(e) => setInitialCategories(e.target.value)}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            />
            
            <div className="modal-actions mt-16">
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-save" onClick={handleFinish} disabled={loading}>
                {loading ? 'Booting Engine...' : 'Launch Routster 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
