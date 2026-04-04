import type { PolicyItem } from "./types";

interface DefaultPolicyPanelProps {
  items: PolicyItem[];
}

export const DefaultPolicyPanel = ({ items }: DefaultPolicyPanelProps) => (
  <div className="rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-xl shadow-lg p-6 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      {items.map((p) => (
        <div key={p.label} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{p.label}</span>
          <span className="text-sm font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
    <button
      type="button"
      className="flex-shrink-0 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95 transition-all duration-200"
    >
      View Escalation Rules
    </button>
  </div>
);
