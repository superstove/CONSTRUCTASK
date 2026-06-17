import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function RotatingRing({ isHovered }: { isHovered: boolean }) {
  const outerRingRef = useRef<THREE.Mesh>(null!);
  const innerRingRef = useRef<THREE.Mesh>(null!);

  useFrame((state, delta) => {
    const rotationSpeed = isHovered ? 1.5 : 1;
    
    // Outer ring rotates slowly (360° every 15s = 0.418 rad/s)
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z -= delta * 0.418 * rotationSpeed;
    }
    
    // Inner ring rotates slightly faster in opposite direction
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * 0.6 * rotationSpeed;
    }
  });

  return (
    <group rotation={[Math.PI / 2.2, 0, 0]}>
      {/* Outer segmented ring */}
      <mesh ref={outerRingRef}>
        <torusGeometry args={[2.2, 0.08, 16, 64, Math.PI * 1.5]} />
        <meshStandardMaterial 
          color="#00f0ff" 
          emissive="#00f0ff" 
          emissiveIntensity={isHovered ? 2 : 1.2} 
          transparent 
          opacity={0.8} 
          wireframe={true}
        />
      </mesh>

      {/* Inner continuous thin ring */}
      <mesh ref={innerRingRef}>
        <torusGeometry args={[1.8, 0.03, 16, 100]} />
        <meshStandardMaterial 
          color="#0ea5e9" 
          emissive="#0ea5e9" 
          emissiveIntensity={isHovered ? 3 : 1.5} 
          transparent 
          opacity={0.9} 
        />
      </mesh>
    </group>
  );
}
