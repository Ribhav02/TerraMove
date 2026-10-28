import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ============================================================
   MotherboardGround — Cybernetic PCB Ground Plane (Ref 1)
   Generates dark metallic substrate with glowing green traces,
   IC chips, bus lines, and animated pulse packets.
   ============================================================ */

function createMotherboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Dark metallic slate background
  ctx.fillStyle = '#060a0f';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle grid
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.05)';
  ctx.lineWidth = 1;
  const gridStep = 32;
  for (let x = 0; x <= 1024; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Draw PCB circuit traces
  const rng = (s: number) => {
    let t = s;
    return () => {
      t = (t * 16807) % 2147483647;
      return (t - 1) / 2147483646;
    };
  };
  const rand = rng(1337);

  // Circuit bus traces
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 45; i++) {
    const isMajor = rand() > 0.6;
    ctx.strokeStyle = isMajor ? 'rgba(0, 255, 150, 0.7)' : 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = isMajor ? 3 : 1.5;

    let cx = Math.floor(rand() * 32) * gridStep;
    let cy = Math.floor(rand() * 32) * gridStep;

    ctx.beginPath();
    ctx.moveTo(cx, cy);

    const steps = 3 + Math.floor(rand() * 5);
    for (let s = 0; s < steps; s++) {
      const dir = Math.floor(rand() * 4);
      const len = (1 + Math.floor(rand() * 4)) * gridStep;
      if (dir === 0) cx += len;
      else if (dir === 1) cx -= len;
      else if (dir === 2) cy += len;
      else cy -= len;

      cx = Math.max(gridStep, Math.min(1024 - gridStep, cx));
      cy = Math.max(gridStep, Math.min(1024 - gridStep, cy));
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Circuit solder pad / via at ends
    ctx.fillStyle = isMajor ? '#00ff9d' : '#10b981';
    ctx.beginPath();
    ctx.arc(cx, cy, isMajor ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Golden / copper bus connectors along center
  ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
  for (let x = 128; x < 896; x += 16) {
    ctx.fillRect(x, 508, 8, 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

export const MotherboardGround: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const texture = useMemo(() => createMotherboardTexture(), []);
  const pulseGroupRef = useRef<THREE.Group>(null);

  // Animated data pulses traveling across circuit traces
  const pulseParticles = useMemo(() => {
    const count = 35;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 8 + (i % 6) * 5;
      pts.push({
        baseX: Math.cos(angle) * radius,
        baseZ: Math.sin(angle) * radius,
        speed: 0.4 + (i % 5) * 0.2,
        offset: i * 0.5,
        axis: i % 2 === 0 ? 'x' : 'z',
      });
    }
    return pts;
  }, []);

  useFrame((state) => {
    if (!pulseGroupRef.current) return;
    const t = state.clock.getElapsedTime();
    pulseGroupRef.current.children.forEach((child, i) => {
      const p = pulseParticles[i];
      if (child instanceof THREE.Mesh) {
        if (p.axis === 'x') {
          child.position.x = ((p.baseX + (t * p.speed * 8 + p.offset)) % 60) - 30;
        } else {
          child.position.z = ((p.baseZ + (t * p.speed * 8 + p.offset)) % 60) - 30;
        }
      }
    });
  });

  return (
    <group>
      {/* Dark metallic motherboard substrate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.4}
          metalness={0.7}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Raised Silicon Chip Plazas / Sockets under key city sectors */}
      {[
        { pos: [0, 0.08, 0], size: [16, 0.16, 16], label: 'CORE PLAZA' },
        { pos: [-16, 0.06, -16], size: [12, 0.12, 12], label: 'BANK SQUARE' },
        { pos: [16, 0.06, 16], size: [12, 0.12, 12], label: 'COMMERCE HUB' },
        { pos: [16, 0.06, -16], size: [10, 0.12, 10], label: 'ISBT TRANSIT' },
        { pos: [-16, 0.06, 16], size: [10, 0.12, 10], label: 'NEELAM PRECINCT' },
      ].map((chip, idx) => (
        <group key={`chip-${idx}`} position={chip.pos as [number, number, number]}>
          {/* Main silicon carrier package */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[chip.size[0], chip.size[1], chip.size[2]]} />
            <meshStandardMaterial
              color="#0b1118"
              metalness={0.85}
              roughness={0.3}
            />
          </mesh>

          {/* Glowing neon perimeter edge rim */}
          <lineSegments position={[0, chip.size[1] / 2 + 0.01, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(chip.size[0], 0.02, chip.size[2])]} />
            <lineBasicMaterial color="#00ff88" linewidth={2} />
          </lineSegments>

          {/* Microchip Contact Pins along border */}
          {Array.from({ length: 12 }).map((_, pIdx) => {
            const step = (chip.size[0] - 2) / 11;
            const px = -chip.size[0] / 2 + 1 + pIdx * step;
            return (
              <React.Fragment key={`pin-${pIdx}`}>
                <mesh position={[px, -0.02, chip.size[2] / 2 + 0.3]}>
                  <boxGeometry args={[0.3, 0.08, 0.6]} />
                  <meshStandardMaterial color="#eab308" metalness={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[px, -0.02, -chip.size[2] / 2 - 0.3]}>
                  <boxGeometry args={[0.3, 0.08, 0.6]} />
                  <meshStandardMaterial color="#eab308" metalness={0.9} roughness={0.2} />
                </mesh>
              </React.Fragment>
            );
          })}
        </group>
      ))}

      {/* Glowing animated data packets along circuit routes */}
      <group ref={pulseGroupRef}>
        {pulseParticles.map((p, idx) => (
          <mesh
            key={`pulse-${idx}`}
            position={[p.baseX, 0.1, p.baseZ]}
          >
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshBasicMaterial color="#00ff9d" />
          </mesh>
        ))}
      </group>
    </group>
  );
};
