/**
 * 放デイシフト - 月間勤務時間集計
 * シミュレーション(app62)から指定月のシフトを取得し、従業員番号ごとに合計時間を算出
 * チェック表と一致させるため参照先は Config.SIMULATION_APP_ID
 * 読み込み順: 11
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Api, Config, log, err } = App;

  const MonthlyHours = {
    _cache:   {},   // key='YYYY-M' → { persons:{num:h}, placements:{type:h} }
    _pending: {},   // key='YYYY-M' → Promise
    _currentKey:  null,
    _currentData: { persons: {}, placements: {} },

    _key(y, m) { return `${y}-${m}`; },

    // 指定月(0-indexed)のデータを取得。キャッシュ優先
    async getData(year, month) {
      const k = this._key(year, month);
      if (this._cache[k])   return this._cache[k];
      if (this._pending[k]) return this._pending[k];

      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0);
      log('月間時間集計 開始', { year, month: month + 1 });

      const p = Api.fetchShifts(start, end, Config.SIMULATION_APP_ID).then((records) => {
        const byNum = {};       // number → totalMinutes（実働: 休憩差し引き）
        const byPlacement = {}; // placement → totalMinutes
        records.forEach((r) => {
          const num = r['従業員番号'] && r['従業員番号'].value;
          const st  = r['開始時間']   && r['開始時間'].value;
          const et  = r['終了時間']   && r['終了時間'].value;
          const placement = r['配置の種類'] && r['配置の種類'].value;
          if (!st || !et) return;
          let diff = toMin(et) - toMin(st);
          const bs = r['休憩開始時間'] && r['休憩開始時間'].value;
          const be = r['休憩終了時間'] && r['休憩終了時間'].value;
          if (bs && be) {
            const breakMin = toMin(be) - toMin(bs);
            if (breakMin > 0) diff -= breakMin;
          }
          if (diff <= 0) return;
          if (num)       byNum[num]             = (byNum[num] || 0) + diff;
          if (placement) byPlacement[placement] = (byPlacement[placement] || 0) + diff;
        });
        const persons = {}, placements = {};
        Object.entries(byNum).forEach(([n, min]) => {
          persons[n] = Math.round((min / 60) * 100) / 100;
        });
        Object.entries(byPlacement).forEach(([n, min]) => {
          placements[n] = Math.round((min / 60) * 100) / 100;
        });
        const result = { persons, placements };
        this._cache[k] = result;
        delete this._pending[k];
        log('月間時間集計 完了', {
          key: k,
          人数: Object.keys(persons).length,
          配置数: Object.keys(placements).length,
        });
        return result;
      }).catch((e) => {
        err('月間時間集計失敗', e);
        delete this._pending[k];
        return { persons: {}, placements: {} };
      });

      this._pending[k] = p;
      return p;
    },

    // 表示対象月をセット（凡例表示に使う）
    async setMonth(year, month) {
      this._currentKey  = this._key(year, month);
      this._currentData = await this.getData(year, month);
      return this._currentData;
    },

    // 従業員番号の合計時間テキスト（未集計/0は空文字）
    getPersonHoursText(employeeNumber) {
      const h = this._currentData.persons && this._currentData.persons[employeeNumber];
      if (h == null || h === 0) return '';
      return `${h}h`;
    },

    // 配置の種類の合計時間テキスト（未集計/0は空文字）
    // ※ 「常勤換算」は「休憩ヘルプ」の時間も合算して表示する
    getPlacementHoursText(placementName) {
      const map = this._currentData.placements || {};
      let h = map[placementName] || 0;
      if (placementName === '常勤換算') {
        h += map['休憩ヘルプ'] || 0;
        h = Math.round(h * 100) / 100;
      }
      if (h === 0) return '';
      return `${h}h`;
    },

    // 常勤換算の人数内訳を返す（1人 = 128h）
    // 休憩ヘルプの時間も常勤換算に合算した合計をもとに算出
    // 返り値: { totalHours, people: [{ index, hours, filled, remaining }] }
    //  - filled=true : 128h達成済み（✓表示）
    //  - filled=false: 最後の不足枠。remaining=128-hours（マイナス表示用）
    getFteBreakdown() {
      const FTE_HOURS = 128;
      const map = this._currentData.placements || {};
      let h = (map['常勤換算'] || 0) + (map['休憩ヘルプ'] || 0);
      h = Math.round(h * 100) / 100;
      if (h === 0) return { totalHours: 0, people: [] };

      const full = Math.floor(h / FTE_HOURS);
      const rem = Math.round((h - full * FTE_HOURS) * 100) / 100;
      const people = [];
      for (let i = 0; i < full; i++) {
        people.push({ index: i + 1, hours: FTE_HOURS, filled: true, remaining: 0 });
      }
      if (rem > 0 || people.length === 0) {
        people.push({
          index: full + 1,
          hours: rem,
          filled: false,
          remaining: Math.round((FTE_HOURS - rem) * 100) / 100,
        });
      }
      return { totalHours: h, people };
    },

    // キャッシュクリア（データ変更後の再集計用）
    clearCache() {
      this._cache = {};
      this._pending = {};
    },
  };

  function toMin(t) {
    const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  }

  App.MonthlyHours = MonthlyHours;
})();
