/**
 * Server Evolutions constants shared between the server (enforcement) and the
 * web client (display). The server keeps its own enriched helpers in
 * packages/server/src/utils/evoLimits.ts — these are the pure numbers.
 */

export const EVO_CHANNEL_LIMITS: Readonly<Record<0 | 1 | 2, { text: number; voice: number }>> = {
  0: { text: 10, voice: 5 },
  1: { text: 20, voice: 15 },
  2: { text: 35, voice: 25 },
};

export const MAX_EVO_LEVEL = 2;
