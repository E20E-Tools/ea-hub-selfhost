import {
  AnimationClip,
  AnimationMixer,
  Object3D,
  VectorKeyframeTrack,
  LoopOnce,
  LoopRepeat,
} from "three";
import {
  finishArchyClip,
  playArchyClip,
  type ArchyActions,
} from "@/components/archy-animation";
import { shouldAnimateArchy } from "@/lib/archy-mascot";

function rig() {
  const root = new Object3D();
  const mixer = new AnimationMixer(root);
  const makeClip = (name: string, duration: number) =>
    new AnimationClip(name, duration, [
      new VectorKeyframeTrack(".position", [0, duration], [0, 0, 0, 0, 1, 0]),
    ]);
  const actions: ArchyActions = {
    Wave: mixer.clipAction(makeClip("Wave", 4)),
    Idle: mixer.clipAction(makeClip("Idle", 3)),
    Hop: mixer.clipAction(makeClip("Hop", 2)),
  };
  mixer.addEventListener("finished", (event) => {
    finishArchyClip(actions, event.action as never);
  });
  return { mixer, actions };
}

it("plays Wave once and returns to looping Idle on its real mixer completion", () => {
  const { mixer, actions } = rig();
  playArchyClip(actions, "Wave");
  expect(actions.Wave?.loop).toBe(LoopOnce);
  expect(actions.Wave?.isRunning()).toBe(true);
  mixer.update(4.05);
  expect(actions.Idle?.loop).toBe(LoopRepeat);
  expect(actions.Idle?.isRunning()).toBe(true);
  expect(actions.Wave?.isRunning()).toBe(false);
});

it("returns occasional Hop to Idle and pauses for reduced motion or a hidden tab", () => {
  const { mixer, actions } = rig();
  playArchyClip(actions, "Hop");
  mixer.update(2.05);
  expect(actions.Idle?.isRunning()).toBe(true);
  expect(actions.Hop?.isRunning()).toBe(false);
  expect(shouldAnimateArchy(true, false)).toBe(false);
  expect(shouldAnimateArchy(false, true)).toBe(false);
  expect(shouldAnimateArchy(false, false)).toBe(true);
});
