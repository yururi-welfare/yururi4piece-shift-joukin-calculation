/**
 * 放デイシフト モバイル - 設定・共有State・名前空間
 * 読み込み順: 1
 *
 * PC版とは完全独立。名前空間は window.ShiftMobile
 */
(function () {
  'use strict';

  const TAG = '[放デイシフト モバイル]';

  window.ShiftMobile = window.ShiftMobile || {};
  const App = window.ShiftMobile;

  // 変更頻度の低い設定値
  App.Config = {
    VIEW_ID: null,                 // 対象モバイルビューID（null=全ビュー）
    ROOT_ID: 'm-shift-root',       // モバイルルートdiv ID
    DAY_MASTER_APP_ID: 57,         // 日付マスタアプリ
    EMPLOYEE_APP_ID: 5,            // 従業員マスタアプリ
    SHIFT_APP_ID: 60,              // シフト登録アプリ（現場・確定シフト）
    SIMULATION_APP_ID: 62,         // シミュレーション用シフトアプリ
    TRACKED_FIELDS: ['営業パターン'],
    DEFAULT_SHIFT_TIME: { start: '10:00', end: '18:00' },
    DEFAULT_BREAK_START: '12:00',
    WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],
    PATTERNS: {
      '10:00〜18:00': { 営業: '10:00〜18:00', サービス: '11:00〜17:00' },
      '9:30〜16:30':  { 営業: '9:30〜16:30',  サービス: '10:00〜16:00' },
      '11:30〜17:30': { 営業: '11:30〜17:30', サービス: '12:00〜17:00' },
      '9:00〜17:00':  { 営業: '9:00〜17:00',  サービス: '10:00〜16:00' },
    },
    // アプリ60/62 フィールドコード
    SHIFT_FIELDS: {
      employeeNumber: '従業員番号',
      employeeName:   '従業員名',
      qualification:  '放デイゆるり_常勤区分',
      placementType:  '配置の種類',
      startDate:      '開始日付',
      startTime:      '開始時間',
      endDate:        '終了日付',
      endTime:        '終了時間',
      breakStartTime: '休憩開始時間',
      breakEndTime:   '休憩終了時間',
    },
    PLACEMENT_TYPES: ['管理者兼児発管', '常勤専従', '常勤換算', '休憩ヘルプ'],
    // FullCalendar 設定
    CALENDAR: {
      LOCALE:              'ja',
      INITIAL_VIEW:        'timeGridWeek',  // 日曜始まり7日表示
      SLOT_MIN_TIME:       '08:00:00',
      SLOT_MAX_TIME:       '19:00:00',
      SLOT_DURATION:       '00:30:00',
      SNAP_DURATION:       '00:15:00',
      SLOT_LABEL_INTERVAL: '01:00:00',
      // 横スクロールは FC の dayMinWidth(Premium) を使わず、
      // 外側ラッパー(.m-fc-scroll)+内側 min-width で実現。mobile.css 参照
    },
    // ドロワー/凡例ストレージキー
    STORAGE: {
      LEGEND_KEY: 'hodeiShiftLegendState_mobile',
    },
    // 凡例色（配置の種類）
    // ※ 休憩ヘルプは凡例非表示。月間時間は「常勤換算」に合算される (m05_monthly_hours.js)
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
    currentDate:    null,          // 表示中の基準日（日単位）
    currentTab:     'checklist',
    currentDayMap:  {},            // YYYY-MM-DD → 日付マスタレコード
    allStaff:       [],
    monthHours:     { persons: {}, placements: {}, personsTo28: {}, placementsTo28: {} },
    monthKey:       null,
    legendState:    { placement: {}, persons: {}, deactivatedPersons: {} },
  };

  // ロガー
  App.log  = (...args) => console.log(TAG, ...args);
  App.warn = (...args) => console.warn(TAG, ...args);
  App.err  = (...args) => console.error(TAG, ...args);
})();
