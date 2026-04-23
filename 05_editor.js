/**
 * 放デイシフト - エディタ
 * 営業パターンセル→ドロップダウン、スタッフセル→モーダル
 * 読み込み順: 5
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Api, Render, State, Config, Utils, log, err } = App;
  const { PATTERNS } = Config;

  // 指定日の営業パターンから勤務時間を導出。未設定はデフォルト
  function defaultTimesForDate(dateStr) {
    const rec = State.currentDayMap && State.currentDayMap[dateStr];
    const patternStr = rec && rec['営業パターン'] && rec['営業パターン'].value;
    const parsed = Utils.parseHourRange(patternStr);
    if (parsed) return parsed;
    return { start: Config.DEFAULT_SHIFT_TIME.start, end: Config.DEFAULT_SHIFT_TIME.end };
  }

  // ── 保存インジケータ ───────────────────────────────
  function setIndicator(root, text, state) {
    const el = root.querySelector('[data-role="saving"]');
    if (!el) return;
    clearTimeout(State.indicatorTimer);
    el.textContent = text;
    el.className = 'saving-indicator visible' + (state ? ' ' + state : '');
    if (state === 'saved') {
      State.indicatorTimer = setTimeout(() => {
        el.className = 'saving-indicator';
      }, 1500);
    }
  }

  // ── 営業時間セル ───────────────────────────────────
  function bindPatternSelects(root) {
    root.querySelectorAll('td.eigyou').forEach((td) => {
      td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;
        enterPatternEditMode(td, root);
      });
    });
  }

  function enterPatternEditMode(td, root) {
    const current = td.dataset.current || '';
    const dateStr = td.dataset.eigyouFor;
    const recordId = td.dataset.recordId || '';

    const options = ['', ...Object.keys(PATTERNS)]
      .map((opt) =>
        `<option value="${opt}" ${opt === current ? 'selected' : ''}>${opt || '未設定'}</option>`
      ).join('');

    td.classList.add('editing');
    td.innerHTML = `<select class="pattern-select">${options}</select>`;
    const sel = td.querySelector('select');
    sel.focus();
    try { sel.showPicker && sel.showPicker(); } catch (_) {}

    let finished = false;
    const exit = () => {
      if (finished) return;
      finished = true;
      td.classList.remove('editing');
      td.innerHTML = `<span class="eigyou-display ${td.dataset.current ? '' : 'is-empty'}">${td.dataset.current || '未設定'}</span>`;
    };

    sel.addEventListener('change', async () => {
      const newPattern = sel.value;
      if (newPattern === current) { exit(); return; }

      log('営業パターン変更', { date: dateStr, pattern: newPattern, recordId });
      sel.classList.add('is-saving');
      sel.disabled = true;
      setIndicator(root, '保存中...', 'saving');

      try {
        await Api.saveDayField(dateStr, { 営業パターン: newPattern }, recordId);
        const fresh = await Api.fetchDayMasters(State.currentWeekStart);
        State.currentDayMap = fresh;
        finished = true;
        td.classList.remove('editing');
        td.innerHTML = `<span class="eigyou-display ${newPattern ? '' : 'is-empty'}">${newPattern || '未設定'}</span>`;
        Render.applyDayMapToCells(root, fresh);
        setIndicator(root, '✓ 保存しました', 'saved');

        // カレンダータブの営業時間外背景を再計算（カレンダーが初期化済みの場合のみ）
        if (App.Calendar && typeof App.Calendar.refreshBackground === 'function') {
          App.Calendar.refreshBackground();
        }
      } catch (_) {
        setIndicator(root, '保存失敗', 'saving');
        exit();
      }
    });

    sel.addEventListener('blur', () => { setTimeout(exit, 150); });
    sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') exit(); });
  }

  // ── スタッフセル（全行モーダル経由） ─────────────────
  function bindStaffSelects(root) {
    root.querySelectorAll('td.staff-cell').forEach((td) => {
      td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;
        openShiftModalForCell(td, root);
      });
    });
  }

  // "YYYY-MM-DD" + "HH:MM" → Date
  function dateTimeOf(dateStr, timeStr) {
    const [y, m, d]  = dateStr.split('-').map(Number);
    const [hh, mm]   = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0);
  }

  // 全シフトを再取得して配置別マップに更新→該当セル群を再描画
  async function refreshPlacementMap(root) {
    const endDate = new Date(State.currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const fresh = await Api.fetchShiftsGroupedByPlacement(State.currentWeekStart, endDate);
    State.currentShiftMaps = fresh;
    Render.applyShiftsToStaffCells(root, fresh);
  }

  // セルクリック時：既存シフトがあれば詳細モーダル、無ければ登録モーダル
  // セルの data-placement / data-slot-index で対象シフトを特定
  function openShiftModalForCell(td, root) {
    const dateStr   = td.dataset.staffFor;
    const placement = td.dataset.placement;
    const slotIndex = parseInt(td.dataset.slotIndex || '0', 10);
    const recordId  = td.dataset.recordId || '';
    const recs = State.currentShiftMaps
      && State.currentShiftMaps[placement]
      && State.currentShiftMaps[placement][dateStr];
    const shift = recs && recs[slotIndex];

    const onChanged = () => refreshPlacementMap(root);

    if (recordId && shift) {
      App.ShiftDialog.showEdit(shift, onChanged);
      return;
    }
    const { start: sTime, end: eTime } = defaultTimesForDate(dateStr);
    App.ShiftDialog.showCreate(
      dateTimeOf(dateStr, sTime),
      dateTimeOf(dateStr, eTime),
      onChanged,
      { placementType: placement }
    );
  }

  App.Editor = {
    setIndicator,
    bindPatternSelects,
    bindStaffSelects,
  };
})();
