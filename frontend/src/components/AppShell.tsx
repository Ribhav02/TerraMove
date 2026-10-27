import React from 'react';
import { Compass, Leaf, ShieldCheck, AlertCircle } from 'lucide-react';
import type { HealthStatus } from '../types';

interface AppShellProps {
  health: HealthStatus | null;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ health, children }) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <div className="terramove-app">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">
            <Compass className="icon-logo" />
            <Leaf className="icon-leaf" />
          </div>
          <div>
            <h1 className="brand-title">TerraMove</h1>
            <p className="brand-subtitle">Smart & Sustainable Mobility — Pilot: Sector 17, Chandigarh</p>
          </div>
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

