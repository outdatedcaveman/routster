import React, { useState, useEffect, useRef } from 'react';
import './CategorySelect.css';

/**
 * Fully custom dropdown replacing native <select> for full styling control.
 * Native <option> elements ignore CSS on Windows/Electron — this solves it.
 */
export default function CategorySelect({ value, options, onChange, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt) => {
    onChange(opt);
    setOpen(false);
  };

  const displayLabel = value || placeholder || 'Select...';

  return (
    <div className={`cselect-wrapper ${className || ''}`} ref={ref}>
      <button
        type="button"
        className={`cselect-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cselect-label">{displayLabel}</span>
        <span className="cselect-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className="cselect-list" role="listbox">
          {options.map(opt => (
            <li
              key={opt.value}
              className={`cselect-option ${opt.value === value ? 'selected' : ''}`}
              role="option"
              aria-selected={opt.value === value}
              onMouseDown={() => handleSelect(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
