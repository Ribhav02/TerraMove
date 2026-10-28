import React, { useMemo } from 'react';
import * as THREE from 'three';

/* ============================================================
   CyberBuildings — Futuristic Digital Twin Architecture (Ref 1 & 3)
   Dark metallic blocks with illuminated window facades,
   luminescent edge highlights, and rooftop architectural details.
   ============================================================ */

function createWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark charcoal/slate facade
  ctx.fillStyle = '#0a1017';
  ctx.fillRect(0, 0, 512, 512);

  // Floor dividers
  ctx.strokeStyle = '#05080c';
  ctx.lineWidth = 3;
  const floorHeight = 16;
  for (let y = 0; y < 512; y += floorHeight) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Windows grid
  const windowWidth = 8;
  const windowHeight = 10;
  const spacingX = 14;
  const rng = (s: number) => {
    let t = s;
    return () => {
      t = (t * 16807) % 2147483647;
      return (t - 1) / 2147483646;
    };
  };
  const rand = rng(420);

  for (let y = 4; y < 512; y += floorHeight) {
    for (let x = 4; x < 512; x += spacingX) {
      const isLit = rand() > 0.45;
      if (isLit) {
        // Vary window color: warm white, amber, or high-tech cyan
        const type = rand();
        if (type > 0.85) {
          ctx.fillStyle = '#67e8f9'; // Cyan LED
        } else if (type > 0.5) {
          ctx.fillStyle = '#fef08a'; // Warm amber office
        } else {
          ctx.fillStyle = '#f8fafc'; // Neutral office light
        }
        ctx.fillRect(x, y, windowWidth, windowHeight);
      } else {
        ctx.fillStyle = '#0f172a'; // Dark unlit window
        ctx.fillRect(x, y, windowWidth, windowHeight);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

interface BuildingProps {
  position: [number, number, number];
  size: [number, number, number];
  isLandmark?: boolean;
  hasCourtyard?: boolean;
}

function generateSector17CyberCity(): BuildingProps[] {
  const buildings: BuildingProps[] = [];
  const rng = (s: number) => {
    let t = s;
    return () => {
      t = (t * 16807) % 2147483647;
      return (t - 1) / 2147483646;
    };
  };
  const rand = rng(999);

  const blockSize = 8;
  const roadWidth = 3.5;
  const gridStep = blockSize + roadWidth;

  // Grid blocks
  for (let bx = -3; bx <= 3; bx++) {
    for (let bz = -3; bz <= 3; bz++) {
      // Leave center plaza open for microchip hub
      if (bx === 0 && bz === 0) continue;

      const cx = bx * gridStep;
      const cz = bz * gridStep;

      // Special architectural typology for Chandigarh Sector 17
      const isCorner = Math.abs(bx) === 2 && Math.abs(bz) === 2;
      const isBankSquare = bx === -1 && bz === -1;
      const isCommerce = bx === 1 && bz === 1;

      if (isBankSquare || isCommerce) {
        // Courtyard commercial complex
        const h = 4 + rand() * 2;
        buildings.push({
          position: [cx, h / 2 + 0.1, cz],
          size: [6.5, h, 6.5],
          hasCourtyard: true,
        });
      } else if (isCorner) {
        // Modern tech tower
        const h = 8 + rand() * 5;
        buildings.push({
          position: [cx, h / 2 + 0.1, cz],
          size: [3.5, h, 3.5],
          isLandmark: true,
        });
      } else {
        // Cluster of 2-4 mid-rise commercial blocks
        const count = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < count; i++) {
          const ox = (rand() - 0.5) * (blockSize - 2.5);
          const oz = (rand() - 0.5) * (blockSize - 2.5);
          const w = 1.8 + rand() * 2;
          const d = 1.8 + rand() * 2;
          const h = 2.5 + rand() * 4.5;
          buildings.push({
            position: [cx + ox, h / 2 + 0.1, cz + oz],
            size: [w, h, d],
          });
        }
      }
    }
  }

  return buildings;
}

export const CyberBuildings: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const windowTexture = useMemo(() => createWindowTexture(), []);
  const rawBuildings = useMemo(() => generateSector17CyberCity(), []);

  // Pre-create and memoize geometries once for high FPS
  const buildingsWithGeom = useMemo(() => {
    return rawBuildings.map((b) => {
      const box = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
      const edges = new THREE.EdgesGeometry(box);
      return {
        ...b,
        boxGeom: box,
        edgesGeom: edges,
      };
    });
  }, [rawBuildings]);

  return (
    <group>
      {buildingsWithGeom.map((b, idx) => {
        const edgeColor = b.isLandmark ? '#00ff88' : '#38bdf8';
        const edgeOpacity = b.isLandmark ? 0.7 : 0.35;

        return (
          <group key={`cb-${idx}`} position={b.position}>
            {/* Main Building Body */}
            <mesh castShadow receiveShadow geometry={b.boxGeom}>
              <meshStandardMaterial
                map={windowTexture}
                color="#cbd5e1"
                metalness={0.7}
                roughness={0.35}
                transparent
                opacity={opacity}
              />
            </mesh>

            {/* Glowing Wireframe CAD Edges (Ref 1 & 3) */}
            <lineSegments geometry={b.edgesGeom}>
              <lineBasicMaterial
                color={edgeColor}
                transparent
                opacity={opacity * edgeOpacity}
              />
            </lineSegments>

            {/* Rooftop Tech Detailing / Antenna / Beacon */}
            {b.isLandmark && (
              <group position={[0, b.size[1] / 2, 0]}>
                {/* Rooftop helipad/equipment platform */}
                <mesh position={[0, 0.1, 0]}>
                  <boxGeometry args={[b.size[0] * 0.7, 0.2, b.size[2] * 0.7]} />
                  <meshStandardMaterial color="#0b131a" metalness={0.9} roughness={0.2} />
                </mesh>
                {/* Spire antenna */}
                <mesh position={[0, 1.2, 0]}>
                  <cylinderGeometry args={[0.04, 0.08, 2, 8]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Red warning beacon at tip */}
                <mesh position={[0, 2.2, 0]}>
                  <sphereGeometry args={[0.1, 8, 8]} />
                  <meshBasicMaterial color="#ef4444" />
                </mesh>
              </group>
            )}

            {/* Courtyard hollow cutout effect */}
            {b.hasCourtyard && (
              <mesh position={[0, b.size[1] / 2 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[b.size[0] * 0.45, b.size[2] * 0.45]} />
                <meshStandardMaterial color="#030712" roughness={0.9} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};
