import React, { useState, useEffect } from 'react';
import './logoSplash.css';

interface LogoSplashIntroProps {
  onComplete: () => void;
  duration?: number; // total duration in ms, default 3000ms
}

export const LogoSplashIntro: React.FC<LogoSplashIntroProps> = ({
  onComplete,
  duration = 3200,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [statusText, setStatusText] = useState('CONNECTING TO MOBILITY ENGINE...');

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / (duration - 600)) * 100));
      setProgress(pct);

      if (pct > 25 && pct <= 60) {
        setStatusText('MAPPING SECTOR 17 TOPOGRAPHY...');
      } else if (pct > 60 && pct <= 85) {
        setStatusText('CALIBRATING SOLAR SHADE CANOPY...');
      } else if (pct > 85) {
        setStatusText('DIGITAL TWIN SYNCHRONIZED • READY');
      }

      if (elapsed >= duration - 600) {
        setIsExiting(true);
      }

      if (elapsed >= duration) {
        clearInterval(interval);
        onComplete();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [duration, onComplete]);

  const handleSkip = () => {
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  return (
    <div className={`logo-splash-overlay ${isExiting ? 'splash-exiting' : ''}`}>
      {/* Background Cybernetic Grid & Ambient Fog */}
      <div className="splash-grid-bg" />
      <div className="splash-ambient-glow" />

      {/* Center Logo Showcase */}
      <div className="splash-center-content">
        {/* Holographic Glowing Ring Aura */}
        <div className="splash-halo-ring" />
        <div className="splash-halo-ring secondary" />

        {/* Official TerraMove Logo Image with 3D Arrow and Typography */}
        <div className="splash-logo-container">
          <img
            src="/terramove-logo.png"
            alt="TerraMove — Move Smarter. Live Cooler."
            className="splash-logo-image"
          />
          {/* Shimmer light sweep reflection */}
          <div className="splash-shimmer-sweep" />
        </div>

        {/* Telemetry Status Readout */}
        <div className="splash-telemetry-box">
          <div className="splash-status-text">
            <span className="splash-blinking-dot" />
            <span>{statusText}</span>
          </div>

          {/* Futuristic High-Tech Progress Bar */}
          <div className="splash-progress-track">
            <div
              className="splash-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="splash-progress-stats">
            <span>SECTOR 17 // CHANDIGARH</span>
            <span className="splash-pct-num">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Skip Button */}
      <button className="splash-skip-btn" onClick={handleSkip}>
        <span>Skip Intro</span>
        <span className="skip-arrow">→</span>
      </button>
    </div>
  );
};

export default LogoSplashIntro;
