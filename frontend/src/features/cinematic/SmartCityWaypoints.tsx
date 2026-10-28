import React, { useMemo } from 'react';
import * as THREE from 'three';

/* ============================================================
   SmartCityWaypoints — Holographic Cylinders & Boundary (Ref 3)
   - Translucent holographic forcefield cylinders
   - Luminous neon perimeter boundary around Sector 17
   - Vertical landmark light pillars
   - High-tech floating POI badges
   ============================================================ */

function createPoiBadgeTexture(title: string, subtitle: string, code: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(6, 18, 25, 0.9)';
  ctx.fillRect(0, 0, 384, 128);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 372, 116);

  // Top code badge
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(code, 18, 28);

  // Main Landmark Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(title, 18, 62);

  // Subtitle
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle, 18, 92);

  // Status dot
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(350, 32, 6, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export const SmartCityWaypoints: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const landmarks = useMemo(() => [
    {
      pos: [0, 0, 0] as [number, number, number],
      title: 'Central Plaza',
      sub: 'Sector 17 Commercial Heart',
      code: 'NODE // SEC17-CP',
      radius: 5,
      height: 9,
      color: '#38bdf8',
      texture: createPoiBadgeTexture('Central Plaza', 'Sector 17 Commercial Heart', 'NODE // SEC17-CP'),
    },
    {
      pos: [-16, 0, -16] as [number, number, number],
      title: 'Bank Square',
      sub: 'Financial & Pedestrian Hub',
      code: 'NODE // SEC17-BS',
      radius: 4,
      height: 7,
      color: '#00ff88',
      texture: createPoiBadgeTexture('Bank Square', 'Financial & Pedestrian Hub', 'NODE // SEC17-BS'),
    },
    {
      pos: [16, 0, 16] as [number, number, number],
      title: 'Rose Garden Corridor',
      sub: 'Cooling Tree Canopy Buffer',
      code: 'ECO // CORRIDOR-01',
      radius: 4.5,
      height: 8,
      color: '#22c55e',
      texture: createPoiBadgeTexture('Rose Garden Corridor', 'Cooling Tree Canopy Buffer', 'ECO // CORRIDOR-01'),
    },
    {
      pos: [-16, 0, 16] as [number, number, number],
      title: 'Neelam Precinct',
      sub: 'Retail & Shaded Colonnade',
      code: 'NODE // SEC17-NL',
      radius: 3.5,
      height: 6,
      color: '#f59e0b',
      texture: createPoiBadgeTexture('Neelam Precinct', 'Retail & Shaded Colonnade', 'NODE // SEC17-NL'),
    },
  ], []);

  // Perimeter boundary contour points around Sector 17 (Ref 3)
  const boundaryPoints = useMemo(() => {
    return [
      new THREE.Vector3(-24, 0.15, -24),
      new THREE.Vector3(24, 0.15, -24),
      new THREE.Vector3(24, 0.15, 6),
      new THREE.Vector3(12, 0.15, 24),
      new THREE.Vector3(-24, 0.15, 24),
      new THREE.Vector3(-24, 0.15, -24),
    ];
  }, []);

  const boundaryGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(boundaryPoints);
  }, [boundaryPoints]);

  if (!visible) return null;

  return (
    <group>
      {/* Neon Sector 17 Perimeter Boundary (Ref 3) */}
      <line geometry={boundaryGeometry}>
        <lineBasicMaterial color="#00ff88" linewidth={3} />
      </line>

      {/* Boundary Floor Glow Ribbon */}
      {boundaryPoints.slice(0, -1).map((pt, i) => {
        const nextPt = boundaryPoints[i + 1];
        const midX = (pt.x + nextPt.x) / 2;
        const midZ = (pt.z + nextPt.z) / 2;
        const dist = pt.distanceTo(nextPt);
        const angle = Math.atan2(nextPt.z - pt.z, nextPt.x - pt.x);

        return (
          <mesh
            key={`bound-ribbon-${i}`}
            position={[midX, 0.09, midZ]}
            rotation={[-Math.PI / 2, 0, -angle]}
          >
            <planeGeometry args={[dist, 0.6]} />
            <meshBasicMaterial
              color="#00ff88"
              transparent
              opacity={0.35}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {/* Holographic Cylinders & Landmark Badges (Ref 3) */}
      {landmarks.map((lm, idx) => {
        const badgeTexture = lm.texture;
        return (
          <group key={`lm-${idx}`} position={lm.pos}>
            {/* Holographic Forcefield Cylinder */}
            <mesh position={[0, lm.height / 2, 0]}>
              <cylinderGeometry args={[lm.radius, lm.radius, lm.height, 32, 1, true]} />
              <meshBasicMaterial
                color={lm.color}
                transparent
                opacity={0.12}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {/* Glowing Top Ring on Cylinder */}
            <mesh position={[0, lm.height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[lm.radius - 0.1, lm.radius + 0.1, 32]} />
              <meshBasicMaterial
                color={lm.color}
                transparent
                opacity={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Vertical Sky Laser Beam */}
            <mesh position={[0, 18, 0]}>
              <cylinderGeometry args={[0.05, 0.15, 36, 12]} />
              <meshBasicMaterial
                color={lm.color}
                transparent
                opacity={0.5}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {/* Floating POI Billboard HUD Badge */}
            <group position={[0, lm.height + 2, 0]}>
              <mesh>
                <planeGeometry args={[3.2, 1.1]} />
                <meshBasicMaterial
                  map={badgeTexture}
                  transparent
                  opacity={0.9}
                  side={THREE.DoubleSide}
                />
              </mesh>
              {/* Connecting vertical tether line */}
              <mesh position={[0, -1, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 2, 8]} />
                <meshBasicMaterial color={lm.color} transparent opacity={0.6} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
};
