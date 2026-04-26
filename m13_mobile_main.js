/**
 * 放デイシフト モバイル - エントリポイント
 * 読み込み順: 13（モバイル側の最後）
 *
 * ★ kintone モバイル設定 > JavaScript/CSSでカスタマイズ（モバイル用）の読込順 ★
 *   1. https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.js
 *   2. https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/locales/ja.global.min.js
 *   3. https://cdn.jsdelivr.net/npm/japanese-holidays@1.0.10/lib/japanese-holidays.min.js
 *   4. m01_config.js
 *   5. m02_utils.js
 *   6. m03_api.js
 *   7. m04_fc_helpers.js
 *   8. m05_monthly_hours.js
 *   9. m06_legend.js
 *  10. m07_mini_calendar.js
 *  11. m08_drawer.js
 *  12. m09_shift_dialog.js
 *  13. m10_checklist.js
 *  14. m11_calendar.js
 *  15. m12_simulation.js
 *  16. m13_mobile_main.js
 *   CSS: mobile.css
 *
 * この m13 は:
 *  - シェルHTMLの組立・挿入
 *  - タブ切替・日付ナビのバインド
 *  - onDateChanged() の中央ディスパッチ（全機能へ反映）
 *  - kintoneイベント登録（mobile.app.record.index.show）
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) {
    console.error('[放デイシフト モバイル] window.ShiftMobile が未初期化（m01_config が先に必要）');
    return;
  }
  const { Config, Utils, State, log, err } = App;

  // ── ルート要素 ─────────────────────────
  function ensureRoot() {
    const existing = document.getElementById(Config.ROOT_ID);
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = Config.ROOT_ID;
    root.className = 'm-shift-root';
    document.body.insertBefore(root, document.body.firstChild);
    return root;
  }

  // ── シェル ──────────────────────────────
  function buildShell() {
    return `
      <header class="m-header">
        <button class="m-hamburger" type="button" aria-label="メニュー">☰</button>
        <div class="m-title">放デイ　常勤換算シミュレーション</div>
        <button class="m-today" type="button">今日</button>
      </header>
      <div class="m-date-bar">
        <button class="m-date-prev" type="button">◀</button>
        <button class="m-date-label" type="button"></button>
        <button class="m-date-next" type="button">▶</button>
      </div>
      <nav class="m-tabs" role="tablist">
        <button class="m-tab is-active" data-tab="checklist">チェック表</button>
        <button class="m-tab" data-tab="calendar">現場シフト</button>
        <button class="m-tab" data-tab="simulation">シミュ</button>
      </nav>
      <main class="m-panels">
        <section class="m-panel is-active" data-panel="checklist"></section>
        <section class="m-panel" data-panel="calendar"></section>
        <section class="m-panel" data-panel="simulation"></section>
      </main>
      <div class="m-drawer-overlay"></div>
      <aside class="m-drawer">
        <div class="m-drawer-header">
          <span>表示設定</span>
          <button class="m-drawer-close" type="button">×</button>
        </div>
        <div class="m-drawer-section">
          <h3>カレンダー</h3>
          <div id="m-mini-cal"></div>
        </div>
        <div class="m-drawer-section">
          <h3 id="m-legend-title">表示項目</h3>
          <div id="m-legend"></div>
        </div>
      </aside>`;
  }

  // ── 日付ナビ（週単位） ─────────────────
  function updateDateLabel() {
    const el = document.querySelector('.m-date-label');
    if (!el) return;
    const ws = Utils.startOfWeek(State.currentDate);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = `${ws.getFullYear()}/${pad(ws.getMonth() + 1)}/${pad(ws.getDate())} 〜 ${pad(we.getMonth() + 1)}/${pad(we.getDate())}`;
  }

  function bindDateNav(root) {
    root.querySelector('.m-date-prev').onclick = () => {
      State.currentDate.setDate(State.currentDate.getDate() - 7);
      onDateChanged();
    };
    root.querySelector('.m-date-next').onclick = () => {
      State.currentDate.setDate(State.currentDate.getDate() + 7);
      onDateChanged();
    };
    root.querySelector('.m-today').onclick = () => {
      State.currentDate = new Date();
      State.currentDate.setHours(0, 0, 0, 0);
      onDateChanged();
    };
    // 日付ラベルをタップでドロワー（ミニカレンダー）を開く
    root.querySelector('.m-date-label').onclick = () => {
      if (App.Drawer) App.Drawer.open();
    };
  }

  // ── タブ切替 ───────────────────────────
  function bindTabs(root) {
    root.querySelectorAll('.m-tab').forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.dataset.tab;
        root.querySelectorAll('.m-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
        root.querySelectorAll('.m-panel').forEach((p) =>
          p.classList.toggle('is-active', p.dataset.panel === key));
        State.currentTab = key;

        if (key === 'checklist') {
          if (App.Checklist) App.Checklist.render().catch((e) => err('チェック表描画失敗', e));
        } else if (key === 'calendar') {
          if (App.Calendar) {
            await App.Calendar.initIfNeeded();
            App.Calendar.gotoDate(State.currentDate);
            App.Calendar.updateSize();
            App.Calendar.refresh();
          }
        } else if (key === 'simulation') {
          if (App.Simulation) {
            await App.Simulation.initIfNeeded();
            App.Simulation.gotoDate(State.currentDate);
            App.Simulation.updateSize();
            App.Simulation.refresh();
          }
        }
      };
    });
  }

  // ── 日付変更の中央ディスパッチ ─────────
  function onDateChanged() {
    updateDateLabel();
    if (App.MiniCalendar) {
      App.MiniCalendar.gotoDate(State.currentDate);
      App.MiniCalendar.highlightWeek();
    }
    if (State.currentTab === 'checklist') {
      if (App.Checklist) App.Checklist.render().catch((e) => err('日付変更再描画失敗', e));
    } else if (State.currentTab === 'calendar') {
      if (App.Calendar) App.Calendar.gotoDate(State.currentDate);
    } else if (State.currentTab === 'simulation') {
      if (App.Simulation) App.Simulation.gotoDate(State.currentDate);
    }
  }

  // 他モジュールから参照できるよう公開
  App.Main = { onDateChanged, updateDateLabel };

  // ── kintone モバイル一覧画面イベント ──
  kintone.events.on('mobile.app.record.index.show', function (event) {
    log('mobile.app.record.index.show 発火', {
      viewId: event.viewId, viewName: event.viewName,
      設定VIEW_ID: Config.VIEW_ID,
    });

    if (Config.VIEW_ID !== null && String(event.viewId) !== String(Config.VIEW_ID)) {
      log(`viewId ${event.viewId} は対象外（期待: ${Config.VIEW_ID}）スキップ`);
      return event;
    }

    // 初期日: 今日
    State.currentDate = new Date();
    State.currentDate.setHours(0, 0, 0, 0);

    // シェル組立
    const root = ensureRoot();
    root.innerHTML = buildShell();
    bindTabs(root);
    bindDateNav(root);
    if (App.Drawer) App.Drawer.bind(root);
    updateDateLabel();

    // 初期描画:
    //  1) チェック表タブ（初期アクティブ）
    //  2) ドロワー内ミニカレンダー
    //  3) 凡例（スタッフ取得→描画→フィルタ適用）
    //  4) 月間時間集計→凡例数字反映
    if (App.Checklist) App.Checklist.render().catch((e) => err('初期チェック表失敗', e));
    if (App.MiniCalendar) App.MiniCalendar.init();

    (async () => {
      if (App.Legend)       await App.Legend.init();
      if (App.Legend)       App.Legend.updateTitleWithMonth(State.currentDate.getMonth());
      if (App.MonthlyHours) await App.MonthlyHours.setMonth(
        State.currentDate.getFullYear(),
        State.currentDate.getMonth()
      );
      if (App.Legend)       App.Legend.refreshHoursText();
    })().catch((e) => err('サイドバー初期化失敗', e));

    return event;
  });

  log('モバイルスクリプト読み込み完了');
})();
