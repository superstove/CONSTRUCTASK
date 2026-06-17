import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function HolographicGlow({ isHovered }: { isHovered: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    // Inner glow pulses every 2s
    const pulse = Math.sin(state.clock.elapsedTime * Math.PI) * 0.5 + 0.5; // 0 to 1
    const baseIntensity = isHovered ? 4 : 2;
    
    if (lightRef.current) {
      lightRef.current.intensity = baseIntensity + pulse * 1.5;
    }
    
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (isHovered ? 0.3 : 0.15) + (pulse * 0.15);
    }
  });

  return (
    <group>
      <pointLight ref={lightRef} color="#00f0ff" distance={8} decay={2} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial 
          color="#06b6d4" 
          transparent 
          opacity={0.2} 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
        />
      </mesh>
    </group>
  );
}
