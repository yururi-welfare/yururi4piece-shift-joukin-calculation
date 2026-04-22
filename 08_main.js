/**
 * 放デイシフト - エントリポイント
 * ルート要素生成・タブ切替・kintoneイベント登録
 * 読み込み順: 8 (最後)
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
 *  11. 08_main.js
 *   CSS: 01_customize.css
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, Render, Editor, Calendar, State, Utils, log, err } = App;

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

  // ── タブ構造の外枠を描画
  function buildShell() {
    return `
      <div class="shift-tabs" role="tablist">
        <button class="shift-tab active" data-tab="checklist">常勤チェック表</button>
        <button class="shift-tab" data-tab="calendar">カレンダー</button>
      </div>
      <div class="shift-panel active" data-panel="checklist" id="panel-checklist"></div>
      <div class="shift-panel" data-panel="calendar" id="panel-calendar"></div>`;
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

    // 日付マスタ(営業パターン) と 資格別シフト を並行取得
    const endDate = new Date(State.currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const roleQual = Config.ROLE_QUALIFICATION || {};
    const roleEntries = Object.entries(roleQual); // [['児発管','児発管'], ...]

    const [dayMap, ...shiftMaps] = await Promise.all([
      Api.fetchDayMasters(State.currentWeekStart),
      ...roleEntries.map(([, qual]) =>
        Api.fetchShiftsByQualification(State.currentWeekStart, endDate, qual)),
    ]);
    State.currentDayMap = dayMap;
    State.currentShiftMaps = {};
    roleEntries.forEach(([role], i) => { State.currentShiftMaps[role] = shiftMaps[i]; });

    Render.applyDayMapToCells(panel, dayMap);
    Render.applyShiftsToStaffCells(panel, State.currentShiftMaps);
    log('常勤チェック表 描画完了');
  }

  function bindChecklistNav(panel, root) {
    const q = (sel) => panel.querySelector(sel);
    const syncCalendar = () => {
      // カレンダー初期化済みなら同じ週へ移動
      if (Calendar && typeof Calendar.gotoDate === 'function') {
        Calendar.gotoDate(State.currentWeekStart);
      }
    };
    if (q('.btn-prev')) q('.btn-prev').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() - 7);
      renderChecklistPanel(root);
      syncCalendar();
    };
    if (q('.btn-next')) q('.btn-next').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() + 7);
      renderChecklistPanel(root);
      syncCalendar();
    };
    if (q('.btn-today')) q('.btn-today').onclick = () => {
      State.currentWeekStart = Utils.startOfWeek(new Date());
      renderChecklistPanel(root);
      syncCalendar();
    };
  }

  // ── カレンダーパネル準備（タブHTMLのみ。FullCalendar自体は初回表示時に初期化）
  function prepareCalendarPanel(root) {
    const panel = root.querySelector('#panel-calendar');
    panel.innerHTML = Calendar.buildPanelHtml();
    Calendar.bindToolbar(panel);
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
          // 初回初期化時はチェック表の週開始日に合わせる
          await Calendar.initIfNeeded(panel, State.currentWeekStart);
          // 既に初期化済みでも、ここでチェック表と同じ週へ同期
          Calendar.gotoDate(State.currentWeekStart);
          Calendar.onShow();
        }
      };
    });
  }

  // ── カレンダー → チェック表 の同期フック
  function bindCalendarToChecklist(root) {
    Calendar.onDateChange = (currentStart) => {
      const newWeekStart = Utils.startOfWeek(currentStart);
      // 既に同じ週を表示しているなら何もしない（ループ防止）
      if (Utils.fmtDate(newWeekStart) === Utils.fmtDate(State.currentWeekStart)) return;
      log('カレンダー→チェック表 週同期', Utils.fmtDate(newWeekStart));
      State.currentWeekStart = newWeekStart;
      renderChecklistPanel(root).catch((e) => err('同期再描画失敗', e));
    };
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
    bindCalendarToChecklist(root);
    renderChecklistPanel(root).catch((e) => err('描画失敗', e));
    return event;
  });

  log('スクリプト読み込み完了');
})();
