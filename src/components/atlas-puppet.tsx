import { Apple, BookOpen, Smartphone, Dumbbell } from "lucide-react";
import type { ArchyAnimation } from "@/lib/archy-mascot";
import head from "@/assets/atlas/head.webp";
import torso from "@/assets/atlas/torso.webp";
import leftArm from "@/assets/atlas/arm-l.webp";
import rightArm from "@/assets/atlas/arm-r.webp";
import leftLeg from "@/assets/atlas/leg-l.webp";
import rightLeg from "@/assets/atlas/leg-r.webp";
import "./atlas-puppet.css";

const objects = {
  Eat: Apple,
  Read: BookOpen,
  Phone: Smartphone,
  Exercise: Dumbbell,
};
function Limb({
  type,
  side,
  src,
  children,
}: {
  type: "arm" | "leg";
  side: "l" | "r";
  src: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`atlas-limb atlas-${type} atlas-${side}`}>
      <img className="atlas-upper" src={src} alt="" />
      <span className="atlas-joint">
        <img className="atlas-lower" src={src} alt="" />
        {children}
      </span>
    </span>
  );
}
export function AtlasPuppet({ action }: { action: ArchyAnimation }) {
  const ObjectIcon = objects[action as keyof typeof objects];
  return (
    <span className="atlas-stage" aria-hidden="true">
      <span className="atlas-body">
        <Limb type="leg" side="l" src={leftLeg} />
        <Limb type="leg" side="r" src={rightLeg} />
        <img className="atlas-torso" src={torso} alt="" />
        <span className="atlas-head">
          <img src={head} alt="" />
          {(action === "Sleep" || action === "Laugh") && (
            <span className="atlas-face">
              <i />
              <i />
              <b />
            </span>
          )}
        </span>
        <Limb type="arm" side="l" src={leftArm} />
        <Limb type="arm" side="r" src={rightArm}>
          {ObjectIcon && (
            <span className="atlas-object">
              <ObjectIcon />
            </span>
          )}
        </Limb>
      </span>
    </span>
  );
}
export const atlasActions = [
  ["Wave", "لوّح لي", "Wave hello"],
  ["Think", "فكّر معي", "Think with me"],
  ["Sleep", "خذ قيلولة", "Take a nap"],
  ["Eat", "وقت التفاحة", "Snack time"],
  ["Exercise", "تمرّن", "Work out"],
  ["Read", "اقرأ كتابًا", "Read a book"],
  ["Laugh", "اضحك معي", "Laugh with me"],
  ["Hop", "اقفز", "Jump"],
  ["Phone", "ردّ على الجوال", "Take a call"],
] as const;
