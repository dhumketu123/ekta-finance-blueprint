interface DetailFieldProps {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
  fullWidth?: boolean;
}

const DetailField = ({ label, value, highlight, fullWidth }: DetailFieldProps) => (
  <div className={`space-y-1 ${fullWidth ? "col-span-full" : ""}`}>
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={`text-base font-medium ${highlight ? "text-primary font-bold text-lg" : "text-foreground"}`}>
      {value ?? "—"}
    </p>
  </div>
);

export default DetailField;
