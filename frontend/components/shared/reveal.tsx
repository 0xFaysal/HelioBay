"use client";
import { motion } from "motion/react";

export function Reveal(
  {
    children,
    className = "",
    delay = 0
  }: {
    children: React.ReactNode;
    className?: string;
    delay?: number;
  }
) {
  return (
    <motion.div
      initial={{
        opacity: 1,
        y: 18
      }}
      whileInView={{
        opacity: 1,
        y: 0
      }}
      viewport={{
        once: true,
        margin: "-30px"
      }}
      transition={{
        duration: .55,
        delay,
        ease: [.22, 1, .36, 1]
      }}
      className={className}>{children}</motion.div>
  );
}
