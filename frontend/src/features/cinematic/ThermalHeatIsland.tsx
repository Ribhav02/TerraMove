import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ============================================================
   ThermalHeatIsland — Urban Heat Island Visualization (Ref 2)
   Recreates the vibrant aerial infrared thermal map:
   - Intense Red/Orange/Yellow core in dense built-up center (44°C)
   - Green/Cyan/Blue cool zones in shaded & vegetated corridors (32°C)
   - Dynamic thermal heat waves and thermal contour rings
   ============================================================ */

function createThermalHeatmapTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // 1. Transparent base
  ctx.clearRect(0, 0, 1024, 1024);

  // 2. Large cool ambient zone (blue/cyan outer ring)
  const outerGrad = ctx.createRadialGradient(512, 512, 100, 512, 512, 480);
  outerGrad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
  outerGrad.addColorStop(0.5, 'rgba(30, 64, 175, 0.35)');
  outerGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = outerGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 3. Green vegetated cooling bands (like Rose Garden / Leisure Valley corridors)
  const drawCoolSplats = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, 'rgba(34, 197, 94, 0.7)');
    g.addColorStop(0.6, 'rgba(6, 182, 212, 0.4)');
    g.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  drawCoolSplats(280, 260, 220);
  drawCoolSplats(760, 320, 200);
  drawCoolSplats(340, 780, 240);

  // 4. Central Fiery Heat Core (Ref 2 — Red/Orange/Yellow dense urban core)
  const coreGrad = ctx.createRadialGradient(512, 512, 20, 512, 512, 280);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  coreGrad.addColorStop(0.15, 'rgba(254, 240, 138, 0.9)');
  coreGrad.addColorStop(0.4, 'rgba(249, 115, 22, 0.85)');
  coreGrad.addColorStop(0.7, 'rgba(239, 68, 68, 0.7)');
  coreGrad.addColorStop(0.9, 'rgba(168, 85, 247, 0.4)');
  coreGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(512, 512, 280, 0, Math.PI * 2);
  ctx.fill();

  // 5. Heat corridors radiating outward along asphalt avenues (Ref 2)
  ctx.lineWidth = 18;
  const avenues = [
    [512, 512, 900, 512],
    [512, 512, 120, 512],
    [512, 512, 512, 900],
    [512, 512, 512, 120],
    [512, 512, 800, 220],
    [512, 512, 220, 800],
  ];
  avenues.forEach(([x1, y1, x2, y2]) => {
    const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
    lineGrad.addColorStop(0, 'rgba(249, 115, 22, 0.8)');
    lineGrad.addColorStop(0.6, 'rgba(239, 68, 68, 0.5)');
    lineGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  // 6. Thermal contour rings (isotherms)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  [90, 160, 230].forEach((r) => {
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export const ThermalHeatIsland: React.FC<{ intensity?: number }> = ({ intensity = 0 }) => {
  const texture = useMemo(() => createThermalHeatmapTexture(), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef1 = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);
  const currentIntensityRef = useRef<number>(intensity);

  useFrame((state, delta) => {
    // Smooth dampening transition toward target intensity
    currentIntensityRef.current = THREE.MathUtils.damp(
      currentIntensityRef.current,
      intensity,
      6,
      delta
    );

    const val = currentIntensityRef.current;
    const t = state.clock.getElapsedTime();

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.92, val * 0.88);
      meshRef.current.visible = val > 0.005;

      // Subtle breathing pulse
      const pulse = 1 + Math.sin(t * 1.5) * 0.02;
      meshRef.current.scale.set(pulse, pulse, 1);
    }

    if (ringRef1.current) {
      const mat = ringRef1.current.material as THREE.MeshBasicMaterial;
      mat.opacity = val * 0.7;
      ringRef1.current.visible = val > 0.005;
      ringRef1.current.rotation.z = t * 0.1;
    }

    if (ringRef2.current) {
      const mat = ringRef2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = val * 0.5;
      ringRef2.current.visible = val > 0.005;
      ringRef2.current.rotation.z = -t * 0.08;
    }
  });

  return (
    <group position={[0, 0.08, 0]}>
      {/* Radiant Thermal Heatmap Plane */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[115, 115]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floating 3D Isotherm contour rings */}
      <mesh ref={ringRef1} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <ringGeometry args={[18, 18.5, 64]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={ringRef2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <ringGeometry args={[26, 26.4, 64]} />
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
