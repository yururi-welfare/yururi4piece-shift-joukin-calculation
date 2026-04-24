/**
 * 放デイシフト モバイル - 月間勤務時間集計
 * 読み込み順: 5
 *
 * app62(シミュレーション)から指定月のシフトを取得し、
 * 個人/配置ごとの「28日まで / 月全体」の合計時間を保持
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Api, Utils, State, log, err } = App;
  const F = Config.SHIFT_FIELDS;

  const MonthlyHours = {
    // 指定月の集計を実行し State.monthHours に反映。同一月キャッシュ時はスキップ
    async setMonth(year, month) {
      const key = `${year}-${month}`;
      if (State.monthKey === key) return State.monthHours;

      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0);
      log('月間時間集計 開始', { year, month: month + 1 });

      try {
        const records = await Api.fetchShifts(start, end, Config.SIMULATION_APP_ID);
        const byNum = {}, byPlac = {}, byNum28 = {}, byPlac28 = {};
        records.forEach((r) => {
          const num  = r[F.employeeNumber] && r[F.employeeNumber].value;
          const sd   = r[F.startDate]      && r[F.startDate].value;
          const st   = r[F.startTime]      && r[F.startTime].value;
          const et   = r[F.endTime]        && r[F.endTime].value;
          const plac = r[F.placementType]  && r[F.placementType].value;
          if (!st || !et) return;

          let diff = Utils.toMin(et) - Utils.toMin(st);
          const bs = r[F.breakStartTime] && r[F.breakStartTime].value;
          const be = r[F.breakEndTime]   && r[F.breakEndTime].value;
          if (bs && be) {
            const bm = Utils.toMin(be) - Utils.toMin(bs);
            if (bm > 0) diff -= bm;
          }
          if (diff <= 0) return;

          if (num)  byNum[num]   = (byNum[num]  || 0) + diff;
          if (plac) byPlac[plac] = (byPlac[plac] || 0) + diff;

          const day = sd ? parseInt(sd.split('-')[2], 10) : 0;
          if (day >= 1 && day <= 28) {
            if (num)  byNum28[num]   = (byNum28[num]  || 0) + diff;
            if (plac) byPlac28[plac] = (byPlac28[plac] || 0) + diff;
          }
        });

        const toH = (m) => Math.round(m / 60 * 100) / 100;
        State.monthKey = key;
        State.monthHours = {
          persons:        Object.fromEntries(Object.entries(byNum).map(([n, m]) => [n, toH(m)])),
          placements:     Object.fromEntries(Object.entries(byPlac).map(([n, m]) => [n, toH(m)])),
          personsTo28:    Object.fromEntries(Object.entries(byNum28).map(([n, m]) => [n, toH(m)])),
          placementsTo28: Object.fromEntries(Object.entries(byPlac28).map(([n, m]) => [n, toH(m)])),
        };
        log('月間時間集計 完了', {
          key,
          人数:  Object.keys(State.monthHours.persons).length,
          配置数: Object.keys(State.monthHours.placements).length,
        });
        return State.monthHours;
      } catch (e) {
        err('月間時間集計失敗', e);
        State.monthHours = { persons: {}, placements: {}, personsTo28: {}, placementsTo28: {} };
        return State.monthHours;
      }
    },

    // データ変更後の強制再集計
    async refresh() {
      const mini = App.MiniCalendar;
      const d = (mini && mini.getDate && mini.getDate()) || State.currentDate || new Date();
      State.monthKey = null; // invalidate
      await MonthlyHours.setMonth(d.getFullYear(), d.getMonth());
      if (App.Legend && App.Legend.refreshHoursText) App.Legend.refreshHoursText();
    },

    // 従業員番号の「28日まで / 月全体」テキスト
    getPersonHoursText(num) {
      const h   = (State.monthHours.persons     && State.monthHours.persons[num])     || 0;
      const h28 = (State.monthHours.personsTo28 && State.monthHours.personsTo28[num]) || 0;
      if (h === 0 && h28 === 0) return '';
      return `${h28}h / ${h}h`;
    },

    // 配置の種類の「28日まで / 月全体」テキスト
    // ※ 「常勤換算」は「休憩ヘルプ」も合算
    getPlacementHoursText(name) {
      const map   = State.monthHours.placements     || {};
      const map28 = State.monthHours.placementsTo28 || {};
      let h   = map[name]   || 0;
      let h28 = map28[name] || 0;
      if (name === '常勤換算') {
        h   += map['休憩ヘルプ']   || 0;
        h28 += map28['休憩ヘルプ'] || 0;
        h   = Math.round(h   * 100) / 100;
        h28 = Math.round(h28 * 100) / 100;
      }
      if (h === 0 && h28 === 0) return '';
      return `${h28}h / ${h}h`;
    },

    // 常勤換算の人数内訳（1人=128h、休憩ヘルプ合算後ベース）
    getFteBreakdown() {
      const FTE = 128;
      const map = State.monthHours.placements || {};
      let h = (map['常勤換算'] || 0) + (map['休憩ヘルプ'] || 0);
      h = Math.round(h * 100) / 100;
      if (h === 0) return { totalHours: 0, people: [] };

      const full = Math.floor(h / FTE);
      const rem = Math.round((h - full * FTE) * 100) / 100;
      const people = [];
      for (let i = 0; i < full; i++) {
        people.push({ index: i + 1, hours: FTE, filled: true, remaining: 0 });
      }
      if (rem > 0 || people.length === 0) {
        people.push({
          index: full + 1, hours: rem, filled: false,
          remaining: Math.round((FTE - rem) * 100) / 100,
        });
      }
      return { totalHours: h, people };
    },
  };

  App.MonthlyHours = MonthlyHours;
})();
