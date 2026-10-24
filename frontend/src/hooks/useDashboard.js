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
export function useDashboard(
  endpoint = "/api/dashboard",
  activePage = "dashboard",
) {
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
    api(endpoint + "?" + query, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData({ endpoint, result });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, version, endpoint, activePage]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [reload]);
  return {
    filters,
    setFilters,
    data: data?.endpoint === endpoint ? data.result : null,
    error,
    loading,
    reload,
    query,
    reset: () => setFilters(defaultFilters()),
  };
}
