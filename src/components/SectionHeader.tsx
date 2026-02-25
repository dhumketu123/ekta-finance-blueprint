import React from "react";
import { motion } from "framer-motion";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export const SectionHeader = React.memo(
  ({ title, subtitle, className = "" }: SectionHeaderProps) => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`mt-6 sm:mt-8 ${className}`}
      >
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-sm sm:text-base text-muted mt-1">{subtitle}</p>
        )}
      </motion.div>
    );
  }
);

SectionHeader.displayName = "SectionHeader";
