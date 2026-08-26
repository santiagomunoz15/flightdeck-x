import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Box3, BufferGeometry, Group, Line as ThreeLine, LineBasicMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Position = [number, number, number];

const MAX_DISPLAY_ALTITUDE_M = 2500;
const ROCKET_HEIGHT_M = 50;
const ROCKET_DISPLAY_HEIGHT = 1.2;
const ROCKET_DISPLAY_SCALE = ROCKET_DISPLAY_HEIGHT / ROCKET_HEIGHT_M;
const ALTITUDE_DISPLAY_TRAVEL = 2.6;
const GROUND_Y = -1.35;

function scenePosition(position: Position): Vector3 {
  const displayAltitude = Math.min(Math.max(position[2], 0), MAX_DISPLAY_ALTITUDE_M) / MAX_DISPLAY_ALTITUDE_M;
  const landedRocketCenter = GROUND_Y + ROCKET_DISPLAY_HEIGHT / 2;
  return new Vector3(position[0] / 1000, landedRocketCenter + displayAltitude * ALTITUDE_DISPLAY_TRAVEL, -position[1] / 1000);
}

function TrajectoryTrail({ positions }: { positions: Position[] }) {
  const trail = useMemo(() => {
    const geometry = new BufferGeometry().setFromPoints(positions.map(scenePosition));
    const material = new LineBasicMaterial({ color: "#67d6c7", transparent: true, opacity: 0.68 });
    return new ThreeLine(geometry, material);
  }, [positions]);
  useEffect(() => () => {
    trail.geometry.dispose();
    (trail.material as LineBasicMaterial).dispose();
  }, [trail]);
  return <primitive object={trail} />;
}

function FallbackRocket() {
  return (
    <>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.38, 0.48, 2.6, 32]} /><meshStandardMaterial color="#dce5e8" metalness={0.72} roughness={0.28} /></mesh>
      <mesh position={[0, 1.8, 0]}><coneGeometry args={[0.38, 0.85, 32]} /><meshStandardMaterial color="#f3f7f8" metalness={0.6} roughness={0.25} /></mesh>
      <mesh position={[0, -1.15, 0]}><cylinderGeometry args={[0.3, 0.2, 0.35, 24]} /><meshStandardMaterial color="#29343a" metalness={0.9} roughness={0.2} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.5, -0.75, 0]} rotation={[0, 0, side * -0.35]}><boxGeometry args={[0.08, 0.75, 0.5]} /><meshStandardMaterial color="#c65038" /></mesh>)}
    </>
  );
}

function FlightModel() {
  const { scene } = useLoader(GLTFLoader, "/models/Falcon9.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const modelOffset = useMemo(
    () => new Box3().setFromObject(model).getCenter(new Vector3()).multiplyScalar(-ROCKET_DISPLAY_SCALE),
    [model],
  );
  return (
    <primitive
      object={model}
      scale={ROCKET_DISPLAY_SCALE}
      position={modelOffset}
    />
  );
}

function Rocket({ orientation, position }: { orientation: [number, number, number, number]; position: Position }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const [w, x, y, z] = orientation;
    if (group.current) {
      group.current.quaternion.set(x, y, z, w).normalize();
      // Telemetry is East-North-Up; Three.js uses Y as its vertical display axis.
      group.current.position.copy(scenePosition(position));
    }
  });
  return (
    <group ref={group}>
      <Suspense fallback={<FallbackRocket />}>
        <FlightModel />
      </Suspense>
    </group>
  );
}

export function RocketView({ orientation, position, trail, active }: { orientation: [number, number, number, number]; position: Position; trail: Position[]; active: boolean }) {
  return (
    <div className="rocket-view" aria-label="Quaternion-driven rocket orientation">
      <Canvas camera={{ position: [4.6, 2.4, 5.2], fov: 35 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#0a1014"]} />
        <ambientLight intensity={1.2} /><directionalLight position={[4, 6, 5]} intensity={3.5} color="#e8f6ff" />
        <pointLight position={[-3, -2, 3]} intensity={active ? 5 : 1.5} color="#e86c3e" />
        <TrajectoryTrail positions={trail} />
        <Rocket orientation={orientation} position={position} />
        <gridHelper args={[10, 20, "#1a4d57", "#10272d"]} position={[0, GROUND_Y, 0]} />
      </Canvas>
      <span className="view-label">ATTITUDE / BODY FRAME</span>
      <div className="position-overlay">
        <span>ENU POSITION</span>
        <b>X {position[0].toFixed(3)}m</b>
        <b>Y {position[1].toFixed(3)}m</b>
        <b>Z {position[2].toFixed(3)}m</b>
      </div>
    </div>
  );
}
