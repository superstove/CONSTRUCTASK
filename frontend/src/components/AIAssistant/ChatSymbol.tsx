import React from 'react';
import { RoundedBox } from '@react-three/drei';

export default function ChatSymbol({ isHovered }: { isHovered: boolean }) {
  const primaryColor = "#0ea5e9";
  const secondaryColor = "#0284c7";

  return (
    <group scale={isHovered ? 1.1 : 1} position={[0, 0, 0]} transition-all duration-300>
      {/* Back Bubble (Darker, shifted up and right) */}
      <group position={[0.4, 0.4, -0.2]}>
        <RoundedBox args={[1.4, 1.0, 0.2]} radius={0.2} smoothness={4}>
          <meshStandardMaterial 
            color={secondaryColor} 
            emissive={secondaryColor}
            emissiveIntensity={isHovered ? 1.5 : 0.8}
            transparent
            opacity={0.8}
          />
        </RoundedBox>
        {/* The little tail for the back bubble */}
        <mesh position={[0.5, -0.5, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.3, 0.3, 0.2]} />
          <meshStandardMaterial color={secondaryColor} emissive={secondaryColor} emissiveIntensity={isHovered ? 1.5 : 0.8} transparent opacity={0.8} />
        </mesh>
      </group>

      {/* Front Bubble (Lighter, shifted down and left) */}
      <group position={[-0.2, -0.2, 0.2]}>
        <RoundedBox args={[1.6, 1.2, 0.2]} radius={0.2} smoothness={4}>
          <meshStandardMaterial 
            color={primaryColor} 
            emissive={primaryColor}
            emissiveIntensity={isHovered ? 2 : 1.2}
            transparent
            opacity={0.9}
          />
        </RoundedBox>
        {/* The little tail for the front bubble */}
        <mesh position={[-0.5, -0.6, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.3, 0.3, 0.2]} />
          <meshStandardMaterial color={primaryColor} emissive={primaryColor} emissiveIntensity={isHovered ? 2 : 1.2} transparent opacity={0.9} />
        </mesh>
        
        {/* Inner lines to represent text */}
        <mesh position={[0, 0.2, 0.11]}>
          <planeGeometry args={[0.8, 0.1]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
        <mesh position={[-0.1, -0.2, 0.11]}>
          <planeGeometry args={[0.6, 0.1]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      </group>
    </group>
  );
}
