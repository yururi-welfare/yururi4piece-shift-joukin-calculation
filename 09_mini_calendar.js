/**
 * 放デイシフト - ミニカレンダー
 * サイドバー上段の月表示FullCalendar。日付クリックで週を同期
 * 読み込み順: 9
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Utils, log, err } = App;

  let mini = null;

  const MiniCalendar = {
    // 指定週をハイライト（週同期の視覚表示）
    _highlightWeek(weekStart) {
      if (!mini) return;
      const root = mini.el;
      if (!root) return;
      root.querySelectorAll('.mini-week-active').forEach((el) =>
        el.classList.remove('mini-week-active')
      );
      if (!weekStart) return;

      const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
      const we = new Date(ws); we.setDate(we.getDate() + 6);

      root.querySelectorAll('.fc-daygrid-day').forEach((cell) => {
        const d = cell.dataset.date;
        if (!d) return;
        const cd = new Date(d);
        if (cd >= ws && cd <= we) cell.classList.add('mini-week-active');
      });
    },

    // 初期化
    init(container, onDateClick, onMonthChange) {
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendar未ロード（ミニカレンダー）');
        return;
      }
      const el = container.querySelector('#mini-calendar');
      if (!el) { err('#mini-calendar が見つかりません'); return; }
      // 前回のインスタンスが残っていれば破棄（index.show 再発火対策）
      if (mini) {
        try { mini.destroy(); } catch (_) {}
        mini = null;
      }

      mini = new FullCalendar.Calendar(el, {
        locale: 'ja',
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        initialView: 'dayGridMonth',
        height: 'auto',
        fixedWeekCount: false,
        showNonCurrentDates: true,
        buttonText: { today: '今日' },
        dayCellContent: (arg) => arg.dayNumberText.replace('日', ''),
        events: [],

        dateClick: (info) => {
          log('ミニカレンダー日付クリック', info.dateStr);
          if (typeof onDateClick === 'function') onDateClick(info.date);
          MiniCalendar._highlightWeek(Utils.startOfWeek(info.date));
        },

        datesSet: (arg) => {
          const current = mini.getDate();
          const y = current.getFullYear();
          const m = current.getMonth();
          if (typeof onMonthChange === 'function') onMonthChange(y, m);
          // 描画完了後にハイライトを再適用
          setTimeout(() => {
            MiniCalendar._highlightWeek(App.State.currentWeekStart);
          }, 0);
        },

        // 土日祝の色付け
        dayCellDidMount: (info) => {
          const d = info.date;
          const dow = d.getDay();
          const holiday = Utils.isHoliday(d);
          if (dow === 6) info.el.classList.add('is-sat');
          if (dow === 0 || holiday) info.el.classList.add('is-sun');
          if (holiday) info.el.setAttribute('title', holiday);
        },
      });

      mini.render();
      log('ミニカレンダー初期化完了');
    },

    // 外部から現在週を同期してハイライト更新
    setActiveWeek(weekStart) {
      MiniCalendar._highlightWeek(weekStart);
    },

    // ミニカレンダーの表示月 {year, month}
    getMonth() {
      if (!mini) return null;
      const d = mini.getDate();
      return { year: d.getFullYear(), month: d.getMonth() };
    },

    // 指定日へ移動
    gotoDate(date) {
      if (mini && date) mini.gotoDate(date);
    },
  };

  App.MiniCalendar = MiniCalendar;
})();
