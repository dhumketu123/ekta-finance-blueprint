import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PaginatedOptions {
  table: string;
  queryKey: string[];
  pageSize?: number;
  select?: string;
  filters?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  softDelete?: boolean;
}

export const usePaginatedQuery = <T = any>({
  table,
  queryKey,
  pageSize = 10,
  select = "*",
  filters = {},
  orderBy = { column: "created_at", ascending: false },
  softDelete = true,
}: PaginatedOptions) => {
  const [page, setPage] = useState(1);

  // Count query
  const { data: totalCount = 0 } = useQuery({
    queryKey: [...queryKey, "count", filters],
    queryFn: async () => {
      let query = supabase.from(table as any).select("id", { count: "exact", head: true });
      if (softDelete) query = query.is("deleted_at", null);
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") query = query.eq(k, v);
      });
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp page
  const safePage = Math.min(page, totalPages);

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey, "page", safePage, pageSize, filters],
    queryFn: async () => {
      let query = supabase.from(table as any).select(select);
      if (softDelete) query = query.is("deleted_at", null);
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") query = query.eq(k, v);
      });
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
      query = query.range((safePage - 1) * pageSize, safePage * pageSize - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data as T[];
    },
  });

  return {
    data: data ?? [],
    isLoading,
    error,
    page: safePage,
    setPage,
    totalPages,
    totalCount,
    pageSize,
  };
};
