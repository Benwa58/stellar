import React from 'react';

const CONFIG = {
  high: { label: 'High Confidence', className: 'confidence-high', icon: '✓' },
  medium: { label: 'Medium — Please Verify', className: 'confidence-medium', icon: '~' },
  low: { label: 'Low — Needs Review', className: 'confidence-low', icon: '!' },
  none: { label: 'Not Extracted', className: 'confidence-none', icon: '?' },
};

export default function ConfidenceBadge({ confidence }) {
  const cfg = CONFIG[confidence] || CONFIG.none;
  return (
    <span className={`confidence-badge ${cfg.className}`} title={cfg.label}>
      <span className="confidence-icon">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
