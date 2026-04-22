/**
 * 放デイシフト - 設定・共有State・名前空間
 * 読み込み順: 1
 */
(function () {
  'use strict';

  const TAG = '[放デイシフト]';

  window.ShiftApp = window.ShiftApp || {};
  const App = window.ShiftApp;

  // 変更頻度の低い設定値
  App.Config = {
    VIEW_ID: null,                 // 対象ビューID（null=全ビュー）
    ROOT_ID: 'shift-root',         // カスタマイズビューのdiv ID
    DAY_MASTER_APP_ID: 57,         // 日付マスタアプリ
    EMPLOYEE_APP_ID: 5,            // 従業員マスタアプリ
    TRACKED_FIELDS: ['営業パターン', '児発管'],  // 保存時に追跡するフィールド
    WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],
    PATTERNS: {
      '10:00〜18:00': { 営業: '10:00〜18:00', サービス: '11:00〜17:00' },
      '9:30〜16:30':  { 営業: '9:30〜16:30',  サービス: '10:00〜16:30' },
    },
  };

  // 実行時に変動するState
  App.State = {
    currentWeekStart: null,  // 表示中の週の開始日
    currentDayMap: {},       // 現在週の日付マスタレコード map (key=YYYY-MM-DD)
    indicatorTimer: null,    // 保存インジケータのタイマー
  };

  // ロガー
  App.log  = (...args) => console.log(TAG, ...args);
  App.warn = (...args) => console.warn(TAG, ...args);
  App.err  = (...args) => console.error(TAG, ...args);
})();
