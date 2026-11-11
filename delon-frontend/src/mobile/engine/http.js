// HTTP that works from the phone without CORS limits (Capacitor native HTTP),
// with a plain fetch fallback for the browser.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

export const native = () => Capacitor.isNativePlatform();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function fetchText(url, timeout = 15000) {
  if (native()) {
    const res = await withTimeout(
      CapacitorHttp.request({
        url,
        method: "GET",
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, text/html, */*" },
        responseType: "text",
        connectTimeout: timeout,
        readTimeout: timeout,
      }),
      timeout + 2000
    );
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function postJSON(url, body, headers = {}, timeout = 60000) {
  if (native()) {
    const res = await withTimeout(
      CapacitorHttp.request({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        data: body,
        responseType: "json",
        connectTimeout: timeout,
        readTimeout: timeout,
      }),
      timeout + 2000
    );
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Download an image and return it as a data: URL (or null). */
export async function fetchImageDataUrl(url, timeout = 12000) {
  if (!url || !/^https?:/.test(url)) return null;
  try {
    if (native()) {
      const res = await withTimeout(
        CapacitorHttp.request({
          url,
          method: "GET",
          headers: { "User-Agent": UA },
          responseType: "blob",
          connectTimeout: timeout,
          readTimeout: timeout,
        }),
        timeout + 2000
      );
      if (res.status >= 400 || !res.data) return null;
      const type = (res.headers && (res.headers["Content-Type"] || res.headers["content-type"])) || "image/jpeg";
      if (!/^image\//.test(type)) return null;
      return `data:${type.split(";")[0]};base64,${res.data}`;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch (_) {
    return null;
  }
}
