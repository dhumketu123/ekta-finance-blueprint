import { memo } from "react";

function CreatorCardInner() {
  return (
    <div className="relative overflow-hidden rounded-xl p-5 mt-4 bg-gradient-to-br from-white/60 via-teal-50/40 to-blue-50/30 backdrop-blur-md border border-white/50 shadow-[0_4px_15px_-3px_rgba(0,0,0,0.05)]">
      {/* Subtle mesh glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br from-[#00D2D3]/20 to-blue-400/10 blur-2xl pointer-events-none" />

      <div className="flex items-start gap-4 relative z-10">
        {/* Avatar */}
        <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-tr from-[#00D2D3] to-blue-400 text-white flex items-center justify-center font-bold text-lg shadow-inner">
          DR
        </div>

        {/* Info */}
        <div className="min-w-0">
          <p className="text-[#041E42] text-xs font-semibold uppercase tracking-wider mb-1">
            Chief System Architect
          </p>
          <p className="text-slate-800 font-bold text-base leading-snug">
            ধূমকেতু রবি (Dhumketu Robi)
          </p>
          <p className="text-slate-500 text-xs italic mt-1">
            Building the future of micro-finance automation.
          </p>
        </div>
      </div>
    </div>
  );
}

export const CreatorCard = memo(CreatorCardInner);
