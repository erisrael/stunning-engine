/*
 * Myseed customer support SDK (docs/SUPPORT-SDK.md).
 *
 *   <script src="https://<your workspace>/support-sdk.js"></script>
 *   <script>
 *     MyseedSupport.init({
 *       appKey: "pk_...",                       // Admin, Support setup, Apps and SDK
 *       user: { id: "123", name: "Abebe", email: "abebe@example.com", hash: "<from your server>" },
 *       position: "right",                       // or "left"
 *       color: "#1A73E8",                        // the launcher button (the panel uses the app's colour)
 *       label: "Help",                           // text beside the icon; "" for the icon only
 *       hideLauncher: false,                     // true: open it from your own button with MyseedSupport.open()
 *     });
 *   </script>
 *
 * MyseedSupport.open(), .close(), .toggle(), .identify(user) (after sign-in), .shutdown() (after sign-out).
 * The panel runs in a frame from the support server, with the microphone allowed for calls.
 */
(function () {
  if (window.MyseedSupport && window.MyseedSupport.__loaded) return;
  var script = document.currentScript;
  var defaultBase = script && script.src ? new URL(script.src).origin : window.location.origin;
  var state = { opts: null, frame: null, box: null, launcher: null, ready: false, open: false, user: null };

  function css(el, styles) {
    for (var k in styles) el.style[k] = styles[k];
    return el;
  }

  function send() {
    if (state.ready && state.frame && state.frame.contentWindow) {
      state.frame.contentWindow.postMessage({ type: "myseed-support:identify", user: state.user || {} }, state.base);
    }
  }

  function build() {
    var o = state.opts;
    var side = o.position === "left" ? "left" : "right";
    var box = css(document.createElement("div"), {
      position: "fixed",
      bottom: "88px",
      width: "min(380px, calc(100vw - 24px))",
      height: "min(600px, calc(100vh - 120px))",
      borderRadius: "14px",
      overflow: "hidden",
      boxShadow: "0 12px 40px rgba(0,0,0,.25)",
      zIndex: "2147483000",
      display: "none",
      background: "#fff",
    });
    box.style[side] = "16px";
    box.setAttribute("data-myseed-support", "panel");
    var frame = document.createElement("iframe");
    frame.title = "Support";
    frame.allow = "microphone; autoplay";
    frame.src = state.base + "/support-widget?embed=1&key=" + encodeURIComponent(o.appKey);
    css(frame, { width: "100%", height: "100%", border: "0" });
    box.appendChild(frame);
    document.body.appendChild(box);
    state.box = box;
    state.frame = frame;

    if (!o.hideLauncher) {
      var b = css(document.createElement("button"), {
        position: "fixed",
        bottom: "20px",
        height: "56px",
        minWidth: "56px",
        padding: o.label ? "0 20px" : "0",
        borderRadius: "28px",
        border: "0",
        background: o.color || "#1A73E8",
        color: "#fff",
        font: "600 15px system-ui, sans-serif",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        cursor: "pointer",
        zIndex: "2147483001",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      });
      b.style[side] = "16px";
      b.type = "button";
      b.setAttribute("aria-label", "Open support");
      b.setAttribute("data-myseed-support", "launcher");
      b.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' + (o.label ? "<span>" + String(o.label).replace(/</g, "&lt;") + "</span>" : "");
      b.addEventListener("click", function () {
        api.toggle();
      });
      document.body.appendChild(b);
      state.launcher = b;
    }
  }

  window.addEventListener("message", function (e) {
    if (!state.frame || e.source !== state.frame.contentWindow) return;
    if (e.data && e.data.type === "myseed-support:ready") {
      state.ready = true;
      send();
    }
  });

  var api = {
    __loaded: true,
    init: function (opts) {
      if (!opts || !opts.appKey) throw new Error("MyseedSupport.init needs appKey.");
      if (state.box) api.shutdown();
      state.opts = { label: "Help", position: "right", hideLauncher: false };
      for (var k in opts) state.opts[k] = opts[k];
      state.base = (opts.baseUrl || defaultBase).replace(/\/$/, "");
      state.user = opts.user || null;
      state.ready = false;
      if (document.body) build();
      else document.addEventListener("DOMContentLoaded", build);
      return api;
    },
    identify: function (user) {
      state.user = user || null;
      send();
    },
    open: function () {
      if (!state.box) return;
      state.box.style.display = "block";
      state.open = true;
    },
    close: function () {
      if (!state.box) return;
      state.box.style.display = "none";
      state.open = false;
    },
    toggle: function () {
      state.open ? api.close() : api.open();
    },
    shutdown: function () {
      if (state.box) state.box.remove();
      if (state.launcher) state.launcher.remove();
      state.box = state.launcher = state.frame = null;
      state.ready = false;
      state.open = false;
    },
  };
  window.MyseedSupport = api;
})();
