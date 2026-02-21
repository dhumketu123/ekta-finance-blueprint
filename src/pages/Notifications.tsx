import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Bell, Send, CheckCircle, XCircle, Clock, RefreshCw, Search, MessageSquare, RotateCcw, Smartphone, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSmsGateway, buildSmsIntentUri } from "@/hooks/useSmsGateway";

const handleResend = async (logId: string, refetch: () => void) => {
  const { error } = await supabase
    .from("notification_logs")
    .update({ delivery_status: "queued", error_message: null } as any)
    .eq("id", logId);
  if (error) {
    toast.error("Resend failed");
  } else {
    toast.success("Re-queued for delivery ✅");
    refetch();
  }
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  sent: "bg-success/10 text-success border-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  delivered: "bg-success/10 text-success border-success/20",
};

const ALERT_LABELS: Record<string, { en: string; bn: string }> = {
  default_alert: { en: "Default Alert", bn: "ডিফল্ট সতর্কতা" },
  escalation_alert: { en: "Escalation", bn: "এস্কেলেশন" },
  overdue_alert: { en: "Overdue", bn: "বকেয়া" },
  loan_due_today: { en: "Due Today", bn: "আজ বকেয়া" },
  upcoming_reminder: { en: "Reminder", bn: "রিমাইন্ডার" },
  savings_reminder: { en: "Savings", bn: "সঞ্চয়" },
  low_risk: { en: "Low Risk", bn: "নিম্ন ঝুঁকি" },
  payment_confirmation: { en: "Payment ✅", bn: "পেমেন্ট ✅" },
};

const useNotificationLogs = () =>
  useQuery({
    queryKey: ["notification_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

const Notifications = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { data: logs, isLoading, refetch, isFetching } = useNotificationLogs();
  const { data: gateway } = useSmsGateway();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => {
      if (statusFilter !== "all" && log.delivery_status !== statusFilter) return false;
      if (eventFilter !== "all" && log.event_type !== eventFilter) return false;
      if (channelFilter !== "all" && log.channel !== channelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (log.recipient_name || "").toLowerCase();
        const phone = (log.recipient_phone || "").toLowerCase();
        const msg = (log.message_en || "").toLowerCase() + (log.message_bn || "").toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !msg.includes(q)) return false;
      }
      return true;
    });
  }, [logs, statusFilter, eventFilter, channelFilter, searchQuery]);

  // KPIs
  const total = logs?.length ?? 0;
  const sentCount = logs?.filter((l) => l.delivery_status === "sent" || l.delivery_status === "delivered").length ?? 0;
  const failedCount = logs?.filter((l) => l.delivery_status === "failed").length ?? 0;
  const queuedCount = logs?.filter((l) => l.delivery_status === "queued").length ?? 0;

  // Unique event types
  const eventTypes = useMemo(() => {
    if (!logs) return [];
    return [...new Set(logs.map((l) => l.event_type))].sort();
  }, [logs]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
        return <CheckCircle className="w-3.5 h-3.5 text-success" />;
      case "failed":
        return <XCircle className="w-3.5 h-3.5 text-destructive" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
    }
  };

  const handleSendViaPhone = (phone: string, message: string) => {
    if (!phone) {
      toast.error(bn ? "ফোন নম্বর নেই" : "No phone number");
      return;
    }
    const uri = buildSmsIntentUri(phone, message);
    window.open(uri, "_blank");
    toast.success(bn ? "মেসেজিং অ্যাপ খোলা হচ্ছে..." : "Opening messaging app...");
  };

  const isMobileNative = gateway?.mode === "mobile_native";

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={bn ? "বিজ্ঞপ্তি লগ" : "Notification Logs"} description={bn ? "সকল বিজ্ঞপ্তি ও ডেলিভারি স্ট্যাটাস" : "All notifications & delivery status"} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={8} cols={6} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "বিজ্ঞপ্তি লগ" : "Notification Logs"}
        description={bn ? "সকল বিজ্ঞপ্তি, ডেলিভারি স্ট্যাটাস ও রিট্রাই" : "All notifications, delivery status & retry"}
        actions={
          <div className="flex items-center gap-2">
            {gateway && (
              <Badge variant="outline" className="text-[10px] gap-1">
                {gateway.mode === "api" && <><ExternalLink className="w-2.5 h-2.5" /> API</>}
                {gateway.mode === "mobile_native" && <><Smartphone className="w-2.5 h-2.5" /> Native</>}
                {gateway.mode === "webhook" && <><ExternalLink className="w-2.5 h-2.5" /> Webhook</>}
              </Badge>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {bn ? "রিফ্রেশ" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard title={bn ? "মোট বিজ্ঞপ্তি" : "Total"} value={total} icon={<Bell className="w-5 h-5" />} />
        <MetricCard title={bn ? "প্রেরিত" : "Sent"} value={sentCount} icon={<Send className="w-5 h-5" />} variant="success" />
        <MetricCard title={bn ? "ব্যর্থ" : "Failed"} value={failedCount} icon={<XCircle className="w-5 h-5" />} variant="destructive" />
        <MetricCard title={bn ? "অপেক্ষমান" : "Queued"} value={queuedCount} icon={<Clock className="w-5 h-5" />} variant="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bn ? "নাম, ফোন বা মেসেজ খুঁজুন..." : "Search name, phone or message..."}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{bn ? "সব স্ট্যাটাস" : "All Status"}</SelectItem>
            <SelectItem value="queued">{bn ? "অপেক্ষমান" : "Queued"}</SelectItem>
            <SelectItem value="sent">{bn ? "প্রেরিত" : "Sent"}</SelectItem>
            <SelectItem value="failed">{bn ? "ব্যর্থ" : "Failed"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue placeholder="Event Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{bn ? "সব ধরন" : "All Types"}</SelectItem>
            {eventTypes.map((et) => (
              <SelectItem key={et} value={et}>{ALERT_LABELS[et]?.[lang] ?? et}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{bn ? "সব চ্যানেল" : "All Channels"}</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]">
          {filteredLogs.length} {bn ? "ফলাফল" : "results"}
        </Badge>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{bn ? "কোনো বিজ্ঞপ্তি পাওয়া যায়নি" : "No notifications found"}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>{bn ? "প্রাপক" : "Recipient"}</TableHead>
                    <TableHead>{bn ? "ধরন" : "Type"}</TableHead>
                    <TableHead>{bn ? "চ্যানেল" : "Channel"}</TableHead>
                    <TableHead>{bn ? "স্ট্যাটাস" : "Status"}</TableHead>
                    <TableHead>{bn ? "বার্তা" : "Message"}</TableHead>
                    <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                    <TableHead>{bn ? "অ্যাকশন" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 50).map((log) => {
                    const message = bn ? (log.message_bn || log.message_en) : (log.message_en || log.message_bn);
                    return (
                      <TableRow key={log.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell>
                          <div>
                            <p className="text-xs font-medium">{log.recipient_name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground">{log.recipient_phone || "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {ALERT_LABELS[log.event_type]?.[lang] ?? log.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] uppercase">{log.channel}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(log.delivery_status)}
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[log.delivery_status] ?? "bg-muted text-muted-foreground"}`}>
                              {log.delivery_status}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <p className="text-[11px] text-muted-foreground truncate">{message}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString(bn ? "bn-BD" : "en-US", { day: "numeric", month: "short", year: "2-digit" })}
                          </p>
                          <p className="text-[9px] text-muted-foreground/70">
                            {new Date(log.created_at).toLocaleTimeString(bn ? "bn-BD" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Mobile native: Send via Phone button */}
                            {isMobileNative && log.recipient_phone && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSendViaPhone(log.recipient_phone!, message)}
                                title={bn ? "ফোনে পাঠান" : "Send via Phone"}
                              >
                                <Smartphone className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            )}
                            {/* Resend for failed */}
                            {log.delivery_status === "failed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleResend(log.id, refetch)}
                                title={bn ? "পুনরায় পাঠান" : "Resend"}
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-border">
              {filteredLogs.slice(0, 30).map((log) => {
                const message = bn ? (log.message_bn || log.message_en) : (log.message_en || log.message_bn);
                return (
                  <div key={log.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.delivery_status)}
                        <p className="text-sm font-medium">{log.recipient_name || "—"}</p>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[log.delivery_status] ?? ""}`}>
                        {log.delivery_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{ALERT_LABELS[log.event_type]?.[lang] ?? log.event_type}</Badge>
                      <Badge variant="secondary" className="text-[10px] uppercase">{log.channel}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{message}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground/70">
                        {new Date(log.created_at).toLocaleString(bn ? "bn-BD" : "en-US")}
                      </p>
                      <div className="flex gap-1">
                        {isMobileNative && log.recipient_phone && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={() => handleSendViaPhone(log.recipient_phone!, message)}>
                            <Smartphone className="w-3 h-3" />
                            {bn ? "পাঠান" : "Send"}
                          </Button>
                        )}
                        {log.delivery_status === "failed" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleResend(log.id, refetch)}>
                            <RotateCcw className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Notifications;
