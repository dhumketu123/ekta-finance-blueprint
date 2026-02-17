import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get only active investors (exclude matured/closed)
    const { data: investors, error } = await supabase
      .from("investors")
      .select("*")
      .eq("status", "active")
      .is("deleted_at", null);

    if (error) throw error;

    const results: Array<{
      investor_id: string;
      name: string;
      profit: number;
      reinvested: boolean;
      new_capital: number;
    }> = [];

    for (const inv of investors ?? []) {
      const profit = Math.round((inv.capital * inv.monthly_profit_percent) / 100 * 100) / 100;

      // Create profit transaction
      await supabase.from("transactions").insert({
        investor_id: inv.id,
        type: "investor_profit",
        amount: profit,
        transaction_date: new Date().toISOString().split("T")[0],
        status: "paid",
        notes: inv.reinvest ? "Auto-reinvested" : "Available for withdrawal",
      });

      if (inv.reinvest) {
        // Add profit to capital + update accumulated_profit
        const newCapital = inv.capital + profit;
        const newAccumulatedProfit = (inv.accumulated_profit ?? 0) + profit;
        await supabase
          .from("investors")
          .update({
            capital: newCapital,
            accumulated_profit: newAccumulatedProfit,
            last_profit_date: new Date().toISOString().split("T")[0],
          })
          .eq("id", inv.id);

        results.push({
          investor_id: inv.id,
          name: inv.name_en,
          profit,
          reinvested: true,
          new_capital: newCapital,
        });
      } else {
        const newAccumulatedProfit = (inv.accumulated_profit ?? 0) + profit;
        await supabase
          .from("investors")
          .update({
            accumulated_profit: newAccumulatedProfit,
            last_profit_date: new Date().toISOString().split("T")[0],
          })
          .eq("id", inv.id);

        results.push({
          investor_id: inv.id,
          name: inv.name_en,
          profit,
          reinvested: false,
          new_capital: inv.capital,
        });
      }

      // Send notification
      await supabase.from("notifications").insert({
        event: "profit_distributed",
        channel: "sms",
        template_en: `Dear ${inv.name_en}, your monthly profit of ৳${profit.toLocaleString()} has been ${inv.reinvest ? "reinvested" : "credited"}.`,
        template_bn: `প্রিয় ${inv.name_bn}, আপনার মাসিক মুনাফা ৳${profit.toLocaleString()} ${inv.reinvest ? "পুনঃবিনিয়োগ করা হয়েছে" : "জমা হয়েছে"}।`,
        recipient_phone: inv.phone,
        recipient_name: inv.name_en,
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action_type: "monthly_investor_profit",
      entity_type: "system",
      details: { processed: results.length, results },
    });

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
