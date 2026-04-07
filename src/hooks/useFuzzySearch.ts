import { useMemo } from "react";
import Fuse from "fuse.js";

interface FuzzySearchOptions {
  keys: string[];
  threshold?: number;
}

export const useFuzzySearch = <T>(
  data: T[],
  searchTerm: string,
  options: FuzzySearchOptions = { keys: ["title", "name", "email", "description"] }
): T[] => {
  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys: options.keys,
        threshold: options.threshold ?? 0.35,
        ignoreLocation: true,
        includeScore: true,
      }),
    [data, options.keys, options.threshold]
  );

  return useMemo(() => {
    if (!searchTerm.trim()) return data;
    return fuse.search(searchTerm).map((res) => res.item);
  }, [searchTerm, fuse, data]);
};
