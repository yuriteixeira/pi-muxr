export const LANDING_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pi-muxr dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1218; color: #eef2ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    header { align-items: center; background: #171b24; border-bottom: 1px solid #2d3342; display: flex; gap: 1rem; justify-content: space-between; padding: 1rem clamp(1rem, 4vw, 3rem); }
    h1 { font-size: 1.1rem; margin: 0; }
    main { margin: 0 auto; max-width: 1600px; padding: clamp(1rem, 3vw, 2rem); }
    .meta { color: #94a3b8; font-size: 0.9rem; }
    .table-shell { border: 1px solid #2d3342; border-radius: 12px; overflow: auto; }
    table { border-collapse: collapse; min-width: 920px; table-layout: fixed; width: 100%; }
    th { background: #171b24; color: #94a3b8; font-size: 0.75rem; letter-spacing: 0.06em; padding: 0.75rem; text-align: left; text-transform: uppercase; }
    td { border-top: 1px solid #252b38; overflow: hidden; padding: 0.8rem 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
    tbody tr[data-href] { cursor: pointer; }
    tbody tr[data-href]:hover, tbody tr[data-href]:focus { background: #1d2431; outline: none; }
    tbody tr:not([data-href]) { opacity: 0.65; }
    .state { font-weight: 700; }
    .state-ASK { color: #facc15; }
    .state-ERROR { color: #f87171; }
    .state-DONE { color: #4ade80; }
    .state-RUN { align-items: center; color: #60a5fa; display: inline-flex; gap: 0.45rem; }
    .state-RUN::before { animation: spin 0.8s linear infinite; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; content: ''; height: 0.8rem; width: 0.8rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .state-QUEUED { color: #c084fc; }
    .state-IDLE, .state-STALE { color: #94a3b8; }
    .unread { color: #fbbf24; display: inline-block; width: 1rem; }
    .session { color: #67e8f9; }
    .empty, .error { border: 1px solid #2d3342; border-radius: 12px; color: #94a3b8; padding: 2rem; text-align: center; }
    .error { color: #fecaca; }
    .hidden { display: none; }
    .toasts { bottom: 1rem; display: grid; gap: 0.75rem; max-width: min(420px, calc(100vw - 2rem)); position: fixed; right: 1rem; z-index: 10; }
    .toast { background: #1f2937; border: 1px solid #475569; border-left: 4px solid #94a3b8; border-radius: 10px; box-shadow: 0 10px 35px #0008; color: #eef2ff; cursor: pointer; padding: 0.8rem; }
    .toast:hover, .toast:focus { background: #252f3f; outline: 2px solid #60a5fa; outline-offset: 2px; }
    .toast strong { display: block; margin-bottom: 0.25rem; }
    .toast-ASK { border-left-color: #facc15; }
    .toast-ERROR { border-left-color: #f87171; }
    .toast-DONE { border-left-color: #4ade80; }
    .toast-RUN { border-left-color: #60a5fa; }
    .toast-QUEUED { border-left-color: #c084fc; }
    .toast-IDLE, .toast-STALE { border-left-color: #94a3b8; }
    .state-column { width: 6rem; }
    .unread-column { text-align: center; width: 3rem; }
    .session-column { width: 11rem; }
    .time-column { width: 8rem; }
    .path-column { width: 18rem; }
    td.root-path { direction: rtl; text-align: left; }
    td.root-path span { direction: ltr; unicode-bidi: plaintext; }
    @media (max-width: 700px) {
      header { align-items: flex-start; flex-direction: column; }
      main { padding: 0.75rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .state-RUN::before { animation: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>pi-muxr dashboard</h1>
    <div class="meta" id="status">Loading sessions…</div>
  </header>
  <main>
    <div class="table-shell" id="table-shell">
      <table>
        <thead>
          <tr>
            <th class="state-column">Status</th>
            <th class="unread-column"></th>
            <th class="session-column">Tmux session</th>
            <th>Last prompt</th>
            <th>Last event</th>
            <th class="time-column">Updated</th>
            <th class="path-column">Root path</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="empty hidden" id="empty">No active Pi sessions.</div>
    <div class="error hidden" id="error">The dashboard could not be loaded.</div>
  </main>
  <div class="toasts" id="toasts" aria-live="polite"></div>
  <script>
    const rowsElement = document.getElementById('rows');
    const tableShell = document.getElementById('table-shell');
    const emptyElement = document.getElementById('empty');
    const errorElement = document.getElementById('error');
    const statusElement = document.getElementById('status');
    const toastsElement = document.getElementById('toasts');
    const seenEvents = new Set();
    let notificationsSeeded = false;

    refreshDashboard();
    setInterval(refreshDashboard, 1000);

    async function refreshDashboard() {
      try {
        const response = await fetch('/api/dashboard', { cache: 'no-store' });
        if (!response.ok) throw new Error('Dashboard request failed');
        const snapshot = await response.json();
        const rows = snapshot.rows || [];
        showNewNotifications(rows);
        renderRows(rows, snapshot.generatedAt || Date.now());
        statusElement.textContent = rows.length + ' active session' + (rows.length === 1 ? '' : 's');
        errorElement.classList.add('hidden');
      } catch {
        errorElement.classList.remove('hidden');
        statusElement.textContent = 'Disconnected';
      }
    }

    function renderRows(rows, now) {
      rowsElement.replaceChildren(...rows.map((row) => renderRow(row, now)));
      tableShell.classList.toggle('hidden', rows.length === 0);
      emptyElement.classList.toggle('hidden', rows.length !== 0);
    }

    function renderRow(row, now) {
      const element = document.createElement('tr');
      if (row.terminalPath) {
        element.dataset.href = row.terminalPath;
        element.tabIndex = 0;
        element.setAttribute('role', 'link');
        element.addEventListener('click', () => openTerminal(row));
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openTerminal(row);
          }
        });
      }

      appendCell(element, row.state, 'state state-' + row.state);
      appendUnreadCell(element, row.unread);
      appendCell(element, row.tmuxSession || '—', 'session');
      appendCell(element, row.lastPrompt || '—');
      appendCell(element, row.summary || '—');
      appendCell(element, formatAge(now - row.lastEventAt));
      appendPathCell(element, row.cwd || '—');
      return element;
    }

    function appendCell(row, value, className) {
      const cell = document.createElement('td');
      const text = document.createElement('span');
      if (className) text.className = className;
      text.textContent = value;
      cell.append(text);
      cell.title = value;
      row.append(cell);
    }

    function appendPathCell(row, path) {
      const cell = document.createElement('td');
      cell.className = 'root-path';
      const text = document.createElement('span');
      text.textContent = path;
      cell.append(text);
      cell.title = path;
      row.append(cell);
    }

    function appendUnreadCell(row, unread) {
      const cell = document.createElement('td');
      cell.className = 'unread-column';
      if (unread) {
        const marker = document.createElement('span');
        marker.className = 'unread';
        marker.textContent = '●';
        marker.title = 'Unread';
        marker.setAttribute('aria-label', 'Unread');
        cell.append(marker);
      }
      row.append(cell);
    }

    function showNewNotifications(rows) {
      const actionableRows = rows.filter((row) => row.actionable && row.unread);
      if (!notificationsSeeded) {
        actionableRows.forEach((row) => seenEvents.add(eventKey(row)));
        notificationsSeeded = true;
        return;
      }

      actionableRows.forEach((row) => {
        const key = eventKey(row);
        if (seenEvents.has(key)) return;
        seenEvents.add(key);
        showToast(row);
      });
    }

    function showToast(row) {
      const toast = document.createElement('div');
      toast.className = 'toast toast-' + row.state;
      toast.tabIndex = row.terminalPath ? 0 : -1;
      toast.setAttribute('role', row.terminalPath ? 'link' : 'status');

      const title = document.createElement('strong');
      title.textContent = row.state + ' · ' + (row.tmuxSession || 'Unknown session');
      const message = document.createElement('div');
      message.textContent = row.summary || 'Session needs attention';
      toast.append(title, message);

      if (row.terminalPath) {
        toast.addEventListener('click', () => openTerminal(row));
        toast.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openTerminal(row);
          }
        });
      }

      toastsElement.prepend(toast);
      setTimeout(() => toast.remove(), 12000);
    }

    function eventKey(row) {
      return row.id + ':' + row.lastEventAt;
    }

    function formatAge(milliseconds) {
      const seconds = Math.max(0, Math.floor(milliseconds / 1000));
      if (seconds < 60) return seconds + 's ago';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      return Math.floor(hours / 24) + 'd ago';
    }

    async function openTerminal(row) {
      if (!row.terminalPath) return;
      try {
        await fetch('/api/dashboard/read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: row.id, lastEventAt: row.lastEventAt }),
        });
      } finally {
        location.assign(row.terminalPath);
      }
    }
  </script>
</body>
</html>`;
