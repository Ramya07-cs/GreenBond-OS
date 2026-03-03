import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBonds, fetchBond, createBond } from "../api";

export function useBonds() {
  return useQuery({
    queryKey: ["bonds"],
    queryFn: fetchBonds,
    refetchInterval: 60_000,  // Auto-refresh every 60s
  });
}

export function useBond(id) {
  return useQuery({
    queryKey: ["bond", id],
    queryFn: () => fetchBond(id),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useCreateBond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBond,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bonds"] }),
  });
}
