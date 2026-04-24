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
    SHIFT_APP_ID: 60,              // シフト登録アプリ（現場・確定シフト）
    SIMULATION_APP_ID: 62,         // シミュレーション用シフトアプリ（app60のコピー）
    TRACKED_FIELDS: ['営業パターン'],  // 保存時に追跡する日付マスタ(app57)のフィールド
    // スタッフセル保存時、営業パターン未設定時に使うデフォルト勤務時間
    DEFAULT_SHIFT_TIME: { start: '10:00', end: '18:00' },
    // 休憩開始時刻の初期値（ユーザーが後から変更可）
    DEFAULT_BREAK_START: '12:00',
    WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],
    PATTERNS: {
      '10:00〜18:00': { 営業: '10:00〜18:00', サービス: '11:00〜17:00' },
      '9:30〜16:30':  { 営業: '9:30〜16:30',  サービス: '10:00〜16:00' },
    },
    // アプリ60(シフト登録)のフィールドコード
    // ※ 資格(児発管など)は従業員マスタからルックアップで自動取得されるためAPI側では設定しない
    SHIFT_FIELDS: {
      employeeNumber: '従業員番号',
      employeeName:   '従業員名',
      qualification:  '放デイゆるり_資格', // ルックアップでコピー取得される資格フィールド
      placementType:  '配置の種類',         // ドロップダウン（管理者兼児発管/常勤専従/常勤換算/休憩ヘルプ）
      startDate:      '開始日付',
      startTime:      '開始時間',
      endDate:        '終了日付',
      endTime:        '終了時間',
      breakStartTime: '休憩開始時間',
      breakEndTime:   '休憩終了時間',
    },
    // 配置の種類ドロップダウンの選択肢（kintone側のフィールド設定と一致させる）
    PLACEMENT_TYPES: ['管理者兼児発管', '常勤専従', '常勤換算', '休憩ヘルプ'],
    // FullCalendar 設定
    CALENDAR: {
      LOCALE:             'ja',
      INITIAL_VIEW:       'timeGridWeek',
      SLOT_MIN_TIME:      '08:00:00',
      SLOT_MAX_TIME:      '19:00:00',
      SLOT_DURATION:      '00:15:00',
      SNAP_DURATION:      '00:15:00',
      SLOT_LABEL_INTERVAL: '01:00:00', // 1時間ごとにラベル表示（居宅準拠）
    },
    // サイドバー
    SIDEBAR: {
      WIDTH: 260,
      STORAGE_OPEN_KEY:   'hodeiShiftSidebarOpen',
      STORAGE_LEGEND_KEY: 'hodeiShiftLegendState',
    },
    // 凡例色（配置の種類）
    // ※ 休憩ヘルプは凡例非表示。月間時間は「常勤換算」に合算される (11_monthly_hours.js)
    LEGEND_COLORS: {
      placement: {
        '管理者兼児発管': '#6784f6',
        '常勤専従':       '#56af80',
        '常勤換算':       '#f09b54',
      },
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
