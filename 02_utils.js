/**
 * 放デイシフト - ユーティリティ
 * 日付整形・祝日判定・セルクラス判定など純粋関数群
 * 読み込み順: 2
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { PATTERNS } = App.Config;

  const Utils = {
    // 日曜始まりの週の開始日
    startOfWeek(date) {
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    },

    fmtDate(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    },

    fmtMD(d) {
      return (d.getMonth() + 1) + '/' + d.getDate();
    },

    // ライブラリ japanese-holidays が読み込まれている前提。未ロードなら null
    isHoliday(d) {
      try {
        return (window.JapaneseHolidays && window.JapaneseHolidays.isHoliday(d)) || null;
      } catch (_) { return null; }
    },

    // 祝日は日曜と同じ赤色スタイル ('sun' クラス再利用)
    cellClass(d) {
      if (Utils.isHoliday(d)) return 'sun';
      return d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : '';
    },

    // 営業パターンから派生値(サービス提供時間等)を取得
    getPatternValues(record) {
      const p = record && record['営業パターン'] && record['営業パターン'].value;
      return p && PATTERNS[p] ? PATTERNS[p] : null;
    },
  };

  App.Utils = Utils;
})();
