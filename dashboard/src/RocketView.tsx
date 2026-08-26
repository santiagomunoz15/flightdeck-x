import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Box3, BufferGeometry, Group, Line as ThreeLine, LineBasicMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Position = [number, number, number];

const ROCKET_HEIGHT_M = 50;
const CAMERA_FOV_DEGREES = 35;
const GROUND_Y = 0;

function scenePosition(position: Position): Vector3 {
  return new Vector3(position[0], Math.max(position[2], GROUND_Y), -position[1]);
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

function FlightModel({ thrustPercent }: { thrustPercent: number }) {
  const { scene } = useLoader(GLTFLoader, "/models/Falcon9.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const { modelOffset, plume, plumeScale } = useMemo(() => {
    const exhaust = model.getObjectByName("Exhaust Plume");
    const exhaustParent = exhaust?.parent;
    if (exhaust && exhaustParent) exhaustParent.remove(exhaust);

    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());

    if (exhaust && exhaustParent) exhaustParent.add(exhaust);
    if (exhaust) exhaust.visible = false;

    return {
      modelOffset: new Vector3(-center.x, -bounds.min.y, -center.z),
      plume: exhaust,
      plumeScale: exhaust?.scale.clone(),
    };
  }, [model]);

  useFrame(({ clock }) => {
    if (!plume || !plumeScale) return;
    const thrust = Math.min(Math.max(thrustPercent, 0), 100) / 100;
    plume.visible = thrust > 0.005;
    if (!plume.visible) return;
    const flicker = 1 + Math.sin(clock.elapsedTime * 31) * 0.055 + Math.sin(clock.elapsedTime * 47) * 0.025;
    plume.scale.set(
      plumeScale.x * flicker,
      plumeScale.y * (0.3 + thrust * 0.7) * flicker,
      plumeScale.z * flicker,
    );
  });

  return (
    <primitive
      object={model}
      scale={1}
      position={modelOffset}
    />
  );
}

function Rocket({ orientation, position, thrustPercent }: { orientation: [number, number, number, number]; position: Position; thrustPercent: number }) {
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
        <FlightModel thrustPercent={thrustPercent} />
      </Suspense>
    </group>
  );
}

function FlightCamera({ position }: { position: Position }) {
  const { camera } = useThree();
  const desiredPosition = useMemo(() => new Vector3(), []);
  const desiredTarget = useMemo(() => new Vector3(), []);
  const currentTarget = useMemo(() => new Vector3(0, ROCKET_HEIGHT_M / 2, 0), []);

  useFrame((_, delta) => {
    const rocket = scenePosition(position);
    rocket.y += ROCKET_HEIGHT_M / 2;

    // Frame the complete vertical journey from the pad to the vehicle. The
    // camera distance therefore grows naturally as real altitude increases.
    const verticalSpan = Math.max(ROCKET_HEIGHT_M * 1.6, rocket.y + ROCKET_HEIGHT_M / 2);
    const halfFovRadians = CAMERA_FOV_DEGREES * Math.PI / 360;
    const distance = verticalSpan / (2 * Math.tan(halfFovRadians)) * 1.35;
    desiredTarget.set(rocket.x / 2, verticalSpan / 2, rocket.z / 2);
    desiredPosition.set(
      desiredTarget.x + distance * 0.7,
      desiredTarget.y + distance * 0.22,
      desiredTarget.z + distance,
    );

    const smoothing = 1 - Math.exp(-delta * 2.5);
    camera.position.lerp(desiredPosition, smoothing);
    currentTarget.lerp(desiredTarget, smoothing);
    camera.lookAt(currentTarget);
  });

  return null;
}

export function RocketView({ orientation, position, trail, thrustPercent }: { orientation: [number, number, number, number]; position: Position; trail: Position[]; thrustPercent: number }) {
  return (
    <div className="rocket-view" aria-label="Quaternion-driven rocket orientation">
      <Canvas camera={{ position: [90, 45, 130], fov: CAMERA_FOV_DEGREES, near: 0.1, far: 20000 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#0a1014"]} />
        <ambientLight intensity={1.2} /><directionalLight position={[4, 6, 5]} intensity={3.5} color="#e8f6ff" />
        <pointLight position={[-3, -2, 3]} intensity={thrustPercent > 0 ? 5 : 1.5} color="#e86c3e" />
        <TrajectoryTrail positions={trail} />
        <Rocket orientation={orientation} position={position} thrustPercent={thrustPercent} />
        <FlightCamera position={position} />
        <gridHelper args={[5000, 100, "#1a4d57", "#10272d"]} position={[0, GROUND_Y, 0]} />
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
