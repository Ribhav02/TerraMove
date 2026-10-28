import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sun, CheckCircle2 } from 'lucide-react';
import type { RouteAlternative } from '../../types';
import { RouteVoiceGuidance } from '../voice-assistant/RouteVoiceGuidance';

interface RouteComparisonCardProps {
  route: RouteAlternative;
  isSelected: boolean;
  onSelect: () => void;
}

export const RouteComparisonCard: React.FC<RouteComparisonCardProps> = ({
  route,
  isSelected,
  onSelect
}) => {
  const [showSteps, setShowSteps] = useState(false);

  const getPreferenceTitle = (pref: string) => {
    switch (pref.toLowerCase()) {
      case 'accessible':
        return { label: 'Accessible Route', badge: 'Step-Free & Paved Focus', color: '#8b5cf6' };
      case 'shadiest':
        return { label: 'Shadiest Route', badge: 'Max Thermal Relief', color: '#059669' };
      case 'balanced':
        return { label: 'Balanced Route', badge: 'Optimal Time & Shade', color: '#0284c7' };
      case 'fastest':
      default:
        return { label: 'Fastest Route', badge: 'Direct Corridor', color: '#6366f1' };
    }
  };

  const prefInfo = getPreferenceTitle(route.preference);

  return (
    <div
      className={`route-card ${isSelected ? 'route-card-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="route-card-header">
        <div>
          <div className="route-title-row">
            <h4 style={{ color: prefInfo.color }}>{prefInfo.label}</h4>
            <span className="route-badge-pill" style={{ backgroundColor: `${prefInfo.color}15`, color: prefInfo.color }}>
              {prefInfo.badge}
            </span>
          </div>
          <span className="metric-used-text">{route.metric_used}</span>
        </div>
        {isSelected && <CheckCircle2 className="selected-icon" style={{ color: prefInfo.color }} />}
      </div>

      <div className="route-stats-grid">
        <div className="stat-item">
          <span className="stat-label">Distance</span>
          <span className="stat-value">{route.distance_m} m</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{route.duration_minutes} min</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">Shade Score</span>
          <div className="score-with-bar">
            <span className="stat-value shade-color">{route.shade_score}/100</span>
            <div className="mini-progress-bg">
              <div
                className="mini-progress-fill shade-fill"
                style={{ width: `${Math.max(5, route.shade_score)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="stat-item">
          <span className="stat-label">Heat Strain</span>
          <div className="score-with-bar">
            <span className="stat-value" style={{ color: route.heat_color }}>
              {route.heat_score}/100 ({route.heat_category})
            </span>
            <div className="mini-progress-bg">
              <div
                className="mini-progress-fill"
                style={{
                  width: `${Math.max(5, route.heat_score)}%`,
                  backgroundColor: route.heat_color
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="route-advisory">
        <Sun className="advisory-icon" style={{ color: route.heat_color }} />
        <p>{route.advisory}</p>
      </div>

      {route.accessibility_score !== undefined && (
        <div style={{ marginTop: '8px', padding: '6px 10px', background: '#091018', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(148, 163, 184, 0.18)', color: '#f8fafc' }}>
          <span>♿ Accessibility: <strong style={{ color: '#00ff88' }}>{route.accessibility_score}/100</strong> ({route.step_free ? 'Step-Free' : 'Contains Steps'})</span>
          <span>Paved: <strong style={{ color: '#38bdf8' }}>{route.paved_percentage}%</strong></span>
        </div>
      )}
      {route.accessibility_notes && route.accessibility_notes.length > 0 && isSelected && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '4px' }}>
          {route.accessibility_notes[0]}
        </div>
      )}

      {isSelected && (
        <div onClick={(e) => e.stopPropagation()}>
          <RouteVoiceGuidance route={route} />
        </div>
      )}

      <div className="route-actions">
        <button
          type="button"
          className="btn-toggle-steps"
          onClick={(e) => {
            e.stopPropagation();
            setShowSteps(!showSteps);
          }}
        >
          <span>{showSteps ? 'Hide Path Steps' : `View Steps (${route.steps.length})`}</span>
          {showSteps ? <ChevronUp className="action-icon" /> : <ChevronDown className="action-icon" />}
        </button>
      </div>

      {showSteps && (
        <div className="route-steps-container">
          <ol className="steps-list">
            {route.steps.map((st, idx) => (
              <li key={idx} className="step-item">
                <span className="step-inst">{st.instruction}</span>
                <span className="step-meta">
                  {st.distance_m}m · ~{Math.round(st.duration_sec)}s · Shade: {st.shade_score}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
