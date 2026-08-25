import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

function Rocket({ orientation }: { orientation: [number, number, number, number] }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const [w, x, y, z] = orientation;
    group.current?.quaternion.set(x, y, z, w).normalize();
  });
  return (
    <group ref={group} rotation={[Math.PI / 18, 0, -Math.PI / 12]}>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.38, 0.48, 2.6, 32]} /><meshStandardMaterial color="#dce5e8" metalness={0.72} roughness={0.28} /></mesh>
      <mesh position={[0, 1.8, 0]}><coneGeometry args={[0.38, 0.85, 32]} /><meshStandardMaterial color="#f3f7f8" metalness={0.6} roughness={0.25} /></mesh>
      <mesh position={[0, -1.15, 0]}><cylinderGeometry args={[0.3, 0.2, 0.35, 24]} /><meshStandardMaterial color="#29343a" metalness={0.9} roughness={0.2} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.5, -0.75, 0]} rotation={[0, 0, side * -0.35]}><boxGeometry args={[0.08, 0.75, 0.5]} /><meshStandardMaterial color="#c65038" /></mesh>)}
    </group>
  );
}

export function RocketView({ orientation, active }: { orientation: [number, number, number, number]; active: boolean }) {
  return (
    <div className="rocket-view" aria-label="Quaternion-driven rocket orientation">
      <Canvas camera={{ position: [4.6, 2.4, 5.2], fov: 35 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#0a1014"]} />
        <ambientLight intensity={1.2} /><directionalLight position={[4, 6, 5]} intensity={3.5} color="#e8f6ff" />
        <pointLight position={[-3, -2, 3]} intensity={active ? 5 : 1.5} color="#e86c3e" />
        <Rocket orientation={orientation} />
        <gridHelper args={[10, 20, "#1a4d57", "#10272d"]} position={[0, -1.35, 0]} />
      </Canvas>
      <span className="view-label">ATTITUDE / BODY FRAME</span>
    </div>
  );
}
