import React from 'react';
import { Loader2, AlertTriangle, Info } from 'lucide-react';

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Computing optimal pedestrian paths...' }) => (
  <div className="state-card loading-state">
    <Loader2 className="spinner-icon" />
    <p>{message}</p>
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="state-card error-state">
    <AlertTriangle className="error-icon" />
    <div>
      <h4>Navigation Notice</h4>
      <p>{message}</p>
    </div>
    {onRetry && (
      <button className="btn-retry" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

export const DataQualityNotice: React.FC<{
  title: string;
  message: string;
  variant?: 'info' | 'warning';
}> = ({ title, message, variant = 'info' }) => (
  <div className={`data-notice notice-${variant}`}>
    <Info className="notice-icon" />
    <div className="notice-content">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  </div>
);

