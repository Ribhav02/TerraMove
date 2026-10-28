import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ============================================================
   HolographicHub — Futuristic Microchip Plaza & Holograms (Ref 1 & 3)
   Features:
   - Raised glowing CPU die with circuit pins
   - Rotating wireframe holographic cube
   - 3D animated holographic bar graph
   - Translucent HUD data vis projection screens
   - Vertical holographic telemetry pillars & light beams
   ============================================================ */

function createHoloHudTexture(title: string, sub: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Transparent dark neon glass
  ctx.fillStyle = 'rgba(6, 18, 25, 0.85)';
  ctx.fillRect(0, 0, 512, 256);

  // Border with corner ticks
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 236);

  // Corner brackets
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(6, 6, 24, 6);
  ctx.fillRect(6, 6, 6, 24);
  ctx.fillRect(482, 6, 24, 6);
  ctx.fillRect(500, 6, 6, 24);

  // Text Title
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(title, 24, 48);

  ctx.fillStyle = '#a7f3d0';
  ctx.font = '16px monospace';
  ctx.fillText(sub, 24, 76);

  // Mini waveform / line chart
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 160);
  const pts = [160, 140, 175, 120, 130, 95, 145, 110, 80, 130, 100];
  pts.forEach((y, i) => {
    ctx.lineTo(24 + i * 44, y);
  });
  ctx.stroke();

  // Grid background under chart
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1;
  for (let y = 100; y <= 200; y += 25) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(480, y);
    ctx.stroke();
  }

  // Live status telemetry
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('STATUS: SYNCHRONIZED  •  HEAT DELTA: -8.4°C', 24, 220);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export const HolographicHub: React.FC = () => {
  const cubeRef = useRef<THREE.Mesh>(null);
  const secondaryCubeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const barsGroupRef = useRef<THREE.Group>(null);

  const hudTexture1 = useMemo(() => createHoloHudTexture('TERRAMOVE // SEC-17 CORE', 'MOBILITY ENGINE ONLINE'), []);
  const hudTexture2 = useMemo(() => createHoloHudTexture('SOLAR CANOPY TELEMETRY', 'SHADE OPTIMIZATION ACTIVE'), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Rotate holographic cube
    if (cubeRef.current) {
      cubeRef.current.rotation.x = t * 0.8;
      cubeRef.current.rotation.y = t * 1.1;
      cubeRef.current.position.y = 3.6 + Math.sin(t * 2) * 0.25;
    }

    if (secondaryCubeRef.current) {
      secondaryCubeRef.current.rotation.x = -t * 0.6;
      secondaryCubeRef.current.rotation.z = t * 0.9;
      secondaryCubeRef.current.position.y = 3.2 + Math.cos(t * 2) * 0.2;
    }

    // Pulse scanning ring
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
      const scale = 1 + Math.sin(t * 3) * 0.08;
      ringRef.current.scale.set(scale, scale, 1);
    }

    // Animate holographic 3D bar graph
    if (barsGroupRef.current) {
      barsGroupRef.current.children.forEach((child, idx) => {
        if (child instanceof THREE.Mesh) {
          const barScaleY = 0.5 + Math.abs(Math.sin(t * 3 + idx * 0.7)) * 2.2;
          child.scale.y = barScaleY;
          child.position.y = 0.8 + barScaleY / 2;
        }
      });
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Central High-Tech Microchip Pedestal (Ref 1) */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[7, 0.8, 7]} />
        <meshStandardMaterial color="#080e14" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Raised Silicon Die with green emissive core */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[5, 0.2, 5]} />
        <meshStandardMaterial
          color="#064e3b"
          emissive="#00ff88"
          emissiveIntensity={0.6}
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>

      {/* Stepped concentric glowing base rings */}
      <mesh ref={ringRef} position={[0, 0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.8, 3.2, 32]} />
        <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.97, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.8, 4.0, 32]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>

      {/* Floating Holographic Rotating Wireframe Cube (Ref 1) */}
      <mesh ref={cubeRef} position={[-1.8, 3.6, -1.8]}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshBasicMaterial color="#00ff88" wireframe />
      </mesh>

      {/* Inner glowing core for the cube */}
      <mesh position={[-1.8, 3.6, -1.8]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial
          color="#10b981"
          emissive="#00ff88"
          emissiveIntensity={1.5}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Secondary Holographic Polyhedron at second hub */}
      <group position={[16, 0, 16]}>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[5, 0.6, 5]} />
          <meshStandardMaterial color="#0b1118" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh ref={secondaryCubeRef} position={[0, 3.2, 0]}>
          <octahedronGeometry args={[1.2, 0]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
        <mesh position={[0, 3.2, 0]}>
          <octahedronGeometry args={[0.5, 0]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      </group>

      {/* 3D Animated Holographic Bar Graph (Ref 1) */}
      <group ref={barsGroupRef} position={[1.2, 0.96, 1.2]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={`bar-${i}`} position={[(i % 3) * 0.6 - 0.6, 1, Math.floor(i / 3) * 0.6 - 0.3]}>
            <boxGeometry args={[0.4, 1, 0.4]} />
            <meshStandardMaterial
              color="#00ff88"
              emissive="#10b981"
              emissiveIntensity={1.2}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
      </group>

      {/* Translucent Holographic HUD Screen 1 (Ref 1 & 3) */}
      <group position={[0, 3.5, 2.8]} rotation={[0, 0, 0]}>
        <mesh>
          <planeGeometry args={[4.2, 2.1]} />
          <meshBasicMaterial
            map={hudTexture1}
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Translucent Holographic HUD Screen 2 */}
      <group position={[-2.8, 3.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[3.8, 1.9]} />
          <meshBasicMaterial
            map={hudTexture2}
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Vertical Holographic Telemetry Pillar / Sky Beam (Ref 3) */}
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[0.08, 0.25, 32, 16]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[0.3, 0.7, 32, 16]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.15} />
      </mesh>
    </group>
  );
};
