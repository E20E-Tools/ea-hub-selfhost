import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  type Object3D,
} from "three";
import type { ArchyAnimation } from "@/lib/archy-mascot";

type Pose = [bone: string, x: number, y: number, z: number];
const poses: Partial<Record<ArchyAnimation, Pose[]>> = {
  Sleep: [
    ["head", 0.28, 0, -0.18],
    ["torso", 0.09, 0, -0.06],
  ],
  Think: [
    ["head", -0.09, 0.23, 0.12],
    ["upper_armR", -0.7, 0, -0.48],
    ["forearmR", -1.1, 0, 0.2],
  ],
  Eat: [
    ["head", 0.15, 0, 0],
    ["upper_armR", -0.85, -0.12, -0.28],
    ["forearmR", -1.3, 0, 0.24],
  ],
  Phone: [
    ["head", -0.06, -0.12, -0.18],
    ["upper_armL", -1.05, 0, 0.48],
    ["forearmL", -1.45, 0, -0.28],
  ],
};
export function archyGestureClips(model: Object3D) {
  return Object.entries(poses).map(([name, pose]) => {
    const tracks = pose.flatMap(([key, x, y, z]) => {
      const bone = model.getObjectByName(key);
      if (!bone) return [];
      const values = [0, 1, name === "Eat" ? 0.66 : 0.91, 1, 0].flatMap(
        (weight) =>
          bone.quaternion
            .clone()
            .multiply(
              new Quaternion().setFromEuler(
                new Euler(x * weight, y * weight, z * weight),
              ),
            )
            .toArray(),
      );
      return [
        new QuaternionKeyframeTrack(
          key + ".quaternion",
          [0, 0.75, 1.65, 2.55, 3.4],
          values,
        ),
      ];
    });
    return new AnimationClip(name, 3.4, tracks);
  });
}
