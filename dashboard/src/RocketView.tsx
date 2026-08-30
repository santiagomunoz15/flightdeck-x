import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Box3, BufferGeometry, Float32BufferAttribute, Group, Line as ThreeLine, LineBasicMaterial, LoopOnce, Mesh, Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MissionPhase } from "./types";

type Position = [number, number, number];

const ROCKET_HEIGHT_M = 50;
const FULL_THRUST_PLUME_LENGTH_M = 70;
const CAMERA_FOV_DEGREES = 35;
const GROUND_Y = 0;
const LANDING_TARGET_EAST_M = 1000;
const LANDING_TARGET_NORTH_M = 200;
const MAX_TRAIL_POINTS = 512;
const LEG_DEPLOYMENT_ALTITUDE_M = 75;
const DEGREES_TO_RADIANS = Math.PI / 180;

function normalizedModelName(name: string): string {
  return name.replace(/[\s_-]/g, "").toLowerCase();
}

function findModelObject(root: Object3D, name: string): Object3D | undefined {
  const target = normalizedModelName(name);
  let match: Object3D | undefined;
  root.traverse((object) => {
    if (!match && normalizedModelName(object.name) === target) match = object;
  });
  return match;
}

function scenePosition(position: Position): Vector3 {
  return new Vector3(position[0], Math.max(position[2], GROUND_Y), -position[1]);
}

function TrajectoryTrail({ positions }: { positions: Position[] }) {
  const trail = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3));
    geometry.setDrawRange(0, 0);
    const material = new LineBasicMaterial({ color: "#67d6c7", transparent: true, opacity: 0.68 });
    return new ThreeLine(geometry, material);
  }, []);
  useEffect(() => {
    const attribute = trail.geometry.getAttribute("position") as Float32BufferAttribute;
    const count = Math.min(positions.length, MAX_TRAIL_POINTS);
    const offset = positions.length - count;
    for (let index = 0; index < count; index += 1) {
      const position = positions[offset + index];
      if (position) attribute.setXYZ(index, position[0], Math.max(position[2], GROUND_Y), -position[1]);
    }
    attribute.needsUpdate = true;
    trail.geometry.setDrawRange(0, count);
    trail.geometry.computeBoundingSphere();
  }, [positions, trail]);
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

function FlightModel({ thrustPercent, position, velocity, missionPhase, gimbalCommandDeg, gridFinCommandDeg }: { thrustPercent: number; position: Position; velocity: Position; missionPhase: MissionPhase; gimbalCommandDeg: [number, number]; gridFinCommandDeg: [number, number] }) {
  const { scene, animations } = useLoader(GLTFLoader, "/models/Falcon9.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const legActions = useMemo(() => animations
    .filter((clip) => clip.name.toLowerCase().includes("landing leg"))
    .map((clip) => mixer.clipAction(clip)), [animations, mixer]);
  const gridFinActions = useMemo(() => animations
    .filter((clip) => clip.tracks.some((track) => normalizedModelName(track.name).includes("gridfin")))
    .map((clip) => mixer.clipAction(clip)), [animations, mixer]);
  const legsDeployed = useRef(false);
  const gridFinsDeployed = useRef(false);
  const { modelOffset, plumes, gridFinPivots, engineGimbal } = useMemo(() => {
    const exhausts: Object3D[] = [];
    model.traverse((object) => {
      const normalizedName = normalizedModelName(object.name);
      const materials = object instanceof Mesh
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : [];
      if (normalizedName === "exhaustplume" || materials.some((material) => material.name.toLowerCase() === "plume")) {
        exhausts.push(object);
      }
    });

    const steeringPivots: Array<{ pivot: Object3D; axis: Vector3 }> = [];
    for (const fin of [1, 2, 3, 4].map((number) => findModelObject(model, `Grid Fin ${number}`))) {
      if (!fin?.parent) continue;
      const parent = fin.parent;
      const pivot = new Object3D();
      pivot.name = `${fin.name} Control`;
      pivot.position.copy(fin.position);
      const axis = new Vector3(fin.position.x, 0, fin.position.z).normalize();
      parent.remove(fin);
      parent.add(pivot);
      pivot.add(fin);
      fin.position.set(0, 0, 0);
      steeringPivots.push({ pivot, axis });
    }

    let gimbalPivot: Object3D | undefined;
    const engine = model.getObjectByName("InnerMerlinEngine");
    if (engine?.parent) {
      const parent = engine.parent;
      gimbalPivot = new Object3D();
      gimbalPivot.name = "EngineGimbalControl";
      gimbalPivot.position.copy(engine.position);
      parent.remove(engine);
      parent.add(gimbalPivot);
      gimbalPivot.add(engine);
      engine.position.set(0, 0, 0);
    }

    const detached = exhausts.flatMap((exhaust) => exhaust.parent ? [{ exhaust, parent: exhaust.parent }] : []);
    for (const { exhaust, parent } of detached) parent.remove(exhaust);

    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());

    for (const { exhaust, parent } of detached) parent.add(exhaust);
    model.updateMatrixWorld(true);
    const plumeObjects = exhausts.map((exhaust) => ({
      object: exhaust,
      baseScale: exhaust.scale.clone(),
      baseHeight: new Box3().setFromObject(exhaust).getSize(new Vector3()).y,
    }));
    for (const { object: exhaust } of plumeObjects) {
      exhaust.visible = false;
      exhaust.scale.setScalar(0);
    }

    return {
      modelOffset: new Vector3(-center.x, -bounds.min.y, -center.z),
      plumes: plumeObjects,
      gridFinPivots: steeringPivots,
      engineGimbal: gimbalPivot,
    };
  }, [model]);

  useEffect(() => {
    for (const action of [...legActions, ...gridFinActions]) {
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.paused = true;
      action.play();
    }
    mixer.setTime(0);
    return () => {
      // Strict Mode immediately runs this effect again with the same memoized
      // actions. uncacheRoot() would invalidate their bindings and crash when
      // the second setup calls play(); stopping is sufficient for teardown.
      mixer.stopAllAction();
    };
  }, [gridFinActions, legActions, mixer, model]);

  useFrame(({ clock }, delta) => {
    if (missionPhase === "PRELAUNCH" && legsDeployed.current) {
      for (const action of legActions) {
        action.reset();
        action.paused = true;
        action.play();
      }
      mixer.setTime(0);
      legsDeployed.current = false;
    } else if (!legsDeployed.current &&
        ((velocity[2] < 0 && position[2] <= LEG_DEPLOYMENT_ALTITUDE_M) || missionPhase === "LANDED")) {
      for (const action of legActions) {
        action.reset();
        action.paused = false;
        action.play();
      }
      if (missionPhase === "LANDED") {
        mixer.setTime(Math.max(0, ...animations.map((clip) => clip.duration)));
        for (const action of legActions) action.paused = true;
      }
      legsDeployed.current = true;
    }
    if (missionPhase === "PRELAUNCH" && gridFinsDeployed.current) {
      for (const action of gridFinActions) {
        action.reset();
        action.paused = true;
        action.play();
      }
      gridFinsDeployed.current = false;
    } else if (!gridFinsDeployed.current &&
        (missionPhase === "DESCENT" || missionPhase === "LANDING_BURN" || missionPhase === "LANDED")) {
      for (const action of gridFinActions) {
        action.reset();
        action.paused = false;
        action.play();
      }
      if (missionPhase === "LANDED") {
        mixer.setTime(Math.max(0, ...animations.map((clip) => clip.duration)));
        for (const action of gridFinActions) action.paused = true;
      }
      gridFinsDeployed.current = true;
    }
    mixer.update(Math.min(delta, 0.1));

    const eastControl = gridFinCommandDeg[0] * DEGREES_TO_RADIANS;
    const northControl = gridFinCommandDeg[1] * DEGREES_TO_RADIANS;
    for (const { pivot, axis } of gridFinPivots) {
      const angle = eastControl * axis.z - northControl * axis.x;
      pivot.quaternion.setFromAxisAngle(axis, gridFinsDeployed.current ? angle : 0);
    }

    if (engineGimbal) {
      const eastGimbal = gimbalCommandDeg[0] * DEGREES_TO_RADIANS;
      const northGimbal = gimbalCommandDeg[1] * DEGREES_TO_RADIANS;
      const gimbalActive = thrustPercent > 0.5;
      engineGimbal.rotation.set(gimbalActive ? northGimbal : 0, 0, gimbalActive ? -eastGimbal : 0);
    }

    const thrust = Math.min(Math.max(thrustPercent, 0), 100) / 100;
    const flicker = 1 + Math.sin(clock.elapsedTime * 31) * 0.055 + Math.sin(clock.elapsedTime * 47) * 0.025;
    for (const { object: plume, baseScale, baseHeight } of plumes) {
      plume.visible = thrust > 0.005;
      if (!plume.visible) {
        plume.scale.setScalar(0);
        continue;
      }
      const targetLength = FULL_THRUST_PLUME_LENGTH_M * (0.1 + thrust * 0.9);
      const lengthScale = baseHeight > 0 ? targetLength / baseHeight : 1;
      plume.scale.set(
        baseScale.x * (0.85 + thrust * 0.3) * flicker,
        baseScale.y * lengthScale * flicker,
        baseScale.z * (0.85 + thrust * 0.3) * flicker,
      );
    }
  });

  return (
    <primitive
      object={model}
      scale={1}
      position={modelOffset}
    />
  );
}

function Rocket({ orientation, position, velocity, missionPhase, thrustPercent, gimbalCommandDeg, gridFinCommandDeg }: { orientation: [number, number, number, number]; position: Position; velocity: Position; missionPhase: MissionPhase; thrustPercent: number; gimbalCommandDeg: [number, number]; gridFinCommandDeg: [number, number] }) {
  const group = useRef<Group>(null);
  const targetPosition = useMemo(() => new Vector3(), []);
  const targetOrientation = useMemo(() => new Quaternion(), []);
  const protocolOrientation = useMemo(() => new Quaternion(), []);
  const bodyAxis = useMemo(() => new Vector3(), []);
  const displayAxis = useMemo(() => new Vector3(), []);
  const modelAxis = useMemo(() => new Vector3(0, 1, 0), []);
  useFrame((_, delta) => {
    const [w, x, y, z] = orientation;
    if (group.current) {
      protocolOrientation.set(x, y, z, w).normalize();
      bodyAxis.set(0, 0, 1).applyQuaternion(protocolOrientation);
      displayAxis.set(bodyAxis.x, bodyAxis.z, -bodyAxis.y).normalize();
      targetOrientation.setFromUnitVectors(modelAxis, displayAxis);
      const stableDelta = Math.min(delta, 1 / 30);
      const smoothing = 1 - Math.exp(-stableDelta * 8);
      group.current.quaternion.slerp(targetOrientation, smoothing);
      // Telemetry is East-North-Up; Three.js uses Y as its vertical display axis.
      targetPosition.copy(scenePosition(position));
      group.current.position.lerp(targetPosition, smoothing);
    }
  });
  return (
    <group ref={group}>
      <Suspense fallback={<FallbackRocket />}>
        <FlightModel thrustPercent={thrustPercent} position={position} velocity={velocity} missionPhase={missionPhase} gimbalCommandDeg={gimbalCommandDeg} gridFinCommandDeg={gridFinCommandDeg} />
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
    const altitudeRatio = Math.min(Math.max(position[2], 0) / 2400, 1);
    const overviewBlend = altitudeRatio * altitudeRatio * (3 - 2 * altitudeRatio);
    const verticalSpan = Math.max(ROCKET_HEIGHT_M * 1.6, rocket.y + ROCKET_HEIGHT_M / 2);
    const halfFovRadians = CAMERA_FOV_DEGREES * Math.PI / 360;
    const overviewDistance = verticalSpan / (2 * Math.tan(halfFovRadians)) * 1.25;
    const distance = 145 + (overviewDistance - 145) * overviewBlend;

    desiredTarget.set(
      rocket.x * (1 - overviewBlend / 2),
      rocket.y * (1 - overviewBlend / 2),
      rocket.z * (1 - overviewBlend / 2),
    );
    desiredPosition.set(
      desiredTarget.x + distance * 0.7,
      desiredTarget.y + distance * 0.22,
      desiredTarget.z + distance,
    );

    const stableDelta = Math.min(delta, 1 / 30);
    const smoothing = 1 - Math.exp(-stableDelta * 2.2);
    camera.position.lerp(desiredPosition, smoothing);
    currentTarget.lerp(desiredTarget, smoothing);
    camera.lookAt(currentTarget);
  });

  return null;
}

export function RocketView({ orientation, position, velocity, missionPhase, trail, thrustPercent, gimbalCommandDeg, gridFinCommandDeg }: { orientation: [number, number, number, number]; position: Position; velocity: Position; missionPhase: MissionPhase; trail: Position[]; thrustPercent: number; gimbalCommandDeg: [number, number]; gridFinCommandDeg: [number, number] }) {
  return (
    <div className="rocket-view" aria-label="Quaternion-driven rocket orientation">
      <Canvas camera={{ position: [90, 45, 130], fov: CAMERA_FOV_DEGREES, near: 0.1, far: 20000 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#0a1014"]} />
        <ambientLight intensity={1.2} /><directionalLight position={[4, 6, 5]} intensity={3.5} color="#e8f6ff" />
        <pointLight position={[-3, -2, 3]} intensity={thrustPercent > 0 ? 5 : 1.5} color="#e86c3e" />
        <TrajectoryTrail positions={trail} />
        <Rocket orientation={orientation} position={position} velocity={velocity} missionPhase={missionPhase} thrustPercent={thrustPercent} gimbalCommandDeg={gimbalCommandDeg} gridFinCommandDeg={gridFinCommandDeg} />
        <FlightCamera position={position} />
        <mesh position={[LANDING_TARGET_EAST_M, 0.6, -LANDING_TARGET_NORTH_M]}>
          <cylinderGeometry args={[24, 24, 1.2, 32]} />
          <meshStandardMaterial color="#67d6c7" emissive="#1d665e" emissiveIntensity={1.4} />
        </mesh>
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
