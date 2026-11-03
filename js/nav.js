/** Hash navigation that works under any sub-path (e.g. GitHub Pages). */
export function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash) return;
  if (replace) location.replace(hash);
  else location.hash = hash;
}
