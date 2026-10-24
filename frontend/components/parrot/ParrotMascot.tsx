"use client";

import { useEffect, useState } from "react";

type MascotState = "idle" | "thinking" | "speaking" | "success" | "error";

interface ParrotMascotProps {
  state?: MascotState;
  reducedMotion?: boolean;
}

const wingPoints = (wingAngle: number) => [
  "M 30 40",
  `L ${30 + 8 * Math.sin(wingAngle)} ${40 - 6 * Math.cos(wingAngle)}`,
  `L ${35 + 6 * Math.sin(wingAngle)} ${42 - 4 * Math.cos(wingAngle)}`,
  "L 45 45",
  "Z",
].join(" ");

export default function ParrotMascot({ state = "idle", reducedMotion = false }: ParrotMascotProps) {
  const [wingAngle, setWingAngle] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setWingAngle(0);
      return;
    }

    const animate = () => {
      setWingAngle((prev) => {
        const next = prev + 0.15;
        if (next >= 6.28) return 0;
        return next;
      });
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [reducedMotion]);

  const stateClass = `parrot-mascot state-${state}`;
  const wing1 = wingPoints(wingAngle);
  const wing2 = wingPoints(-wingAngle);

  return (
    <svg
      className={stateClass}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      <title>Parrot AI study companion</title>
      <rect width="100" height="100" fill="transparent" />
      {/* Body main shape */}
      <path
        fill="#7137f7"
        fill-opacity="0.9"
        d="M 50 30
           C 20 30 5 50 5 70
           C 5 90 20 95 40 95
           C 55 95 70 90 70 70
           C 70 50 75 30 70 30
           C 65 25 55 20 50 30"
      />
      {/* Beak */}
      <polygon
        fill="#ffcc00"
        points="70 55 78 52 78 58 70 55"
      />
      {/* Eye */}
      <circle cx="55" cy="55" r="5" fill="#e94a4a" />
      {/* Pupil */}
      <circle cx="55" cy="55" r="2.5" fill="#fff" />
      {/* Tail */}
      <path
        fill="#7137f7"
        fill-opacity="0.7"
        d="M 5 50 Q 0 60 15 70 Q 20 80 30 75"
      />
      {/* Wing 1 (top) */}
      <path
        fill="#3477fa"
        d={wing1}
      />
      {/* Wing 2 (bottom) */}
      <path
        fill="#3477fa"
        d={wing2}
      />
      {/* Foot */}
      <circle cx="45" cy="85" r="3.5" fill="#e94a4a" />
      <circle cx="55" cy="85" r="3.5" fill="#e94a4a" />
    </svg>
  );
}