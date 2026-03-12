import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBonds, fetchBond, createBond } from "../api";

export function useBonds() {
  return useQuery({
    queryKey: ["bonds"],
    queryFn: fetchBonds,
    refetchInterval: 30_000,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useBond(id) {
  return useQuery({
    queryKey: ["bond", id],
    queryFn: () => fetchBond(id),
    enabled: !!id,
    refetchInterval: 30_000,
    staleTime: 0,        // Always consider data stale — refetch on every mount/focus
    gcTime: 0,           // Don't keep old data in memory between navigations
  });
}

export function useCreateBond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBond,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bonds"] }),
  });
}