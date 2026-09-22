export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pi-muxr web</title>
  <link rel="stylesheet" href="/vendor/xterm.css" />
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1218; color: #eef2ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    header { align-items: center; background: #171b24; border-bottom: 1px solid #2d3342; display: flex; gap: 1rem; justify-content: space-between; padding: 0.8rem 1rem; }
    h1 { font-size: 1.05rem; margin: 0; }
    main { display: grid; grid-template-rows: auto 1fr; gap: 0.75rem; height: calc(100vh - 58px); padding: 0.75rem; }
    button { background: #2563eb; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; padding: 0.55rem 0.8rem; }
    button.secondary { background: #374151; }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    .toolbar { align-items: center; display: flex; gap: 0.75rem; justify-content: space-between; }
    .status { color: #cbd5e1; font-size: 0.9rem; }
    .terminal-container { background: var(--terminal-background, #000); border: 1px solid #2d3342; border-radius: 10px; min-height: 0; overflow: hidden; padding: 0.4rem; }
    .terminal-container .xterm-viewport { scrollbar-width: none; }
    .terminal-container .xterm-viewport::-webkit-scrollbar { display: none; }
    .toasts { bottom: 1rem; display: grid; gap: 0.75rem; max-width: min(420px, calc(100vw - 2rem)); position: fixed; right: 1rem; z-index: 10; }
    .toast { background: #1f2937; border: 1px solid #475569; border-left: 4px solid #f59e0b; border-radius: 10px; box-shadow: 0 10px 35px #0008; padding: 0.8rem; }
    .toast strong { display: block; margin-bottom: 0.25rem; }
    .toast small { color: #cbd5e1; display: block; margin-top: 0.35rem; }
    .error { color: #fecaca; }
  </style>
</head>
<body>
  <header>
    <h1>pi-muxr web</h1>
    <div class="status" id="session-label"></div>
  </header>
  <main>
    <div class="toolbar">
      <div><span id="status">Connecting…</span> <span class="error" id="error"></span></div>
      <button id="notifications" class="secondary">Enable notifications</button>
    </div>
    <div id="terminal" class="terminal-container"></div>
  </main>
  <div id="toasts" class="toasts"></div>
  <script src="/vendor/xterm.js"></script>
  <script src="/vendor/addon-fit.js"></script>
  <script>
    const terminalElement = document.getElementById('terminal');
    const statusElement = document.getElementById('status');
    const errorElement = document.getElementById('error');
    const toastsElement = document.getElementById('toasts');
    const notificationsButton = document.getElementById('notifications');
    const params = new URLSearchParams(location.search);
    const session = params.get('session') || 'pi-muxr-web';
    document.getElementById('session-label').textContent = 'tmux: ' + session;

    let terminal;
    let fitAddon;
    let socket;
    let animationFrame;
    let lastSize = { cols: 0, rows: 0 };

    initializeTerminal();
    notificationsButton.addEventListener('click', requestNotifications);
    updateNotificationButton();

    async function initializeTerminal() {
      const terminalTheme = await loadTerminalTheme();
      if (terminalTheme?.background) terminalElement.style.setProperty('--terminal-background', terminalTheme.background);

      terminal = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: 'JetBrainsMono Nerd Font, JetBrains Mono, Menlo, Monaco, Consolas, monospace', fontSize: 14, theme: terminalTheme });
      fitAddon = new FitAddon.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalElement);

      socket = new WebSocket(buildTerminalUrl(session));
      socket.addEventListener('open', () => { statusElement.textContent = 'Connected'; fitAndSync(); terminal.focus(); });
      socket.addEventListener('message', (event) => handleServerMessage(JSON.parse(String(event.data))));
      socket.addEventListener('close', () => { statusElement.textContent = 'Disconnected — refresh to reconnect.'; });
      socket.addEventListener('error', () => { errorElement.textContent = ' Terminal websocket failed.'; });
      terminal.onData((data) => send({ type: 'input', data }));

      const resizeObserver = new ResizeObserver(fitAndSync);
      resizeObserver.observe(terminalElement);
      window.addEventListener('beforeunload', () => socket.close());
      fitAndSync();
    }

    function handleServerMessage(message) {
      if (message.type === 'output') terminal.write(message.data);
      if (message.type === 'error') { errorElement.textContent = ' ' + message.message; terminal.writeln('\\r\\n' + message.message); }
      if (message.type === 'exit') statusElement.textContent = 'Disconnected' + (message.code === undefined ? '' : ' (' + message.code + ')');
      if (message.type === 'notification') showAttention(message);
    }

    function showAttention(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<strong></strong><div></div><small></small>';
      toast.querySelector('strong').textContent = message.title;
      toast.querySelector('div').textContent = message.body;
      toast.querySelector('small').textContent = formatLocation(message.row);
      toastsElement.prepend(toast);
      setTimeout(() => toast.remove(), 12000);
      if (Notification.permission === 'granted') new Notification(message.title, { body: message.body });
    }

    function fitAndSync() {
      if (!terminal || !fitAddon || !socket || animationFrame !== undefined) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined;
        fitAddon.fit();
        if (!terminal.cols || !terminal.rows || socket.readyState !== WebSocket.OPEN) return;
        if (terminal.cols === lastSize.cols && terminal.rows === lastSize.rows) return;
        lastSize = { cols: terminal.cols, rows: terminal.rows };
        send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
      });
    }

    function send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }

    async function loadTerminalTheme() {
      try {
        const response = await fetch('/api/terminal-theme');
        const data = await response.json();
        return data.theme || undefined;
      } catch {
        return undefined;
      }
    }

    function buildTerminalUrl(sessionName) {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return protocol + '//' + location.host + '/ws/terminal?session=' + encodeURIComponent(sessionName);
    }

    async function requestNotifications() {
      if (!('Notification' in window)) return;
      await Notification.requestPermission();
      updateNotificationButton();
    }

    function updateNotificationButton() {
      if (!('Notification' in window)) { notificationsButton.disabled = true; notificationsButton.textContent = 'Notifications unavailable'; return; }
      if (Notification.permission === 'granted') { notificationsButton.disabled = true; notificationsButton.textContent = 'Notifications enabled'; return; }
      if (Notification.permission === 'denied') { notificationsButton.disabled = true; notificationsButton.textContent = 'Notifications blocked'; }
    }

    function formatLocation(row) {
      return [row.tmuxSession || '?', row.tmuxWindowIndex || '?', row.paneId || '?'].join(':');
    }
  </script>
</body>
</html>`;
