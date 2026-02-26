import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { useSuperAdmin, type TenantInfo } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, Users, Wallet, MessageSquare, ShieldCheck, ShieldOff,
  RotateCcw, Lock, Unlock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

const statusVariant = (status: string) => {
  switch (status) {
    case "active": return "default";
    case "locked": return "destructive";
    case "expired": return "secondary";
    default: return "outline";
  }
};

const statusIcon = (status: string) => {
  switch (status) {
    case "active": return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "locked": return <Lock className="h-3.5 w-3.5" />;
    case "expired": return <AlertTriangle className="h-3.5 w-3.5" />;
    default: return null;
  }
};

const MetricSkeleton = () => (
  <Card><CardContent className="p-6"><Skeleton className="h-8 w-20" /><Skeleton className="h-4 w-32 mt-2" /></CardContent></Card>
);

const TenantCard = ({
  tenant,
  onSuspend,
  onUnsuspend,
  onResetSms,
}: {
  tenant: TenantInfo;
  onSuspend: (id: string) => void;
  onUnsuspend: (id: string) => void;
  onResetSms: (id: string) => void;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {tenant.name}
        </CardTitle>
        <Badge variant={statusVariant(tenant.status)} className="gap-1 text-xs">
          {statusIcon(tenant.status)}
          {tenant.status}
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">প্ল্যান:</span>{" "}
          <span className="font-medium">{tenant.plan}</span>
        </div>
        <div>
          <span className="text-muted-foreground">মেয়াদ:</span>{" "}
          <span className="font-medium">
            {tenant.end_date ? format(new Date(tenant.end_date), "dd/MM/yyyy") : "N/A"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.client_count}/{tenant.max_customers}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.loan_count}/{tenant.max_loans}</span>
        </div>
        <div className="flex items-center gap-1.5 col-span-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span>SMS: {tenant.sms_count}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {tenant.status === "active" ? (
          <Button size="sm" variant="destructive" onClick={() => onSuspend(tenant.id)} className="gap-1.5">
            <ShieldOff className="h-3.5 w-3.5" /> সাসপেন্ড
          </Button>
        ) : (
          <Button size="sm" variant="default" onClick={() => onUnsuspend(tenant.id)} className="gap-1.5">
            <Unlock className="h-3.5 w-3.5" /> আনলক
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onResetSms(tenant.id)} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> SMS রিসেট
        </Button>
      </div>
    </CardContent>
  </Card>
);

const SuperAdminDashboard = () => {
  const { data, isLoading, suspendTenant, unsuspendTenant, resetSmsQuota } = useSuperAdmin();

  return (
    <AppLayout>
      <PageHeader title="Super Admin Dashboard" description="সকল টেন্যান্ট ও সিস্টেম পরিচালনা" />

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.total_tenants ?? 0}</p>
                    <p className="text-xs text-muted-foreground">মোট টেন্যান্ট</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.active_subscriptions ?? 0}</p>
                    <p className="text-xs text-muted-foreground">সক্রিয় সাবস্ক্রিপশন</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(data?.locked_subscriptions ?? 0) + (data?.expired_subscriptions ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">লক/মেয়াদোত্তীর্ণ</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-accent/20 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.sms_this_month ?? 0}</p>
                    <p className="text-xs text-muted-foreground">এই মাসে SMS</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Global Stats */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{data.total_clients}</p>
                <p className="text-xs text-muted-foreground">মোট গ্রাহক</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{data.total_loans}</p>
                <p className="text-xs text-muted-foreground">মোট ঋণ</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{data.total_sms_sent}</p>
                <p className="text-xs text-muted-foreground">মোট SMS পাঠানো</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tenant List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">টেন্যান্ট তালিকা</h2>
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}><CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {(data?.tenants ?? []).map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onSuspend={suspendTenant}
                onUnsuspend={unsuspendTenant}
                onResetSms={resetSmsQuota}
              />
            ))}
            {(data?.tenants ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground col-span-2 text-center py-8">কোনো টেন্যান্ট পাওয়া যায়নি</p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default SuperAdminDashboard;
