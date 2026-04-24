/**
 * 放デイシフト モバイル - FullCalendar 共通処理 ＋ トースト
 * 読み込み順: 4
 *
 * カレンダータブ/シミュレーションタブで共通に使う:
 *  - シフトレコード→FCイベント変換
 *  - 配置色取得、休憩帯オーバーレイ
 *  - 営業時間外背景・営業開始/終了マーカー生成
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils } = App;
  const F = Config.SHIFT_FIELDS;

  const FCHelpers = {
    readQualificationList(rec) {
      const field = rec[F.qualification];
      if (!field) return [];
      const v = field.value;
      if (Array.isArray(v)) return v;
      return v ? [v] : [];
    },

    // 配置の種類に応じた塗り色（凡例と同じ色）
    placementColors(plac) {
      const legend = (Config.LEGEND_COLORS && Config.LEGEND_COLORS.placement) || {};
      const color = legend[plac] || '#9aa4b2';
      return { bg: color, border: color, text: '#1a202c' };
    },

    // 休憩時間帯だけ色を薄める縦方向オーバーレイ（週/日ビューのみ）
    applyBreakOverlay(el, event, view) {
      if (!el) return;
      el.style.backgroundImage = '';
      const vt = view && view.type;
      if (!vt || vt.indexOf('timeGrid') !== 0) return;
      const rec = event.extendedProps && event.extendedProps.record;
      if (!rec) return;
      const bs = rec[F.breakStartTime] && rec[F.breakStartTime].value;
      const be = rec[F.breakEndTime]   && rec[F.breakEndTime].value;
      if (!bs || !be) return;
      const start = event.start, end = event.end;
      if (!start || !end) return;
      const bm = bs.match(/(\d{1,2}):(\d{2})/);
      const em = be.match(/(\d{1,2}):(\d{2})/);
      if (!bm || !em) return;
      const bsDate = new Date(start); bsDate.setHours(+bm[1], +bm[2], 0, 0);
      const beDate = new Date(start); beDate.setHours(+em[1], +em[2], 0, 0);
      const total = end - start;
      if (total <= 0) return;
      let bsPct = (bsDate - start) / total * 100;
      let bePct = (beDate - start) / total * 100;
      if (bsPct >= 100 || bePct <= 0 || bsPct >= bePct) return;
      bsPct = Math.max(0, bsPct); bePct = Math.min(100, bePct);
      if (bePct - bsPct < 1) return;
      el.style.backgroundImage =
        `linear-gradient(to bottom,` +
        ` transparent 0%, transparent ${bsPct}%,` +
        ` rgba(255,255,255,0.5) ${bsPct}%, rgba(255,255,255,0.5) ${bePct}%,` +
        ` transparent ${bePct}%, transparent 100%)`;
    },

    // シフトレコード → FCイベント
    recordToEvent(rec) {
      const sd = rec[F.startDate] && rec[F.startDate].value;
      const st = (rec[F.startTime] && rec[F.startTime].value) || '00:00';
      const ed = rec[F.endDate] && rec[F.endDate].value;
      const et = (rec[F.endTime] && rec[F.endTime].value) || st;
      if (!sd) return null;
      const name = (rec[F.employeeName] && rec[F.employeeName].value) || '(未設定)';
      const num  = (rec[F.employeeNumber] && rec[F.employeeNumber].value) || '';
      const plac = (rec[F.placementType] && rec[F.placementType].value) || '';
      const qual = FCHelpers.readQualificationList(rec);
      const title = qual.length ? `${name}（${qual.join(' / ')}）` : name;
      const colors = FCHelpers.placementColors(plac);
      return {
        id: rec.$id.value, title,
        start: `${sd}T${st}`, end: ed ? `${ed}T${et}` : `${sd}T${et}`,
        backgroundColor: colors.bg, borderColor: colors.border, textColor: colors.text,
        extendedProps: { record: rec, placement: plac, employeeNumber: num },
      };
    },

    // 営業時間外背景
    buildOffHoursBg(start, end, dayMap) {
      const evs = [];
      const slotMin = Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5);
      const slotMax = Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5);
      const BG = '#475569';
      const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
      while (cursor <= endDay) {
        const ds = Utils.fmtDate(cursor);
        const rec = dayMap[ds];
        const parsed = Utils.parseHourRange(rec && rec['営業パターン'] && rec['営業パターン'].value);
        if (!parsed) {
          evs.push({ start: `${ds}T${slotMin}:00`, end: `${ds}T${slotMax}:00`,
            display: 'background', backgroundColor: BG, classNames: ['offhours-bg'], groupId: 'offhours' });
        } else {
          if (parsed.start > slotMin) evs.push({ start: `${ds}T${slotMin}:00`, end: `${ds}T${parsed.start}:00`,
            display: 'background', backgroundColor: BG, classNames: ['offhours-bg'], groupId: 'offhours' });
          if (parsed.end < slotMax) evs.push({ start: `${ds}T${parsed.end}:00`, end: `${ds}T${slotMax}:00`,
            display: 'background', backgroundColor: BG, classNames: ['offhours-bg'], groupId: 'offhours' });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return evs;
    },

    // 営業開始/終了マーカー（30分マーカーイベント）
    buildMarkerLabels(start, end, dayMap) {
      const evs = [];
      const slotMinM = Utils.toMin(Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5));
      const slotMaxM = Utils.toMin(Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5));
      const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
      while (cursor <= endDay) {
        const ds = Utils.fmtDate(cursor);
        const rec = dayMap[ds];
        const parsed = Utils.parseHourRange(rec && rec['営業パターン'] && rec['営業パターン'].value);
        if (parsed) {
          const oM = Utils.toMin(parsed.start), cM = Utils.toMin(parsed.end);
          if (oM > slotMinM) {
            const s = Math.max(slotMinM, oM - 30), e = oM;
            if (e - s >= 15) evs.push(FCHelpers.makeMarker(ds, s, e, `${parsed.start} 営業開始`, 'open'));
          }
          if (cM < slotMaxM) {
            const s = cM, e = Math.min(slotMaxM, cM + 30);
            if (e - s >= 15) evs.push(FCHelpers.makeMarker(ds, s, e, `${parsed.end} 営業終了`, 'close'));
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return evs;
    },

    makeMarker(ds, sMin, eMin, title, type) {
      return {
        start: `${ds}T${Utils.toHHMM(sMin)}:00`, end: `${ds}T${Utils.toHHMM(eMin)}:00`,
        title, display: 'block',
        editable: false, startEditable: false, durationEditable: false,
        classNames: ['shift-marker', `shift-marker-${type}`],
        extendedProps: { isMarker: true, markerType: type },
      };
    },
  };

  App.FCHelpers = FCHelpers;

  // ── トースト ──────────────────────────
  let toastTimer = null;
  App.toast = function (msg, type) {
    let el = document.getElementById('m-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'm-toast';
      el.className = 'm-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'm-toast is-visible' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'm-toast'; }, 2200);
  };
})();
