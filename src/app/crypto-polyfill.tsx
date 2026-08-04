'use client';

export default function CryptoPolyfill() {
  if (typeof globalThis.crypto === 'undefined') {
    (globalThis as any).crypto = {};
  }
  if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
    (globalThis as any).crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c: string) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }
  return null;
}
