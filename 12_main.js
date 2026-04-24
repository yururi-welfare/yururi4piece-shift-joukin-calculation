/**
 * 放デイシフト - エントリポイント
 * 2カラム構造(サイドバー+メイン)・タブ切替・kintoneイベント登録
 * 読み込み順: 12 (最後)
 *
 * ★ kintone アプリ設定 > JavaScript/CSS でカスタマイズ（PC用）に必要な読み込み順 ★
 *   1. https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.js
 *   2. https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/locales/ja.global.min.js
 *   3. https://cdn.jsdelivr.net/npm/japanese-holidays@1.0.10/lib/japanese-holidays.min.js
 *   4. 01_config.js
 *   5. 02_utils.js
 *   6. 03_api.js
 *   7. 04_render.js
 *   8. 05_editor.js
 *   9. 06_calendar.js
 *  10. 07_shift_dialog.js
 *  11. 08_sidebar.js
 *  12. 09_mini_calendar.js
 *  13. 10_legend.js
 *  14. 11_monthly_hours.js
 *  15. 12_main.js
 *  16. 13_simulation.js
 *   CSS: 01_customize.css
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, Render, Editor, Calendar, Sidebar, MiniCalendar, Legend,
          MonthlyHours, State, Utils, log, err } = App;

  // ── ルート要素（なければ自動生成）
  function ensureRoot() {
    const existing = document.getElementById(Config.ROOT_ID);
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = Config.ROOT_ID;

    const listView =
      document.querySelector('.gaia-argoui-app-index-listview') ||
      document.querySelector('.recordlist-gaia') ||
      document.querySelector('.gaia-argoui-list');

    if (listView && listView.parentNode) {
      listView.parentNode.insertBefore(root, listView);
      log('標準一覧の直前にルート要素を挿入', listView);
    } else {
      const contents = document.querySelector('.contents-gaia') || document.body;
      contents.insertBefore(root, contents.firstChild);
      log('contents-gaia の先頭にルート要素を挿入', contents);
    }
    return root;
  }

  // ── シェル（サイドバー+メイン2カラム）
  function buildShell() {
    return `
      <div class="shift-layout">
        ${Sidebar.buildHtml()}
        <div class="shift-main">
          ${Sidebar.buildToggleHtml()}
          <div class="shift-tabs" role="tablist">
            <button class="shift-tab active" data-tab="checklist">常勤チェック表</button>
            <button class="shift-tab" data-tab="calendar">カレンダー</button>
            <button class="shift-tab" data-tab="simulation">シミュレーション</button>
          </div>
          <div class="shift-panel active" data-panel="checklist" id="panel-checklist"></div>
          <div class="shift-panel" data-panel="calendar" id="panel-calendar"></div>
          <div class="shift-panel" data-panel="simulation" id="panel-simulation"></div>
        </div>
      </div>`;
  }

  // ── 常勤チェック表パネルの描画
  async function renderChecklistPanel(root) {
    const panel = root.querySelector('#panel-checklist');
    log('常勤チェック表 描画開始', { week: Utils.fmtDate(State.currentWeekStart) });
    panel.innerHTML =
      Render.buildHeader(State.currentWeekStart) +
      Render.buildTable(State.currentWeekStart, {});
    bindChecklistNav(panel, root);
    Editor.bindPatternSelects(panel);
    Editor.bindStaffSelects(panel);

    // 日付マスタ(営業パターン) と 配置別シフトマップ を並行取得
    const endDate = new Date(State.currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);

    const [dayMap, placementMap] = await Promise.all([
      Api.fetchDayMasters(State.currentWeekStart),
      Api.fetchShiftsGroupedByPlacement(State.currentWeekStart, endDate, Config.SIMULATION_APP_ID),
    ]);
    State.currentDayMap = dayMap;
    State.currentShiftMaps = placementMap;

    Render.applyDayMapToCells(panel, dayMap);
    Render.applyShiftsToStaffCells(panel, placementMap);
    log('常勤チェック表 描画完了');
  }

  function bindChecklistNav(panel, root) {
    const q = (sel) => panel.querySelector(sel);
    const syncAll = () => {
      if (Calendar && typeof Calendar.gotoDate === 'function') {
        Calendar.gotoDate(State.currentWeekStart);
      }
      if (MiniCalendar) {
        MiniCalendar.gotoDate(State.currentWeekStart);
        MiniCalendar.setActiveWeek(State.currentWeekStart);
      }
    };
    if (q('.btn-prev')) q('.btn-prev').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() - 7);
      renderChecklistPanel(root);
      syncAll();
    };
    if (q('.btn-next')) q('.btn-next').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() + 7);
      renderChecklistPanel(root);
      syncAll();
    };
    if (q('.btn-today')) q('.btn-today').onclick = () => {
      State.currentWeekStart = Utils.startOfWeek(new Date());
      renderChecklistPanel(root);
      syncAll();
    };
  }

  // ── カレンダーパネル準備
  function prepareCalendarPanel(root) {
    const panel = root.querySelector('#panel-calendar');
    panel.innerHTML = Calendar.buildPanelHtml();
    Calendar.bindToolbar(panel);
  }

  // ── シミュレーションパネル準備（HTMLだけ先に差し込み、FC初期化はタブ初回切替時）
  function prepareSimulationPanel(root) {
    const Sim = App.Simulation;
    if (!Sim) return;
    const panel = root.querySelector('#panel-simulation');
    panel.innerHTML = Sim.buildPanelHtml();
    Sim.bindToolbar(panel);
  }

  // ── タブ切替
  function bindTabs(root) {
    const tabs = root.querySelectorAll('.shift-tab');
    const panels = root.querySelectorAll('.shift-panel');
    tabs.forEach((tab) => {
      tab.onclick = async () => {
        const key = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
        log('タブ切替', key);
        if (key === 'calendar') {
          const panel = root.querySelector('#panel-calendar');
          const wasInited = Calendar.isInitialized && Calendar.isInitialized();
          await Calendar.initIfNeeded(panel, State.currentWeekStart);
          Calendar.gotoDate(State.currentWeekStart);
          Calendar.onShow();
          if (wasInited) Calendar.refreshEvents();
        } else if (key === 'simulation') {
          const Sim = App.Simulation;
          if (!Sim) { err('Simulation モジュール未ロード'); return; }
          const panel = root.querySelector('#panel-simulation');
          const wasInited = Sim.isInitialized && Sim.isInitialized();
          await Sim.initIfNeeded(panel, State.currentWeekStart);
          Sim.gotoDate(State.currentWeekStart);
          Sim.onShow();
          if (wasInited) Sim.refreshEvents();
        } else if (key === 'checklist') {
          renderChecklistPanel(root).catch((e) => err('再描画失敗', e));
        }
      };
    });
  }

  // ── カレンダー → チェック表 の同期フック
  function bindCalendarToChecklist(root) {
    Calendar.onDateChange = (currentStart) => {
      const newWeekStart = Utils.startOfWeek(currentStart);
      if (Utils.fmtDate(newWeekStart) === Utils.fmtDate(State.currentWeekStart)) return;
      log('カレンダー→チェック表 週同期', Utils.fmtDate(newWeekStart));
      State.currentWeekStart = newWeekStart;
      renderChecklistPanel(root).catch((e) => err('同期再描画失敗', e));
      if (MiniCalendar) {
        MiniCalendar.gotoDate(newWeekStart);
        MiniCalendar.setActiveWeek(newWeekStart);
      }
    };
  }

  // ── サイドバー初期化
  async function initSidebar(root) {
    const layoutEl = root.querySelector('.shift-layout');

    // 開閉状態の復元
    Sidebar.applyOpenState(layoutEl, Sidebar.loadOpenState());
    Sidebar.bindToggle(layoutEl, () => {
      // トグル後に各カレンダーのサイズを再計算
      if (Calendar && Calendar.onShow) Calendar.onShow();
    });

    const sidebarEl = root.querySelector('.shift-sidebar');
    if (!sidebarEl) return;

    // ミニカレンダー：日付クリック→チェック表週へ同期／月変更→月間時間再集計
    MiniCalendar.init(
      sidebarEl,
      (date) => {
        const newWeekStart = Utils.startOfWeek(date);
        State.currentWeekStart = newWeekStart;
        renderChecklistPanel(root).catch((e) => err('ミニ→チェック表失敗', e));
        if (Calendar && Calendar.isInitialized && Calendar.isInitialized()) {
          Calendar.gotoDate(newWeekStart);
        }
      },
      async (year, month) => {
        Legend.updateTitleWithMonth(month);
        await MonthlyHours.setMonth(year, month);
        Legend.refreshHoursText();
        if (App.Simulation && App.Simulation.updateImportLabel) App.Simulation.updateImportLabel();
      }
    );

    // 凡例：初期化（スタッフ取得 → 描画 → フィルタ適用）
    await Legend.init(sidebarEl);

    // 初期月の月間時間を集計して凡例に反映
    const now = MiniCalendar.getMonth() || { year: new Date().getFullYear(), month: new Date().getMonth() };
    Legend.updateTitleWithMonth(now.month);
    await MonthlyHours.setMonth(now.year, now.month);
    Legend.refreshHoursText();

    // 初期週ハイライト
    MiniCalendar.setActiveWeek(State.currentWeekStart);
  }

  // ── kintone 一覧画面イベント
  kintone.events.on('app.record.index.show', function (event) {
    log('app.record.index.show 発火', {
      viewId: event.viewId, viewName: event.viewName, viewType: event.viewType,
      設定VIEW_ID: Config.VIEW_ID,
    });

    if (Config.VIEW_ID !== null && String(event.viewId) !== String(Config.VIEW_ID)) {
      log(`viewId ${event.viewId} は対象外（期待: ${Config.VIEW_ID}）スキップ`);
      return event;
    }

    State.currentWeekStart = Utils.startOfWeek(new Date());
    const root = ensureRoot();
    root.innerHTML = buildShell();
    bindTabs(root);
    prepareCalendarPanel(root);
    prepareSimulationPanel(root);
    bindCalendarToChecklist(root);
    renderChecklistPanel(root).catch((e) => err('描画失敗', e));
    initSidebar(root).catch((e) => err('サイドバー初期化失敗', e));
    return event;
  });

  log('スクリプト読み込み完了');
})();
