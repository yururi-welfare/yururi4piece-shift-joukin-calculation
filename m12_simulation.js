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
  // 休憩再計算ルール:
  //  - 6h以下になった → 休憩クリア
  //  - 6h超 → 休憩開始は現在の値を尊重（空なら既定値12:00）、終了は勤務時間から再計算
  //            〜8h: 45分 / 8h超: 60分。変更がある場合のみpayloadに含める
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

    const rec = ev.extendedProps.record;
    const workMin = Math.round((e - s) / 60000);
    const curBs = (rec && rec[F.breakStartTime] && rec[F.breakStartTime].value) || '';
    const curBe = (rec && rec[F.breakEndTime]   && rec[F.breakEndTime].value)   || '';
    if (workMin > 0 && workMin <= 360) {
      if (curBs || curBe) {
        payload[F.breakStartTime] = '';
        payload[F.breakEndTime]   = '';
      }
    } else if (workMin > 360) {
      const breakMin = workMin <= 480 ? 45 : 60;
      const bs = curBs || (Config.DEFAULT_BREAK_START || '12:00');
      const be = Utils.toHHMM(Utils.toMin(bs) + breakMin);
      if (bs !== curBs || be !== curBe) {
        payload[F.breakStartTime] = bs;
        payload[F.breakEndTime]   = be;
      }
    }

    try {
      await Api.updateShift(ev.id, payload, Config.SIMULATION_APP_ID);
      if (rec) {
        rec[F.startDate] = { value: payload[F.startDate] };
        rec[F.startTime] = { value: payload[F.startTime] };
        rec[F.endDate]   = { value: payload[F.endDate] };
        rec[F.endTime]   = { value: payload[F.endTime] };
        if (F.breakStartTime in payload) {
          rec[F.breakStartTime] = { value: payload[F.breakStartTime] };
          rec[F.breakEndTime]   = { value: payload[F.breakEndTime] };
        }
      }
      // 休憩が自動変更された時は専用メッセージ、それ以外は通常保存トースト
      if (F.breakStartTime in payload) {
        const newBs = payload[F.breakStartTime];
        const newBe = payload[F.breakEndTime];
        if (!newBs && !newBe) {
          toast('休憩時間を削除しました（勤務6時間以下）', 'success');
        } else {
          toast(`休憩時間を ${newBs}〜${newBe} に設定しました`, 'success');
        }
      } else {
        toast('✓ 保存しました', 'success');
      }
    } catch (_) {
      info.revert();
      toast('保存失敗', 'error');
    }
  }

  // 対象月を取得（ミニカレンダーの表示月 > FC view > 今日 の優先順）
  function getTargetMonth() {
    const MC = App.MiniCalendar;
    if (MC && MC.getMonth) {
      const mo = MC.getMonth();
      if (mo) return mo;
    }
    const d = (fc && fc.view && fc.view.currentStart) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  // 現場シフト(app60) → シミュ(app62) 月単位完全上書き
  async function importFromProduction(panel) {
    if (!fc) return;
    const { year, month } = getTargetMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd   = new Date(year, month + 1, 0);
    const label = `${year}年${month + 1}月 (${Utils.fmtDate(monthStart)} 〜 ${Utils.fmtDate(monthEnd)})`;
    if (!confirm(
      `現場シフト(app${Config.SHIFT_APP_ID}) → シミュレーション(app${Config.SIMULATION_APP_ID})\n\n` +
      `対象月: ${label}\n\n` +
      `この月のシミュは全削除され、現場シフトで上書きされます。続行しますか？`
    )) return;
    const btn = panel.querySelector('.m-sim-import');
    btn.disabled = true; btn.textContent = '取り込み中...';
    try {
      const simRecs = await Api.fetchShifts(monthStart, monthEnd, Config.SIMULATION_APP_ID);
      const simIds = simRecs.map((r) => r.$id.value);
      await Api.deleteShiftsBulk(simIds, Config.SIMULATION_APP_ID);
      const prodRecs = await Api.fetchShifts(monthStart, monthEnd, Config.SHIFT_APP_ID);
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
      alert(`取り込み完了\n対象月: ${label}\n削除: ${simIds.length}件 / 作成: ${dataList.length}件`);
    } catch (e) {
      err('取り込み失敗', e);
      alert('取り込みに失敗しました: ' + (e && e.message ? e.message : JSON.stringify(e)));
    } finally {
      btn.disabled = false;
      Simulation.updateImportLabel();
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
          <button class="m-sim-import" type="button">現場シフト取り込み</button>
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
      Simulation.updateImportLabel();
      log('シミュレーション 初期化完了');
    },

    gotoDate(date) { if (fc && date) fc.gotoDate(date); },
    updateSize() { if (fc) setTimeout(() => fc.updateSize(), 0); },
    refresh() { if (fc) fc.refetchEvents(); },
    isInitialized() { return !!fc; },

    // 取り込みボタンのラベルをミニカレンダーの表示月に合わせて更新
    updateImportLabel() {
      const panel = document.querySelector('.m-panel[data-panel="simulation"]');
      if (!panel) return;
      const btn = panel.querySelector('.m-sim-import');
      if (!btn) return;
      const { year, month } = getTargetMonth();
      btn.textContent = `${month + 1}月 現場シフト取り込み`;
      btn.title = `${year}年${month + 1}月のシミュレーションを現場シフトで上書き`;
    },
  };

  App.Simulation = Simulation;
})();
