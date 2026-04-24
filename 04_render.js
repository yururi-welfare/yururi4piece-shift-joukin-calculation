/**
 * 放デイシフト - レンダリング
 * HTML文字列生成・描画後のセル反映処理
 * 読み込み順: 4
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Utils } = App;
  const { WEEKDAYS } = Config;
  const { fmtDate, fmtMD, cellClass, isHoliday, getPatternValues } = Utils;

  const Render = {
    // スタッフ用編集セルを生成
    // placement: 配置の種類（'管理者兼児発管' / '常勤専従' / '常勤換算' / '休憩ヘルプ'）
    // slotIndex: 同一placementで複数枠あるとき(常勤換算)の枠番号(0-2)。単一枠は0でOK
    buildStaffCells(days, placement, slotIndex = 0) {
      return days.map((d) => {
        const dateStr = fmtDate(d);
        return `<td class="cell staff-cell ${cellClass(d)}" data-staff-for="${dateStr}" data-placement="${placement}" data-slot-index="${slotIndex}" data-record-id="" data-current=""><span class="staff-display is-empty"></span></td>`;
      }).join('');
    },

    // スタッフ配置セクションの行群（行=配置の種類トリガー）
    renderStaffRows(days) {
      return `
        <tr><td class="row-label" colspan="2">管理者兼\n児発管</td>${Render.buildStaffCells(days, '管理者兼児発管')}</tr>
        <tr><td class="row-label" colspan="2">常勤専従</td>${Render.buildStaffCells(days, '常勤専従')}</tr>
        <tr>
          <td class="row-label vertical" rowspan="6">常勤換算累積</td>
          <td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 0)}
        </tr>
        <tr><td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 1)}</tr>
        <tr><td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 2)}</tr>
        <tr><td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 3)}</tr>
        <tr><td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 4)}</tr>
        <tr><td class="row-label"></td>${Render.buildStaffCells(days, '常勤換算', 5)}</tr>`;
    },

    // 週テーブル本体
    buildTable(startDate, dayMap) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        days.push(d);
      }

      const dateHeader = days.map((d) => {
        const holiday = isHoliday(d);
        const sub = holiday ? `<div class="holiday-name">${holiday}</div>` : '';
        return `<th class="${cellClass(d)}">${fmtMD(d)} (${WEEKDAYS[d.getDay()]})${sub}</th>`;
      }).join('');

      // 営業時間：クリックで編集
      const rowEigyou = days.map((d) => {
        const dateStr = fmtDate(d);
        const rec = dayMap[dateStr];
        const current = (rec && rec['営業パターン'] && rec['営業パターン'].value) || '';
        const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
        const text = current || '';
        const emptyCls = current ? '' : 'is-empty';
        return `<td class="cell eigyou ${cellClass(d)}" data-eigyou-for="${dateStr}" data-record-id="${recordId}" data-current="${current}"><span class="eigyou-display ${emptyCls}">${text}</span></td>`;
      }).join('');

      // サービス提供時間：表示のみ（営業パターンから導出）
      const rowService = days.map((d) => {
        const dateStr = fmtDate(d);
        const rec = dayMap[dateStr];
        const p = getPatternValues(rec);
        const val = p ? p.サービス : '';
        return `<td class="cell derived ${cellClass(d)}" data-service-for="${dateStr}">${val}</td>`;
      }).join('');

      const empty = () => days.map((d) => `<td class="cell ${cellClass(d)}"></td>`).join('');

      return `
      <table class="shift-table">
        <colgroup>
          <col style="width:32px">
          <col style="width:110px">
          <col><col><col><col><col><col><col>
        </colgroup>
        <thead><tr><th colspan="2"></th>${dateHeader}</tr></thead>
        <tbody>
          <tr class="group-header"><td colspan="9">営業時間</td></tr>
          <tr><td class="row-label" colspan="2">営業時間</td>${rowEigyou}</tr>
          <tr><td class="row-label" colspan="2">サービス\n提供時間</td>${rowService}</tr>

          <tr class="group-header"><td colspan="9">スタッフ配置</td></tr>
          ${Render.renderStaffRows(days)}

          <tr class="group-header"><td colspan="9">加算・備考</td></tr>
          <tr><td class="row-label" colspan="2">体制加算</td>${empty()}</tr>
          <tr><td class="row-label" colspan="2">備考</td>${empty()}</tr>
        </tbody>
      </table>`;
    },

    // dayMap を既存DOMのセルへ反映（再描画せず更新）
    applyDayMapToCells(root, dayMap) {
      // 営業時間
      root.querySelectorAll('td.eigyou').forEach((td) => {
        if (td.classList.contains('editing')) return;
        const dateStr = td.dataset.eigyouFor;
        const rec = dayMap[dateStr];
        const current = (rec && rec['営業パターン'] && rec['営業パターン'].value) || '';
        const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
        td.dataset.current = current;
        td.dataset.recordId = recordId;
        const display = td.querySelector('.eigyou-display');
        if (display) {
          display.textContent = current || '';
          display.classList.toggle('is-empty', !current);
        }
      });

      // サービス提供時間
      root.querySelectorAll('[data-service-for]').forEach((td) => {
        const dateStr = td.dataset.serviceFor;
        const rec = dayMap[dateStr];
        const p = getPatternValues(rec);
        td.textContent = p ? p.サービス : '';
      });

      // ※ 児発管セル(staff-cell)の描画は applyShiftsToStaffCells に移行
    },

    // 配置別シフトマップ（placement → dateStr → レコード配列） を受け取り該当セルを描画
    // 例: placementMap = { '常勤換算': { '2026-04-27': [rec1, rec2] } }
    // セルは data-placement と data-slot-index で自分の取得位置を知る
    applyShiftsToStaffCells(root, placementMap) {
      root.querySelectorAll('td.staff-cell').forEach((td) => {
        if (td.classList.contains('editing')) return;
        const dateStr = td.dataset.staffFor;
        const placement = td.dataset.placement;
        const slotIndex = parseInt(td.dataset.slotIndex || '0', 10);
        const recs = placementMap[placement] && placementMap[placement][dateStr];
        const rec = recs && recs[slotIndex];
        const name = (rec && rec['従業員名'] && rec['従業員名'].value) || '';
        const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
        td.dataset.current = name;
        td.dataset.recordId = recordId;
        td.innerHTML = Render.buildStaffCellInner(rec);
      });
    },

    // スタッフセルの内部HTMLを生成（record がなければ「未設定」の単一行）
    // ※ HTMLは1行にまとめる。親tdの white-space: pre-line が効くと改行がテキスト化され中央寄せが崩れるため
    buildStaffCellInner(rec) {
      if (!rec) return '<span class="staff-display is-empty"></span>';
      const name   = (rec['従業員名']     && rec['従業員名'].value)     || '';
      const sTime  = (rec['開始時間']     && rec['開始時間'].value)     || '';
      const eTime  = (rec['終了時間']     && rec['終了時間'].value)     || '';
      const bsTime = (rec['休憩開始時間'] && rec['休憩開始時間'].value) || '';
      const beTime = (rec['休憩終了時間'] && rec['休憩終了時間'].value) || '';
      const hours = actualWorkHours(sTime, eTime, bsTime, beTime);
      const timeLine = (sTime && eTime)
        ? `<div class="staff-time">${sTime} ~ ${eTime}${hours != null ? ` <span class="staff-hours">( ${hours} )</span>` : ''}</div>`
        : '';
      return `<div class="staff-display has-data"><div class="staff-name">${name || ''}</div>${timeLine}</div>`;
    },
  };

  // 実働時間を小数時間で返す（休憩時間を差し引く）。例: 10:00-17:00 / 休憩45分 → 6.25
  // パース失敗・負値時は null
  function actualWorkHours(startTime, endTime, breakStart, breakEnd) {
    const parse = (s) => {
      const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };
    const s = parse(startTime), e = parse(endTime);
    if (s == null || e == null) return null;
    let workMin = e - s;
    const bs = parse(breakStart), be = parse(breakEnd);
    if (bs != null && be != null && be > bs) workMin -= (be - bs);
    if (workMin <= 0) return null;
    // 小数2桁に丸め（6.25 は 6.25、6 は 6、6.5 は 6.5 として表示）
    return Math.round((workMin / 60) * 100) / 100;
  }

  App.Render = Render;
})();
