// api.js — one place that knows where the Delon backend lives.
//
// * Served by Flask (web / desktop .exe): same origin, so the base is "".
// * `npm start` dev server (port 3000): http://127.0.0.1:5000.
// * Android app (Capacitor): the user enters the server address in Settings
//   (e.g. http://192.168.1.20:5000 or https://my-delon.onrender.com).

const STORAGE_KEY = "delon.apiBase";

export const isNative = () =>
  typeof window !== "undefined" &&
  !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export const isDesktop = () => typeof window !== "undefined" && !!window.pywebview;

function defaultBase() {
  if (process.env.REACT_APP_API_BASE) return process.env.REACT_APP_API_BASE;
  if (typeof window === "undefined") return "";
  if (isNative()) return "";
  const { protocol, port } = window.location;
  if (protocol === "file:" || port === "3000") return "http://127.0.0.1:5000";
  return ""; // served by Flask itself
}

export function getApiBase() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved.replace(/\/+$/, "");
  } catch (_) {}
  return defaultBase();
}

export function setApiBase(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value.trim().replace(/\/+$/, ""));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

export const needsServerSetup = () => isNative() && !getApiBase();

export const apiUrl = (path) => `${getApiBase()}${path}`;

export async function fetchJSON(path, options = {}) {
  const response = await fetch(apiUrl(path), options);
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  return response.json();
}

// Backwards compatible helper used by older components.
export const fetchData = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return response.json();
};

// Open a link outside the app (system browser / PDF viewer).
export async function openExternal(url) {
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch (_) {
      window.location.href = url;
      return;
    }
  }
  if (isDesktop() && window.pywebview.api && window.pywebview.api.open_external) {
    window.pywebview.api.open_external(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
