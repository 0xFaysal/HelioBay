"use client";
import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

export function AnimatedNumber({ value }: { value: number }) {
  const target = useMotionValue(value);
  const smooth = useSpring(target, { stiffness: 130, damping: 24 });
  const display = useTransform(smooth, n => Math.round(n).toString());
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) smooth.jump(value);
    else target.set(value);
  }, [value, target, smooth, reducedMotion]);
  return <motion.span>{display}</motion.span>;
}
