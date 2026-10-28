import React, { useState, useEffect } from 'react';

/* ============================================================
   CinematicNavigation — Premium dark nav with glassmorphism
   ============================================================ */

interface CinematicNavigationProps {
  onNavigate: (section: string) => void;
  currentSection: string;
}

export const CinematicNavigation: React.FC<CinematicNavigationProps> = ({
  onNavigate,
  currentSection
}) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: '3d-city', label: '3D City' },
    { id: 'climate', label: 'Climate & Mobility' },
    { id: 'dashboard', label: 'Live Map' },
    { id: 'planning', label: 'Urban Planning' },
  ];

  return (
    <nav className={`cinematic-nav ${isScrolled ? 'nav-scrolled' : ''}`}>
      <a
        className="nav-brand"
        href="#"
        onClick={(e) => { e.preventDefault(); onNavigate('hero'); }}
      >
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
      </a>

      <ul className="nav-links">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`nav-link ${currentSection === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
        <li>
          <button
            className="nav-cta"
            onClick={() => onNavigate('dashboard')}
          >
            Explore Sector 17
          </button>
        </li>
      </ul>

      <button
        className="nav-menu-toggle"
        onClick={() => onNavigate('dashboard')}
        aria-label="Menu"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
    </nav>
  );
};

export default CinematicNavigation;
