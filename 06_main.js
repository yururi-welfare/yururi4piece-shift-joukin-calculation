/**
 * 放デイシフト - エントリポイント
 * ルート要素生成・render呼び出し・週ナビ・kintoneイベント登録
 * 読み込み順: 6 (最後)
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, Render, Editor, State, Utils, log, err } = App;

  // ── ルート要素を取得（なければ自動生成）
  // 既存のrootがあれば削除して作り直す（イベント再発火による重複防止）
  function ensureRoot() {
    const existing = document.getElementById(Config.ROOT_ID);
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = Config.ROOT_ID;

    // 挿入先の優先順位：標準レコード一覧の直前 → contents-gaia の先頭
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

  // ── 描画 ──────────────────────────────────────────
  async function render(root) {
    log('描画開始', { week: Utils.fmtDate(State.currentWeekStart) });
    root.innerHTML =
      Render.buildHeader(State.currentWeekStart) +
      Render.buildTable(State.currentWeekStart, {});
    bindNav(root);
    Editor.bindPatternSelects(root);
    Editor.bindStaffSelects(root);

    const dayMap = await Api.fetchDayMasters(State.currentWeekStart);
    State.currentDayMap = dayMap;
    Render.applyDayMapToCells(root, dayMap);
    log('描画完了');
  }

  function bindNav(root) {
    const q = (sel) => root.querySelector(sel);
    if (q('.btn-prev')) q('.btn-prev').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() - 7);
      render(root);
    };
    if (q('.btn-next')) q('.btn-next').onclick = () => {
      State.currentWeekStart.setDate(State.currentWeekStart.getDate() + 7);
      render(root);
    };
    if (q('.btn-today')) q('.btn-today').onclick = () => {
      State.currentWeekStart = Utils.startOfWeek(new Date());
      render(root);
    };
  }

  // ── 一覧画面イベント ───────────────────────────────
  kintone.events.on('app.record.index.show', function (event) {
    log('app.record.index.show 発火', {
      viewId: event.viewId,
      viewName: event.viewName,
      viewType: event.viewType,
      設定VIEW_ID: Config.VIEW_ID,
    });

    if (Config.VIEW_ID !== null && String(event.viewId) !== String(Config.VIEW_ID)) {
      log(`viewId ${event.viewId} は対象外（期待: ${Config.VIEW_ID}）スキップ`);
      return event;
    }

    State.currentWeekStart = Utils.startOfWeek(new Date());
    const root = ensureRoot();
    render(root).catch((e) => err('描画失敗', e));
    return event;
  });

  log('スクリプト読み込み完了');
})();
