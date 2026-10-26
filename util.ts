import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const num = (v: any) => Number(v) || 0;
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const inr = (n: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num(n));
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5);
/** Indian financial year (1 Apr – 31 Mar) containing today. */
export function fyRange(): [string, string] {
  const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return [`${y}-04-01`, `${y + 1}-03-31`];
}
export const monthKey = (s: string) => s.slice(0, 7);
export function lastMonths(n: number) {
  const out: string[] = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`); }
  return out;
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}

/** Save/share a file: native share sheet on Android/iOS, normal download on Windows. */
export async function saveFile(name: string, blob: Blob) {
  if (Capacitor.isNativePlatform()) {
    const data: string = await new Promise((res, rej) => {
      const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob);
    });
    const w = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: name, url: w.uri });
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

// ---- optional password-protected backups (PBKDF2 -> AES-GCM) ----
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function key(pw: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(text: string, pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pw, salt), new TextEncoder().encode(text)));
  return JSON.stringify({ nsnEncrypted: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
export async function decryptText(obj: any, pw: string) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, await key(pw, unb64(obj.salt)), unb64(obj.data));
  return new TextDecoder().decode(pt);
}
export async function sha(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nsn:' + s));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}
