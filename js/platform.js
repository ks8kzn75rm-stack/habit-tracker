/** Platform detection used for install hints. */

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return navigator.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}
