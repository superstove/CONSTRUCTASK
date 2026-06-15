import React, { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number; // In seconds, e.g., 0.3 for 300ms
}

export default function AnimatedCounter({ 
  value, 
  suffix = "", 
  prefix = "", 
  decimals = 0,
  duration = 0.3 
}: AnimatedCounterProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const spring = useSpring(0, {
    duration: duration * 1000,
    bounce: 0,
  });

  const display = useTransform(spring, (current) => {
    return prefix + current.toFixed(decimals) + suffix;
  });

  useEffect(() => {
    setHasMounted(true);
    spring.set(value);
  }, [spring, value]);

  if (!hasMounted) {
    return <span>{prefix}{value.toFixed(decimals)}{suffix}</span>;
  }

  return <motion.span>{display}</motion.span>;
}
