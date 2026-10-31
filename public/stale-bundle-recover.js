/*
 * Web only. Loaded from src/app/+html.tsx before the app bundle, as a file (not inline) so the page's
 * script policy stays as it is. After a web update the old hashed bundles are gone and the host answers
 * their URLs with the app page, so the script fails and the screen hangs. When that happens this reloads
 * the page once to pick up the new version. Native builds never run it. Tests run these exact bytes
 * (src/lib/stale-bundle-recover.test.ts).
 */
;(function () {
  var PREFIX = '/_expo/static/'
  var KEY = 'turbopanel.staleReload'
  var WINDOW_MS = 60000
  var REJECTION =
    /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
  var PARSE_ERROR = /Unexpected token '?<|Unexpected end of input/

  function isBundleUrl(url, origin) {
    try {
      var u = new URL(url, origin)
      return u.origin === origin && u.pathname.indexOf(PREFIX) === 0
    } catch (e) {
      return false
    }
  }

  // A <script> or <link> element for a built file failed to load, or a built file threw a parse error
  // (the host answered with the app page and the browser tried to run it as code).
  function isStaleBundleEvent(ev, origin) {
    var t = ev && ev.target
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      return isBundleUrl(t.src || t.href, origin) && ev.type === 'error'
    }
    if (ev && ev.filename && isBundleUrl(ev.filename, origin)) {
      // A JSON parse error from an API answer is not a stale bundle.
      if (/JSON/i.test(String(ev.message || ''))) return false
      var err = ev.error
      return (!!err && err.name === 'SyntaxError') || PARSE_ERROR.test(String(ev.message || ''))
    }
    return false
  }

  function isStaleBundleRejection(reason) {
    var text = reason && (reason.name || '') + ' ' + (reason.message || reason)
    return REJECTION.test(String(text || ''))
  }

  // One reload per tab per minute. stored is the last marker (ms) or null.
  function mayReload(stored, now) {
    var last = Number(stored)
    if (!stored || !isFinite(last)) return true
    return now - last > WINDOW_MS || now < last
  }

  function install(win) {
    var memory = false
    function readMarker() {
      try {
        var v = win.sessionStorage.getItem(KEY)
        if (v) return v
      } catch (e) {
        /* blocked storage: fall through to window.name */
      }
      var m = /(?:^|;)tpStaleReload=(\d+)/.exec(win.name || '')
      return m ? m[1] : null
    }
    // Returns true only when the marker really persisted, so a blocked store can never cause a loop.
    function writeMarker(now) {
      var value = String(now)
      try {
        win.sessionStorage.setItem(KEY, value)
        if (win.sessionStorage.getItem(KEY) === value) return true
      } catch (e) {
        /* fall through */
      }
      try {
        win.name =
          (win.name || '').replace(/(?:^|;)tpStaleReload=\d+/, '') + ';tpStaleReload=' + value
        return /(?:^|;)tpStaleReload=(\d+)/.test(win.name)
      } catch (e) {
        return false
      }
    }
    function recover(why) {
      if (memory) return
      memory = true
      var now = Date.now()
      if (!mayReload(readMarker(), now) || !writeMarker(now)) {
        if (win.console)
          win.console.warn('A script failed to load (' + why + ') and a reload was already tried.')
        return
      }
      win.location.reload()
    }
    win.addEventListener(
      'error',
      function (ev) {
        if (isStaleBundleEvent(ev, win.location.origin)) recover('stale bundle')
      },
      true
    )
    win.addEventListener('unhandledrejection', function (ev) {
      if (isStaleBundleRejection(ev && ev.reason)) recover('chunk load')
    })
  }

  var api = {
    isBundleUrl: isBundleUrl,
    isStaleBundleEvent: isStaleBundleEvent,
    isStaleBundleRejection: isStaleBundleRejection,
    mayReload: mayReload,
    install: install,
  }
  if (typeof module === 'object' && module && module.exports) module.exports = api
  else if (typeof window !== 'undefined') install(window)
})()
