// ==UserScript==
// @name         Newtpad Companion
// @namespace    https://newtpad.github.io/
// @version      1.0
// @description  Rocksolid local-first OS engine for Newtpad
// @match        https://newtpad.github.io/*
// @match        http://localhost:*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Inject dense, high-efficiency styles into the host slots
  GM_addStyle(`
    .np-textarea {
      width: 100%; height: 100%;
      background: transparent;
      border: none; outline: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.85rem; line-height: 1.6;
      padding: 1rem; resize: none;
    }
    .np-list { list-style: none; overflow-y: auto; flex: 1; }
    .np-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.65rem 0.9rem;
      border-bottom: 1px solid var(--border);
      text-decoration: none; color: var(--text);
      font-family: var(--font-mono); font-size: 0.8rem;
    }
    .np-item:hover { background: var(--surface-raised); }
    .np-prune {
      background: var(--amber-dim); color: var(--amber);
      padding: 2px 6px; border-radius: 2px; font-size: 0.65rem;
      cursor: pointer; border: none; margin-left: 8px;
    }
    .np-form { display: flex; border-top: 1px solid var(--border); background: var(--surface-raised); }
    .np-form input {
      flex: 1; background: transparent; border: none;
      padding: 0.6rem 0.8rem; color: var(--text);
      font-family: var(--font-mono); font-size: 0.8rem; outline: none;
    }
    .np-form button {
      background: transparent; border: none; border-left: 1px solid var(--border);
      color: var(--cyan); padding: 0 0.9rem; cursor: pointer;
      font-family: var(--font-mono); font-size: 0.8rem;
    }
    .np-feed-item {
      padding: 0.65rem 0.9rem; border-bottom: 1px solid var(--border);
    }
    .np-feed-link {
      color: var(--text); text-decoration: none; font-size: 0.8rem;
      display: block; line-height: 1.4;
    }
    .np-feed-link:hover { color: var(--cyan); }
    .np-feed-meta {
      font-family: var(--font-mono); font-size: 0.65rem;
      color: var(--text-dim); margin-top: 3px;
    }
  `);

  // Default Store Schema
  const defaultState = {
    notes: '',
    links: [
      { id: '1', title: 'github', url: 'https://github.com', hits: 12, lastUsed: Date.now() },
      { id: '2', title: 'news.yc', url: 'https://news.ycombinator.com', hits: 8, lastUsed: Date.now() },
      { id: '3', title: 'mdn.docs', url: 'https://developer.mozilla.org', hits: 0, lastUsed: Date.now() - (15 * 86400000) }
    ]
  };

  // State Controller
  let state = JSON.parse(GM_getValue('newtpad_state', JSON.stringify(defaultState)));
  function saveState() {
    GM_setValue('newtpad_state', JSON.stringify(state));
  }

  // 1. Mount Scratchpad
  function mountScratchpad() {
    const slot = document.getElementById('slot-scratchpad');
    const meta = document.getElementById('scratchpad-meta');
    slot.innerHTML = `<textarea class="np-textarea" id="np-notes" placeholder="// Fast scratchpad... Auto-persisted via GM_setValue"></textarea>`;
    
    const textarea = document.getElementById('np-notes');
    textarea.value = state.notes || '';

    function updateMeta() {
      const chars = textarea.value.length;
      const lines = textarea.value ? textarea.value.split('\n').length : 0;
      meta.textContent = `${lines}L · ${chars}C`;
    }
    updateMeta();

    textarea.addEventListener('input', (e) => {
      state.notes = e.target.value;
      saveState();
      updateMeta();
    });
  }

  // 2. Mount Adaptive Links with Decay Engine
  function mountLinks() {
    const slot = document.getElementById('slot-links');
    const meta = document.getElementById('links-meta');

    slot.innerHTML = `
      <ul class="np-list" id="np-link-list"></ul>
      <form class="np-form" id="np-link-form">
        <input type="text" id="np-link-name" placeholder="label" required style="max-width: 110px;" />
        <input type="url" id="np-link-url" placeholder="https://..." required />
        <button type="submit">+</button>
      </form>
    `;

    function render() {
      const list = document.getElementById('np-link-list');
      list.innerHTML = '';
      
      // Auto-rank: most hits top
      state.links.sort((a, b) => b.hits - a.hits);
      meta.textContent = `${state.links.length} ITEMS`;

      const now = Date.now();
      state.links.forEach((item, index) => {
        const daysOld = (now - item.lastUsed) / 86400000;
        const isStale = daysOld > 10 && item.hits < 2;

        const li = document.createElement('li');
        li.innerHTML = `
          <a class="np-item" href="${item.url}" data-id="${item.id}">
            <span>${item.title}</span>
            <div style="display:flex; align-items:center;">
              <span style="color:var(--text-dim)">${item.hits}h</span>
              ${isStale ? `<button class="np-prune" data-prune="${index}" title="Unused for ${Math.floor(daysOld)}d">PRUNE</button>` : ''}
            </div>
          </a>
        `;
        list.appendChild(li);
      });
    }

    // Usage-tracking & Prune events
    slot.addEventListener('click', (e) => {
      const pruneIdx = e.target.getAttribute('data-prune');
      if (pruneIdx !== null) {
        e.preventDefault();
        e.stopPropagation();
        state.links.splice(pruneIdx, 1);
        saveState();
        render();
        return;
      }

      const itemEl = e.target.closest('.np-item');
      if (itemEl) {
        const id = itemEl.getAttribute('data-id');
        const target = state.links.find(l => l.id === id);
        if (target) {
          target.hits += 1;
          target.lastUsed = Date.now();
          saveState();
        }
      }
    });

    document.getElementById('np-link-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('np-link-name').value.trim();
      const url = document.getElementById('np-link-url').value.trim();
      state.links.push({ id: Date.now().toString(), title, url, hits: 1, lastUsed: Date.now() });
      saveState();
      render();
      e.target.reset();
    });

    render();
  }

  // 3. Mount CORS-Free Feed (GM_xmlhttpRequest)
  function mountFeed() {
    const slot = document.getElementById('slot-feed');
    const meta = document.getElementById('feed-meta');
    slot.innerHTML = `<ul class="np-list" id="np-feed-list"><li class="np-feed-item" style="color:var(--text-dim); font-family:var(--font-mono); font-size:0.75rem;">Connecting stream...</li></ul>`;

    // Direct CORS-free fetch via Violentmonkey engine
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://api.hnpwa.com/v0/news/1.json',
      timeout: 8000,
      onload: (res) => {
        try {
          const items = JSON.parse(res.responseText).slice(0, 8);
          meta.textContent = 'HACKER NEWS';
          document.getElementById('np-feed-list').innerHTML = items.map(post => `
            <li class="np-feed-item">
              <a class="np-feed-link" href="${post.url}" target="_blank" rel="noopener">${post.title}</a>
              <div class="np-feed-meta">${post.points || 0} PTS · ${post.comments_count} COMMENTS · BY ${post.user}</div>
            </li>
          `).join('');
        } catch (_) {}
      },
      onerror: () => {
        slot.innerHTML = `<div class="unhydrated">Feed stream offline.</div>`;
      }
    });
  }

  // 4. Command Bar Router (Math engine, quick searches, direct jump)
  function mountCommandBar() {
    const input = document.getElementById('cmd-input');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const raw = input.value.trim();
      if (!raw) return;

      // 1. Math calculation (e.g. "45 * 12" or "sqrt(144)")
      if (/^[\d\s\+\-\*\/\(\)\.\^]|sqrt|sin|cos/.test(raw) && !raw.startsWith('http')) {
        try {
          const sanitized = raw.replace(/sqrt/g, 'Math.sqrt');
          const res = Function(`'use strict'; return (${sanitized})`)();
          input.value = `= ${res}`;
          return;
        } catch (_) {}
      }

      // 2. Direct URL Jump
      if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('.com') || raw.includes('.org') || raw.includes('.io')) {
        window.location.href = raw.startsWith('http') ? raw : `https://${raw}`;
        return;
      }

      // 3. Fallback: Default DuckDuckGo Search
      window.location.href = `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;
    });
  }

  // 5. Mount Dock / System Status
  function mountDock() {
    document.getElementById('dock-left').textContent = `DB: GM_STORAGE_OK · ${state.links.length} ANCHORS LOADED`;
  }

  // Initialize and attach to the Host
  function boot() {
    if (window.Newtpad) {
      window.Newtpad.mount();
      mountScratchpad();
      mountLinks();
      mountFeed();
      mountCommandBar();
      mountDock();
    }
  }

  boot();
})();