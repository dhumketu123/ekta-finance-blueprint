import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TX_COLUMNS = "id, created_at, type, amount, status, reference_id, transaction_date" as const;

interface UseInvestorTransactionsOptions {
  investorId: string | undefined;
  pageSize?: number;
}

export const useInvestorTransactions = ({
  investorId,
  pageSize = 10,
}: UseInvestorTransactionsOptions) => {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryKey = ["investor_transactions", investorId, debouncedSearch];

  // Count query
  const { data: totalCount = 0 } = useQuery({
    queryKey: [...queryKey, "count"],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("investor_id", investorId!)
        .is("deleted_at", null);

      if (debouncedSearch) {
        query = query.or(
          `reference_id.ilike.%${debouncedSearch}%,type.ilike.%${debouncedSearch}%,status.ilike.%${debouncedSearch}%`
        );
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!investorId,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  // Data query
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey, "page", safePage, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(TX_COLUMNS)
        .eq("investor_id", investorId!)
        .is("deleted_at", null);

      if (debouncedSearch) {
        query = query.or(
          `reference_id.ilike.%${debouncedSearch}%,type.ilike.%${debouncedSearch}%,status.ilike.%${debouncedSearch}%`
        );
      }

      query = query
        .order("created_at", { ascending: false })
        .range((safePage - 1) * pageSize, safePage * pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!investorId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!investorId) return;

    // Clean up previous
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`investor_tx_${investorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `investor_id=eq.${investorId}`,
        },
        (payload) => {
          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey });

          if (payload.eventType === "INSERT") {
            toast.success("New transaction received", {
              duration: 3000,
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [investorId, queryClient]); // intentionally exclude queryKey to avoid re-subscribing on search

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  return {
    transactions: data ?? [],
    isLoading,
    error,
    page: safePage,
    setPage,
    totalPages,
    totalCount,
    pageSize,
    searchTerm,
    onSearch: handleSearch,
    clearSearch,
    isSearching: searchTerm !== debouncedSearch,
  };
};
