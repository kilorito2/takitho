// Runs before first paint (loaded synchronously from <head>): sets data-theme from the saved choice or the system.
;(function () {
  try {
    var t = localStorage.getItem('takitho-theme')
    if (t !== 'light' && t !== 'dark')
      t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = t
    // The static first paint in index.html is the home hero: every other route skips it.
    document.documentElement.dataset.boot =
      location.pathname === '/' || location.pathname === '/menu' ? location.pathname : ''
  } catch {
    /* storage blocked: stay with the CSS fallback (prefers-color-scheme) */
  }
})()
