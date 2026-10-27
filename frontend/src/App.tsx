import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppShell } from './components/AppShell';
import { MapView } from './features/map/MapView';
import { RoutePlannerPanel } from './features/route-planner/RoutePlannerPanel';
import { RouteComparisonCard } from './features/route-planner/RouteComparisonCard';
import { WeatherPanel } from './features/weather/WeatherPanel';
import { ParkingList } from './features/parking/ParkingList';
import { CommunityPanel } from './features/community/CommunityPanel';
import { VoiceAssistantWidget } from './features/voice-assistant/VoiceAssistantWidget';
import { LoadingState, ErrorState, DataQualityNotice } from './components/FeedbackStates';

import { compareRoutes } from './services/routesApi';
import { fetchParking } from './services/parkingApi';
import { fetchCurrentWeather, fetchHealth, fetchSectorBoundary } from './services/weatherApi';
import { fetchActiveHazards } from './services/communityApi';
import type { RouteAlternative, ParkingItem, WeatherData, HealthStatus, HazardMarkerItem } from './types';

import './styles/theme.css';
import './styles/App.css';

export const App: React.FC = () => {
  // Navigation State
  const [startLat, setStartLat] = useState<number>(30.7395);
  const [startLon, setStartLon] = useState<number>(76.7810);
  const [destLat, setDestLat] = useState<number>(30.7415);
  const [destLon, setDestLon] = useState<number>(76.7870);
  const [departureHour, setDepartureHour] = useState<number>(14.0);
  const [accessibilityMode, setAccessibilityMode] = useState<boolean>(false);

  // Response State
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [parkingLots, setParkingLots] = useState<ParkingItem[]>([]);
  const [selectedParking, setSelectedParking] = useState<ParkingItem | null>(null);
  const [sectorGeoJson, setSectorGeoJson] = useState<any | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'routes' | 'parking' | 'community'>('routes');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [routeNote, setRouteNote] = useState<string | null>(null);
  const [isSimulatedActive, setIsSimulatedActive] = useState<boolean>(false);
  const initialMount = useRef<boolean>(true);

  // Community & Hazard State
  const [hazards, setHazards] = useState<HazardMarkerItem[]>([]);
  const [showHazards, setShowHazards] = useState<boolean>(true);
  const [isPickingLocation, setIsPickingLocation] = useState<boolean>(false);
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lon: number } | null>(null);

  const calculateRoutes = useCallback(async (
    sLat: number,
    sLon: number,
    dLat: number,
    dLon: number,
    hour: number,
    accMode: boolean = false
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const preferences: string[] = ['fastest', 'shadiest', 'balanced'];
      if (accMode) {
        preferences.push('accessible');
      }
      const res = await compareRoutes({
        start_lat: sLat,
        start_lon: sLon,
        dest_lat: dLat,
        dest_lon: dLon,
        time_of_day_hour: hour,
        preferences,
        accessibility_mode: accMode,
        include_nearby_parking: true
      });

      setRoutes(res.routes || []);
      setSelectedRouteIndex(0);
      setWeather(res.weather_summary);
      setParkingLots(res.nearby_parking || []);
      setRouteNote(res.note || null);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate pedestrian route.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCompare = async () => {
    await calculateRoutes(startLat, startLon, destLat, destLon, departureHour, accessibilityMode);
  };

  const handleToggleAccessibility = (enabled: boolean) => {
    setAccessibilityMode(enabled);
    calculateRoutes(startLat, startLon, destLat, destLon, departureHour, enabled);
  };

  // Initial Load: health, sector boundary, weather, and initial route
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [healthRes, boundaryRes, weatherRes] = await Promise.allSettled([
          fetchHealth(),
          fetchSectorBoundary(),
          fetchCurrentWeather()
        ]);

        if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
        if (boundaryRes.status === 'fulfilled') setSectorGeoJson(boundaryRes.value.geojson);
        if (weatherRes.status === 'fulfilled') setWeather(weatherRes.value);

        // Load community hazard markers
        fetchActiveHazards().then((h) => setHazards(h)).catch(() => {});

        // Run initial route comparison
        await calculateRoutes(startLat, startLon, destLat, destLon, departureHour, accessibilityMode);
      } catch (err: any) {
        console.error('Initial load notice:', err);
      }
    }
    loadInitialData();

    // Periodic heartbeat to keep engine connection badge updated
    const healthTimer = setInterval(async () => {
      try {
        const h = await fetchHealth();
        setHealth(h);
      } catch {
        // engine offline or restarting
      }
    }, 8000);

    return () => clearInterval(healthTimer);
  }, [calculateRoutes]);

  // Auto-recalculate routes when start/dest/departure hour/accessibilityMode changes (debounced by 350ms)
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      calculateRoutes(startLat, startLon, destLat, destLon, departureHour, accessibilityMode);
    }, 350);

    return () => clearTimeout(timer);
  }, [startLat, startLon, destLat, destLon, departureHour, accessibilityMode, calculateRoutes]);

  const handleRefreshWeather = async () => {
    setIsWeatherLoading(true);
    try {
      const w = await fetchCurrentWeather(destLat, destLon);
      setWeather(w);
    } catch (err: any) {
      console.warn('Weather refresh failed:', err);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  const handleToggleSimulate = async (simulate: boolean) => {
    setIsSimulatedActive(simulate);
    try {
      const res = await fetchParking(destLat, destLon, 25, simulate);
      setParkingLots(res.parking_lots);
    } catch (err) {
      console.error('Failed to toggle simulation:', err);
    }
  };

  const handleRefreshParking = async () => {
    try {
      const res = await fetchParking(destLat, destLon, 25, isSimulatedActive);
      setParkingLots(res.parking_lots);
    } catch (err) {
      console.warn('Failed to refresh parking:', err);
    }
  };

  const handleNavigateFromParking = (parking: ParkingItem) => {
    setStartLat(parking.latitude);
    setStartLon(parking.longitude);
    setSelectedParking(parking);
    setActiveTab('routes');
    calculateRoutes(parking.latitude, parking.longitude, destLat, destLon, departureHour, accessibilityMode);
  };

  return (
    <AppShell health={health}>
      <div className="layout-grid">
        {/* Left Side: Controls & Results */}
        <aside className="control-sidebar">
          {/* Live Microclimate Weather Card */}
          <WeatherPanel
            weather={weather}
            onRefresh={handleRefreshWeather}
            isLoading={isWeatherLoading}
          />

          {/* Route Planner Inputs */}
          <RoutePlannerPanel
            startLat={startLat}
            startLon={startLon}
            destLat={destLat}
            destLon={destLon}
            departureHour={departureHour}
            accessibilityMode={accessibilityMode}
            isLoading={isLoading}
            onStartChange={(lat, lon) => {
              setStartLat(lat);
              setStartLon(lon);
            }}
            onDestChange={(lat, lon) => {
              setDestLat(lat);
              setDestLon(lon);
            }}
            onHourChange={(hour) => setDepartureHour(hour)}
            onToggleAccessibility={handleToggleAccessibility}
            onCompare={handleCompare}
          />

          {/* Navigation Tabs: Routes vs Parking vs Community */}
          <div className="tab-switcher">
            <button
              className={`tab-btn ${activeTab === 'routes' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('routes')}
            >
              Routes ({routes.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'parking' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('parking')}
            >
              Parking ({parkingLots.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'community' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('community')}
            >
              Community ({hazards.length})
            </button>
          </div>

          {/* Feedback states */}
          {isLoading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={handleCompare} />}

          {/* Route Alternatives Tab */}
          {activeTab === 'routes' && !isLoading && (
            <div className="routes-tab-content">
              {routeNote && (
                <DataQualityNotice
                  title="Network Topology Note"
                  message={routeNote}
                  variant="info"
                />
              )}

              {routes.length === 0 && !error && (
                <div className="empty-state">
                  <p>Select origin and destination within Sector 17 and click <strong>Compare</strong> to generate shaded route alternatives.</p>
                </div>
              )}

              {routes.map((route, idx) => (
                <RouteComparisonCard
                  key={route.preference}
                  route={route}
                  isSelected={idx === selectedRouteIndex}
                  onSelect={() => setSelectedRouteIndex(idx)}
                />
              ))}
            </div>
          )}

          {/* Parking Tab */}
          {activeTab === 'parking' && (
            <ParkingList
              parkingLots={parkingLots}
              selectedParkingId={selectedParking?.id || null}
              destLat={destLat}
              destLon={destLon}
              onSelectParking={(p) => setSelectedParking(p)}
              onToggleSimulate={handleToggleSimulate}
              isSimulatedActive={isSimulatedActive}
              onNavigateFromParking={handleNavigateFromParking}
              onRefreshParking={handleRefreshParking}
            />
          )}

          {/* Community Tab */}
          {activeTab === 'community' && (
            <div className="community-tab-content" style={{ marginTop: '8px' }}>
              <CommunityPanel
                onSelectLocationOnMap={() => {
                  setIsPickingLocation(true);
                }}
                pickedLocation={pickedLocation}
                onFocusHazardOnMap={(hLat, hLon) => {
                  setFocusLocation({ lat: hLat, lon: hLon });
                }}
                onReportsUpdated={async () => {
                  try {
                    const h = await fetchActiveHazards();
                    setHazards(h);
                  } catch (e) {
                    console.error('Failed to update hazards:', e);
                  }
                }}
              />
            </div>
          )}
        </aside>

        {/* Right Side: Interactive Leaflet Map */}
        <section className="map-section">
          <MapView
            sectorGeoJson={sectorGeoJson}
            routes={routes}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRoute={(idx) => setSelectedRouteIndex(idx)}
            startLat={startLat}
            startLon={startLon}
            destLat={destLat}
            destLon={destLon}
            onStartMove={(lat, lon) => {
              setStartLat(lat);
              setStartLon(lon);
            }}
            onDestMove={(lat, lon) => {
              setDestLat(lat);
              setDestLon(lon);
            }}
            parkingLots={parkingLots}
            selectedParking={selectedParking}
            onSelectParking={(p) => setSelectedParking(p)}
            hazards={hazards}
            showHazards={showHazards}
            onToggleHazards={(show) => setShowHazards(show)}
            isPickingLocation={isPickingLocation}
            onLocationPicked={(pickLat, pickLon) => {
              setPickedLocation({ lat: pickLat, lon: pickLon });
              setIsPickingLocation(false);
              setActiveTab('community');
            }}
            focusLocation={focusLocation}
          />
        </section>
      </div>

      {/* Voice Assistant Floating Guide */}
      <VoiceAssistantWidget
        routes={routes}
        selectedRouteIndex={selectedRouteIndex}
        onSelectRouteIndex={(idx) => setSelectedRouteIndex(idx)}
        weather={weather}
        parkingLots={parkingLots}
        destLat={destLat}
        destLon={destLon}
        onSetDestination={(lat, lon) => {
          setDestLat(lat);
          setDestLon(lon);
        }}
        onSwitchTab={(tab) => setActiveTab(tab)}
        onTriggerCompare={handleCompare}
        isLoadingRoutes={isLoading}
      />
    </AppShell>
  );
};

export default App;
