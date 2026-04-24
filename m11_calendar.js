/**
 * 放デイシフト モバイル - カレンダータブ（閲覧専用）
 * 読み込み順: 11
 *
 * FullCalendar timeGridDay ビュー。app60(現場確定シフト)を参照。
 * タップでトースト案内のみ表示し、編集不可。
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils, Api, State, FCHelpers, toast, log, err } = App;

  let fc = null;

  const Calendar = {
    async initIfNeeded() {
      if (fc) return;
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendar未ロード（カレンダー）');
        return;
      }
      const panel = document.querySelector('.m-panel[data-panel="calendar"]');
      if (!panel) return;
      // 外側にスクロールラッパーを置き、内側のFCを min-width で広げて横スクロールさせる
      panel.innerHTML = `<div class="m-fc-scroll"><div id="m-fc-cal"></div></div>`;

      fc = new FullCalendar.Calendar(panel.querySelector('#m-fc-cal'), {
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
        selectable:            false,
        editable:              false,
        eventDurationEditable: false,
        eventStartEditable:    false,
        nowIndicator: true,
        height: 'auto',
        slotLabelFormat: {
          hour: 'numeric', minute: '2-digit',
          omitZeroMinute: true, meridiem: false, hour12: false,
        },

        eventSources: [
          { id: 'shifts', events: (fi, suc, fai) => {
            const s = fi.start, e = new Date(fi.end); e.setDate(e.getDate() - 1);
            Api.fetchShifts(s, e)
              .then((recs) => suc(recs.map(FCHelpers.recordToEvent).filter(Boolean)))
              .catch(fai);
          }},
          { id: 'offhours', events: (fi, suc, fai) => {
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
          const name = Utils.isHoliday(info.date);
          if (name) {
            info.el.classList.add('is-holiday');
            const cushion = info.el.querySelector('.fc-col-header-cell-cushion') || info.el;
            if (!cushion.querySelector('.holiday-name')) {
              const sp = document.createElement('span');
              sp.className = 'holiday-name';
              sp.textContent = name;
              cushion.appendChild(sp);
            }
          }
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

        eventClick: (info) => {
          if (info.event.extendedProps.isMarker) return;
          toast('🔒 閲覧専用です（編集はシミュレーションタブ）', 'warn');
        },
      });
      fc.render();
      log('カレンダー(閲覧) 初期化完了');
    },

    gotoDate(date) { if (fc && date) fc.gotoDate(date); },
    updateSize() { if (fc) setTimeout(() => fc.updateSize(), 0); },
    refresh() { if (fc) fc.refetchEvents(); },
    isInitialized() { return !!fc; },
  };

  App.Calendar = Calendar;
})();
