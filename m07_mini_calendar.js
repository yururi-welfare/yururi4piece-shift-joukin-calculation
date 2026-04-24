/**
 * 放デイシフト モバイル - ミニカレンダー
 * 読み込み順: 7
 *
 * ドロワー内の月表示カレンダー。日付タップで currentDate 同期＋ドロワー閉じ。
 * 月切替時に凡例の月間時間を再集計する。
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Utils, State, log, err } = App;

  let mini = null;

  const MiniCalendar = {
    init() {
      if (typeof FullCalendar === 'undefined') { err('FullCalendar未ロード（ミニカレンダー）'); return; }
      const el = document.getElementById('m-mini-cal');
      if (!el) { err('#m-mini-cal が見つかりません'); return; }
      if (mini) { try { mini.destroy(); } catch (_) {} mini = null; }

      mini = new FullCalendar.Calendar(el, {
        locale: 'ja',
        initialView: 'dayGridMonth',
        initialDate: State.currentDate,
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        height: 'auto',
        fixedWeekCount: false,
        buttonText: { today: '今日' },
        dayCellContent: (arg) => arg.dayNumberText.replace('日', ''),

        dateClick: (info) => {
          log('ミニカレンダー日付クリック', info.dateStr);
          State.currentDate = new Date(
            info.date.getFullYear(), info.date.getMonth(), info.date.getDate()
          );
          if (App.Main && App.Main.onDateChanged) App.Main.onDateChanged();
          if (App.Drawer) App.Drawer.close();
        },

        datesSet: () => {
          const d = mini.getDate();
          if (App.Legend) App.Legend.updateTitleWithMonth(d.getMonth());
          if (App.MonthlyHours) {
            App.MonthlyHours.setMonth(d.getFullYear(), d.getMonth())
              .then(() => { if (App.Legend) App.Legend.refreshHoursText(); })
              .catch((e) => err('月切替集計失敗', e));
          }
          setTimeout(() => MiniCalendar.highlightWeek(), 0);
        },

        dayCellDidMount: (info) => {
          const d = info.date;
          const dow = d.getDay();
          const holi = Utils.isHoliday(d);
          if (dow === 6) info.el.classList.add('is-sat');
          if (dow === 0 || holi) info.el.classList.add('is-sun');
          if (holi) info.el.setAttribute('title', holi);
        },
      });
      mini.render();
      log('ミニカレンダー初期化完了');
    },

    getDate() { return mini ? mini.getDate() : null; },
    getMonth() {
      if (!mini) return null;
      const d = mini.getDate();
      return { year: d.getFullYear(), month: d.getMonth() };
    },
    gotoDate(date) { if (mini && date) mini.gotoDate(date); },
    updateSize() { if (mini) mini.updateSize(); },

    // 現在の currentDate を含む週（日〜土）をハイライト
    highlightWeek() {
      if (!mini) return;
      const root = mini.el;
      if (!root) return;
      root.querySelectorAll('.mini-week-active').forEach((c) => c.classList.remove('mini-week-active'));
      const ws = Utils.startOfWeek(State.currentDate);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      root.querySelectorAll('.fc-daygrid-day').forEach((c) => {
        const d = c.dataset.date;
        if (!d) return;
        const cd = new Date(d);
        if (cd >= ws && cd <= we) c.classList.add('mini-week-active');
      });
    },
  };

  App.MiniCalendar = MiniCalendar;
})();
