import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MotherboardGround } from './MotherboardGround';
import { CyberBuildings } from './CyberBuildings';
import { RoadNetwork, TreeClusters } from './RoadNetwork';
import { HolographicHub } from './HolographicHub';
import { ThermalHeatIsland } from './ThermalHeatIsland';
import { CircuitEnergyTrails } from './CircuitEnergyTrails';
import { SmartCityWaypoints } from './SmartCityWaypoints';
import { RouteTrail, OriginMarker, DestinationMarker, ParkingMarker3D } from './RouteTrail';

/* ============================================================
   ScrollCameraController — Smooth Interpolated Camera
   ============================================================ */

interface CameraKeyframe {
  position: [number, number, number];
  lookAt: [number, number, number];
}

const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  // Scene 0: Hero — Isometric overview (Ref 1)
  { position: [26, 34, 26], lookAt: [0, 0, 0] },
  // Scene 1: Discover — Descending toward microchip core
  { position: [16, 20, 16], lookAt: [0, 1, 0] },
  // Scene 2: Route — Tracking energy highway
  { position: [-12, 13, -8], lookAt: [0, 0, 0] },
  // Scene 3: Climate — Elevated thermal heatmap aerial view (Ref 2)
  { position: [0, 48, 12], lookAt: [0, 0, 0] },
  // Scene 4: Inclusive mobility — Street-level digital twin (Ref 3)
  { position: [-8, 9, 8], lookAt: [4, 1, 4] },
  // Scene 5: Parking — Angle toward transit hubs
  { position: [16, 14, -6], lookAt: [12, 0, 0] },
  // Scene 6: Urban Planning — High-altitude command view (Ref 3)
  { position: [0, 44, 30], lookAt: [0, 0, 0] },
  // Scene 7: Final Overview
  { position: [28, 40, 28], lookAt: [0, 0, 0] },
];

const ScrollCameraController: React.FC<{ scrollProgress: number; activeMode: string }> = ({
  scrollProgress,
  activeMode,
}) => {
  const { camera } = useThree();
  const posRef = useRef(new THREE.Vector3(26, 34, 26));
  const lookRef = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_, delta) => {
    let targetPos: THREE.Vector3;
    let targetLook: THREE.Vector3;

    if (activeMode === 'thermal') {
      // Direct aerial thermal inspection angle (Ref 2)
      targetPos = new THREE.Vector3(0, 52, 10);
      targetLook = new THREE.Vector3(0, 0, 0);
    } else if (activeMode === 'circuit') {
      // Low glide along circuit bus traces (Ref 1)
      targetPos = new THREE.Vector3(-14, 15, -10);
      targetLook = new THREE.Vector3(0, 0, 0);
    } else {
      // Scroll-driven story sequence
      const totalScenes = CAMERA_KEYFRAMES.length - 1;
      const exactScene = scrollProgress * totalScenes;
      const sceneIndex = Math.min(Math.floor(exactScene), totalScenes - 1);
      const sceneFraction = exactScene - sceneIndex;

      const from = CAMERA_KEYFRAMES[sceneIndex];
      const to = CAMERA_KEYFRAMES[Math.min(sceneIndex + 1, totalScenes)];

      // Smoothstep easing
      const t = sceneFraction * sceneFraction * (3 - 2 * sceneFraction);

      targetPos = new THREE.Vector3(
        from.position[0] + (to.position[0] - from.position[0]) * t,
        from.position[1] + (to.position[1] - from.position[1]) * t,
        from.position[2] + (to.position[2] - from.position[2]) * t
      );

      targetLook = new THREE.Vector3(
        from.lookAt[0] + (to.lookAt[0] - from.lookAt[0]) * t,
        from.lookAt[1] + (to.lookAt[1] - from.lookAt[1]) * t,
        from.lookAt[2] + (to.lookAt[2] - from.lookAt[2]) * t
      );
    }

    // High performance frame-rate independent dampening
    posRef.current.lerp(targetPos, Math.min(1, delta * 4.5));
    lookRef.current.lerp(targetLook, Math.min(1, delta * 4.5));

    camera.position.copy(posRef.current);
    camera.lookAt(lookRef.current);
  });

  return null;
};

/* ============================================================
   CyberCityLighting — Dynamic Lighting Setup
   ============================================================ */

const CyberCityLighting: React.FC<{ scrollProgress: number; activeMode: string }> = ({
  scrollProgress,
  activeMode,
}) => {
  const isClimate = (scrollProgress > 0.35 && scrollProgress < 0.55) || activeMode === 'thermal';

  return (
    <>
      <ambientLight intensity={isClimate ? 0.3 : 0.45} color={isClimate ? '#f97316' : '#38bdf8'} />

      <directionalLight
        position={[25, 45, 20]}
        intensity={isClimate ? 0.7 : 1.3}
        color={isClimate ? '#fed7aa' : '#e0f2fe'}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={120}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.001}
      />

      <directionalLight
        position={[-20, 15, -20]}
        intensity={1.2}
        color="#00ff88"
      />

      <directionalLight
        position={[20, 12, -25]}
        intensity={0.65}
        color="#06b6d4"
      />

      <hemisphereLight args={['#0f172a', '#020617', 0.5]} />
    </>
  );
};

/* ============================================================
   CitySceneContent — Composed 3D Layers
   ============================================================ */

export interface CitySceneProps {
  scrollProgress: number;
  activeMode?: 'all' | 'circuit' | 'thermal' | 'hologram';
}

const CitySceneContent: React.FC<CitySceneProps> = ({ scrollProgress, activeMode = 'all' }) => {
  const routeProgress = useMemo(() => {
    if (scrollProgress < 0.12) return 0;
    if (scrollProgress > 0.45) return 1;
    return (scrollProgress - 0.12) / 0.33;
  }, [scrollProgress]);

  const showOrigin = scrollProgress > 0.1;
  const showDestination = scrollProgress > 0.38;
  const showAlternates = scrollProgress > 0.25 && scrollProgress < 0.55;
  const showParking = scrollProgress > 0.6 && scrollProgress < 0.85;

  // Thermal intensity calculation
  const thermalIntensity = useMemo(() => {
    if (activeMode === 'thermal') return 1;
    if (scrollProgress >= 0.30 && scrollProgress <= 0.55) {
      return Math.sin(((scrollProgress - 0.30) / 0.25) * Math.PI);
    }
    return 0;
  }, [scrollProgress, activeMode]);

  return (
    <>
      <ScrollCameraController scrollProgress={scrollProgress} activeMode={activeMode} />
      <CyberCityLighting scrollProgress={scrollProgress} activeMode={activeMode} />

      <fog attach="fog" args={['#04070c', 35, 100]} />

      {/* 1. PCB Motherboard Substrate (Ref 1) */}
      <MotherboardGround opacity={1} />

      {/* 2. Thermal Heat Island Layer (Ref 2) */}
      <ThermalHeatIsland intensity={thermalIntensity} />

      {/* 3. Illuminated Digital Twin Buildings (Ref 1 & 3) */}
      <CyberBuildings opacity={activeMode === 'thermal' ? 0.65 : 1} />

      {/* 4. Roads and Canopy */}
      <RoadNetwork opacity={0.8} />
      <TreeClusters opacity={Math.min(1, 0.4 + scrollProgress * 1.5)} />

      {/* 5. Central Silicon Hub & 3D Hologram Cube (Ref 1) */}
      <HolographicHub />

      {/* 6. Neon Circuit Energy Highways (Ref 1) */}
      <CircuitEnergyTrails progress={1} />

      {/* 7. Holographic Cylinders & Waypoints (Ref 3) */}
      <SmartCityWaypoints visible={activeMode !== 'circuit'} />

      {/* 8. Walking Route Splines */}
      <RouteTrail
        progress={routeProgress}
        showAlternates={showAlternates}
        glowIntensity={1.4}
      />
      <OriginMarker visible={showOrigin} />
      <DestinationMarker visible={showDestination} />
      <ParkingMarker3D visible={showParking} />
    </>
  );
};

/* ============================================================
   CityScene — Top Level Canvas Wrapper
   ============================================================ */

export const CityScene: React.FC<CitySceneProps> = (props) => {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.25,
        powerPreference: 'high-performance',
      }}
      camera={{
        fov: 45,
        near: 0.5,
        far: 250,
        position: [26, 34, 26],
      }}
      style={{
        width: '100%',
        height: '100%',
        background: '#04070c',
      }}
    >
      <Suspense fallback={null}>
        <CitySceneContent {...props} />
      </Suspense>
    </Canvas>
  );
};

export default CityScene;
