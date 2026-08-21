/* Pre-paint theme application. Keep in sync with src/lib/theme.ts.

   Must stay an EXTERNAL, SAME-ORIGIN file: the CSP is `script-src 'self'`
   (no 'unsafe-inline'), so an inline <script> would be blocked — but this is
   allowed, which is what makes a flash-free explicit Dark choice possible.

   Loaded from <head> WITHOUT defer so it runs before first paint.
   nginx must serve it no-cache: it is unhashed, and the `expires 1y; immutable`
   regex rule would otherwise freeze it in browsers for a year. */
(function () {
  try {
    var mode = localStorage.getItem('eclaims_theme') || 'auto'
    var dark =
      mode === 'dark' ||
      (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch (e) {
    /* storage disabled -> stay light */
  }
})()
