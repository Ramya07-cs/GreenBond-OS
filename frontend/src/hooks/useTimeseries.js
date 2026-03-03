import { useQuery } from "@tanstack/react-query";
import { fetchTimeseries } from "../api";

export function useTimeseries(bondId, days = 60) {
  return useQuery({
    queryKey: ["timeseries", bondId, days],
    queryFn: () => fetchTimeseries(bondId, days),
    enabled: !!bondId,
    staleTime: 5 * 60_000,   // 5 minutes — chart data doesn't need live refresh
  });
}
