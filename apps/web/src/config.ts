/**
 * Data-mode switch. When VITE_API_URL is set the app talks to the real NestJS
 * backend; otherwise it runs fully offline on the localStorage store (default),
 * so the demo and tests keep working with no server.
 */
const raw = (import.meta.env.VITE_API_URL ?? '').trim();

export const API_URL = raw.replace(/\/$/, '');
export const isApiMode = API_URL.length > 0;
