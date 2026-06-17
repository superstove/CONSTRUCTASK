import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Float } from '@react-three/drei';
import RotatingRing from './RotatingRing';
import HolographicGlow from './HolographicGlow';
import ParticleOrbit from './ParticleOrbit';
import ChatSymbol from './ChatSymbol';

function Scene({ isHovered }: { isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    if (groupRef.current) {
      // Slight floating motion (up/down 3px)
      // We scale it down a bit for the 3D coordinate system (0.03)
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
  });

  return (
    <group ref={groupRef} scale={isHovered ? 1.05 : 1} dispose={null}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      {/* 3D Elements */}
      <HolographicGlow isHovered={isHovered} />
      <RotatingRing isHovered={isHovered} />
      <ParticleOrbit isHovered={isHovered} />
      <ChatSymbol isHovered={isHovered} />
    </group>
  );
}

export default function Assistant3D({ isHovered }: { isHovered: boolean }) {
  return (
    <div className="w-full h-full relative pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene isHovered={isHovered} />
        {/* Optional: Add environment for better material reflections */}
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
