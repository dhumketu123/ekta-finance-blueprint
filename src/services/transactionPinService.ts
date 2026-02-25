import { supabase } from "@/integrations/supabase/client";

export interface PinVerifyResult {
  status: "success" | "invalid" | "locked" | "no_pin" | "unauthorized";
  remaining_attempts?: number;
  locked_until?: string;
}

export interface PinSetResult {
  status: "success" | "invalid_length" | "unauthorized";
}

/**
 * Set or update the user's transaction PIN.
 * PIN must be 4–6 digits. Stored as bcrypt hash server-side.
 */
export async function setTransactionPin(pin: string): Promise<PinSetResult> {
  const { data, error } = await supabase.rpc("create_or_update_transaction_pin", {
    _new_pin: pin,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PinSetResult;
}

/**
 * Verify the user's transaction PIN.
 * Returns status with remaining attempts or lock info.
 */
export async function verifyTransactionPin(pin: string): Promise<PinVerifyResult> {
  const { data, error } = await supabase.rpc("verify_transaction_pin", {
    _input_pin: pin,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PinVerifyResult;
}

/**
 * Check if the current user has a PIN set.
 */
export async function hasTransactionPin(): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("pin_updated_at")
    .eq("id", user.user.id)
    .single();

  return !!data?.pin_updated_at;
}
