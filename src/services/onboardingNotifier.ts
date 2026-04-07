import { supabase } from "@/integrations/supabase/client";

export type OnboardRole = "client" | "investor" | "officer";

export interface OnboardEntry {
  name_en: string;
  name_bn: string;
  phone: string;
  area?: string;
  email?: string;
  notes?: string;
}

export interface ChannelResult {
  channel: "In-App" | "SMS" | "Email";
  ok: boolean;
  detail: string;
}

export interface OnboardNotifyResult {
  name: string;
  status: "success" | "failed";
  channels: ChannelResult[];
}

const ROLE_BN: Record<OnboardRole, string> = {
  client: "গ্রাহক",
  investor: "বিনিয়োগকারী",
  officer: "মাঠকর্মী",
};

// ── Retry helper: exponential backoff, max 3 attempts ──
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastErr;
}

async function sendInApp(entry: OnboardEntry, role: OnboardRole, tenantId: string, userId: string): Promise<ChannelResult> {
  try {
    await withRetry(async () => {
      const { error } = await supabase.rpc("dispatch_notification" as any, {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_title: `${entry.name_en} অনবোর্ড সম্পন্ন`,
        p_message: `${ROLE_BN[role]} "${entry.name_en}" সফলভাবে যোগ হয়েছে।`,
        p_event_type: "bulk_onboard",
        p_source_module: "onboarding",
        p_role: "admin",
        p_priority: "LOW",
      });
      if (error) throw error;
    });
    return { channel: "In-App", ok: true, detail: "✅" };
  } catch (err: any) {
    return { channel: "In-App", ok: false, detail: err.message || "Failed" };
  }
}

async function sendSms(entry: OnboardEntry, role: OnboardRole): Promise<ChannelResult | null> {
  if (!entry.phone?.trim()) return null;
  try {
    await withRetry(async () => {
      const { error } = await supabase.rpc("send_sms" as any, {
        p_recipient: entry.phone.trim(),
        p_message: `স্বাগতম ${entry.name_en}! আপনার ${ROLE_BN[role]} অ্যাকাউন্ট Ekta Finance-এ তৈরি হয়েছে।`,
        p_recipient_name: entry.name_en,
        p_message_type: "onboarding",
      });
      if (error) throw error;
    });
    return { channel: "SMS", ok: true, detail: "✅" };
  } catch (err: any) {
    return { channel: "SMS", ok: false, detail: err.message || "Failed" };
  }
}

async function sendEmail(entry: OnboardEntry, role: OnboardRole): Promise<ChannelResult | null> {
  if (!entry.email?.trim()) return null;
  try {
    await withRetry(() =>
      supabase.functions.invoke("send-notification", {
        body: {
          channel: "email",
          to: entry.email!.trim(),
          subject: `Welcome to Ekta Finance — ${ROLE_BN[role]}`,
          body: `Hello ${entry.name_en},\n\nYour ${role} account has been created on Ekta Finance.\n\nধন্যবাদ,\nEkta Finance Team`,
        },
      }).then(({ error }) => { if (error) throw error; })
    );
    return { channel: "Email", ok: true, detail: "✅" };
  } catch (err: any) {
    return { channel: "Email", ok: false, detail: err.message || "Failed" };
  }
}

/**
 * Multi-channel notification dispatcher with retry logic.
 * Each channel is independent — failure in one does not block others.
 */
export const notifyBulkOnboard = async (
  entries: OnboardEntry[],
  role: OnboardRole,
  tenantId: string,
  userId: string
): Promise<OnboardNotifyResult[]> => {
  const results: OnboardNotifyResult[] = [];

  for (const entry of entries) {
    const channelResults = await Promise.all([
      sendInApp(entry, role, tenantId, userId),
      sendSms(entry, role),
      sendEmail(entry, role),
    ]);

    const channels = channelResults.filter(Boolean) as ChannelResult[];
    const allFailed = channels.length > 0 && channels.every((c) => !c.ok);

    results.push({
      name: entry.name_en,
      status: allFailed ? "failed" : "success",
      channels,
    });
  }

  return results;
};

/** Backward-compatible alias */
export const notifyOnboardedUsers = async (
  entries: { name_en: string; phone?: string | null }[],
  role: OnboardRole,
  tenantId: string,
  userId: string
) => {
  const mapped: OnboardEntry[] = entries.map((e) => ({
    name_en: e.name_en,
    name_bn: e.name_en,
    phone: e.phone || "",
  }));
  return notifyBulkOnboard(mapped, role, tenantId, userId);
};

export const triggerFirstLoginWizard = (_userId: string) => {
  return !localStorage.getItem("ekta_onboarding_dismissed");
};
