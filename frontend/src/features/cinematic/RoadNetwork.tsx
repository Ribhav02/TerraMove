import React, { useMemo } from 'react';
import * as THREE from 'three';

/* ============================================================
   RoadNetwork — Procedural road geometry for the 3D city
   Creates road planes in a grid pattern matching the building layout
   ============================================================ */

interface RoadSegment {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: number;
}

function generateRoads(): RoadSegment[] {
  const roads: RoadSegment[] = [];
  const blockSize = 8;
  const roadWidth = 3;
  const gridStep = blockSize + roadWidth;
  const extent = 4;

  // Horizontal roads (along X)
  for (let bz = -extent; bz <= extent; bz++) {
    const z = bz * gridStep - gridStep / 2 + blockSize / 2;
    roads.push({
      position: [0, 0.02, z],
      scale: [extent * 2 * gridStep + roadWidth, 1, roadWidth],
      rotation: 0
    });
  }

  // Vertical roads (along Z)
  for (let bx = -extent; bx <= extent; bx++) {
    const x = bx * gridStep - gridStep / 2 + blockSize / 2;
    roads.push({
      position: [x, 0.02, 0],
      scale: [roadWidth, 1, extent * 2 * gridStep + roadWidth],
      rotation: 0
    });
  }

  return roads;
}

export const RoadNetwork: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const roads = useMemo(() => generateRoads(), []);

  return (
    <group>
      {roads.map((road, i) => (
        <mesh
          key={i}
          position={road.position}
          receiveShadow
        >
          <planeGeometry args={[road.scale[0], road.scale[2]]} />
          <meshStandardMaterial
            color="#1a2320"
            transparent
            opacity={opacity * 0.9}
            roughness={0.95}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* Road markings — subtle center lines */}
      {roads.slice(0, Math.floor(roads.length / 2)).map((road, i) => (
        <mesh
          key={`mark-${i}`}
          position={[road.position[0], 0.03, road.position[2]]}
          receiveShadow
        >
          <planeGeometry args={[road.scale[0] * 0.98, 0.15]} />
          <meshStandardMaterial
            color="#2a3a35"
            transparent
            opacity={opacity * 0.5}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

/* ============================================================
   TreeClusters — Instanced tree geometry for green spaces
   ============================================================ */

interface TreeData {
  position: [number, number, number];
  scale: number;
}

function generateTrees(): TreeData[] {
  const trees: TreeData[] = [];
  const rng = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  };
  const random = rng(137);

  const blockSize = 8;
  const roadWidth = 3;
  const gridStep = blockSize + roadWidth;

  // Trees along road edges
  for (let bx = -3; bx <= 3; bx++) {
    for (let bz = -3; bz <= 3; bz++) {
      const cx = bx * gridStep;
      const cz = bz * gridStep;

      // Trees along road edges for each block
      for (let side = 0; side < 4; side++) {
        if (random() > 0.6) continue; // Not every edge has trees

        const numTrees = 1 + Math.floor(random() * 3);
        for (let t = 0; t < numTrees; t++) {
          let tx = cx, tz = cz;
          const offset = (random() - 0.5) * blockSize * 0.8;
          const edgeOffset = blockSize / 2 + 0.8;

          switch (side) {
            case 0: tx += offset; tz -= edgeOffset; break; // North
            case 1: tx += offset; tz += edgeOffset; break; // South
            case 2: tx -= edgeOffset; tz += offset; break; // West
            case 3: tx += edgeOffset; tz += offset; break; // East
          }

          const scale = 0.6 + random() * 0.6;
          trees.push({ position: [tx, 0, tz], scale });
        }
      }
    }
  }

  return trees;
}

export const TreeClusters: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const trees = useMemo(() => generateTrees(), []);

  return (
    <group>
      {trees.map((tree, i) => (
        <group key={i} position={tree.position}>
          {/* Trunk */}
          <mesh position={[0, tree.scale * 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.06 * tree.scale, 0.1 * tree.scale, tree.scale * 1.2, 6]} />
            <meshStandardMaterial
              color="#3a2a1a"
              transparent
              opacity={opacity}
              roughness={0.9}
            />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, tree.scale * 1.4, 0]} castShadow>
            <sphereGeometry args={[tree.scale * 0.7, 8, 6]} />
            <meshStandardMaterial
              color="#2d5a3a"
              transparent
              opacity={opacity * 0.9}
              roughness={0.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default RoadNetwork;
