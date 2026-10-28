import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';

/* ============================================================
   CityBuildings — Instanced procedural buildings for Sector 17
   Uses InstancedMesh for performance
   ============================================================ */

interface BuildingData {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}

function generateBuildings(): BuildingData[] {
  const buildings: BuildingData[] = [];
  const rng = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  };
  const random = rng(42);

  // Sector 17 grid layout — blocks of buildings with roads between them
  const blockSize = 8;
  const roadWidth = 3;
  const gridStep = blockSize + roadWidth;

  for (let bx = -3; bx <= 3; bx++) {
    for (let bz = -3; bz <= 3; bz++) {
      const blockCenterX = bx * gridStep;
      const blockCenterZ = bz * gridStep;

      // Each block gets 2-6 buildings
      const numBuildings = 2 + Math.floor(random() * 5);
      for (let i = 0; i < numBuildings; i++) {
        const ox = (random() - 0.5) * (blockSize - 2);
        const oz = (random() - 0.5) * (blockSize - 2);
        const w = 1.0 + random() * 2.5;
        const d = 1.0 + random() * 2.5;
        // Height varies: mostly 2-6 stories, occasional taller
        let h = 2 + random() * 4;
        if (random() > 0.85) h = 5 + random() * 6; // tall landmark
        if (random() > 0.95) h = 8 + random() * 5; // tower

        // Color: dark tones with subtle variation
        const brightness = 0.12 + random() * 0.08;
        const greenTint = 0.02 + random() * 0.04;
        const color = `rgb(${Math.floor(brightness * 220)}, ${Math.floor((brightness + greenTint) * 240)}, ${Math.floor((brightness + greenTint * 0.5) * 230)})`;

        buildings.push({
          position: [blockCenterX + ox, h / 2, blockCenterZ + oz],
          scale: [w, h, d],
          color
        });
      }
    }
  }
  return buildings;
}

export const CityBuildings: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const buildings = useMemo(() => generateBuildings(), []);

  const { matrix, colors } = useMemo(() => {
    const mat = new THREE.Matrix4();
    const matrices: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const color = new THREE.Color();

    buildings.forEach((b) => {
      mat.identity();
      mat.makeScale(b.scale[0], b.scale[1], b.scale[2]);
      mat.setPosition(b.position[0], b.position[1], b.position[2]);
      matrices.push(mat.clone());
      color.setStyle(b.color);
      cols.push(color.clone());
    });

    return { matrix: matrices, colors: cols };
  }, [buildings]);

  React.useEffect(() => {
    if (!meshRef.current) return;
    matrix.forEach((m, i) => {
      meshRef.current!.setMatrixAt(i, m);
      meshRef.current!.setColorAt(i, colors[i]);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [matrix, colors]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, buildings.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        transparent
        opacity={opacity}
        roughness={0.85}
        metalness={0.1}
      />
    </instancedMesh>
  );
};

export default CityBuildings;
