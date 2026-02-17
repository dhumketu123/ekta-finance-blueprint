interface PageHeaderProps {
  titleEn: string;
  titleBn: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = ({ titleEn, titleBn, description, actions }: PageHeaderProps) => {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-english">{titleEn}</h1>
        <p className="text-sm text-muted-foreground font-bangla">{titleBn}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
};

export default PageHeader;
