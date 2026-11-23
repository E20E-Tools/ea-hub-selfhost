import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useAnimations, useGLTF } from "@react-three/drei";
import type { AnimationAction, Group } from "three";
import { archyGestureClips } from "./archy-gestures";
import { useDirection } from "@/studio/directions";
import { createArchyRig } from "./archy-rig";
import archyModel from "@/assets/models/archy-rigged.glb.asset.json";
import { playArchyClip, finishArchyClip, type ArchyActions } from "./archy-animation";
import type { ArchyAnimation } from "@/lib/archy-mascot";

type SceneProps = {
  animation: ArchyAnimation;
  animationKey: number;
  reducedMotion: boolean;
  hidden: boolean;
  onReady: () => void;
  onFinished: (clip: ArchyAnimation) => void;
  onFailure: () => void;
};

function ContextLossListener({ onFailure }: Pick<SceneProps, "onFailure">) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost, { once: true });
    // R3F intentionally loses the context after its canvas unmounts in lightweight mode.
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [canvas, onFailure]);
  return null;
}

function ArchyRig({
  animation,
  animationKey,
  paused,
  onReady,
  onFinished,
}: Pick<SceneProps, "animation" | "animationKey" | "onReady" | "onFinished"> & {
  paused: boolean;
}) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(archyModel.url);
  const invalidate = useThree((state) => state.invalidate);
  const direction = useDirection();
  const rig = useMemo(() => createArchyRig(scene), [scene]);
  const clips = useMemo(() => [...animations, ...archyGestureClips(scene)], [scene, animations]);
  useEffect(() => { rig.recolor(direction); invalidate(); }, [rig, direction, invalidate]);
  useEffect(() => () => rig.dispose(), [rig]);
  const { actions, mixer } = useAnimations(clips, group);


  // Keep the supplied poster visible until the real rig has loaded, not merely the canvas.
  useEffect(() => onReady(), [onReady]);

  useEffect(() => {
    const typedActions = actions as ArchyActions;
    if (paused) {
      mixer.stopAllAction();
      invalidate();
      return;
    }
    playArchyClip(typedActions, animation);
  }, [actions, animation, animationKey, invalidate, mixer, paused]);

  useEffect(() => {
    const finished = (event: { action: AnimationAction }) => {
      const clip = event.action.getClip().name as ArchyAnimation;
      if (clip === "Idle") return;
      finishArchyClip(actions as ArchyActions, event.action);
      onFinished(clip);
    };
    mixer.addEventListener("finished", finished);
    return () => mixer.removeEventListener("finished", finished);
  }, [actions, mixer, onFinished]);

  useEffect(
    () => () => {
      mixer.stopAllAction();
    },
    [mixer],
  );

  return (
    <group ref={group} position={[0, -1.76, 0]} dispose={null}>
      <primitive object={rig.model} />
    </group>
  );
}

export default function ArchyScene({
  animation,
  animationKey,
  reducedMotion,
  hidden,
  onReady,
  onFinished,
  onFailure,
}: SceneProps) {
  // hidden covers both a hidden tab and an open chat (the dock is display:none then);
  // the same canvas and rig stay mounted and resume when shown again.
  const paused = reducedMotion || hidden;
  const [loaded, setLoaded] = useState(false);
  const ready = useCallback(() => {
    setLoaded(true);
    onReady();
  }, [onReady]);
  // No continuous loop while only the poster is visible (loading) or when paused.
  const frameloop = hidden ? "never" : reducedMotion || !loaded ? "demand" : "always";
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 1.5]}
      camera={{ position: [0.72, 0.16, 6.8], fov: 32, near: 0.1, far: 50 }}
      frameloop={frameloop}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <ContextLossListener onFailure={onFailure} />
      <hemisphereLight args={["#edf8ff", "#8096af", 1.65]} />
      <directionalLight position={[3, 5, 5]} intensity={2.35} color="#fff7e9" />
      <directionalLight position={[-4, 2, 3]} intensity={1.22} color="#bdeaff" />
      <directionalLight position={[2, 3, -3]} intensity={1.1} color="#b4ebff" />
      <Environment>
        <Lightformer intensity={1.5} position={[0, 4, 3]} scale={[5, 5, 1]} />
        <Lightformer
          intensity={0.8}
          color="#9fdcff"
          position={[-4, 1, 2]}
          rotation-y={Math.PI / 2}
          scale={[4, 2, 1]}
        />
      </Environment>
      <Suspense fallback={null}>
        <ArchyRig
          animation={animation}
          animationKey={animationKey}
          paused={paused}
          onReady={ready}
          onFinished={onFinished}
        />
      </Suspense>
    </Canvas>
  );
}
