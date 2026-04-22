/**
 * 放デイシフト 表示専用アプリ カスタマイズ
 *
 * 一覧画面の「カスタマイズビュー」に週間シフト表を描画する。
 * レコードが0件でも必ず表が描画される（GUIの入力台紙として機能）。
 */
(function () {
  'use strict';

  const TAG = '[放デイシフト]';
  const log  = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);
  const err  = (...args) => console.error(TAG, ...args);

  // ▼ 設定 ────────────────────────────────────────────
  // カスタマイズビューのID（数値）。null のままだと全ビューで動作。
  // ログ出力の「viewId: XXXX」を見てここに貼り付ける。
  const VIEW_ID   = null;
  const ROOT_ID   = 'shift-root';         // HTML欄に書いたdivのID
  const DAY_MASTER_APP_ID = 57;           // 日付マスタ
  // ────────────────────────────────────────────────

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  const PATTERNS = {
    '10:00〜18:00': { 営業: '10:00〜18:00', サービス: '11:00〜17:00' },
    '9:30〜16:30':  { 営業: '9:30〜16:30',  サービス: '10:00〜16:30' },
  };

  // ── ユーティリティ ────────────────────────────────
  function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay()); // 日曜始まり
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const fmtDate = (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  const fmtMD = (d) => (d.getMonth() + 1) + '/' + d.getDate();
  const isHoliday = (d) => {
    try {
      return (window.JapaneseHolidays && window.JapaneseHolidays.isHoliday(d)) || null;
    } catch (_) { return null; }
  };
  // 祝日は日曜と同じ赤色スタイルにする（'sun'クラス再利用）
  const cellClass = (d) => {
    if (isHoliday(d)) return 'sun';
    return d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : '';
  };

  function getPatternValues(record) {
    const p = record && record['営業パターン'] && record['営業パターン'].value;
    return p && PATTERNS[p] ? PATTERNS[p] : null;
  }

  // ── 日付マスタ 保存系 ──────────────────────────────
  async function saveDayPattern(dateStr, newPattern, existingRecordId) {
    try {
      // パターンクリア → レコード削除
      if (!newPattern && existingRecordId) {
        log('レコード削除', { recordId: existingRecordId, date: dateStr });
        await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'DELETE',
          { app: DAY_MASTER_APP_ID, ids: [existingRecordId] }
        );
        return;
      }
      // 既存更新
      if (existingRecordId) {
        log('レコード更新', { recordId: existingRecordId, date: dateStr, pattern: newPattern });
        await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'PUT',
          {
            app: DAY_MASTER_APP_ID,
            id: existingRecordId,
            record: { 営業パターン: { value: newPattern } },
          }
        );
        return;
      }
      // 新規作成
      if (newPattern) {
        log('レコード新規作成', { date: dateStr, pattern: newPattern });
        await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'POST',
          {
            app: DAY_MASTER_APP_ID,
            record: {
              営業日: { value: dateStr },
              営業パターン: { value: newPattern },
            },
          }
        );
      }
    } catch (e) {
      err('保存失敗', e);
      alert('保存に失敗しました: ' + (e.message || JSON.stringify(e)));
      throw e;
    }
  }

  // ── 日付マスタ取得 ─────────────────────────────────
  async function fetchDayMasters(startDate) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    const query =
      `営業日 >= "${fmtDate(startDate)}" and 営業日 <= "${fmtDate(end)}" order by 営業日 asc`;
    log('日付マスタ取得開始', { app: DAY_MASTER_APP_ID, query });
    try {
      const res = await kintone.api(
        kintone.api.url('/k/v1/records', true),
        'GET',
        { app: DAY_MASTER_APP_ID, query: query }
      );
      log('日付マスタ取得成功', { 件数: res.records.length, records: res.records });
      const map = {};
      res.records.forEach((r) => { map[r['営業日'].value] = r; });
      return map;
    } catch (e) {
      err('日付マスタ取得失敗（App未作成／権限不足／フィールドコード相違の可能性）', e);
      return {};
    }
  }

  // ── スタッフ行 ─────────────────────────────────────
  function renderStaffRows(days) {
    const empty = () => days.map((d) => `<td class="cell ${cellClass(d)}"></td>`).join('');
    return `
      <tr><td class="row-label" colspan="2">管理者兼\n児発管</td>${empty()}</tr>
      <tr><td class="row-label" colspan="2">常勤専従</td>${empty()}</tr>
      <tr>
        <td class="row-label vertical" rowspan="3">常勤換算1人</td>
        <td class="row-label">1人目</td>${empty()}
      </tr>
      <tr><td class="row-label">2人目</td>${empty()}</tr>
      <tr><td class="row-label"></td>${empty()}</tr>
      <tr><td class="row-label" colspan="2">休憩</td>${empty()}</tr>`;
  }

  // ── テーブル組み立て ───────────────────────────────
  function buildTable(startDate, dayMap) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    const dateHeader = days.map((d) => {
      const holiday = isHoliday(d);
      const sub = holiday ? `<div class="holiday-name">${holiday}</div>` : '';
      return `<th class="${cellClass(d)}">${fmtMD(d)} (${WEEKDAYS[d.getDay()]})${sub}</th>`;
    }).join('');

    // 営業時間：プレーンなセル（クリックで編集モード）
    const rowEigyou = days.map((d) => {
      const dateStr = fmtDate(d);
      const rec = dayMap[dateStr];
      const current = (rec && rec['営業パターン'] && rec['営業パターン'].value) || '';
      const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
      const text = current || '未設定';
      const emptyCls = current ? '' : 'is-empty';
      return `<td class="cell eigyou ${cellClass(d)}" data-eigyou-for="${dateStr}" data-record-id="${recordId}" data-current="${current}"><span class="eigyou-display ${emptyCls}">${text}</span></td>`;
    }).join('');

    // サービス提供時間：表示のみ（営業パターンから導出）
    const rowService = days.map((d) => {
      const dateStr = fmtDate(d);
      const rec = dayMap[dateStr];
      const p = getPatternValues(rec);
      const val = p ? p.サービス : '';
      return `<td class="cell derived ${cellClass(d)}" data-service-for="${dateStr}">${val}</td>`;
    }).join('');

    const empty = () => days.map((d) => `<td class="cell ${cellClass(d)}"></td>`).join('');

    return `
    <table class="shift-table">
      <colgroup>
        <col style="width:32px">
        <col style="width:110px">
        <col><col><col><col><col><col><col>
      </colgroup>
      <thead><tr><th colspan="2"></th>${dateHeader}</tr></thead>
      <tbody>
        <tr class="group-header"><td colspan="9">日の情報</td></tr>
        <tr><td class="row-label" colspan="2">営業時間</td>${rowEigyou}</tr>
        <tr><td class="row-label" colspan="2">サービス\n提供時間</td>${rowService}</tr>

        <tr class="group-header"><td colspan="9">スタッフ配置</td></tr>
        ${renderStaffRows(days)}

        <tr class="group-header"><td colspan="9">加算・備考</td></tr>
        <tr><td class="row-label" colspan="2">体制加算</td>${empty()}</tr>
        <tr><td class="row-label" colspan="2">備考</td>${empty()}</tr>
      </tbody>
    </table>`;
  }

  function buildHeader(startDate) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    return `
      <div class="shift-nav">
        <button class="btn-prev">◀ 前の週</button>
        <span class="week-label">${startDate.getFullYear()}年 ${fmtMD(startDate)} 〜 ${fmtMD(end)}</span>
        <button class="btn-next">次の週 ▶</button>
        <button class="btn-today">今週</button>
        <span class="saving-indicator" data-role="saving"></span>
      </div>`;
  }

  // ── 保存インジケータ ───────────────────────────────
  let indicatorTimer = null;
  function setIndicator(root, text, state) {
    const el = root.querySelector('[data-role="saving"]');
    if (!el) return;
    clearTimeout(indicatorTimer);
    el.textContent = text;
    el.className = 'saving-indicator visible' + (state ? ' ' + state : '');
    if (state === 'saved') {
      indicatorTimer = setTimeout(() => {
        el.className = 'saving-indicator';
      }, 1500);
    }
  }

  // ── ルート要素を取得（なければ自動生成）──────────────
  // 既存のrootがあれば削除して作り直す（イベント再発火による重複防止）
  function ensureRoot() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = ROOT_ID;

    // 挿入先の優先順位：標準レコード一覧の直前 → contents-gaia の先頭
    const listView =
      document.querySelector('.gaia-argoui-app-index-listview') ||
      document.querySelector('.recordlist-gaia') ||
      document.querySelector('.gaia-argoui-list');

    if (listView && listView.parentNode) {
      listView.parentNode.insertBefore(root, listView);
      log('標準一覧の直前にルート要素を挿入', listView);
    } else {
      const contents = document.querySelector('.contents-gaia') || document.body;
      contents.insertBefore(root, contents.firstChild);
      log('contents-gaia の先頭にルート要素を挿入', contents);
    }
    return root;
  }

  // ── 描画 ─────────────────────────────────────────
  let currentWeekStart = startOfWeek(new Date());
  let currentDayMap = {};

  async function render(root) {
    log('描画開始', { week: fmtDate(currentWeekStart) });
    root.innerHTML = buildHeader(currentWeekStart) + buildTable(currentWeekStart, {});
    bindNav(root);
    bindPatternSelects(root);

    const dayMap = await fetchDayMasters(currentWeekStart);
    currentDayMap = dayMap;
    applyDayMapToCells(root, dayMap);
    log('描画完了');
  }

  // dayMapの内容を「既存DOMのセル」に反映（再描画せずに更新）
  function applyDayMapToCells(root, dayMap) {
    root.querySelectorAll('td.eigyou').forEach((td) => {
      // 編集中は触らない
      if (td.classList.contains('editing')) return;
      const dateStr = td.dataset.eigyouFor;
      const rec = dayMap[dateStr];
      const current = (rec && rec['営業パターン'] && rec['営業パターン'].value) || '';
      const recordId = (rec && rec['$id'] && rec['$id'].value) || '';
      td.dataset.current = current;
      td.dataset.recordId = recordId;
      const display = td.querySelector('.eigyou-display');
      if (display) {
        display.textContent = current || '未設定';
        display.classList.toggle('is-empty', !current);
      }
    });
    root.querySelectorAll('[data-service-for]').forEach((td) => {
      const dateStr = td.dataset.serviceFor;
      const rec = dayMap[dateStr];
      const p = getPatternValues(rec);
      td.textContent = p ? p.サービス : '';
    });
  }

  // 営業時間セルをクリックしたら編集モードに入る
  function bindPatternSelects(root) {
    root.querySelectorAll('td.eigyou').forEach((td) => {
      td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;
        enterEditMode(td, root);
      });
    });
  }

  function enterEditMode(td, root) {
    const current = td.dataset.current || '';
    const dateStr = td.dataset.eigyouFor;
    const recordId = td.dataset.recordId || '';

    const options = ['', ...Object.keys(PATTERNS)]
      .map((opt) =>
        `<option value="${opt}" ${opt === current ? 'selected' : ''}>${opt || '未設定'}</option>`
      ).join('');

    td.classList.add('editing');
    td.innerHTML = `<select class="pattern-select">${options}</select>`;
    const sel = td.querySelector('select');
    sel.focus();
    try { sel.showPicker && sel.showPicker(); } catch (_) {}

    let finished = false;
    const exit = () => {
      if (finished) return;
      finished = true;
      td.classList.remove('editing');
      // 表示モードに戻す
      td.innerHTML = `<span class="eigyou-display ${td.dataset.current ? '' : 'is-empty'}">${td.dataset.current || '未設定'}</span>`;
    };

    sel.addEventListener('change', async () => {
      const newPattern = sel.value;
      if (newPattern === current) { exit(); return; }

      log('営業パターン変更', { date: dateStr, pattern: newPattern, recordId });
      sel.classList.add('is-saving');
      sel.disabled = true;
      setIndicator(root, '保存中...', 'saving');

      try {
        await saveDayPattern(dateStr, newPattern, recordId);
        const fresh = await fetchDayMasters(currentWeekStart);
        currentDayMap = fresh;
        // 先にeditingを外し<select>を<span>へ戻してからセル更新（applyDayMapToCellsは.editingをskipするため）
        finished = true;
        td.classList.remove('editing');
        td.innerHTML = `<span class="eigyou-display ${newPattern ? '' : 'is-empty'}">${newPattern || '未設定'}</span>`;
        applyDayMapToCells(root, fresh);
        setIndicator(root, '✓ 保存しました', 'saved');
      } catch (_) {
        setIndicator(root, '保存失敗', 'saving');
        exit();
      }
    });

    sel.addEventListener('blur', () => {
      // change発火後にblurが来るケースもあるため遅延
      setTimeout(exit, 150);
    });

    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') exit();
    });
  }

  function bindNav(root) {
    const q = (sel) => root.querySelector(sel);
    if (q('.btn-prev')) q('.btn-prev').onclick = () => {
      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
      render(root);
    };
    if (q('.btn-next')) q('.btn-next').onclick = () => {
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      render(root);
    };
    if (q('.btn-today')) q('.btn-today').onclick = () => {
      currentWeekStart = startOfWeek(new Date());
      render(root);
    };
  }

  // ── 一覧画面イベント ───────────────────────────────
  kintone.events.on('app.record.index.show', function (event) {
    log('app.record.index.show 発火', {
      viewId: event.viewId,
      viewName: event.viewName,
      viewType: event.viewType,
      設定VIEW_ID: VIEW_ID,
    });

    if (VIEW_ID !== null && String(event.viewId) !== String(VIEW_ID)) {
      log(`viewId ${event.viewId} は対象外（期待: ${VIEW_ID}）スキップ`);
      return event;
    }

    const root = ensureRoot();
    render(root).catch((e) => err('描画失敗', e));
    return event;
  });

  log('スクリプト読み込み完了');
})();
