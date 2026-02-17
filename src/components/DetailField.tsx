interface DetailFieldProps {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
  fullWidth?: boolean;
}

const DetailField = ({ label, value, highlight, fullWidth }: DetailFieldProps) => (
  <div className={`space-y-1 ${fullWidth ? "col-span-full" : ""}`}>
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={`text-sm font-medium ${highlight ? "text-primary font-bold text-base" : "text-foreground"}`}>
      {value ?? "—"}
    </p>
  </div>
);

export default DetailField;
