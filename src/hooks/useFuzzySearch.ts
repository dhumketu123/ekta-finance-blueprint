import { useMemo } from "react";
import Fuse from "fuse.js";

interface FuzzySearchOptions {
  keys: string[];
  threshold?: number;
}

/** Strip diacritics, punctuation, lowercase, trim */
const preprocess = (str: string): string =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?'"()\-_]/g, "")
    .toLowerCase()
    .trim();

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
    const cleaned = preprocess(searchTerm);
    if (!cleaned) return data;
    return fuse.search(cleaned).map((res) => res.item);
  }, [searchTerm, fuse, data]);
};
