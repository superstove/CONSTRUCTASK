import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function ParticleOrbit({ isHovered }: { isHovered: boolean }) {
  const pointsRef = useRef<THREE.Points>(null!);
  
  // Generate 60 random particles in a sphere around the center
  const [positions, phases] = useMemo(() => {
    const pos = new Float32Array(60 * 3);
    const ph = new Float32Array(60);
    for (let i = 0; i < 60; i++) {
      // Random position in a spherical shell (radius 1.5 to 3.0)
      const r = 1.5 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      
      ph[i] = Math.random() * Math.PI * 2;
    }
    return [pos, ph];
  }, []);

  useFrame((state, delta) => {
    const speed = isHovered ? 1.5 : 0.8;
    if (pointsRef.current) {
      // Orbit rotation
      pointsRef.current.rotation.y += delta * 0.2 * speed;
      pointsRef.current.rotation.z += delta * 0.1 * speed;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.08} 
        color="#22d3ee" 
        transparent 
        opacity={isHovered ? 0.9 : 0.6} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
