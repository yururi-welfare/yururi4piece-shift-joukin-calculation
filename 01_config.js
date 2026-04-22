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
    SHIFT_APP_ID: 60,              // シフト登録アプリ（児発管シフト自動作成先）
    TRACKED_FIELDS: ['営業パターン'],  // 保存時に追跡する日付マスタ(app57)のフィールド
    // 児発管等のスタッフ情報はapp60(シフト)を一次ソースとする
    ROLE_QUALIFICATION: {
      '児発管': '児発管',  // 役割→放デイゆるり_資格の値 のマッピング
    },
    // 児発管セルの保存時、営業パターン未設定時に使うデフォルト勤務時間
    DEFAULT_SHIFT_TIME: { start: '10:00', end: '18:00' },
    WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],
    PATTERNS: {
      '10:00〜18:00': { 営業: '10:00〜18:00', サービス: '11:00〜17:00' },
      '9:30〜16:30':  { 営業: '9:30〜16:30',  サービス: '10:00〜16:30' },
    },
    // アプリ60(シフト登録)のフィールドコード
    // ※ 資格(児発管など)は従業員マスタからルックアップで自動取得されるためAPI側では設定しない
    SHIFT_FIELDS: {
      employeeNumber: '従業員番号',
      employeeName:   '従業員名',
      qualification:  '放デイゆるり_資格', // ルックアップでコピー取得される資格フィールド
      startDate:      '開始日付',
      startTime:      '開始時間',
      endDate:        '終了日付',
      endTime:        '終了時間',
    },
    // FullCalendar 設定
    CALENDAR: {
      LOCALE:         'ja',
      INITIAL_VIEW:   'timeGridWeek',
      SLOT_MIN_TIME:  '08:00:00',
      SLOT_MAX_TIME:  '19:00:00',
      SLOT_DURATION:  '00:15:00',
      SNAP_DURATION:  '00:15:00',
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
