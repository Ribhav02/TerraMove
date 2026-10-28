import React from 'react';
import { ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import type { HealthStatus } from '../types';

interface AppShellProps {
  health: HealthStatus | null;
  children: React.ReactNode;
  onBackToLanding?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ health, children, onBackToLanding }) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <div className="terramove-app">
      <header className="app-header">
        <div className="header-brand">
          {onBackToLanding && (
            <button
              className="back-to-landing-btn"
              onClick={onBackToLanding}
              title="Back to TerraMove Home"
              style={{
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid rgba(0, 255, 136, 0.4)',
                borderRadius: '8px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#00ff88',
                cursor: 'pointer',
                marginRight: '12px',
                transition: 'all 0.2s ease',
                boxShadow: '0 0 12px rgba(0, 255, 136, 0.15)',
              }}
            >
              <ArrowLeft style={{ width: '14px', height: '14px' }} />
              <span>← Landing</span>
            </button>
          )}
          <img
            src="/terramove-logo.png"
            alt="TerraMove"
            style={{
              height: '48px',
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 10px rgba(0, 0, 0, 0.5))',
            }}
          />
        </div>

        <div className="header-badges">
          <div className="pilot-badge">
            <span className="pilot-dot"></span>
            <span>Pilot Area: <strong>Sector 17, Chandigarh</strong></span>
          </div>

          <div className={`status-badge ${isHealthy ? 'status-ok' : 'status-warn'}`}>
            {isHealthy ? (
              <>
                <ShieldCheck className="status-icon" />
                <span>Engine Active (v{health?.version || '1.0'})</span>
              </>
            ) : (
              <>
                <AlertCircle className="status-icon" />
                <span>Connecting to Engine...</span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
};
