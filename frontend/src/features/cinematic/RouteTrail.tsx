import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ============================================================
   RouteTrail — Animated 3D route line that draws progressively
   The signature "flowing green light" through the city
   ============================================================ */

// Predefined route waypoints following the road network grid
const ROUTE_WAYPOINTS: [number, number, number][] = [
  [-22, 0.15, -16],   // Origin
  [-22, 0.15, -10.5],
  [-22, 0.15, 0],
  [-11, 0.15, 0],     // Turn east
  [-11, 0.15, 5.5],
  [-11, 0.15, 11],    // Turn east again
  [0, 0.15, 11],
  [0, 0.15, 5.5],
  [0, 0.15, 0],       // Central intersection
  [11, 0.15, 0],      // Continue east
  [11, 0.15, -5.5],
  [11, 0.15, -11],
  [22, 0.15, -11],    // Turn north-east
  [22, 0.15, -5.5],
  [22, 0.15, 0],
  [22, 0.15, 5.5],    // Destination area
];

// Alternate routes
const ALTERNATE_ROUTE_A: [number, number, number][] = [
  [-22, 0.12, -16],
  [-22, 0.12, -5.5],
  [-11, 0.12, -5.5],
  [0, 0.12, -5.5],
  [11, 0.12, -5.5],
  [22, 0.12, -5.5],
  [22, 0.12, 0],
  [22, 0.12, 5.5],
];

const ALTERNATE_ROUTE_B: [number, number, number][] = [
  [-22, 0.12, -16],
  [-22, 0.12, -10.5],
  [-11, 0.12, -10.5],
  [-11, 0.12, -5.5],
  [0, 0.12, -5.5],
  [0, 0.12, 0],
  [0, 0.12, 5.5],
  [11, 0.12, 5.5],
  [22, 0.12, 5.5],
];

function createSmoothCurve(points: [number, number, number][], segments = 100): THREE.Vector3[] {
  if (points.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0.3
  );
  return curve.getPoints(segments);
}

interface RouteTrailProps {
  progress: number; // 0-1, how much of the route to show
  showAlternates: boolean;
  glowIntensity?: number;
}

export const RouteTrail: React.FC<RouteTrailProps> = ({
  progress,
  showAlternates,
  glowIntensity = 1
}) => {
  const mainLineRef = useRef<THREE.Line>(null);
  const glowLineRef = useRef<THREE.Line>(null);

  const mainPoints = useMemo(() => createSmoothCurve(ROUTE_WAYPOINTS, 120), []);
  const altAPoints = useMemo(() => createSmoothCurve(ALTERNATE_ROUTE_A, 60), []);
  const altBPoints = useMemo(() => createSmoothCurve(ALTERNATE_ROUTE_B, 60), []);

  // Progressive drawing — update geometry each frame
  useFrame(() => {
    if (!mainLineRef.current || !glowLineRef.current) return;

    const visibleCount = Math.max(2, Math.floor(progress * mainPoints.length));
    const visiblePoints = mainPoints.slice(0, visibleCount);

    const geo = new THREE.BufferGeometry().setFromPoints(visiblePoints);
    mainLineRef.current.geometry.dispose();
    mainLineRef.current.geometry = geo;

    const glowGeo = new THREE.BufferGeometry().setFromPoints(visiblePoints);
    glowLineRef.current.geometry.dispose();
    glowLineRef.current.geometry = glowGeo;
  });

  const initialGeo = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(mainPoints.slice(0, 2));
  }, [mainPoints]);

  const altAGeo = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(altAPoints);
  }, [altAPoints]);

  const altBGeo = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(altBPoints);
  }, [altBPoints]);

  return (
    <group>
      {/* Main route — luminous lime glow layer */}
      <line ref={glowLineRef} geometry={initialGeo.clone()}>
        <lineBasicMaterial
          color="#C4F56B"
          transparent
          opacity={0.3 * glowIntensity}
          linewidth={1}
        />
      </line>

      {/* Main route — solid lime core */}
      <line ref={mainLineRef} geometry={initialGeo.clone()}>
        <lineBasicMaterial
          color="#C4F56B"
          transparent
          opacity={0.9 * glowIntensity}
          linewidth={1}
        />
      </line>

      {/* Route glow tube for more visible 3D effect */}
      {progress > 0.05 && (
        <mesh>
          <tubeGeometry args={[
            new THREE.CatmullRomCurve3(
              mainPoints.slice(0, Math.max(2, Math.floor(progress * mainPoints.length)))
            ),
            Math.max(2, Math.floor(progress * 60)),
            0.12,
            6,
            false
          ]} />
          <meshStandardMaterial
            color="#C4F56B"
            emissive="#C4F56B"
            emissiveIntensity={0.6 * glowIntensity}
            transparent
            opacity={0.7 * glowIntensity}
            roughness={0.3}
          />
        </mesh>
      )}

      {/* Alternate routes — shown when requested */}
      {showAlternates && (
        <group>
          {/* Fastest — indigo */}
          <mesh>
            <tubeGeometry args={[
              new THREE.CatmullRomCurve3(altAPoints),
              30, 0.06, 4, false
            ]} />
            <meshStandardMaterial
              color="#6366f1"
              transparent
              opacity={0.4}
              roughness={0.5}
            />
          </mesh>

          {/* Balanced — cyan */}
          <mesh>
            <tubeGeometry args={[
              new THREE.CatmullRomCurve3(altBPoints),
              30, 0.06, 4, false
            ]} />
            <meshStandardMaterial
              color="#0284c7"
              transparent
              opacity={0.4}
              roughness={0.5}
            />
          </mesh>
        </group>
      )}
    </group>
  );
};

/* ============================================================
   OriginMarker / DestinationMarker — 3D markers at route endpoints
   ============================================================ */

export const OriginMarker: React.FC<{ visible: boolean }> = ({ visible }) => {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });

  if (!visible) return null;

  return (
    <group ref={ref} position={[-22, 0.5, -16]}>
      {/* Pin body */}
      <mesh castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color="#C4F56B"
          emissive="#C4F56B"
          emissiveIntensity={0.5}
          roughness={0.3}
        />
      </mesh>
      {/* Pin glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <ringGeometry args={[0.4, 0.6, 16]} />
        <meshStandardMaterial
          color="#C4F56B"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Label "A" */}
      <sprite position={[0, 0.8, 0]} scale={[0.5, 0.5, 1]}>
        <spriteMaterial color="#C4F56B" transparent opacity={0.8} />
      </sprite>
    </group>
  );
};

export const DestinationMarker: React.FC<{ visible: boolean }> = ({ visible }) => {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 2 + 1) * 0.15;
  });

  if (!visible) return null;

  return (
    <group ref={ref} position={[22, 0.5, 5.5]}>
      <mesh castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color="#65DDB0"
          emissive="#65DDB0"
          emissiveIntensity={0.5}
          roughness={0.3}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <ringGeometry args={[0.4, 0.6, 16]} />
        <meshStandardMaterial
          color="#65DDB0"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

/* ============================================================
   ParkingMarker3D — 3D parking location indicators
   ============================================================ */

interface ParkingMarker3DProps {
  visible: boolean;
  positions?: [number, number, number][];
}

const DEFAULT_PARKING_POSITIONS: [number, number, number][] = [
  [-18, 0.3, -12],
  [-8, 0.3, 8],
  [5, 0.3, -8],
  [15, 0.3, 3],
  [20, 0.3, -14],
  [-14, 0.3, 4],
  [8, 0.3, 12],
  [-3, 0.3, -14],
];

export const ParkingMarker3D: React.FC<ParkingMarker3DProps> = ({
  visible,
  positions = DEFAULT_PARKING_POSITIONS
}) => {
  if (!visible) return null;

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh>
            <boxGeometry args={[0.5, 0.1, 0.5]} />
            <meshStandardMaterial
              color="#C4F56B"
              emissive="#C4F56B"
              emissiveIntensity={0.3}
              transparent
              opacity={0.7}
              roughness={0.5}
            />
          </mesh>
          {/* P label marker */}
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.25, 0.5, 0.05]} />
            <meshStandardMaterial
              color="#C4F56B"
              emissive="#C4F56B"
              emissiveIntensity={0.4}
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default RouteTrail;
