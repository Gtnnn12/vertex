import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import type { GifResult } from '@vertex/shared';
import { useLanguage } from '../../contexts/LanguageContext';

interface GifPickerProps {
  onGifSelect: (url: string) => void;
  /**
   * Mobile rendering: drop the desktop fixed dimensions and let the picker
   * fill its parent (a bottom sheet that controls width + max-height).
   */
  mobile?: boolean;
}

// Category chips shown when no search is active. Each chip drives the
// EXISTING `api.gif.search` endpoint with a keyword — no new API surface.
// `trending` is special-cased to the trending endpoint (with its pagination
// shape) so the default open view keeps today's behavior.
interface GifCategory {
  key: string;
  i18nKey: string;
  keyword: string;
  emoji: string;
  isTrending?: boolean;
}

const GIF_CATEGORIES: GifCategory[] = [
  { key: 'trending', i18nKey: 'gif_category_trending', keyword: '', emoji: '🔥', isTrending: true },
  { key: 'memes', i18nKey: 'gif_category_memes', keyword: 'meme', emoji: '😂' },
  { key: 'reactions', i18nKey: 'gif_category_reactions', keyword: 'reaction', emoji: '😆' },
  { key: 'anime', i18nKey: 'gif_category_anime', keyword: 'anime', emoji: '🌸' },
  { key: 'love', i18nKey: 'gif_category_love', keyword: 'love', emoji: '❤️' },
  { key: 'sports', i18nKey: 'gif_category_sports', keyword: 'sports', emoji: '⚽' },
  { key: 'celebrating', i18nKey: 'gif_category_celebrating', keyword: 'celebration', emoji: '🎉' },
];

export function GifPicker({ onGifSelect, mobile = false }: GifPickerProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // Active category: null = trending (default view). A category chip sets
  // this; typing a search clears it (search takes precedence).
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPos, setNextPos] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const activeCat = GIF_CATEGORIES.find((c) => c.key === activeCategory) ?? null;
  const isSearchMode = debouncedQuery.trim().length > 0;

  // Selecting a search term exits category mode; picking a category clears
  // the search box. Both flows land in one of exactly two fetch modes.
  useEffect(() => {
    if (debouncedQuery.trim()) setActiveCategory(null);
  }, [debouncedQuery]);
  const handleCategorySelect = (key: string) => {
    setQuery('');
    setDebouncedQuery('');
    setActiveCategory(key);
  };

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Fetch results when debounced query or category changes. The keyword for a
  // category flows through the same `search` endpoint as a user query.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResults([]);
    setNextPos('');

    const fetchGifs = async () => {
      try {
        let data: { results: GifResult[]; next: string };
        if (isSearchMode) {
          data = await api.gif.search(debouncedQuery.trim(), 30);
        } else if (activeCat && !activeCat.isTrending) {
          data = await api.gif.search(activeCat.keyword, 30);
          // Categories must NEVER render empty: if the keyword search comes
          // back dry (Klipy can miss niche terms), fall back to trending so
          // the chip always shows content. Manual searches keep the friendly
          // empty state instead.
          if (data.results.length === 0) {
            data = await api.gif.trending(30);
          }
        } else {
          data = await api.gif.trending(30);
        }
        if (!cancelled) {
          setResults(data.results);
          setNextPos(data.next);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    fetchGifs();
    return () => { cancelled = true; };
  }, [debouncedQuery, activeCategory]); // eslint-disable-line react-hooks/exhaustive-deps -- activeCat derives from activeCategory

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !nextPos) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setLoadingMore(true);
      const fetchMore = async () => {
        try {
          let data: { results: GifResult[]; next: string };
          if (isSearchMode) {
            data = await api.gif.search(debouncedQuery.trim(), 30, nextPos);
          } else if (activeCat && !activeCat.isTrending) {
            data = await api.gif.search(activeCat.keyword, 30, nextPos);
          } else {
            data = await api.gif.trending(30, nextPos);
          }
          setResults((prev) => [...prev, ...data.results]);
          setNextPos(data.next);
        } finally {
          setLoadingMore(false);
        }
      };
      fetchMore();
    }
  }, [loadingMore, nextPos, debouncedQuery, isSearchMode, activeCat]);

  // Prevent keyboard events from bubbling
  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  // Empty-state copy: friendlier tone, distinguishes search from browse.
  const emptyMessage = isSearchMode
    ? t('gif_empty_search')
    : t('gif_empty_trending');

  // Mobile: fill parent (sheet sets width + max-height). Desktop: fixed dims
  // matching the legacy popover footprint.
  const rootClass = mobile
    ? 'flex flex-col flex-1 min-h-0 w-full'
    : 'flex flex-col h-[390px] w-[390px]';

  return (
    <div className={rootClass} onKeyDown={handleKeyDown}>
      {/* Search */}
      <div className="px-3 pt-2 pb-1.5 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs"
          className="input-search w-full"
          // Auto-focus only on desktop. On mobile this would force the OS
          // keyboard up the moment the sheet opens, hiding most of the grid.
          autoFocus={!mobile}
        />
      </div>

      {/* Category chips — only in browse mode (hidden while searching) */}
      {!isSearchMode && (
        <div className="px-2 pb-1.5 shrink-0 flex flex-wrap gap-1">
          {GIF_CATEGORIES.map((cat) => {
            const isActive = (activeCategory ?? 'trending') === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategorySelect(cat.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-accent-primary text-white'
                    : 'bg-white/[0.05] text-txt-tertiary hover:text-txt-primary hover:bg-white/[0.09]'
                }`}
              >
                <span aria-hidden className="text-[12px] leading-none">{cat.emoji}</span>
                {t(cat.i18nKey)}
              </button>
            );
          })}
        </div>
      )}

      {/* Results grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-1"
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-1.5 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface-elevated rounded-lg animate-pulse"
                style={{ height: 100 + Math.random() * 60 }}
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-txt-tertiary/60"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M8 10h.01M12 10h.01M16 10h.01M8 14.5c1 1 2.5 1.5 4 1.5s3-.5 4-1.5" />
            </svg>
            <p className="text-txt-tertiary text-[13px] leading-[1.5]">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="columns-2 gap-1.5 p-1">
            {results.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onGifSelect(gif.url)}
                className="gif-tile w-full mb-1.5 rounded-lg overflow-hidden break-inside-avoid transition-all duration-150"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="w-full object-cover rounded-lg"
                  loading="lazy"
                  style={{
                    aspectRatio: gif.width && gif.height ? `${gif.width}/${gif.height}` : undefined,
                  }}
                />
              </button>
            ))}
          </div>
        )}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-txt-tertiary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="px-3 py-1 text-[10px] text-txt-tertiary text-right shrink-0">
        Powered by Klipy · {t('gif_created_by')}
      </div>
    </div>
  );
}
