/**
 * 放デイシフト モバイル - ユーティリティ
 * 日付整形・祝日判定・営業パターン解析など純粋関数群
 * 読み込み順: 2
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { PATTERNS, WEEKDAYS } = App.Config;

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

    // 2026/04/24 (木) の形式（モバイル日付ラベル用）
    fmtLabel(d) {
      return d.getFullYear() + '/' +
        String(d.getMonth() + 1).padStart(2, '0') + '/' +
        String(d.getDate()).padStart(2, '0') +
        ' (' + WEEKDAYS[d.getDay()] + ')';
    },

    parseDateStr(s) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    },

    // "HH:MM" → 分
    toMin(t) {
      const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    },
    // 分 → "HH:MM"
    toHHMM(m) {
      const h = Math.floor(m / 60), mm = m % 60;
      return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    },

    // 実働時間(h, 小数2桁)。パース失敗は null
    actualWorkHours(s, e, bs, be) {
      const sm = Utils.toMin(s), em = Utils.toMin(e);
      if (sm == null || em == null) return null;
      let w = em - sm;
      const bsm = Utils.toMin(bs), bem = Utils.toMin(be);
      if (bsm != null && bem != null && bem > bsm) w -= bem - bsm;
      if (w <= 0) return null;
      return Math.round(w / 60 * 100) / 100;
    },

    // CSS属性セレクタ値エスケープ
    escAttr(s) {
      return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    },

    // japanese-holidays CDN 依存
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

    // 営業パターンから派生値を取得
    getPatternValues(record) {
      const p = record && record['営業パターン'] && record['営業パターン'].value;
      return p && PATTERNS[p] ? PATTERNS[p] : null;
    },

    // 営業時間文字列 "10:00〜18:00" を {start, end} に分解
    parseHourRange(str) {
      if (!str) return null;
      const m = String(str).replace(/[：]/g, ':').match(/(\d{1,2}:\d{2})\s*[〜~]\s*(\d{1,2}:\d{2})/);
      if (!m) return null;
      const pad = (t) => t.length === 4 ? '0' + t : t;
      return { start: pad(m[1]), end: pad(m[2]) };
    },
  };

  App.Utils = Utils;
})();
