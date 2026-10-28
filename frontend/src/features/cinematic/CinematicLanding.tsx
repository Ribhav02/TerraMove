import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { CinematicNavigation } from './CinematicNavigation';
import '../../styles/cinematic.css';

// Lazy load the 3D scene
const CityScene = lazy(() => import('./CityScene'));

/* ============================================================
   WebGL Fallback
   ============================================================ */

const WebGLFallback: React.FC = () => (
  <div className="webgl-fallback">
    <div className="webgl-fallback-inner">
      <div className="webgl-fallback-title">TerraMove Digital Twin</div>
      <div className="webgl-fallback-desc">
        3D city visualization requires WebGL. Your browser or device may not support hardware acceleration.
        Navigate directly to the Live Mobility Map for full functionality.
      </div>
    </div>
  </div>
);

/* ============================================================
   SCROLL STORY SCENE DEFINITIONS
   ============================================================ */

interface StoryScene {
  id: string;
  label: string;
  headline: string;
  description: string;
  stats?: { value: string; label: string }[];
  routes?: { color: string; label: string }[];
  highlights?: string[];
}

const STORY_SCENES: StoryScene[] = [
  {
    id: 'discover',
    label: 'DISCOVER SECTOR 17',
    headline: 'Every journey starts\nwith precision context.',
    description: 'Sector 17 — Chandigarh\'s commercial heart and Le Corbusier\'s pedestrian masterwork. Spanning 240,000 m² of vehicle-free plazas, sheltered brutalist colonnades, and connected shopping promenades, TerraMove indexes every walkable link for maximum comfort.',
    stats: [
      { value: '240K m²', label: 'Pedestrian precinct' },
      { value: '100%', label: 'Vehicle-free core' },
      { value: '42+', label: 'Connected plazas' },
      { value: '1.8 km', label: 'Continuous colonnades' },
    ],
    highlights: [
      'Corbusian sheltered colonnades mapped for all-weather sun & rain protection',
      'High-precision 3D building geometry, canopy density & pedestrian footways',
      'Seamless multi-access transit connectivity from outer ring roads to plaza core',
    ],
  },
  {
    id: 'route',
    label: 'INTELLIGENT ROUTING',
    headline: 'Your route.\nReimagined in real time.',
    description: 'Not all routes are equal under the intense midday sun. TerraMove computes real-time solar azimuth, canopy shadows, and pavement albedo to generate three distinct options tailored to your schedule and comfort.',
    routes: [
      { color: '#00ff88', label: 'Shadiest Route — Up to 78% tree & colonnade cover' },
      { color: '#38bdf8', label: 'Fastest Route — Direct path for minimal transit time' },
      { color: '#c4f56b', label: 'Balanced Route — Optimal harmony of speed and shade' },
    ],
    stats: [
      { value: '< 120 ms', label: 'Graph computation' },
      { value: '78%', label: 'Max shade coverage' },
      { value: '3', label: 'Dynamic alternatives' },
      { value: '5.4 km', label: 'Indexed footpaths' },
    ],
    highlights: [
      'Live solar position calculations projecting shadows from buildings and trees',
      'Turn-by-turn guidance with voice assistance and elevation effort profiling',
    ],
  },
  {
    id: 'climate',
    label: 'CLIMATE INTELLIGENCE',
    headline: 'Cities feel different\nunder the summer sun.',
    description: 'Direct solar radiation elevates effective temperature by 8–12°C on exposed asphalt streets (reaching 44°C+ in summer peaks). TerraMove continuously models thermal comfort and microclimate zones so you avoid heat exhaustion.',
    stats: [
      { value: '12°C', label: 'Perceived temp drop' },
      { value: '44°C vs 32°C', label: 'Asphalt vs Shaded' },
      { value: '14 Nodes', label: 'Microclimate sensors' },
      { value: '-35%', label: 'Thermal stress reduction' },
    ],
    highlights: [
      'UTCI (Universal Thermal Climate Index) bio-meteorological comfort modeling',
      'Tree canopy LiDAR vegetation density and albedo reflectance indexing',
      'Heat Island warning overlays highlighting danger corridors to avoid',
    ],
  },
  {
    id: 'inclusive',
    label: 'INCLUSIVE MOBILITY',
    headline: 'Universal access.\nEngineered for everyone.',
    description: 'Urban mobility must empower elderly citizens, wheelchair users, and parents with strollers. TerraMove classifies every path by surface smoothness, step-free access, tactile paving, and active construction obstacles.',
    stats: [
      { value: '100%', label: 'Step-free routing' },
      { value: '16', label: 'Tactile paving corridors' },
      { value: '32', label: 'Verified curb ramps' },
      { value: '0', label: 'Stair surprises' },
    ],
    highlights: [
      'Wheelchair priority routing avoiding steep curbs, uneven pavers, and stairs',
      'Tactile paving networks for visually impaired pedestrians with audio cues',
      'Crowdsourced community obstacle reporting with instant verification badges',
    ],
  },
  {
    id: 'parking',
    label: 'SMART PARKING TELEMETRY',
    headline: 'First-to-last mile.\nSeamless transitions.',
    description: 'Your pedestrian experience begins the second you arrive at Sector 17\'s perimeter. TerraMove tracks 8 multi-level and surface parking facilities, displaying real-time bay occupancy and shaded walking routes straight to your destination.',
    stats: [
      { value: '8', label: 'Facilities mapped' },
      { value: '1,850+', label: 'Tracked parking bays' },
      { value: '~3 min', label: 'Average walk to plaza' },
      { value: '92%', label: 'Telemetry accuracy' },
    ],
    highlights: [
      'Sahib Singh, Neelam, and Bank Square multi-level live occupancy tracking',
      'Integrated EV charging stations and priority accessible parking stalls',
      'One-tap walking route guidance from parked vehicle to any Sector 17 shop',
    ],
  },
  {
    id: 'planner',
    label: 'URBAN COMMAND CENTER',
    headline: 'Empowering city planners\nwith live digital twin data.',
    description: 'Municipal authorities and urban planners can analyze district-wide pedestrian desire lines, shade deficits, and thermal vulnerability hotspots to guide targeted tree planting and sustainable infrastructure investments.',
    stats: [
      { value: '15,000+', label: 'Daily journeys modeled' },
      { value: '12', label: 'Priority shade corridors' },
      { value: '28%', label: 'Simulated heat reduction' },
      { value: 'GeoJSON', label: 'Open municipal export' },
    ],
    highlights: [
      'Pedestrian flow density simulations and pedestrian bottleneck detection',
      'Scenario sandbox: simulate shade sail and tree planting cooling impacts',
      'Direct feedback loops between community mobility reports and civic works',
    ],
  },
];

/* ============================================================
   CinematicLanding — Optimized Single-Canvas Scroll Experience
   ============================================================ */

interface CinematicLandingProps {
  onEnterDashboard: () => void;
}

export const CinematicLanding: React.FC<CinematicLandingProps> = ({ onEnterDashboard }) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [currentSection, setCurrentSection] = useState('overview');
  const [activeMode, setActiveMode] = useState<'all' | 'circuit' | 'thermal'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Check WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      setWebglAvailable(!!gl);
    } catch {
      setWebglAvailable(false);
    }
  }, []);

  // High performance rAF scroll tracking (prevents lag & eliminates frame drops)
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!containerRef.current) {
            ticking = false;
            return;
          }
          const container = containerRef.current;
          const scrollTop = window.scrollY;
          const scrollHeight = container.scrollHeight - window.innerHeight;
          const progress = Math.min(1, Math.max(0, scrollTop / Math.max(scrollHeight, 1)));

          setScrollProgress(progress);

          // Update navigation active section
          if (progress < 0.08) setCurrentSection('overview');
          else if (progress < 0.3) setCurrentSection('3d-city');
          else if (progress < 0.58) setCurrentSection('climate');
          else if (progress < 0.85) setCurrentSection('planning');
          else setCurrentSection('dashboard');

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavigate = useCallback((section: string) => {
    if (section === 'dashboard' || section === 'live-map') {
      onEnterDashboard();
      return;
    }
    if (section === 'hero' || section === 'overview') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const sectionMap: Record<string, number> = {
      '3d-city': 0.16,
      'climate': 0.40,
      'planning': 0.75,
    };

    const target = sectionMap[section];
    if (target !== undefined && containerRef.current) {
      const scrollHeight = containerRef.current.scrollHeight - window.innerHeight;
      window.scrollTo({ top: target * scrollHeight, behavior: 'smooth' });
    }
  }, [onEnterDashboard]);

  return (
    <div ref={containerRef} className="scroll-story-container">
      {/* 1. Global Navigation Bar */}
      <CinematicNavigation
        onNavigate={handleNavigate}
        currentSection={currentSection}
      />

      {/* 2. SINGLE Fixed 3D Digital Twin Viewport (Zero-Lag, 60 FPS) */}
      <div className="fixed-3d-background">
        {webglAvailable ? (
          <Suspense fallback={<WebGLFallback />}>
            <CityScene scrollProgress={scrollProgress} activeMode={activeMode} />
          </Suspense>
        ) : (
          <WebGLFallback />
        )}
      </div>

      {/* 3. Top-Level High-Z-Index Mode Switcher Buttons (Ref 1, 2, 3) */}
      <div className="cinematic-mode-switcher">
        <button
          className={`mode-btn ${activeMode === 'all' ? 'active' : ''}`}
          onClick={() => setActiveMode('all')}
          title="Digital Twin 3D View"
        >
          <span className="mode-icon">⚡</span>
          <span className="mode-text">Digital Twin</span>
        </button>
        <button
          className={`mode-btn ${activeMode === 'thermal' ? 'active' : ''}`}
          onClick={() => setActiveMode('thermal')}
          title="Urban Heat Island Thermal Heatmap (Ref 2)"
        >
          <span className="mode-icon">🔥</span>
          <span className="mode-text">Heat Island (44°C)</span>
        </button>
        <button
          className={`mode-btn ${activeMode === 'circuit' ? 'active' : ''}`}
          onClick={() => setActiveMode('circuit')}
          title="Circuit Board Energy Flow (Ref 1)"
        >
          <span className="mode-icon">🛣️</span>
          <span className="mode-text">Circuit Flow</span>
        </button>
      </div>

      {/* 4. HERO SECTION (Overlays single 3D scene) */}
      <section className="hero-section" id="hero">
        <div className="hero-overlay" />

        <div className="hero-content">
          <div className="hero-location">SECTOR 17 · CHANDIGARH</div>
          <h1 className="hero-headline">
            Move smarter.<br />
            <span className="text-lime">Live cooler.</span>
          </h1>
          <p className="hero-subtitle">
            Discover a better way to navigate the city — from finding smart parking
            to choosing thermal-optimized shaded pedestrian routes.
          </p>
          <div className="hero-actions">
            <button className="hero-btn-primary" onClick={onEnterDashboard}>
              Explore Live Map
            </button>
            <button
              className="hero-btn-secondary"
              onClick={() => handleNavigate('3d-city')}
            >
              Experience 3D City
            </button>
          </div>
        </div>

        <div className="scroll-indicator" onClick={() => handleNavigate('3d-city')}>
          <span className="scroll-indicator-text">Scroll to explore</span>
          <span className="scroll-indicator-line" />
        </div>
      </section>

      {/* 5. SCROLL STORY PANELS (Float smoothly over 3D city) */}
      <div className="scroll-scene-wrapper">
        <div className="scroll-content-track">
          {STORY_SCENES.map((scene, index) => {
            const sceneFraction = index / STORY_SCENES.length;
            const isVisible =
              scrollProgress >= sceneFraction - 0.08 &&
              scrollProgress <= sceneFraction + 0.22;

            return (
              <div
                key={scene.id}
                className="scroll-scene-panel"
                id={`scene-${scene.id}`}
                style={{
                  justifyContent: index % 2 === 0 ? 'flex-start' : 'flex-end',
                }}
              >
                <div
                  className="scene-text-card"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
                    pointerEvents: isVisible ? 'auto' : 'none',
                  }}
                >
                  <div className="scene-label">{scene.label}</div>
                  <h2 className="scene-headline" style={{ whiteSpace: 'pre-line' }}>
                    {scene.headline}
                  </h2>
                  <p className="scene-description">{scene.description}</p>

                  {scene.routes && (
                    <div className="scene-routes-legend">
                      {scene.routes.map((r) => (
                        <div key={r.label} className="route-legend-item">
                          <span
                            className="route-legend-swatch"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="route-legend-text">{r.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {scene.highlights && (
                    <div className="scene-highlights-container">
                      {scene.highlights.map((h, i) => (
                        <div key={i} className="scene-highlight-item">
                          <span className="scene-highlight-bullet" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {scene.stats && (
                    <div className="scene-stats">
                      {scene.stats.map((s) => (
                        <div key={s.label} className="stat-item">
                          <span className="stat-value">{s.value}</span>
                          <span className="stat-label">{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. CALL TO ACTION & DASHBOARD TRANSITION */}
      <section className="cta-section">
        <div className="cta-content">
          <div className="cta-label">LIVE PILOT ACTIVE</div>
          <h2 className="cta-headline">
            Sector 17 is ready.<br />
            <span className="text-lime">Are you?</span>
          </h2>
          <p className="cta-description">
            Experience real-time navigation, live parking occupancy, and solar shade
            optimization right in your browser.
          </p>
          <div className="cta-actions">
            <button className="hero-btn-primary" onClick={onEnterDashboard}>
              Launch Mobility Dashboard
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CinematicLanding;
