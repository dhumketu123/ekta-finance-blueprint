import { memo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import OwnerExitModal from "@/components/owner/OwnerExitModal";
import { toast } from "sonner";
import { LogOut, AlertTriangle, Trash2 } from "lucide-react";

interface OwnerAdminControlsProps {
  owner: {
    id: string;
    name_en: string;
    name_bn: string;
    phone: string;
    created_at: string;
    owner_id?: string;
  };
  ownerRefId: string;
  totalCapital: number;
  totalProfitEarned: number;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  bn: boolean;
}

const OwnerAdminControls = memo(({
  owner, ownerRefId, totalCapital, totalProfitEarned, isAdmin, isSuperAdmin, bn,
}: OwnerAdminControlsProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setPinOpen(false);
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("secure_delete_owner" as any, { _owner_user_id: ownerRefId });
      if (error) throw new Error(error.message);
      const result = data as unknown as { status: string; message: string };
      if (result.status === "error") { toast.error(result.message); return; }
      toast.success(bn ? "মালিক মুছে ফেলা হয়েছে ✅" : "Owner deleted ✅");
      queryClient.invalidateQueries({ queryKey: ["owners"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      navigate("/owners");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeleting(false);
    }
  }, [ownerRefId, bn, queryClient, navigate]);

  return (
    <>
      {/* Exit Protocol */}
      {(isAdmin || isSuperAdmin) && (
        <Card className="border border-amber-500/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <LogOut className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "মালিক এক্সিট প্রোটোকল" : "Owner Exit Protocol"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {bn
                ? "কর্পোরেট-গ্রেড এক্সিট সেটেলমেন্ট। ভেস্টিং ক্যালকুলেশন, পেনাল্টি/বোনাস, MoU জেনারেশন ও Alumni রোল ট্রানজিশন।"
                : "Corporate-grade exit settlement with vesting calculation, penalty/bonus, MoU generation & Alumni role transition."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5"
              onClick={() => setExitModalOpen(true)}
            >
              <LogOut className="w-4 h-4" />
              {bn ? "এক্সিট প্রক্রিয়া শুরু করুন" : "Initiate Exit Protocol"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Super Admin Delete */}
      {isSuperAdmin && (
        <Card className="border border-destructive/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "সিস্টেম রিসেট (সুপার অ্যাডমিন)" : "System Reset (Super Admin)"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {bn ? "শুধুমাত্র টেস্ট ডেটা মুছে ফেলার জন্য।" : "For clearing test data only."}
            </p>
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setWarningOpen(true)} disabled={deleting}>
              <Trash2 className="w-4 h-4" />
              {bn ? "টেস্ট মালিক মুছুন" : "Delete Test Owner"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <OwnerExitModal
        open={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        owner={{
          id: ownerRefId,
          name_en: owner.name_en,
          name_bn: owner.name_bn,
          phone: owner.phone || "",
          created_at: owner.created_at,
          owner_id: owner.owner_id,
        }}
        totalCapital={totalCapital}
        totalProfitEarned={totalProfitEarned}
      />

      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {bn ? "গুরুতর সতর্কতা" : "Critical Warning"}
            </DialogTitle>
            <DialogDescription className="text-sm pt-2 space-y-2">
              <span className="block font-semibold text-destructive">
                {bn ? "⚠️ অপরিবর্তনীয়!" : "⚠️ Irreversible!"}
              </span>
              <span className="block">
                {bn
                  ? "এটি স্থায়ীভাবে auth অ্যাকাউন্ট ও সকল ডেটা মুছে ফেলবে।"
                  : "This will permanently delete the auth account and all data."}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWarningOpen(false)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button variant="destructive" onClick={() => { setWarningOpen(false); setPinOpen(true); }}>
              {bn ? "নিশ্চিত, পিন দিন" : "Confirm, Enter PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionAuthModal open={pinOpen} onClose={() => setPinOpen(false)} onAuthorized={handleDelete} />
    </>
  );
});

OwnerAdminControls.displayName = "OwnerAdminControls";
export default OwnerAdminControls;
