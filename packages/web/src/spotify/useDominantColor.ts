import { useEffect, useState } from 'react';

/** Spotify embed covers are served with CORS headers, so canvas reads work. */
export function useDominantColor(coverUrl: string): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (!coverUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        // Tiny sample — colour accuracy is not worth the pixel loop cost.
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);
        let r = 0, g = 0, b = 0, count = 0;
        // Skip near-black (vinyl grooves would darken the average).
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2];
          if (pr + pg + pb < 60) continue;
          r += pr; g += pg; b += pb; count++;
        }
        if (count === 0) return;
        setColor(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
      } catch {
        // Tainted canvas (no CORS) — accent fallback stays.
      }
    };
    img.onerror = () => undefined;
    img.src = coverUrl;
    return () => { cancelled = true; };
  }, [coverUrl]);
  return color;
}
