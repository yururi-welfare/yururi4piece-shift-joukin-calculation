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

    // 営業時間文字列 "10:00〜18:00" を {start, end} に分解
    // 記号は 〜 または ~ を想定。半角/全角コロン両対応
    parseHourRange(str) {
      if (!str) return null;
      const m = String(str).replace(/[：]/g, ':').match(/(\d{1,2}:\d{2})\s*[〜~]\s*(\d{1,2}:\d{2})/);
      if (!m) return null;
      const pad = (t) => t.length === 4 ? '0' + t : t; // "9:30" → "09:30"
      return { start: pad(m[1]), end: pad(m[2]) };
    },
  };

  App.Utils = Utils;
})();
