import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { filterQuery } from "../utils/format";
export const defaultFilters = () => ({
  year: String(new Date().getFullYear()),
  month: "",
  start: "",
  end: "",
  product: "",
  category: "",
  location: "",
});
export function useDashboard() {
  const [filters, setFilters] = useState(defaultFilters),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const query = filterQuery(filters);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api("/api/dashboard?" + query, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return {
    filters,
    setFilters,
    data,
    error,
    loading,
    reload,
    query,
    reset: () => setFilters(defaultFilters()),
  };
}
