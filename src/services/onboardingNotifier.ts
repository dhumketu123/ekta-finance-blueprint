import { supabase } from "@/integrations/supabase/client";

type OnboardRole = "client" | "investor" | "officer";

interface OnboardEntry {
  name_en: string;
  phone?: string | null;
  email?: string | null;
}

interface NotifyOptions {
  userId: string;
  tenantId: string;
  role: OnboardRole;
  entries: OnboardEntry[];
}

interface OnboardNotifyResult {
  name: string;
  status: "success" | "failed";
  messages: string[];
}

const ROLE_LABEL_BN: Record<OnboardRole, string> = {
  client: "গ্রাহক",
  investor: "বিনিয়োগকারী",
  officer: "মাঠকর্মী",
};

/**
 * Dispatches multi-channel notifications (In-App + SMS + Email)
 * for each onboarded entry. Each channel is independent —
 * failure in one does not block others.
 */
export const notifyBulkOnboard = async (opts: NotifyOptions): Promise<OnboardNotifyResult[]> => {
  const results: OnboardNotifyResult[] = [];

  for (const entry of opts.entries) {
    const result: OnboardNotifyResult = { name: entry.name_en, status: "success", messages: [] };

    // 1️⃣ In-App notification via SECURITY DEFINER RPC
    try {
      await supabase.rpc("dispatch_notification" as any, {
        p_user_id: opts.userId,
        p_tenant_id: opts.tenantId,
        p_title: `${entry.name_en} অনবোর্ড সম্পন্ন`,
        p_message: `${ROLE_LABEL_BN[opts.role]} "${entry.name_en}" সফলভাবে যোগ হয়েছে।`,
        p_event_type: "bulk_onboard",
        p_source_module: "onboarding",
        p_role: "admin",
        p_priority: "LOW",
      });
      result.messages.push("In-App ✅");
    } catch (err: any) {
      result.messages.push(`In-App ❌ ${err.message || ""}`);
    }

    // 2️⃣ SMS via BulkSMSBD gateway
    try {
      if (entry.phone?.trim()) {
        await supabase.rpc("send_sms" as any, {
          p_recipient: entry.phone.trim(),
          p_message: `স্বাগতম ${entry.name_en}! আপনার ${ROLE_LABEL_BN[opts.role]} অ্যাকাউন্ট Ekta Finance-এ তৈরি হয়েছে।`,
          p_recipient_name: entry.name_en,
          p_message_type: "onboarding",
        });
        result.messages.push("SMS ✅");
      }
    } catch (err: any) {
      result.messages.push(`SMS ❌ ${err.message || ""}`);
    }

    // 3️⃣ Email (if provided) — uses send-notification edge function
    try {
      if (entry.email?.trim()) {
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: "email",
            to: entry.email.trim(),
            subject: `Welcome to Ekta Finance — ${ROLE_LABEL_BN[opts.role]}`,
            body: `Hello ${entry.name_en},\n\nYour ${opts.role} account has been created on Ekta Finance.\n\nধন্যবাদ,\nEkta Finance Team`,
          },
        });
        result.messages.push("Email ✅");
      }
    } catch (err: any) {
      result.messages.push(`Email ❌ ${err.message || ""}`);
    }

    // Mark failed if no channel succeeded
    if (result.messages.every((m) => m.includes("❌"))) {
      result.status = "failed";
    }

    results.push(result);
  }

  return results;
};

/** Backward-compatible alias used by BulkOnboarding page */
export const notifyOnboardedUsers = async (
  entries: { name_en: string; phone?: string | null }[],
  role: OnboardRole,
  tenantId: string,
  userId: string
) => {
  return notifyBulkOnboard({ userId, tenantId, role, entries });
};

/**
 * Triggers the first-login onboarding wizard if not already shown.
 */
export const triggerFirstLoginWizard = (userId: string) => {
  const key = "ekta_onboarding_dismissed";
  return !localStorage.getItem(key);
};
