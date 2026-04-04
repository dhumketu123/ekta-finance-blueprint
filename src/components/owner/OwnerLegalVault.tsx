import { memo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderLock, FileText, Shield, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { formatLocalDate } from "@/lib/date-utils";

const PAGE_SIZE = 15;

interface OwnerLegalVaultProps {
  ownerRefId: string;
  bn: boolean;
}

const OwnerLegalVault = memo(({ ownerRefId, bn }: OwnerLegalVaultProps) => {
  const [page, setPage] = useState(0);

  const { data: legalDocs } = useQuery({
    queryKey: ["owner_legal_docs", ownerRefId, page],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("legal-vault")
        .list(`${ownerRefId}`, {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) return [];
      return data ?? [];
    },
    enabled: !!ownerRefId,
    staleTime: 120_000,
  });

  const docs = legalDocs ?? [];

  const handleDownload = useCallback(async (docName: string) => {
    const { data } = await supabase.storage
      .from("legal-vault")
      .createSignedUrl(`${ownerRefId}/${docName}`, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }, [ownerRefId]);

  return (
    <Card className="border border-border/60">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <FolderLock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {bn ? "🔐 ডিজিটাল লিগ্যাল ভল্ট" : "🔐 Digital Legal Vault"}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {bn ? "সুরক্ষিত নথি সংরক্ষণ" : "Secure Document Repository"}
            </p>
          </div>
        </div>

        {docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.name}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.created_at ? format(new Date(doc.created_at), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDownload(doc.name)}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

            {/* Pagination */}
            {docs.length >= PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="gap-1 text-xs">
                  <ChevronLeft className="w-3.5 h-3.5" /> {bn ? "আগে" : "Prev"}
                </Button>
                <span className="text-[10px] text-muted-foreground">{bn ? `পৃষ্ঠা ${page + 1}` : `Page ${page + 1}`}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} className="gap-1 text-xs">
                  {bn ? "পরে" : "Next"} <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center space-y-2">
            <Shield className="w-10 h-10 text-muted-foreground/20 mx-auto" />
            <p className="text-xs text-muted-foreground">
              {bn ? "এখনো কোনো নথি আপলোড হয়নি" : "No documents uploaded yet"}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {[bn ? "ফাউন্ডার চুক্তিপত্র" : "Founder Agreement", "KYC", bn ? "এক্সিট MoU" : "Exit MoU"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full bg-muted/30 border border-border/50 text-muted-foreground">
                  <FileText className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

OwnerLegalVault.displayName = "OwnerLegalVault";
export default OwnerLegalVault;
