interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = ({ title, description, actions }: PageHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-8">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-primary truncate">{title}</h1>
        {description && <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
};

export default PageHeader;
