/**
 * 放デイシフト - サイドバー（レイアウト・トグル）
 * ミニカレンダーと凡例を左カラムに配置。両タブで共通表示。
 * 読み込み順: 8
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, log } = App;

  const Sidebar = {
    // サイドバー骨格HTML。内部のセクションは MiniCalendar / Legend が後で流し込む
    buildHtml() {
      return `
        <aside class="shift-sidebar">
          <div class="sidebar-section" id="mini-calendar-section">
            <h3>カレンダー</h3>
            <div id="mini-calendar"></div>
          </div>
          <div class="sidebar-section" id="legend-section">
            <h3 id="legend-section-title">表示項目</h3>
            <div id="shift-legend"></div>
          </div>
        </aside>`;
    },

    // トグルボタン（メインエリア左上固定）
    buildToggleHtml() {
      return `<button class="sidebar-toggle" type="button" title="サイドバー切替"><span class="arrow">◀</span></button>`;
    },

    // 開閉状態の復元
    loadOpenState() {
      try {
        const v = localStorage.getItem(Config.SIDEBAR.STORAGE_OPEN_KEY);
        return v === null ? true : v === '1';
      } catch (_) { return true; }
    },

    saveOpenState(open) {
      try { localStorage.setItem(Config.SIDEBAR.STORAGE_OPEN_KEY, open ? '1' : '0'); } catch (_) {}
    },

    // レイアウトに開閉クラスを適用
    applyOpenState(layoutEl, open) {
      layoutEl.classList.toggle('sidebar-collapsed', !open);
      const btn = layoutEl.querySelector('.sidebar-toggle .arrow');
      if (btn) btn.textContent = open ? '◀' : '▶';
    },

    // トグルをバインド
    bindToggle(layoutEl, onChange) {
      const btn = layoutEl.querySelector('.sidebar-toggle');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const collapsed = layoutEl.classList.contains('sidebar-collapsed');
        const newOpen = collapsed; // collapsed → open
        Sidebar.applyOpenState(layoutEl, newOpen);
        Sidebar.saveOpenState(newOpen);
        log('サイドバートグル', { open: newOpen });
        if (typeof onChange === 'function') onChange(newOpen);
      });
    },
  };

  App.Sidebar = Sidebar;
})();
