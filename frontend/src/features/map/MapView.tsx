import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, MapPin } from 'lucide-react';
import type { RouteAlternative, ParkingItem, HazardMarkerItem } from '../../types';

interface MapViewProps {
  sectorGeoJson: any | null;
  routes: RouteAlternative[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  startLat: number;
  startLon: number;
  destLat: number;
  destLon: number;
  onStartMove: (lat: number, lon: number) => void;
  onDestMove: (lat: number, lon: number) => void;
  parkingLots: ParkingItem[];
  selectedParking: ParkingItem | null;
  onSelectParking: (p: ParkingItem) => void;
  // Community Hazards
  hazards?: HazardMarkerItem[];
  showHazards?: boolean;
  onToggleHazards?: (show: boolean) => void;
  isPickingLocation?: boolean;
  onLocationPicked?: (lat: number, lon: number) => void;
  focusLocation?: { lat: number; lon: number } | null;
}

export const MapView: React.FC<MapViewProps> = ({
  sectorGeoJson,
  routes,
  selectedRouteIndex,
  onSelectRoute,
  startLat,
  startLon,
  destLat,
  destLon,
  onStartMove,
  onDestMove,
  parkingLots,
  selectedParking,
  onSelectParking,
  hazards = [],
  showHazards = true,
  onToggleHazards,
  isPickingLocation = false,
  onLocationPicked,
  focusLocation
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const isPickingRef = useRef<boolean>(isPickingLocation);
  isPickingRef.current = isPickingLocation;
  const onLocationPickedRef = useRef(onLocationPicked);
  onLocationPickedRef.current = onLocationPicked;

  const layersRef = useRef<{
    boundary?: L.GeoJSON;
    startMarker?: L.Marker;
    destMarker?: L.Marker;
    routeLines: L.Polyline[];
    parkingMarkers: L.Marker[];
    hazardMarkers: L.Marker[];
  }>({ routeLines: [], parkingMarkers: [], hazardMarkers: [] });

  // Custom marker icons using SVG
  const createCustomIcon = (color: string, label: string) => {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="
          background-color: ${color};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          border: 2px solid white;
        ">
          <span style="
            transform: rotate(45deg);
            font-size: 11px;
            font-weight: bold;
          ">${label}</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  };

  const createParkingIcon = (isSelected: boolean, status: string = 'unknown') => {
    let bg = '#475569';
    switch (status.toLowerCase()) {
      case 'available':
        bg = '#10b981';
        break;
      case 'reserved':
        bg = '#6366f1';
        break;
      case 'occupied':
        bg = '#ef4444';
        break;
      case 'maintenance':
        bg = '#f59e0b';
        break;
      case 'simulated':
        bg = '#0284c7';
        break;
      case 'unknown':
      default:
        bg = '#475569';
        break;
    }

    const ring = isSelected ? 'box-shadow: 0 0 0 3px #38bdf8, 0 3px 8px rgba(0,0,0,0.4); transform: scale(1.15);' : 'box-shadow: 0 2px 5px rgba(0,0,0,0.3);';

    return L.divIcon({
      className: 'parking-div-icon',
      html: `
        <div style="
          background-color: ${bg};
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          ${ring}
          border: 1.5px solid white;
          font-weight: 800;
          font-size: 11px;
          transition: transform 0.2s ease;
        ">P</div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  };

  const createHazardIcon = (category: string, status: string) => {
    let bg = '#d97706';
    let symbol = '⚠️';
    if (status === 'verified') {
      bg = '#dc2626';
    } else if (status === 'resolved') {
      bg = '#16a34a';
      symbol = '✓';
    }

    switch (category) {
      case 'pothole':
        symbol = '🕳️';
        break;
      case 'broken_footpath':
      case 'broken_sidewalk':
        symbol = '🚶';
        break;
      case 'construction':
        symbol = '🚧';
        break;
      case 'streetlight':
        symbol = '💡';
        bg = status === 'verified' ? '#b45309' : '#4338ca';
        break;
      case 'garbage':
        symbol = '🗑️';
        break;
      case 'unsafe_crossing':
        symbol = '🚸';
        break;
      case 'extreme_heat':
      case 'missing_shade':
        symbol = '☀️';
        break;
      case 'flooding':
        symbol = '🌊';
        break;
    }

    const ring = status === 'verified'
      ? 'box-shadow: 0 0 0 3px #fecaca, 0 3px 8px rgba(220,38,38,0.5); transform: scale(1.1);'
      : 'box-shadow: 0 2px 6px rgba(0,0,0,0.3);';

    return L.divIcon({
      className: 'hazard-div-icon',
      html: `
        <div style="
          background-color: ${bg};
          color: white;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          ${ring}
          border: 1.5px solid white;
          font-size: 13px;
          cursor: pointer;
        ">${symbol}</div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13]
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [30.7410, 76.7820],
      zoom: 15,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | TerraMove Pilot',
      maxZoom: 19
    }).addTo(map);

    // Map click handler to set destination OR pick report location
    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickLat = parseFloat(e.latlng.lat.toFixed(5));
      const clickLon = parseFloat(e.latlng.lng.toFixed(5));
      if (isPickingRef.current && onLocationPickedRef.current) {
        onLocationPickedRef.current(clickLat, clickLon);
      } else {
        onDestMove(clickLat, clickLon);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Sector Boundary Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sectorGeoJson) return;

    if (layersRef.current.boundary) {
      map.removeLayer(layersRef.current.boundary);
    }

    const boundaryLayer = L.geoJSON(sectorGeoJson, {
      style: {
        color: '#059669',
        weight: 2.5,
        dashArray: '5, 5',
        fillColor: '#10b981',
        fillOpacity: 0.05
      }
    }).addTo(map);

    layersRef.current.boundary = boundaryLayer;
  }, [sectorGeoJson]);

  // Update Start & Destination Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Start Marker (Origin A)
    if (layersRef.current.startMarker) {
      map.removeLayer(layersRef.current.startMarker);
    }
    const startM = L.marker([startLat, startLon], {
      icon: createCustomIcon('#059669', 'A'),
      draggable: true,
      title: 'Origin / Start (Drag to reposition)'
    }).addTo(map);

    startM.on('dragend', () => {
      const pos = startM.getLatLng();
      onStartMove(parseFloat(pos.lat.toFixed(5)), parseFloat(pos.lng.toFixed(5)));
    });
    layersRef.current.startMarker = startM;

    // Dest Marker (Destination B)
    if (layersRef.current.destMarker) {
      map.removeLayer(layersRef.current.destMarker);
    }
    const destM = L.marker([destLat, destLon], {
      icon: createCustomIcon('#0284c7', 'B'),
      draggable: true,
      title: 'Destination (Drag to reposition)'
    }).addTo(map);

    destM.on('dragend', () => {
      const pos = destM.getLatLng();
      onDestMove(parseFloat(pos.lat.toFixed(5)), parseFloat(pos.lng.toFixed(5)));
    });
    layersRef.current.destMarker = destM;
  }, [startLat, startLon, destLat, destLon]);

  // Update Routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.routeLines.forEach((line) => map.removeLayer(line));
    layersRef.current.routeLines = [];

    if (!routes || routes.length === 0) return;

    const colors: Record<string, string> = {
      fastest: '#6366f1',
      shadiest: '#059669',
      balanced: '#0284c7',
      accessible: '#8b5cf6'
    };

    const newLines: L.Polyline[] = [];
    let selectedPolyline: L.Polyline | null = null;

    routes.forEach((route, idx) => {
      const isSelected = idx === selectedRouteIndex;
      const color = colors[route.preference.toLowerCase()] || '#059669';

      const latLngs = route.coordinates.map((c) => [c[1], c[0]] as [number, number]);
      if (latLngs.length < 2) return;

      if (isSelected) {
        const casing = L.polyline(latLngs, {
          color: '#ffffff',
          weight: 9,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
        newLines.push(casing);
      }

      const polyline = L.polyline(latLngs, {
        color: color,
        weight: isSelected ? 6 : 3.5,
        opacity: isSelected ? 1.0 : 0.50,
        dashArray: isSelected ? undefined : '6, 6',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      polyline.bindTooltip(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: ${color}; text-transform: uppercase;">${route.preference} Route</strong><br/>
          <span>${route.distance_m}m • ~${route.duration_minutes} min walk</span><br/>
          <span>Shade: <strong>${route.shade_score}%</strong> • Heat: <strong>${route.heat_category}</strong></span>
          ${route.hazard_warnings && route.hazard_warnings.length > 0 ? `<br/><span style="color:#dc2626;font-weight:bold;">⚠️ ${route.hazard_warnings.length} Hazard(s) Nearby</span>` : ''}
        </div>
      `, { sticky: true });

      polyline.on('click', () => onSelectRoute(idx));
      newLines.push(polyline);

      if (isSelected) {
        selectedPolyline = polyline;
      }
    });

    if (selectedPolyline) {
      (selectedPolyline as L.Polyline).bringToFront();
      map.fitBounds((selectedPolyline as L.Polyline).getBounds(), { padding: [50, 50], maxZoom: 17 });
    }

    layersRef.current.routeLines = newLines;
  }, [routes, selectedRouteIndex]);

  // Update Parking Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.parkingMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.parkingMarkers = [];

    if (!parkingLots || parkingLots.length === 0) return;

    const markers: L.Marker[] = [];

    parkingLots.forEach((p) => {
      const isSelected = selectedParking?.id === p.id;
      const m = L.marker([p.latitude, p.longitude], {
        icon: createParkingIcon(isSelected, p.availability_status),
        title: p.name
      }).addTo(map);

      m.bindPopup(`
        <div style="font-family: sans-serif; font-size: 13px; line-height: 1.4; color: #f8fafc;">
          <strong style="color: #00ff88; font-size: 14px;">${p.name}</strong><br/>
          <span style="color: #94a3b8;">${p.address || 'Sector 17, Chandigarh'}</span>
          <hr style="margin: 6px 0; border: none; border-top: 1px solid rgba(148, 163, 184, 0.2);"/>
          <div><strong style="color: #cbd5e1;">4-Wheeler:</strong> ${p.capacity_four_wheeler ?? 'N/A'} spaces</div>
          <div><strong style="color: #cbd5e1;">2-Wheeler:</strong> ${p.capacity_two_wheeler ?? 'N/A'} spaces</div>
          <div style="margin-top: 4px; color: #34d399;"><strong>Distance:</strong> ${p.distance_to_dest_m}m (~${p.walking_time_to_dest_min} min walk)</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Status: ${p.availability_status}</div>
        </div>
      `);

      m.on('click', () => onSelectParking(p));
      markers.push(m);
    });

    layersRef.current.parkingMarkers = markers;
  }, [parkingLots, selectedParking]);

  // Update Hazard Markers Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.hazardMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.hazardMarkers = [];

    if (!showHazards || !hazards || hazards.length === 0) return;

    const hMarkers: L.Marker[] = [];

    hazards.forEach((h) => {
      const m = L.marker([h.latitude, h.longitude], {
        icon: createHazardIcon(h.category, h.status),
        title: h.title
      }).addTo(map);

      const statusBadge = h.status === 'verified'
        ? '<span style="background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.4);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">VERIFIED HAZARD</span>'
        : (h.status === 'resolved'
          ? '<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">RESOLVED</span>'
          : '<span style="background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">COMMUNITY REPORT</span>');

      const photoHtml = h.photo_url
        ? `<div style="margin-top:6px;"><img src="${h.photo_url}" alt="Hazard" style="width:100%;max-height:100px;object-fit:cover;border-radius:4px;border:1px solid rgba(148,163,184,0.2);"/></div>`
        : '';

      m.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 220px; color: #f8fafc;">
          <div style="margin-bottom: 4px;">${statusBadge}</div>
          <strong style="color: #f8fafc; font-size: 13px;">${h.title}</strong><br/>
          <span style="color: #94a3b8; font-size: 11px;">Category: ${h.category_display}</span><br/>
          <span style="color: #94a3b8; font-size: 11px;">Severity: <strong style="color: #00ff88;">${h.severity}</strong></span>
          ${photoHtml}
          <div style="margin-top: 6px; font-size: 10px; color: #64748b;">
            Reported: ${new Date(h.created_at).toLocaleDateString()}
          </div>
        </div>
      `);

      hMarkers.push(m);
    });

    layersRef.current.hazardMarkers = hMarkers;
  }, [hazards, showHazards]);

  // Focus on specific location (e.g. from feed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLocation) return;
    map.flyTo([focusLocation.lat, focusLocation.lon], 17, { animate: true, duration: 0.8 });
  }, [focusLocation]);

  return (
    <div className="map-view-wrapper" style={{ cursor: isPickingLocation ? 'crosshair' : 'default' }}>
      <div ref={mapContainerRef} className="map-container" />

      {/* Picking Location Banner */}
      {isPickingLocation && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: '#0d1520',
          color: '#f8fafc',
          border: '1px solid rgba(0, 255, 136, 0.4)',
          padding: '8px 16px',
          borderRadius: '30px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <MapPin style={{ width: '14px', height: '14px', color: '#00ff88' }} />
          <span>Click anywhere on the map to set report location</span>
        </div>
      )}

      {/* Hazard Layer Toggle Floating Button */}
      {onToggleHazards && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 999
        }}>
          <button
            type="button"
            onClick={() => onToggleHazards(!showHazards)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: showHazards ? 'rgba(239, 68, 68, 0.18)' : 'rgba(13, 21, 32, 0.92)',
              color: showHazards ? '#f87171' : '#cbd5e1',
              border: showHazards ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(148, 163, 184, 0.22)',
              borderRadius: '20px',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
            }}
          >
            <AlertTriangle style={{ width: '13px', height: '13px' }} />
            <span>{showHazards ? `Hazards Active (${hazards.length})` : 'Show Hazards'}</span>
          </button>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="map-legend-card">
        <div className="legend-title">Route Options</div>
        <div className="legend-items">
          {routes.map((route, idx) => {
            const isSelected = selectedRouteIndex === idx;
            const colors: Record<string, string> = {
              fastest: '#6366f1',
              shadiest: '#059669',
              balanced: '#0284c7',
              accessible: '#8b5cf6'
            };
            const color = colors[route.preference.toLowerCase()] || '#059669';
            const label = route.preference.charAt(0).toUpperCase() + route.preference.slice(1) + ' Route';
            const meta = route.preference.toLowerCase() === 'shadiest'
              ? `${route.shade_score}% shade`
              : `${route.duration_minutes}m`;

            return (
              <div
                key={route.preference}
                className={`legend-item ${isSelected ? 'legend-item-active' : ''}`}
                onClick={() => onSelectRoute(idx)}
                title={`Click to select ${route.preference} route`}
              >
                <span className="legend-swatch" style={{ backgroundColor: color }} />
                <span>{label}</span>
                <span className="legend-meta">{meta}</span>
              </div>
            );
          })}
        </div>
        <div className="legend-divider" />
        <div className="legend-items legend-meta-items">
          <div className="legend-item-static" title="Origin Marker A">
            <span className="legend-dot" style={{ backgroundColor: '#059669' }}>A</span>
            <span>Origin</span>
          </div>
          <div className="legend-item-static" title="Destination Marker B">
            <span className="legend-dot" style={{ backgroundColor: '#0284c7' }}>B</span>
            <span>Dest</span>
          </div>
          <div className="legend-item-static" title="Parking Lots">
            <span className="legend-box" style={{ backgroundColor: '#1e293b' }}>P</span>
            <span>Parking</span>
          </div>
          <div className="legend-item-static" title="Community Hazards">
            <span className="legend-dot" style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '9px' }}>⚠️</span>
            <span>Hazards</span>
          </div>
        </div>
      </div>

      {/* Helpful Interactive Overlay Hint */}
      <div className="map-overlay-tip">
        <span>💡 <strong>Interactive:</strong> Drag marker <strong>A</strong> or <strong>B</strong>, or click anywhere on the map to recalculate road-following routes.</span>
      </div>
    </div>
  );
};
