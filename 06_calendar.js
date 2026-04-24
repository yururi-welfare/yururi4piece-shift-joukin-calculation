/**
 * 放デイシフト - カレンダータブ (FullCalendar)
 * アプリ60のシフトをカレンダー表示、空きスロットクリック→登録ダイアログ
 * 読み込み順: 6（ダイアログ・mainより前）
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, Utils, log, err } = App;

  let fc = null;              // FullCalendar インスタンス
  let inited = false;
  let suppressDateChange = false;  // 外部からgotoDateで動かした時の自己通知抑止
  let toastTimer = null;

  // 閲覧専用トースト（画面中央下に2秒表示）
  function showReadonlyToast() {
    let el = document.getElementById('shift-readonly-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shift-readonly-toast';
      el.className = 'shift-readonly-toast';
      el.textContent = '🔒 カレンダータブは閲覧専用です。編集はシミュレーションタブから行ってください。';
      document.body.appendChild(el);
    }
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  // ラベル: アクティブビューボタンの更新
  function setActiveViewBtn(container, viewName) {
    container.querySelectorAll('.view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
  }

  // 日付タイトル更新
  function updateDateTitle(container) {
    if (!fc) return;
    const el = container.querySelector('.date-title');
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

  // 資格配列（複数選択の場合に対応）
  function readQualificationList(rec) {
    const F = Config.SHIFT_FIELDS;
    const field = rec[F.qualification];
    if (!field) return [];
    const v = field.value;
    if (Array.isArray(v)) return v;
    return v ? [v] : [];
  }

  // アプリ60のレコード → FullCalendarイベント変換
  function recordToEvent(rec) {
    const F = Config.SHIFT_FIELDS;
    const startDate = rec[F.startDate] && rec[F.startDate].value;
    const startTime = (rec[F.startTime] && rec[F.startTime].value) || '00:00';
    const endDate   = rec[F.endDate]   && rec[F.endDate].value;
    const endTime   = (rec[F.endTime]   && rec[F.endTime].value) || startTime;
    if (!startDate) return null;
    const name = (rec[F.employeeName] && rec[F.employeeName].value) || '(未設定)';
    const empNum = (rec[F.employeeNumber] && rec[F.employeeNumber].value) || '';
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
      extendedProps: {
        record: rec,
        placement: placement,
        employeeNumber: empNum,
      },
    };
  }

  // 配置の種類に応じた色（サイドバー凡例と同じ色で塗りつぶし）
  // 色が薄めなので文字は濃色で可読性を確保
  function placementColors(placement) {
    const legend = (Config.LEGEND_COLORS && Config.LEGEND_COLORS.placement) || {};
    const color = legend[placement] || '#9aa4b2';
    return { bg: color, border: color, text: '#1a202c' };
  }

  // 休憩時間帯だけ色を薄める縦方向オーバーレイ
  // 週/日ビューのみ対象。背景色はFCが設定済みなので background-image のみ操作
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

  // Date → "YYYY-MM-DD"
  function toDateStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  // Date → "HH:MM"
  function toTimeStr(d) {
    return String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  // イベントソース：FullCalendarが求める期間を受け取り、app60から取得
  function eventSource(fetchInfo, success, failure) {
    const start = fetchInfo.start;
    const end = new Date(fetchInfo.end);
    end.setDate(end.getDate() - 1);
    Api.fetchShifts(start, end)
      .then((records) => {
        const events = records.map(recordToEvent).filter(Boolean);
        success(events);
      })
      .catch((e) => { err('events取得失敗', e); failure(e); });
  }

  // 営業時間外を示すグレー背景＋営業開始/終了ラベル
  // 週・日ビューのみ描画（月ビューでは空を返す）
  function offHoursEventSource(fetchInfo, success, failure) {
    const viewType = fetchInfo.view && fetchInfo.view.type;
    if (viewType === 'dayGridMonth') { success([]); return; }

    const start = fetchInfo.start;
    const end = new Date(fetchInfo.end);
    end.setDate(end.getDate() - 1);
    Api.fetchDayMasters(start, end)
      .then((dayMap) => {
        const bg     = buildOffHoursBackground(start, end, dayMap);
        const labels = buildOpenCloseLabels(start, end, dayMap);
        success([...bg, ...labels]);
      })
      .catch((e) => { err('日付マスタ取得失敗(背景)', e); failure(e); });
  }

  // "HH:MM" ↔ 分 の相互変換
  function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function toHHMM(m) {
    const h = Math.floor(m / 60), mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // 営業開始/終了ラベルの "マーカーイベント" を生成
  // - 開始ラベル: 営業開始時刻の直前30分間（営業開始時刻に下端が接する）
  // - 終了ラベル: 営業終了時刻の直後30分間（営業終了時刻に上端が接する）
  // → 15分グリッドにぴったり収まる
  function buildOpenCloseLabels(startDate, endDate, dayMap) {
    const events = [];
    const slotMinM = toMin(Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5));
    const slotMaxM = toMin(Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5));
    const LABEL_MIN_DURATION = 15;
    const LABEL_DURATION     = 30;

    const cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(endDate);   endDay.setHours(0, 0, 0, 0);

    while (cursor <= endDay) {
      const dateStr = Utils.fmtDate(cursor);
      const rec = dayMap[dateStr];
      const patternStr = rec && rec['営業パターン'] && rec['営業パターン'].value;
      const parsed = Utils.parseHourRange(patternStr);

      if (parsed) {
        const openM  = toMin(parsed.start);
        const closeM = toMin(parsed.end);

        // 開始ラベル: (open - 30) 〜 open。slotMin より前にはみ出さないようクランプ
        if (openM > slotMinM) {
          const s = Math.max(slotMinM, openM - LABEL_DURATION);
          const e = openM;
          if (e - s >= LABEL_MIN_DURATION) {
            events.push(makeLabelEvent(dateStr, s, e, `${parsed.start} 営業開始`, 'open'));
          }
        }
        // 終了ラベル: close 〜 (close + 30)。slotMax を越えないようクランプ
        if (closeM < slotMaxM) {
          const s = closeM;
          const e = Math.min(slotMaxM, closeM + LABEL_DURATION);
          if (e - s >= LABEL_MIN_DURATION) {
            events.push(makeLabelEvent(dateStr, s, e, `${parsed.end} 営業終了`, 'close'));
          }
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
      editable: false,
      startEditable: false,
      durationEditable: false,
      classNames: ['shift-marker', `shift-marker-${type}`],
      extendedProps: { isMarker: true, markerType: type },
    };
  }

  // 営業時間外スロットの背景イベント配列を生成
  function buildOffHoursBackground(startDate, endDate, dayMap) {
    const events = [];
    const slotMin = Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5); // "08:00"
    const slotMax = Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5); // "19:00"
    // FullCalendarが背景イベントに opacity をかけるためベース色は濃いめにする
    // 視覚濃度はCSSの .fc-bg-event.offhours-bg で opacity 調整
    const BG_COLOR = '#475569';

    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(endDate);
    endDay.setHours(0, 0, 0, 0);

    while (cursor <= endDay) {
      const dateStr = Utils.fmtDate(cursor);
      const rec = dayMap[dateStr];
      const patternStr = rec && rec['営業パターン'] && rec['営業パターン'].value;
      const parsed = Utils.parseHourRange(patternStr);

      if (!parsed) {
        // 営業パターン未設定 → 全スロットをグレー
        events.push({
          start: `${dateStr}T${slotMin}:00`,
          end:   `${dateStr}T${slotMax}:00`,
          display: 'background',
          backgroundColor: BG_COLOR,
          classNames: ['offhours-bg'],
          groupId: 'offhours',
        });
      } else {
        // slotMin 〜 営業開始
        if (parsed.start > slotMin) {
          events.push({
            start: `${dateStr}T${slotMin}:00`,
            end:   `${dateStr}T${parsed.start}:00`,
            display: 'background',
            backgroundColor: BG_COLOR,
            classNames: ['offhours-bg'],
            groupId: 'offhours',
          });
        }
        // 営業終了 〜 slotMax
        if (parsed.end < slotMax) {
          events.push({
            start: `${dateStr}T${parsed.end}:00`,
            end:   `${dateStr}T${slotMax}:00`,
            display: 'background',
            backgroundColor: BG_COLOR,
            classNames: ['offhours-bg'],
            groupId: 'offhours',
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return events;
  }

  const Calendar = {
    // タブ初回表示時にFullCalendarを生成
    // initialDate: 初期表示日（チェック表の週開始と同期するため）
    async initIfNeeded(container, initialDate) {
      if (inited) return;
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendarライブラリが読み込まれていません（CDN読み込み順を確認）');
        container.querySelector('#fc-calendar').innerHTML =
          '<div style="padding:20px;color:#c53030;">FullCalendar が読み込まれていません。kintoneのJSカスタマイズに CDN を追加してください。</div>';
        return;
      }

      inited = true;
      const calEl = container.querySelector('#fc-calendar');

      fc = new FullCalendar.Calendar(calEl, {
        locale:            Config.CALENDAR.LOCALE,
        initialView:       Config.CALENDAR.INITIAL_VIEW,
        initialDate:       initialDate || undefined,
        slotMinTime:       Config.CALENDAR.SLOT_MIN_TIME,
        slotMaxTime:       Config.CALENDAR.SLOT_MAX_TIME,
        slotDuration:      Config.CALENDAR.SLOT_DURATION,
        snapDuration:      Config.CALENDAR.SNAP_DURATION,
        slotLabelInterval: Config.CALENDAR.SLOT_LABEL_INTERVAL,
        firstDay:      0,      // 日曜始まり
        allDaySlot:    false,
        headerToolbar: false,  // カスタムツールバー使用
        selectable:    false,  // 読み取り専用: 空き枠クリックでの新規登録を無効化
        editable:      false,  // 読み取り専用: ドラッグ移動・リサイズを無効化
        eventDurationEditable: false,
        eventStartEditable:    false,
        nowIndicator:  true,
        height:        'auto',
        expandRows:    false,
        slotLabelFormat: {
          hour: 'numeric', minute: '2-digit', omitZeroMinute: true,
          meridiem: false, hour12: false,
        },
        eventSources: [
          { id: 'shifts',   events: eventSource },
          { id: 'offhours', events: offHoursEventSource },
        ],
        datesSet: () => {
          updateDateTitle(container);
          // 外部からgotoDateで動かしたときは自己通知を抑止（ループ防止）
          if (suppressDateChange) return;
          if (typeof Calendar.onDateChange === 'function') {
            Calendar.onDateChange(fc.view.currentStart);
          }
        },

        // 曜日ヘッダー: 祝日クラス付与＋祝日名表示
        dayHeaderDidMount: (info) => {
          const name = Utils.isHoliday(info.date);
          if (name) {
            info.el.classList.add('is-holiday');
            const cushion = info.el.querySelector('.fc-col-header-cell-cushion') || info.el;
            // 重複追加を防止
            if (!cushion.querySelector('.holiday-name')) {
              const span = document.createElement('span');
              span.className = 'holiday-name';
              span.textContent = name;
              cushion.appendChild(span);
            }
          }
        },

        // 月ビューの各日付セル
        dayCellDidMount: (info) => {
          if (Utils.isHoliday(info.date)) {
            info.el.classList.add('is-holiday');
          }
        },
        // イベントDOMに凡例フィルタ用の data-* を付与＋休憩帯オーバーレイ
        eventDidMount: (info) => {
          const p = info.event.extendedProps || {};
          if (p.isMarker) return;
          if (p.placement != null)      info.el.dataset.placement      = p.placement || 'none';
          if (p.employeeNumber != null) info.el.dataset.employeeNumber = p.employeeNumber || 'none';
          applyBreakOverlay(info.el, info.event, info.view);
        },
        // 読み取り専用: select/eventDrop/eventResize は無効化
        // eventClick は残し、クリック時に案内トーストを表示
        eventClick: (info) => {
          if (info.event.extendedProps.isMarker) return;
          showReadonlyToast();
        },
      });

      fc.render();
      setActiveViewBtn(container, Config.CALENDAR.INITIAL_VIEW);
      updateDateTitle(container);
      log('FullCalendar 初期化完了');
    },

    // タブ切替後のサイズ調整（非表示→表示時は再計算が必要）
    onShow() {
      if (fc) setTimeout(() => fc.updateSize(), 0);
    },

    // 外部(チェック表)から指定日付へ移動（datesSetの自己通知を抑止）
    gotoDate(date) {
      if (!fc || !date) return;
      suppressDateChange = true;
      try { fc.gotoDate(date); }
      finally { setTimeout(() => { suppressDateChange = false; }, 0); }
    },

    // 現在カレンダーが表示している基準日（初期化前はnull）
    getCurrentDate() {
      return fc ? fc.view.currentStart : null;
    },

    // 外部から差し替え可能なフック： 日付変更時に main が受け取る
    onDateChange: null,

    // 営業パターンが別タブで更新されたときに、背景(営業時間外)のみ再取得
    refreshBackground() {
      if (!fc) return;
      const src = fc.getEventSourceById('offhours');
      if (src) src.refetch();
    },

    // タブ切替時に呼ぶ：シフト＋背景を全再取得
    refreshEvents() {
      if (!fc) return;
      fc.refetchEvents();
    },

    // 初期化済みかどうか（タブ切替時に「初回」と「2回目以降」を区別するため）
    isInitialized() { return inited; },

    bindToolbar(container) {
      // ページ送り（前/次/今日）は共通ナビ(タブ右隣)に集約。ここではビュー切替のみ。
      container.querySelectorAll('.view-btn').forEach((btn) => {
        btn.onclick = () => {
          if (!fc) return;
          fc.changeView(btn.dataset.view);
          setActiveViewBtn(container, btn.dataset.view);
        };
      });
    },

    // パネルのHTML（空の状態）
    // ページ送りは共通ナビ（タブ右隣）で行うため、ここではタイトル・ビュー切替のみ
    buildPanelHtml() {
      return `
        <div class="fc-toolbar-row">
          <div class="nav-group">
            <span class="date-title"></span>
          </div>
          <div class="nav-group">
            <span class="readonly-badge" title="編集はシミュレーションタブから">🔒 閲覧専用</span>
            <button class="view-btn" data-view="timeGridDay">日</button>
            <button class="view-btn" data-view="timeGridWeek">週</button>
            <button class="view-btn" data-view="dayGridMonth">月</button>
          </div>
        </div>
        <div id="fc-calendar"></div>`;
    },
  };

  App.Calendar = Calendar;
})();
