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
    // 週ナビのヘッダー
    buildHeader(startDate) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);
      return `
        <div class="shift-nav">
          <button class="btn-prev">◀ 前の週</button>
          <span class="week-label">${startDate.getFullYear()}年 ${fmtMD(startDate)} 〜 ${fmtMD(end)}</span>
          <button class="btn-next">次の週 ▶</button>
          <button class="btn-today">今週</button>
          <span class="saving-indicator" data-role="saving"></span>
        </div>`;
    },

    // スタッフ用編集セルを生成 (role: 児発管, 常勤専従, etc.)
    buildStaffCells(days, role) {
      return days.map((d) => {
        const dateStr = fmtDate(d);
        return `<td class="cell staff-cell ${cellClass(d)}" data-staff-for="${dateStr}" data-staff-role="${role}" data-record-id="" data-current=""><span class="staff-display is-empty">未設定</span></td>`;
      }).join('');
    },

    // スタッフ配置セクションの行群
    renderStaffRows(days) {
      const empty = () => days.map((d) => `<td class="cell ${cellClass(d)}"></td>`).join('');
      return `
        <tr><td class="row-label" colspan="2">管理者兼\n児発管</td>${Render.buildStaffCells(days, '児発管')}</tr>
        <tr><td class="row-label" colspan="2">常勤専従</td>${empty()}</tr>
        <tr>
          <td class="row-label vertical" rowspan="3">常勤換算1人</td>
          <td class="row-label">1人目</td>${empty()}
        </tr>
        <tr><td class="row-label">2人目</td>${empty()}</tr>
        <tr><td class="row-label"></td>${empty()}</tr>
        <tr><td class="row-label" colspan="2">休憩</td>${empty()}</tr>`;
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
        const text = current || '未設定';
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
          <tr class="group-header"><td colspan="9">日の情報</td></tr>
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
          display.textContent = current || '未設定';
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

    // 役割ごとのシフトマップ（role → dateStr → app60レコード）を受け取り、該当セルを描画
    // 例: rolesShiftMap = { '児発管': { '2026-04-27': {...app60レコード...} } }
    applyShiftsToStaffCells(root, rolesShiftMap) {
      root.querySelectorAll('td.staff-cell').forEach((td) => {
        if (td.classList.contains('editing')) return;
        const dateStr = td.dataset.staffFor;
        const role = td.dataset.staffRole;
        const roleMap = rolesShiftMap[role];
        const rec = roleMap && roleMap[dateStr];
        const name = (rec && rec['従業員名'] && rec['従業員名'].value) || '';
        const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
        td.dataset.current = name;
        td.dataset.recordId = recordId;
        const display = td.querySelector('.staff-display');
        if (display) {
          display.textContent = name || '未設定';
          display.classList.toggle('is-empty', !name);
        }
      });
    },
  };

  App.Render = Render;
})();
