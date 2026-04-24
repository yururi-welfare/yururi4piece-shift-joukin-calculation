/**
 * 放デイシフト - シミュレーションタブ (FullCalendar)
 * アプリ62のシフトをカレンダー表示。現場シフト(app60)から週単位で取り込み可能
 * 読み込み順: 13
 *
 * 設計メモ:
 * - app62 に対して作成/更新/削除/ドラッグ等を全て実行（app60には一切書き込まない）
 * - 「現場シフトを取り込む」ボタン: 表示中の週のシミュを全削除→app60の同週を全コピー（完全上書き）
 * - カレンダー(06)と同等の FullCalendar 設定だが完全に別インスタンス
 * - 営業時間外背景は app57 日付マスタを共通利用
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, Utils, log, err } = App;

  let fc = null;
  let inited = false;

  // ── view helpers
  function setActiveViewBtn(container, viewName) {
    container.querySelectorAll('.sim-view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
  }

  function updateDateTitle(container) {
    if (!fc) return;
    const el = container.querySelector('.sim-date-title');
    if (!el) return;
    const view = fc.view;
    const start = view.currentStart;
    const end = new Date(view.currentEnd);
    end.setDate(end.getDate() - 1);
    if (view.type === 'dayGridMonth') {
      el.textContent = start.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
    } else if (view.type === 'timeGridWeek' || view.type === 'listWeek') {
      const m = start.getMonth() + 1;
      el.textContent = `${start.getFullYear()}年 ${m}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
    } else {
      el.textContent = start.toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      });
    }
  }

  function readQualificationList(rec) {
    const F = Config.SHIFT_FIELDS;
    const field = rec[F.qualification];
    if (!field) return [];
    const v = field.value;
    if (Array.isArray(v)) return v;
    return v ? [v] : [];
  }

  // 配置の種類に応じた色（サイドバー凡例と同じ色で塗りつぶし）
  function placementColors(placement) {
    const legend = (Config.LEGEND_COLORS && Config.LEGEND_COLORS.placement) || {};
    const color = legend[placement] || '#9aa4b2';
    return { bg: color, border: color, text: '#1a202c' };
  }

  // 休憩時間帯だけ色を薄める縦方向オーバーレイ（週/日ビューのみ）
  function applyBreakOverlay(el, event, view) {
    if (!el) return;
    el.style.backgroundImage = '';
    const viewType = view && view.type;
    if (!viewType || viewType.indexOf('timeGrid') !== 0) return;
    const rec = event.extendedProps && event.extendedProps.record;
    if (!rec) return;
    const F = Config.SHIFT_FIELDS;
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
    const totalMs = end - start;
    if (totalMs <= 0) return;
    let bsPct = (bsDate - start) / totalMs * 100;
    let bePct = (beDate - start) / totalMs * 100;
    if (bsPct >= 100 || bePct <= 0 || bsPct >= bePct) return;
    bsPct = Math.max(0, bsPct);
    bePct = Math.min(100, bePct);
    if (bePct - bsPct < 1) return;
    const brk = 'rgba(255,255,255,0.5)';
    el.style.backgroundImage =
      `linear-gradient(to bottom,` +
      ` transparent 0%, transparent ${bsPct}%,` +
      ` ${brk} ${bsPct}%, ${brk} ${bePct}%,` +
      ` transparent ${bePct}%, transparent 100%)`;
  }

  function recordToEvent(rec) {
    const F = Config.SHIFT_FIELDS;
    const startDate = rec[F.startDate] && rec[F.startDate].value;
    const startTime = (rec[F.startTime] && rec[F.startTime].value) || '00:00';
    const endDate   = rec[F.endDate]   && rec[F.endDate].value;
    const endTime   = (rec[F.endTime]   && rec[F.endTime].value) || startTime;
    if (!startDate) return null;
    const name = (rec[F.employeeName] && rec[F.employeeName].value) || '(未設定)';
    const placement = (rec[F.placementType] && rec[F.placementType].value) || '';
    const qualList = readQualificationList(rec);
    const qualStr  = qualList.join(' / ');
    const title = qualStr ? `${name}（${qualStr}）` : name;
    const colors = placementColors(placement);
    return {
      id: rec.$id.value,
      title: title,
      start: `${startDate}T${startTime}`,
      end: endDate ? `${endDate}T${endTime}` : `${startDate}T${endTime}`,
      backgroundColor: colors.bg,
      borderColor:     colors.border,
      textColor:       colors.text,
      extendedProps: { record: rec, placement: placement },
    };
  }

  function toDateStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function toTimeStr(d) {
    return String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  // ドラッグ/リサイズ → app62 更新
  async function handleEventTimeChange(info, reason) {
    const ev = info.event;
    const start = ev.start;
    const end   = ev.end || new Date(start.getTime() + 15 * 60 * 1000);
    const recordId = ev.id;
    if (!recordId || !start) { info.revert(); return; }
    const payload = {
      '開始日付': toDateStr(start),
      '開始時間': toTimeStr(start),
      '終了日付': toDateStr(end),
      '終了時間': toTimeStr(end),
    };
    log(`[シミュ]${reason}による時間変更`, { id: recordId, payload });
    try {
      await Api.updateShift(recordId, payload, Config.SIMULATION_APP_ID);
      const rec = ev.extendedProps.record;
      if (rec) {
        rec['開始日付'] = { value: payload['開始日付'] };
        rec['開始時間'] = { value: payload['開始時間'] };
        rec['終了日付'] = { value: payload['終了日付'] };
        rec['終了時間'] = { value: payload['終了時間'] };
      }
    } catch (e) {
      info.revert();
      alert(`${reason}での保存に失敗しました。\n詳細はコンソールを確認してください。`);
    }
  }

  function eventSource(fetchInfo, success, failure) {
    const start = fetchInfo.start;
    const end = new Date(fetchInfo.end);
    end.setDate(end.getDate() - 1);
    Api.fetchShifts(start, end, Config.SIMULATION_APP_ID)
      .then((records) => success(records.map(recordToEvent).filter(Boolean)))
      .catch((e) => { err('[シミュ]events取得失敗', e); failure(e); });
  }

  function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function toHHMM(m) {
    const h = Math.floor(m / 60), mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function buildOpenCloseLabels(startDate, endDate, dayMap) {
    const events = [];
    const slotMinM = toMin(Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5));
    const slotMaxM = toMin(Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5));
    const LABEL_MIN_DURATION = 15, LABEL_DURATION = 30;
    const cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(endDate);   endDay.setHours(0, 0, 0, 0);
    while (cursor <= endDay) {
      const dateStr = Utils.fmtDate(cursor);
      const rec = dayMap[dateStr];
      const patternStr = rec && rec['営業パターン'] && rec['営業パターン'].value;
      const parsed = Utils.parseHourRange(patternStr);
      if (parsed) {
        const openM = toMin(parsed.start), closeM = toMin(parsed.end);
        if (openM > slotMinM) {
          const s = Math.max(slotMinM, openM - LABEL_DURATION), e = openM;
          if (e - s >= LABEL_MIN_DURATION) events.push(makeLabelEvent(dateStr, s, e, `${parsed.start} 営業開始`, 'open'));
        }
        if (closeM < slotMaxM) {
          const s = closeM, e = Math.min(slotMaxM, closeM + LABEL_DURATION);
          if (e - s >= LABEL_MIN_DURATION) events.push(makeLabelEvent(dateStr, s, e, `${parsed.end} 営業終了`, 'close'));
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return events;
  }

  function makeLabelEvent(dateStr, startMin, endMin, title, type) {
    return {
      start: `${dateStr}T${toHHMM(startMin)}:00`,
      end:   `${dateStr}T${toHHMM(endMin)}:00`,
      title: title,
      display: 'block',
      editable: false, startEditable: false, durationEditable: false,
      classNames: ['shift-marker', `shift-marker-${type}`],
      extendedProps: { isMarker: true, markerType: type },
    };
  }

  function buildOffHoursBackground(startDate, endDate, dayMap) {
    const events = [];
    const slotMin = Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5);
    const slotMax = Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5);
    const BG_COLOR = '#475569';
    const cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(endDate);   endDay.setHours(0, 0, 0, 0);
    while (cursor <= endDay) {
      const dateStr = Utils.fmtDate(cursor);
      const rec = dayMap[dateStr];
      const parsed = Utils.parseHourRange(rec && rec['営業パターン'] && rec['営業パターン'].value);
      if (!parsed) {
        events.push({ start: `${dateStr}T${slotMin}:00`, end: `${dateStr}T${slotMax}:00`,
          display: 'background', backgroundColor: BG_COLOR, classNames: ['offhours-bg'], groupId: 'offhours' });
      } else {
        if (parsed.start > slotMin) {
          events.push({ start: `${dateStr}T${slotMin}:00`, end: `${dateStr}T${parsed.start}:00`,
            display: 'background', backgroundColor: BG_COLOR, classNames: ['offhours-bg'], groupId: 'offhours' });
        }
        if (parsed.end < slotMax) {
          events.push({ start: `${dateStr}T${parsed.end}:00`, end: `${dateStr}T${slotMax}:00`,
            display: 'background', backgroundColor: BG_COLOR, classNames: ['offhours-bg'], groupId: 'offhours' });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return events;
  }

  function offHoursEventSource(fetchInfo, success, failure) {
    const viewType = fetchInfo.view && fetchInfo.view.type;
    if (viewType === 'dayGridMonth') { success([]); return; }
    const start = fetchInfo.start;
    const end = new Date(fetchInfo.end);
    end.setDate(end.getDate() - 1);
    Api.fetchDayMasters(start, end)
      .then((dayMap) => {
        success([...buildOffHoursBackground(start, end, dayMap), ...buildOpenCloseLabels(start, end, dayMap)]);
      })
      .catch((e) => { err('[シミュ]日付マスタ取得失敗(背景)', e); failure(e); });
  }

  // 対象月を取得（ミニカレンダーの表示月 > FC view > 今日 の優先順）
  function getTargetMonth() {
    const MC = App.MiniCalendar;
    if (MC && MC.getMonth) {
      const mo = MC.getMonth();
      if (mo) return mo;
    }
    const d = (fc && fc.view && fc.view.currentStart) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  // ── 現場シフト取り込み（完全上書き・月単位）
  async function importFromProduction(container) {
    if (!fc) return;
    const { year, month } = getTargetMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd   = new Date(year, month + 1, 0);
    const rangeLabel = `${year}年${month + 1}月 (${Utils.fmtDate(monthStart)} 〜 ${Utils.fmtDate(monthEnd)})`;

    const ok = confirm(
      `現場シフト(app${Config.SHIFT_APP_ID}) → シミュレーション(app${Config.SIMULATION_APP_ID}) 取り込み\n\n` +
      `対象月: ${rangeLabel}\n\n` +
      `※ この月のシミュレーションデータは全て削除され、現場シフトの内容で上書きされます。\n` +
      `続行しますか？`
    );
    if (!ok) return;

    const btn = container.querySelector('.btn-sim-import');
    if (btn) { btn.disabled = true; btn.textContent = '取り込み中...'; }

    try {
      // 1. シミュの対象月レコードを取得→削除
      const simRecords = await Api.fetchShifts(monthStart, monthEnd, Config.SIMULATION_APP_ID);
      const simIds = simRecords.map((r) => r.$id.value);
      log('[シミュ]取り込み: 既存削除', { 件数: simIds.length });
      await Api.deleteShiftsBulk(simIds, Config.SIMULATION_APP_ID);

      // 2. 現場シフトの対象月レコードを取得
      const prodRecords = await Api.fetchShifts(monthStart, monthEnd, Config.SHIFT_APP_ID);
      log('[シミュ]取り込み: 現場取得', { 件数: prodRecords.length });

      // 3. シミュへ一括作成
      const F = Config.SHIFT_FIELDS;
      const dataList = prodRecords.map((r) => ({
        [F.employeeNumber]: (r[F.employeeNumber] && r[F.employeeNumber].value) || '',
        [F.placementType]:  (r[F.placementType]  && r[F.placementType].value)  || '',
        [F.startDate]:      (r[F.startDate]      && r[F.startDate].value)      || '',
        [F.startTime]:      (r[F.startTime]      && r[F.startTime].value)      || '',
        [F.endDate]:        (r[F.endDate]        && r[F.endDate].value)        || '',
        [F.endTime]:        (r[F.endTime]        && r[F.endTime].value)        || '',
        [F.breakStartTime]: (r[F.breakStartTime] && r[F.breakStartTime].value) || '',
        [F.breakEndTime]:   (r[F.breakEndTime]   && r[F.breakEndTime].value)   || '',
      }));
      await Api.createShiftsBulk(dataList, Config.SIMULATION_APP_ID);
      log('[シミュ]取り込み完了', { 削除: simIds.length, 作成: dataList.length });

      fc.refetchEvents();
      // 月間時間を再集計して凡例に反映
      if (App.MonthlyHours && App.MonthlyHours.clearCache) {
        App.MonthlyHours.clearCache();
        await App.MonthlyHours.setMonth(year, month);
        if (App.Legend && App.Legend.refreshHoursText) App.Legend.refreshHoursText();
      }
      alert(`取り込み完了\n対象月: ${rangeLabel}\n削除: ${simIds.length}件 / 作成: ${dataList.length}件`);
    } catch (e) {
      err('[シミュ]取り込み失敗', e);
      alert('取り込みに失敗しました: ' + (e && e.message ? e.message : JSON.stringify(e)));
    } finally {
      if (btn) btn.disabled = false;
      Simulation.updateImportLabel();
    }
  }

  const Simulation = {
    async initIfNeeded(container, initialDate) {
      if (inited) return;
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendarライブラリが読み込まれていません（シミュレーション）');
        container.querySelector('#sim-calendar').innerHTML =
          '<div style="padding:20px;color:#c53030;">FullCalendar が読み込まれていません。</div>';
        return;
      }
      inited = true;
      const calEl = container.querySelector('#sim-calendar');

      fc = new FullCalendar.Calendar(calEl, {
        locale:            Config.CALENDAR.LOCALE,
        initialView:       Config.CALENDAR.INITIAL_VIEW,
        initialDate:       initialDate || undefined,
        slotMinTime:       Config.CALENDAR.SLOT_MIN_TIME,
        slotMaxTime:       Config.CALENDAR.SLOT_MAX_TIME,
        slotDuration:      Config.CALENDAR.SLOT_DURATION,
        snapDuration:      Config.CALENDAR.SNAP_DURATION,
        slotLabelInterval: Config.CALENDAR.SLOT_LABEL_INTERVAL,
        firstDay: 0, allDaySlot: false, headerToolbar: false,
        selectable: true, editable: true,
        eventDurationEditable: true, eventStartEditable: true,
        nowIndicator: true, height: 'auto', expandRows: false,
        slotLabelFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true, meridiem: false, hour12: false },
        eventSources: [
          { id: 'sim-shifts',   events: eventSource },
          { id: 'sim-offhours', events: offHoursEventSource },
        ],
        datesSet: () => updateDateTitle(container),
        dayHeaderDidMount: (info) => {
          const name = Utils.isHoliday(info.date);
          if (name) {
            info.el.classList.add('is-holiday');
            const cushion = info.el.querySelector('.fc-col-header-cell-cushion') || info.el;
            if (!cushion.querySelector('.holiday-name')) {
              const span = document.createElement('span');
              span.className = 'holiday-name'; span.textContent = name;
              cushion.appendChild(span);
            }
          }
        },
        dayCellDidMount: (info) => { if (Utils.isHoliday(info.date)) info.el.classList.add('is-holiday'); },
        eventDidMount: (info) => {
          const p = info.event.extendedProps || {};
          if (p.isMarker) return;
          if (p.placement != null) info.el.dataset.placement = p.placement || 'none';
          applyBreakOverlay(info.el, info.event, info.view);
        },
        select: (info) => {
          App.ShiftDialog.showCreate(info.start, info.end, () => fc.refetchEvents(),
            { appId: Config.SIMULATION_APP_ID });
          fc.unselect();
        },
        eventClick: (info) => {
          if (info.event.extendedProps.isMarker) return;
          App.ShiftDialog.showEdit(info.event.extendedProps.record, () => fc.refetchEvents(),
            { appId: Config.SIMULATION_APP_ID });
        },
        eventDrop: async (info) => {
          if (info.event.extendedProps.isMarker) { info.revert(); return; }
          await handleEventTimeChange(info, 'ドラッグ移動');
          applyBreakOverlay(info.el, info.event, info.view);
        },
        eventResize: async (info) => {
          if (info.event.extendedProps.isMarker) { info.revert(); return; }
          await handleEventTimeChange(info, 'リサイズ');
          applyBreakOverlay(info.el, info.event, info.view);
        },
      });

      fc.render();
      setActiveViewBtn(container, Config.CALENDAR.INITIAL_VIEW);
      updateDateTitle(container);
      Simulation.updateImportLabel();
      log('[シミュ]FullCalendar 初期化完了');
    },

    onShow() { if (fc) setTimeout(() => fc.updateSize(), 0); },
    gotoDate(date) { if (fc && date) fc.gotoDate(date); },
    refreshEvents() { if (fc) fc.refetchEvents(); },
    isInitialized() { return inited; },

    // 取り込みボタンのラベルをミニカレンダーの表示月に合わせて更新
    updateImportLabel() {
      const container = document.querySelector('[data-panel="simulation"]');
      if (!container) return;
      const btn = container.querySelector('.btn-sim-import');
      if (!btn) return;
      const { year, month } = getTargetMonth();
      btn.textContent = `${month + 1}月 現場シフト取り込み`;
      btn.title = `${year}年${month + 1}月のシミュレーションを現場シフトで上書き`;
    },

    bindToolbar(container) {
      const q = (sel) => container.querySelector(sel);
      q('.sim-btn-prev')  && (q('.sim-btn-prev').onclick  = () => { fc && fc.prev(); });
      q('.sim-btn-next')  && (q('.sim-btn-next').onclick  = () => { fc && fc.next(); });
      q('.sim-btn-today') && (q('.sim-btn-today').onclick = () => { fc && fc.today(); });
      container.querySelectorAll('.sim-view-btn').forEach((btn) => {
        btn.onclick = () => {
          if (!fc) return;
          fc.changeView(btn.dataset.view);
          setActiveViewBtn(container, btn.dataset.view);
        };
      });
      const importBtn = q('.btn-sim-import');
      if (importBtn) importBtn.onclick = () => importFromProduction(container);
    },

    buildPanelHtml() {
      return `
        <div class="fc-toolbar-row sim-toolbar-row">
          <div class="nav-group">
            <button class="sim-btn-prev">◀</button>
            <button class="sim-btn-today">今日</button>
            <button class="sim-btn-next">▶</button>
            <span class="sim-date-title date-title"></span>
          </div>
          <div class="nav-group">
            <button class="sim-view-btn view-btn" data-view="timeGridDay">日</button>
            <button class="sim-view-btn view-btn" data-view="timeGridWeek">週</button>
            <button class="sim-view-btn view-btn" data-view="dayGridMonth">月</button>
            <button class="btn-sim-import" type="button" title="表示中月を現場シフトで上書き">現場シフト取り込み</button>
          </div>
        </div>
        <div id="sim-calendar"></div>`;
    },
  };

  App.Simulation = Simulation;
})();
