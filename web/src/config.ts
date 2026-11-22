// Public data release on Cloudflare R2. Override at build time with VITE_DATA_URL
// (for example once a custom domain such as https://data.<domain> exists).
const DEFAULT_DATA_URL = "https://pub-7368a1bf7f2b44898e1f5028f7fdb733.r2.dev";

export const DATA_BASE: string = (import.meta.env.VITE_DATA_URL as string | undefined) || DEFAULT_DATA_URL;
/** Phase 6 feedback form; the button stays hidden while this is empty. */
export const FEEDBACK_URL: string = (import.meta.env.VITE_FEEDBACK_URL as string | undefined) || "";
export const CODE_URL = "https://github.com/loicns/buja-twin-web";
export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
/** Live-preview API (AWS Lambda Function URL). The preview panel stays hidden while this is empty. */
export const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/\/$/, "");
