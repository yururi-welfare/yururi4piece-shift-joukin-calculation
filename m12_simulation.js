/**
 * 放デイシフト モバイル - シミュレーションタブ（編集可）
 * 読み込み順: 12
 *
 * FullCalendar timeGridDay ビュー。app62(シミュレーション)に対して
 * 作成/編集/削除/ドラッグ/リサイズを全て実行。
 * 「現場シフトを取り込む」ボタンで表示中の週を app60 から上書きコピー。
 * 長押し300msでドラッグ開始（モバイル最適化）。
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils, Api, State, FCHelpers, toast, log, err } = App;
  const F = Config.SHIFT_FIELDS;

  let fc = null;

  // ドラッグ/リサイズ時の更新処理
  async function handleTimeChange(info) {
    const ev = info.event;
    const s = ev.start;
    const e = ev.end || new Date(s.getTime() + 15 * 60000);
    if (!ev.id || !s) { info.revert(); return; }
    const payload = {
      [F.startDate]: Utils.fmtDate(s),
      [F.startTime]: Utils.toHHMM(s.getHours() * 60 + s.getMinutes()),
      [F.endDate]:   Utils.fmtDate(e),
      [F.endTime]:   Utils.toHHMM(e.getHours()   * 60 + e.getMinutes()),
    };
    try {
      await Api.updateShift(ev.id, payload, Config.SIMULATION_APP_ID);
      const rec = ev.extendedProps.record;
      if (rec) {
        rec[F.startDate] = { value: payload[F.startDate] };
        rec[F.startTime] = { value: payload[F.startTime] };
        rec[F.endDate]   = { value: payload[F.endDate] };
        rec[F.endTime]   = { value: payload[F.endTime] };
      }
      toast('✓ 保存しました', 'success');
    } catch (_) {
      info.revert();
      toast('保存失敗', 'error');
    }
  }

  // 現場シフト(app60) → シミュ(app62) 週単位完全上書き
  async function importFromProduction(panel) {
    if (!fc) return;
    const base = fc.view.currentStart;
    const ws = Utils.startOfWeek(base);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const label = `${Utils.fmtDate(ws)} 〜 ${Utils.fmtDate(we)}`;
    if (!confirm(
      `現場シフト(app${Config.SHIFT_APP_ID}) → シミュレーション(app${Config.SIMULATION_APP_ID})\n\n` +
      `対象週: ${label}\n\n` +
      `この週のシミュは全削除され、現場シフトで上書きされます。続行しますか？`
    )) return;
    const btn = panel.querySelector('.m-sim-import');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '取り込み中...';
    try {
      const simRecs = await Api.fetchShifts(ws, we, Config.SIMULATION_APP_ID);
      const simIds = simRecs.map((r) => r.$id.value);
      await Api.deleteShiftsBulk(simIds, Config.SIMULATION_APP_ID);
      const prodRecs = await Api.fetchShifts(ws, we, Config.SHIFT_APP_ID);
      const dataList = prodRecs.map((r) => ({
        [F.employeeNumber]: (r[F.employeeNumber] && r[F.employeeNumber].value) || '',
        [F.placementType]:  (r[F.placementType]  && r[F.placementType].value)  || '',
        [F.startDate]:      (r[F.startDate]      && r[F.startDate].value)      || '',
        [F.startTime]:      (r[F.startTime]      && r[F.startTime].value)      || '',
        [F.endDate]:        (r[F.endDate]        && r[F.endDate].value)        || '',
        [F.endTime]:        (r[F.endTime]        && r[F.endTime].value)        || '',
        [F.breakStartTime]: (r[F.breakStartTime] && r[F.breakStartTime].value) || '',
        [F.breakEndTime]:   (r[F.breakEndTime]   && r[F.breakEndTime].value)   || '',
      }));
      await Api.createShiftsBulk(dataList, Config.SIMULATION_APP_ID);
      fc.refetchEvents();
      if (App.Checklist)    App.Checklist.render();
      if (App.MonthlyHours) App.MonthlyHours.refresh();
      alert(`取り込み完了\n対象週: ${label}\n削除: ${simIds.length}件 / 作成: ${dataList.length}件`);
    } catch (e) {
      err('取り込み失敗', e);
      alert('取り込みに失敗しました: ' + (e && e.message ? e.message : JSON.stringify(e)));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  const Simulation = {
    async initIfNeeded() {
      if (fc) return;
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendar未ロード（シミュレーション）');
        return;
      }
      const panel = document.querySelector('.m-panel[data-panel="simulation"]');
      if (!panel) return;
      panel.innerHTML = `
        <div class="m-sim-toolbar">
          <button class="m-sim-import" type="button">現場シフトを取り込む</button>
        </div>
        <div class="m-fc-scroll"><div id="m-fc-sim"></div></div>`;
      panel.querySelector('.m-sim-import').onclick = () => importFromProduction(panel);

      fc = new FullCalendar.Calendar(panel.querySelector('#m-fc-sim'), {
        locale:            Config.CALENDAR.LOCALE,
        initialView:       Config.CALENDAR.INITIAL_VIEW,
        initialDate:       State.currentDate,
        firstDay:          0,  // 日曜始まり
        slotMinTime:       Config.CALENDAR.SLOT_MIN_TIME,
        slotMaxTime:       Config.CALENDAR.SLOT_MAX_TIME,
        slotDuration:      Config.CALENDAR.SLOT_DURATION,
        snapDuration:      Config.CALENDAR.SNAP_DURATION,
        slotLabelInterval: Config.CALENDAR.SLOT_LABEL_INTERVAL,
        allDaySlot:            false,
        headerToolbar:         false,
        selectable:            true,
        editable:              true,
        eventDurationEditable: true,
        eventStartEditable:    true,
        longPressDelay:        300,   // モバイル: 300ms長押しでドラッグ開始
        selectLongPressDelay:  300,
        nowIndicator: true,
        height: 'auto',
        slotLabelFormat: {
          hour: 'numeric', minute: '2-digit',
          omitZeroMinute: true, meridiem: false, hour12: false,
        },

        eventSources: [
          { id: 'sim-shifts', events: (fi, suc, fai) => {
            const s = fi.start, e = new Date(fi.end); e.setDate(e.getDate() - 1);
            Api.fetchShifts(s, e, Config.SIMULATION_APP_ID)
              .then((recs) => suc(recs.map(FCHelpers.recordToEvent).filter(Boolean)))
              .catch(fai);
          }},
          { id: 'sim-offhours', events: (fi, suc, fai) => {
            const s = fi.start, e = new Date(fi.end); e.setDate(e.getDate() - 1);
            Api.fetchDayMasters(s, e)
              .then((dm) => suc([...FCHelpers.buildOffHoursBg(s, e, dm), ...FCHelpers.buildMarkerLabels(s, e, dm)]))
              .catch(fai);
          }},
        ],

        datesSet: () => {
          const d = fc.view.currentStart;
          const currentWeek = Utils.startOfWeek(State.currentDate);
          if (Utils.fmtDate(d) !== Utils.fmtDate(currentWeek)) {
            State.currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (App.Main && App.Main.updateDateLabel) App.Main.updateDateLabel();
            if (App.MiniCalendar) {
              App.MiniCalendar.gotoDate(State.currentDate);
              App.MiniCalendar.highlightWeek();
            }
          }
        },

        dayHeaderDidMount: (info) => {
          if (Utils.isHoliday(info.date)) info.el.classList.add('is-holiday');
        },
        dayCellDidMount: (info) => {
          if (Utils.isHoliday(info.date)) info.el.classList.add('is-holiday');
        },

        eventDidMount: (info) => {
          const p = info.event.extendedProps || {};
          if (p.isMarker) return;
          if (p.placement != null)      info.el.dataset.placement      = p.placement || 'none';
          if (p.employeeNumber != null) info.el.dataset.employeeNumber = p.employeeNumber || 'none';
          FCHelpers.applyBreakOverlay(info.el, info.event, info.view);
        },

        select: (info) => {
          const Dialog = App.ShiftDialog;
          if (!Dialog) return;
          Dialog.open({
            mode: 'create', start: info.start, end: info.end,
            onChanged: () => {
              fc.refetchEvents();
              if (App.Checklist)    App.Checklist.render();
              if (App.MonthlyHours) App.MonthlyHours.refresh();
            },
          });
          fc.unselect();
        },

        eventClick: (info) => {
          if (info.event.extendedProps.isMarker) return;
          const Dialog = App.ShiftDialog;
          if (!Dialog) return;
          Dialog.open({
            mode: 'edit', record: info.event.extendedProps.record,
            onChanged: () => {
              fc.refetchEvents();
              if (App.Checklist)    App.Checklist.render();
              if (App.MonthlyHours) App.MonthlyHours.refresh();
            },
          });
        },

        eventDrop: async (info) => {
          if (info.event.extendedProps.isMarker) { info.revert(); return; }
          await handleTimeChange(info);
          FCHelpers.applyBreakOverlay(info.el, info.event, info.view);
          if (App.Checklist)    App.Checklist.render();
          if (App.MonthlyHours) App.MonthlyHours.refresh();
        },

        eventResize: async (info) => {
          if (info.event.extendedProps.isMarker) { info.revert(); return; }
          await handleTimeChange(info);
          FCHelpers.applyBreakOverlay(info.el, info.event, info.view);
          if (App.Checklist)    App.Checklist.render();
          if (App.MonthlyHours) App.MonthlyHours.refresh();
        },
      });
      fc.render();
      log('シミュレーション 初期化完了');
    },

    gotoDate(date) { if (fc && date) fc.gotoDate(date); },
    updateSize() { if (fc) setTimeout(() => fc.updateSize(), 0); },
    refresh() { if (fc) fc.refetchEvents(); },
    isInitialized() { return !!fc; },
  };

  App.Simulation = Simulation;
})();
