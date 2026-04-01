import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import CommitmentSwipeCard from "@/components/CommitmentSwipeCard";
import AIChipsRescheduleModal from "@/components/AIChipsRescheduleModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useMyCommitments,
  useCommitments,
  useFulfillCommitment,
  useRescheduleCommitmentSwipe,
  useSwipeDebounce,
  useFeatureFlag,
  type Commitment,
} from "@/hooks/useCommitments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Sparkles, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Commitments = () => {
  const { lang } = useLanguage();
  const { isAdmin, isOwner, isFieldOfficer } = usePermissions();
  const [rescheduleTarget, setRescheduleTarget] = useState<Commitment | null>(null);

  // Feature flag
  const { data: swipeEnabled, isLoading: flagLoading } = useFeatureFlag("mobile_ai_reschedule");

  // Data: admins/owners see all, officers see own
  const isOfficerOnly = isFieldOfficer && !isAdmin && !isOwner;
  const allQuery = useCommitments();
  const myQuery = useMyCommitments();
  const { data: commitments, isLoading } = isOfficerOnly ? myQuery : allQuery;

  const fulfillMutation = useFulfillCommitment();
  const rescheduleMutation = useRescheduleCommitmentSwipe();
  const canSwipe = useSwipeDebounce(500);

  const pending = commitments?.filter((c) => c.status === "pending") ?? [];
  const fulfilled = commitments?.filter((c) => c.status === "fulfilled") ?? [];
  const rescheduled = commitments?.filter((c) => c.status === "rescheduled") ?? [];

  const handleFulfill = (id: string) => {
    if (!canSwipe()) return; // 500ms debounce
    fulfillMutation.mutate(id);
  };

  const handleRescheduleOpen = (commitment: Commitment) => {
    if (!canSwipe()) return; // 500ms debounce
    setRescheduleTarget(commitment);
  };


  const handleRescheduleConfirm = (commitmentId: string, date: string, reason: string) => {
    rescheduleMutation.mutate(
      { commitment_id: commitmentId, reschedule_date: date, reschedule_reason: reason },
      { onSuccess: () => setRescheduleTarget(null) }
    );
  };

  const renderCards = (items: Commitment[]) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarClock className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground font-bangla">
            {lang === "bn" ? "কোনো প্রতিশ্রুতি নেই" : "No commitments"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((c) => (
          <CommitmentSwipeCard
            key={c.id}
            commitment={c}
            onFulfill={handleFulfill}
            onReschedule={handleRescheduleOpen}
            disabled={c.status !== "pending" || !swipeEnabled}
          />
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "প্রতিশ্রুতি ট্র্যাকার" : "Commitment Tracker"}
        description={lang === "bn" ? "গ্রাহকদের পেমেন্ট প্রতিশ্রুতি ট্র্যাক এবং পরিচালনা করুন" : "Track and manage client payment commitments"}
        badge={lang === "bn" ? "🤝 প্রতিশ্রুতি ইঞ্জিন" : "🤝 Promise Engine"}
      />

      {/* Feature flag + swipe instructions */}
      {swipeEnabled && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
          <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
          <p className="text-xs text-foreground/80 font-bangla">
            {lang === "bn"
              ? "👉 ডানে সোয়াইপ = পরিশোধ | 👈 বামে সোয়াইপ = রিশিডিউল"
              : "👉 Swipe Right = Paid | 👈 Swipe Left = Reschedule"}
          </p>
        </div>
      )}

      {!swipeEnabled && !flagLoading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border/40">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            {lang === "bn" ? "সোয়াইপ ফিচার নিষ্ক্রিয়" : "Swipe feature is disabled"}
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="pending" className="text-xs gap-1">
            {lang === "bn" ? "বাকি" : "Pending"}
            {pending.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{pending.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fulfilled" className="text-xs gap-1">
            {lang === "bn" ? "পরিশোধিত" : "Fulfilled"}
            {fulfilled.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{fulfilled.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rescheduled" className="text-xs gap-1">
            {lang === "bn" ? "রিশিডিউল" : "Rescheduled"}
            {rescheduled.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{rescheduled.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="pending" className="mt-4">{renderCards(pending)}</TabsContent>
            <TabsContent value="fulfilled" className="mt-4">{renderCards(fulfilled)}</TabsContent>
            <TabsContent value="rescheduled" className="mt-4">{renderCards(rescheduled)}</TabsContent>
          </>
        )}
      </Tabs>

      {/* AI Reschedule Modal */}
      <AIChipsRescheduleModal
        commitment={rescheduleTarget}
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onConfirm={handleRescheduleConfirm}
        isPending={rescheduleMutation.isPending}
      />
    </AppLayout>
  );
};

export default Commitments;
