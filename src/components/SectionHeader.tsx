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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`mt-6 sm:mt-8 mb-4 ${className}`}
      >
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>

          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </motion.div>
    );
  }
);

SectionHeader.displayName = "SectionHeader";
