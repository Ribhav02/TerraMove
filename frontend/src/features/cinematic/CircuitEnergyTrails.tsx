import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ============================================================
   CircuitEnergyTrails — High-Tech Neon Data Bus Arteries (Ref 1)
   Creates luminous multi-lane energy ribbons with branching
   sub-traces and zooming photon packets.
   ============================================================ */

export const CircuitEnergyTrails: React.FC<{ progress?: number }> = ({ progress = 1 }) => {
  const photonGroupRef = useRef<THREE.Group>(null);
  const clampedProgress = Math.min(1, Math.max(0, progress));

  // Generate main artery paths mimicking PCB bus ribbon
  const mainArteries = useMemo(() => {
    // Main boulevard ribbon traversing through Sector 17
    const points1 = [
      new THREE.Vector3(-35, 0.12, -22),
      new THREE.Vector3(-20, 0.12, -22),
      new THREE.Vector3(-8, 0.12, -10),
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(12, 0.12, 8),
      new THREE.Vector3(25, 0.12, 8),
      new THREE.Vector3(38, 0.12, 24),
    ];

    // Branching north-south bus artery
    const points2 = [
      new THREE.Vector3(-16, 0.12, 35),
      new THREE.Vector3(-16, 0.12, 12),
      new THREE.Vector3(-8, 0.12, -10),
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(16, 0.12, -14),
      new THREE.Vector3(16, 0.12, -35),
    ];

    const curve1 = new THREE.CatmullRomCurve3(points1, false, 'catmullrom', 0.2);
    const curve2 = new THREE.CatmullRomCurve3(points2, false, 'catmullrom', 0.2);

    return [
      { geom: new THREE.TubeGeometry(curve1, 64, 0.35, 8, false), color: '#00ff88' },
      { geom: new THREE.TubeGeometry(curve1, 64, 0.18, 8, false), color: '#10b981' },
      { geom: new THREE.TubeGeometry(curve2, 64, 0.28, 8, false), color: '#38bdf8' },
      { geom: new THREE.TubeGeometry(curve2, 64, 0.15, 8, false), color: '#0284c7' },
    ];
  }, []);

  // Photons zooming along arteries
  const photons = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      arteryIdx: i % 2,
      speed: 0.15 + (i % 5) * 0.05,
      offset: (i / 24),
      size: 0.18 + (i % 3) * 0.06,
    }));
  }, []);

  useFrame((state) => {
    if (!photonGroupRef.current) return;
    const t = state.clock.getElapsedTime();

    photonGroupRef.current.children.forEach((child, idx) => {
      const p = photons[idx];
      const curve = mainArteries[p.arteryIdx === 0 ? 0 : 2].geom.parameters.path;
      const u = ((t * p.speed + p.offset) % 1);
      const pos = curve.getPointAt(u);
      child.position.copy(pos);
      child.position.y += 0.08;
    });
  });

  return (
    <group>
      {/* Multi-lane luminous tube conduits */}
      {mainArteries.map((art, idx) => (
        <mesh key={`art-${idx}`} geometry={art.geom}>
          <meshBasicMaterial
            color={art.color}
            transparent
            opacity={0.85 * clampedProgress}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Zooming Data Photons (Ref 1) */}
      <group ref={photonGroupRef} visible={clampedProgress > 0.05} scale={clampedProgress}>
        {photons.map((p, idx) => (
          <mesh key={`photon-${idx}`}>
            <sphereGeometry args={[p.size, 12, 12]} />
            <meshBasicMaterial
              color={p.arteryIdx === 0 ? '#ffffff' : '#67e8f9'}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
