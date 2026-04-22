/**
 * 放デイシフト - エディタ
 * クリック→ドロップダウン→保存 のインタラクション
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

  // 児発管セルの保存： app60のshiftレコードを削除→作成（役割→資格のマッピングあり）
  async function saveStaffToShiftApp(role, newVal, dateStr, existingRecordId) {
    // 既存レコード削除
    if (existingRecordId) {
      try { await Api.deleteShift(existingRecordId); }
      catch (e) { err('既存シフト削除失敗（続行して新規作成）', e); }
    }
    if (!newVal) return; // 空にした場合は削除のみで終了

    const number = Api.getEmployeeNumberByName(newVal);
    if (!number) {
      err('従業員番号が見つかりません', newVal);
      throw new Error('従業員番号が見つかりません: ' + newVal);
    }
    const { start, end } = defaultTimesForDate(dateStr);
    await Api.createShift({
      '従業員番号': number,
      '開始日付':   dateStr,
      '開始時間':   start,
      '終了日付':   dateStr,
      '終了時間':   end,
    });
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
      } catch (_) {
        setIndicator(root, '保存失敗', 'saving');
        exit();
      }
    });

    sel.addEventListener('blur', () => { setTimeout(exit, 150); });
    sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') exit(); });
  }

  // ── スタッフセル ───────────────────────────────────
  function bindStaffSelects(root) {
    root.querySelectorAll('td.staff-cell').forEach((td) => {
      td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;
        enterStaffEditMode(td, root);
      });
    });
  }

  // role ごとに呼び出すfetch関数を変える（拡張時はここにマッピング追加）
  async function fetchStaffListForRole(role) {
    switch (role) {
      case '児発管': return Api.fetchJihatsukanStaff();
      default: return [];
    }
  }

  async function enterStaffEditMode(td, root) {
    const current = td.dataset.current || '';
    const dateStr = td.dataset.staffFor;
    const role = td.dataset.staffRole;
    const recordId = td.dataset.recordId || '';

    td.classList.add('editing');
    td.innerHTML = `<span class="staff-display">読み込み中…</span>`;

    const staffList = await fetchStaffListForRole(role);
    const options = ['', ...staffList]
      .map((opt) =>
        `<option value="${opt}" ${opt === current ? 'selected' : ''}>${opt || '未設定'}</option>`
      ).join('');

    td.innerHTML = `<select class="staff-select">${options}</select>`;
    const sel = td.querySelector('select');
    sel.focus();
    try { sel.showPicker && sel.showPicker(); } catch (_) {}

    let finished = false;
    const exit = () => {
      if (finished) return;
      finished = true;
      td.classList.remove('editing');
      // 取消時は保持中のシフトマップから該当セルを再描画して時間表示まで復元
      if (State.currentShiftMaps) {
        Render.applyShiftsToStaffCells(root, State.currentShiftMaps);
      } else {
        td.innerHTML = `<span class="staff-display ${td.dataset.current ? '' : 'is-empty'}">${td.dataset.current || '未設定'}</span>`;
      }
    };

    sel.addEventListener('change', async () => {
      const newVal = sel.value;
      if (newVal === current) { exit(); return; }

      log('スタッフ変更', { role, date: dateStr, staff: newVal, recordId });
      sel.classList.add('is-saving');
      sel.disabled = true;
      setIndicator(root, '保存中...', 'saving');

      try {
        // 役割に対応する資格があれば app60 を一次ソースとして保存
        const qualification = Config.ROLE_QUALIFICATION && Config.ROLE_QUALIFICATION[role];
        if (qualification) {
          await saveStaffToShiftApp(role, newVal, dateStr, recordId);
          // 該当週の app60 の資格別マップを再取得して反映
          const endDate = new Date(State.currentWeekStart);
          endDate.setDate(endDate.getDate() + 6);
          const fresh = await Api.fetchShiftsByQualification(State.currentWeekStart, endDate, qualification);
          State.currentShiftMaps = State.currentShiftMaps || {};
          State.currentShiftMaps[role] = fresh;
          finished = true;
          td.classList.remove('editing');
          Render.applyShiftsToStaffCells(root, State.currentShiftMaps);
          setIndicator(root, '✓ 保存しました', 'saved');
        } else {
          // 未マッピング役割は従来どおり app57 日付マスタに保存
          await Api.saveDayField(dateStr, { [role]: newVal }, recordId);
          const fresh = await Api.fetchDayMasters(State.currentWeekStart);
          State.currentDayMap = fresh;
          finished = true;
          td.classList.remove('editing');
          td.innerHTML = `<span class="staff-display ${newVal ? '' : 'is-empty'}">${newVal || '未設定'}</span>`;
          Render.applyDayMapToCells(root, fresh);
          setIndicator(root, '✓ 保存しました', 'saved');
        }
      } catch (e) {
        err('スタッフ保存失敗', e);
        setIndicator(root, '保存失敗', 'saving');
        exit();
      }
    });

    sel.addEventListener('blur', () => { setTimeout(exit, 150); });
    sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') exit(); });
  }

  App.Editor = {
    setIndicator,
    bindPatternSelects,
    bindStaffSelects,
  };
})();
