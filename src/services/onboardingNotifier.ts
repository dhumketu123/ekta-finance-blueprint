import { supabase } from "@/integrations/supabase/client";

type OnboardRole = "client" | "investor" | "officer";

interface OnboardedEntry {
  name_en: string;
  phone?: string | null;
}

/**
 * Dispatches in-app notification + SMS for each onboarded user.
 * Uses the existing `dispatch_notification` RPC for in-app
 * and `send_sms` RPC for SMS delivery via BulkSMSBD.
 */
export const notifyOnboardedUsers = async (
  entries: OnboardedEntry[],
  role: OnboardRole,
  tenantId: string,
  userId: string
) => {
  const roleLabelBn: Record<OnboardRole, string> = {
    client: "গ্রাহক",
    investor: "বিনিয়োগকারী",
    officer: "মাঠকর্মী",
  };

  for (const entry of entries) {
    try {
      // 1️⃣ In-App notification via SECURITY DEFINER RPC
      await supabase.rpc("dispatch_notification" as any, {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_title: `${entry.name_en} অনবোর্ড সম্পন্ন`,
        p_message: `${roleLabelBn[role]} "${entry.name_en}" সফলভাবে যোগ হয়েছে।`,
        p_event_type: "bulk_onboard",
        p_source_module: "onboarding",
        p_role: "admin",
        p_priority: "LOW",
      });
    } catch {
      // Non-blocking: notification failure should not break onboarding
    }

    try {
      // 2️⃣ SMS notification via BulkSMSBD gateway
      if (entry.phone?.trim()) {
        await supabase.rpc("send_sms" as any, {
          p_recipient: entry.phone.trim(),
          p_message: `স্বাগতম ${entry.name_en}! আপনার ${roleLabelBn[role]} অ্যাকাউন্ট Ekta Finance-এ তৈরি হয়েছে।`,
          p_recipient_name: entry.name_en,
          p_message_type: "onboarding",
        });
      }
    } catch {
      // Non-blocking
    }
  }
};

/**
 * Triggers the first-login onboarding wizard if not already shown.
 * Uses localStorage flag (same key as OnboardingWizard component).
 */
export const triggerFirstLoginWizard = (userId: string) => {
  const key = `ekta_onboarding_dismissed`;
  if (!localStorage.getItem(key)) {
    // Wizard auto-shows via OnboardingWizard component on Index page
    // This function ensures the flag is NOT set, so the wizard displays
    return true;
  }
  return false;
};
