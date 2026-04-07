import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";

interface SearchInputProps<T> {
  data: T[];
  keys?: string[];
  onSelect?: (item: T) => void;
  placeholder?: string;
  renderItem?: (item: T) => React.ReactNode;
}

function SearchInput<T extends Record<string, unknown>>({
  data,
  keys = ["title", "name", "email"],
  onSelect,
  placeholder = "Search...",
  renderItem,
}: SearchInputProps<T>) {
  const [query, setQuery] = useState("");
  const results = useFuzzySearch(data, query, { keys });
  const showResults = query.trim().length > 0;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showResults && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((item, idx) => (
            <li
              key={idx}
              onClick={() => {
                onSelect?.(item);
                setQuery("");
              }}
              className="px-3 py-2 text-sm text-popover-foreground hover:bg-accent/10 cursor-pointer transition-colors"
            >
              {renderItem
                ? renderItem(item)
                : String(
                    (item as Record<string, unknown>).title ??
                      (item as Record<string, unknown>).name ??
                      (item as Record<string, unknown>).email ??
                      ""
                  )}
            </li>
          ))}
        </ul>
      )}
      {showResults && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover px-3 py-2 text-sm text-muted-foreground">
          No results found
        </div>
      )}
    </div>
  );
}

export default SearchInput;
