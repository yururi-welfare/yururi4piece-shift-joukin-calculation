/**
 * 放デイシフト - エディタ
 * クリック→ドロップダウン→保存 のインタラクション
 * 読み込み順: 5
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Api, Render, State, Config, log } = App;
  const { PATTERNS } = Config;

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
      td.innerHTML = `<span class="staff-display ${td.dataset.current ? '' : 'is-empty'}">${td.dataset.current || '未設定'}</span>`;
    };

    sel.addEventListener('change', async () => {
      const newVal = sel.value;
      if (newVal === current) { exit(); return; }

      log('スタッフ変更', { role, date: dateStr, staff: newVal, recordId });
      sel.classList.add('is-saving');
      sel.disabled = true;
      setIndicator(root, '保存中...', 'saving');

      try {
        await Api.saveDayField(dateStr, { [role]: newVal }, recordId);
        const fresh = await Api.fetchDayMasters(State.currentWeekStart);
        State.currentDayMap = fresh;
        finished = true;
        td.classList.remove('editing');
        td.innerHTML = `<span class="staff-display ${newVal ? '' : 'is-empty'}">${newVal || '未設定'}</span>`;
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

  App.Editor = {
    setIndicator,
    bindPatternSelects,
    bindStaffSelects,
  };
})();
