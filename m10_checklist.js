/**
 * 放デイシフト モバイル - チェック表タブ（週表示・横スクロール）
 * 読み込み順: 10
 *
 * 日曜始まりの7日間を横方向に並べる。左端は行ラベル固定（sticky）。
 * - 営業時間行: セルタップで営業パターン select
 * - サービス提供時間行: 表示のみ
 * - 管理者兼児発管: 1枠
 * - 常勤専従:       1枠
 * - 常勤換算:       6枠
 * スタッフセルタップで ShiftDialog（app62に書込）
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils, Api, State, toast, log, err } = App;
  const F = Config.SHIFT_FIELDS;

  const Checklist = {
    async render() {
      const panel = document.querySelector('.m-panel[data-panel="checklist"]');
      if (!panel) return;
      const ws = Utils.startOfWeek(State.currentDate);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      panel.innerHTML = `<div class="m-cl-loading">読み込み中…</div>`;

      // 日付マスタ(app57) と シフト(app62) を週単位で並行取得
      const [dayMap, records] = await Promise.all([
        Api.fetchDayMasters(ws, we),
        Api.fetchShifts(ws, we, Config.SIMULATION_APP_ID),
      ]);
      State.currentDayMap = dayMap;

      // 配置 → 日付 → レコード配列（開始時間昇順）に分類
      // ※ 「休憩ヘルプ」は「常勤換算」バケットに合算（同一セル群に表示）。
      //   月間時間集計でも「常勤換算」は「休憩ヘルプ」を含めた合計で表示している。
      const byPlacDate = {};
      records.forEach((r) => {
        let p = r[F.placementType] && r[F.placementType].value;
        const d = r[F.startDate] && r[F.startDate].value;
        if (!p || !d) return;
        if (p === '休憩ヘルプ') p = '常勤換算';  // 合算表示
        if (!byPlacDate[p]) byPlacDate[p] = {};
        if (!byPlacDate[p][d]) byPlacDate[p][d] = [];
        byPlacDate[p][d].push(r);
      });
      Object.keys(byPlacDate).forEach((p) => {
        Object.keys(byPlacDate[p]).forEach((d) => {
          byPlacDate[p][d].sort((a, b) => {
            const t1 = (a[F.startTime] && a[F.startTime].value) || '';
            const t2 = (b[F.startTime] && b[F.startTime].value) || '';
            return t1.localeCompare(t2);
          });
        });
      });

      // 7日分の配列
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        days.push(d);
      }

      // ── ヘッダ ──
      const dateHeader = days.map((d) => {
        const cls = Utils.cellClass(d);
        const holi = Utils.isHoliday(d);
        const holiHtml = holi ? `<div class="m-cl-holi">${holi}</div>` : '';
        return `<th class="${cls}">${Utils.fmtMD(d)}<br>(${Config.WEEKDAYS[d.getDay()]})${holiHtml}</th>`;
      }).join('');

      // ── 営業時間行 ──
      const rowEigyou = days.map((d) => {
        const ds = Utils.fmtDate(d);
        const rec = dayMap[ds];
        const current = (rec && rec['営業パターン'] && rec['営業パターン'].value) || '';
        const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
        const emptyCls = current ? '' : 'is-empty';
        return `<td class="m-cl-cell m-cl-eigyou ${Utils.cellClass(d)}" data-eigyou-for="${ds}" data-record-id="${recordId}" data-current="${current}"><span class="m-cl-eigyou-display ${emptyCls}">${current || '—'}</span></td>`;
      }).join('');

      // ── サービス提供時間行（表示のみ） ──
      const rowService = days.map((d) => {
        const ds = Utils.fmtDate(d);
        const rec = dayMap[ds];
        const p = Utils.getPatternValues(rec);
        const val = p ? p.サービス : '';
        return `<td class="m-cl-cell m-cl-service ${Utils.cellClass(d)}">${val || '—'}</td>`;
      }).join('');

      // スタッフセル生成
      function cellsFor(placement, slotIndex) {
        return days.map((d) => {
          const ds = Utils.fmtDate(d);
          const recs = (byPlacDate[placement] && byPlacDate[placement][ds]) || [];
          const rec = recs[slotIndex];
          const cls = Utils.cellClass(d);
          const rid = rec ? rec.$id.value : '';
          return `<td class="m-cl-cell m-cl-staff ${cls}" data-staff-for="${ds}" data-placement="${placement}" data-slot-index="${slotIndex}" data-record-id="${rid}">${renderStaffInner(rec)}</td>`;
        }).join('');
      }
      function renderStaffInner(rec) {
        if (!rec) return '<span class="m-cl-staff-empty">＋</span>';
        const name = (rec[F.employeeName] && rec[F.employeeName].value) || '(未設定)';
        const st   = (rec[F.startTime] && rec[F.startTime].value) || '';
        const et   = (rec[F.endTime] && rec[F.endTime].value) || '';
        const bs   = (rec[F.breakStartTime] && rec[F.breakStartTime].value) || '';
        const be   = (rec[F.breakEndTime] && rec[F.breakEndTime].value) || '';
        const hrs  = Utils.actualWorkHours(st, et, bs, be);
        const timeHtml = (st && et)
          ? `<div class="m-cl-staff-time">${st}~${et}${hrs != null ? ` (${hrs}h)` : ''}</div>`
          : '';
        return `<div class="m-cl-staff-inner"><div class="m-cl-staff-name">${name}</div>${timeHtml}</div>`;
      }

      panel.innerHTML = `
        <div class="m-cl-week-scroll">
          <table class="m-cl-week-table">
            <colgroup>
              <col class="m-cl-col-label">
              <col><col><col><col><col><col><col>
            </colgroup>
            <thead>
              <tr><th class="m-cl-rowhead"></th>${dateHeader}</tr>
            </thead>
            <tbody>
              <tr class="m-cl-group-head"><td colspan="8">営業時間</td></tr>
              <tr><th class="m-cl-rowhead">営業<br>時間</th>${rowEigyou}</tr>
              <tr><th class="m-cl-rowhead">サービス<br>提供時間</th>${rowService}</tr>
              <tr class="m-cl-group-head"><td colspan="8">スタッフ配置</td></tr>
              <tr><th class="m-cl-rowhead">管理者兼<br>児発管</th>${cellsFor('管理者兼児発管', 0)}</tr>
              <tr><th class="m-cl-rowhead">常勤<br>専従</th>${cellsFor('常勤専従', 0)}</tr>
              <tr><th class="m-cl-rowhead m-cl-rowhead-group" rowspan="6">常勤<br>換算</th>${cellsFor('常勤換算', 0)}</tr>
              <tr>${cellsFor('常勤換算', 1)}</tr>
              <tr>${cellsFor('常勤換算', 2)}</tr>
              <tr>${cellsFor('常勤換算', 3)}</tr>
              <tr>${cellsFor('常勤換算', 4)}</tr>
              <tr>${cellsFor('常勤換算', 5)}</tr>
            </tbody>
          </table>
        </div>`;

      // 営業パターン編集
      panel.querySelectorAll('.m-cl-eigyou').forEach((td) => {
        td.onclick = () => openPatternEdit(td);
      });
      // スタッフセル編集
      panel.querySelectorAll('.m-cl-staff').forEach((td) => {
        td.onclick = () => openStaffDialog(td, records);
      });
      log('週チェック表 描画完了', { 週開始: Utils.fmtDate(ws) });
    },
  };

  // ── 営業パターン編集（インラインselect） ──
  function openPatternEdit(td) {
    if (td.classList.contains('editing')) return;
    const current  = td.dataset.current || '';
    const dateStr  = td.dataset.eigyouFor;
    const recordId = td.dataset.recordId || '';
    const options = ['', ...Object.keys(Config.PATTERNS)]
      .map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${o || '—'}</option>`).join('');
    td.classList.add('editing');
    td.innerHTML = `<select class="m-cl-pattern-sel">${options}</select>`;
    const sel = td.querySelector('select');
    sel.focus();
    try { sel.showPicker && sel.showPicker(); } catch (_) {}
    let done = false;
    const exit = () => {
      if (done) return;
      done = true;
      td.classList.remove('editing');
      const cur = td.dataset.current || '';
      td.innerHTML = `<span class="m-cl-eigyou-display ${cur ? '' : 'is-empty'}">${cur || '—'}</span>`;
    };
    sel.onchange = async () => {
      const newPat = sel.value;
      if (newPat === current) { exit(); return; }
      try {
        await Api.saveDayField(dateStr, { 営業パターン: newPat }, recordId);
        toast('✓ 保存しました', 'success');
        App.Checklist.render();
        if (App.Calendar)   App.Calendar.refresh();
        if (App.Simulation) App.Simulation.refresh();
      } catch (_) {
        toast('保存失敗', 'error');
        exit();
      }
    };
    sel.onblur = () => setTimeout(exit, 150);
    sel.onkeydown = (e) => { if (e.key === 'Escape') exit(); };
  }

  // ── スタッフセル → ダイアログ ──
  function openStaffDialog(td, allRecords) {
    const dateStr   = td.dataset.staffFor;
    const placement = td.dataset.placement;
    const recordId  = td.dataset.recordId || '';
    const Dialog = App.ShiftDialog;
    if (!Dialog) { err('ShiftDialog未ロード'); return; }
    const onChanged = () => {
      App.Checklist.render();
      if (App.MonthlyHours) App.MonthlyHours.refresh();
      if (App.Calendar)     App.Calendar.refresh();
      if (App.Simulation)   App.Simulation.refresh();
    };
    if (recordId) {
      const rec = allRecords.find((r) => r.$id.value === recordId);
      if (rec) Dialog.open({ mode: 'edit', record: rec, onChanged });
      return;
    }
    Dialog.open({ mode: 'create', date: dateStr, placement, onChanged });
  }

  App.Checklist = Checklist;
})();
