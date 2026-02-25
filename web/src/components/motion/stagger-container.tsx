"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
    },
  },
};

export function StaggerContainer({
  children,
  className,
  delayChildren = 0.04,
  staggerChildren = 0.05,
}: StaggerContainerProps) {
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={{
        ...containerVariants,
        visible: {
          ...containerVariants.visible,
          transition: { delayChildren, staggerChildren },
        },
      }}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
