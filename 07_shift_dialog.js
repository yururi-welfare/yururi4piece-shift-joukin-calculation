/**
 * 放デイシフト - シフト登録ダイアログ
 * カレンダーからの新規登録・既存編集（削除）
 * 読み込み順: 7
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, log, err } = App;

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

  function removeModal() {
    const existing = document.querySelector('.shift-modal-overlay');
    if (existing) existing.remove();
  }

  // 資格フィールド(放デイゆるり_資格) を読み取る。
  // kintone のフィールド種別によって value が string or 配列になりうるため両対応
  function readQualification(record) {
    const F = Config.SHIFT_FIELDS;
    const field = record[F.qualification];
    if (!field) return '';
    const v = field.value;
    if (Array.isArray(v)) return v.join(' / ');
    return v || '';
  }

  // 15分刻みの時刻オプションを生成。範囲はカレンダーの SLOT_MIN_TIME〜SLOT_MAX_TIME と一致させる
  function buildTimeOptions(selectedValue) {
    const slotMin = Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5); // "08:00"
    const slotMax = Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5); // "19:00"
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fmt   = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const start = toMin(slotMin);
    const end   = toMin(slotMax);
    const opts = [];
    for (let m = start; m <= end; m += 15) {
      const t = fmt(m);
      const sel = t === selectedValue ? 'selected' : '';
      opts.push(`<option value="${t}" ${sel}>${t}</option>`);
    }
    return opts.join('');
  }

  // ── 休憩計算 ────────────────────────────────
  // 勤務時間（分）から自動で取る休憩分を返す
  // - 6時間以下(360分以下) → 0分（休憩なし）
  // - 6時間超〜8時間未満     → 45分
  // - 8時間以上              → 60分
  function calcBreakMinutes(workMin) {
    if (workMin <= 360) return 0;
    if (workMin < 480)  return 45;
    return 60;
  }

  function hhmmToMin(t) {
    const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function minToHHMM(m) {
    const h = Math.floor(m / 60), mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // 勤務時間(分)を算出。日またぎ非対応なので同日を想定。複数日ならnull
  function computeWorkMinutes(sDate, sTime, eDate, eTime) {
    if (!sDate || !sTime || !eDate || !eTime) return null;
    const s = new Date(`${sDate}T${sTime}:00`);
    const e = new Date(`${eDate}T${eTime}:00`);
    const diff = Math.round((e - s) / 60000);
    return diff > 0 ? diff : null;
  }

  // 全スタッフから選択可能（資格フィルタは廃止、配置の種類で意味付けする方針）
  async function buildStaffOptions(currentName) {
    const staff = await Api.fetchAllStaff();
    const opts = ['<option value="">— 選択 —</option>']
      .concat(staff.map((s) => {
        const sel = s.氏名 === currentName ? 'selected' : '';
        return `<option value="${s.氏名}" data-number="${s.従業員番号 || ''}" ${sel}>${s.氏名}</option>`;
      }));
    return opts.join('');
  }

  // 共通モーダル骨格
  function openModal(innerHtml) {
    removeModal();
    const overlay = document.createElement('div');
    overlay.className = 'shift-modal-overlay';
    overlay.innerHTML = `<div class="shift-modal">${innerHtml}</div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) removeModal();
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { removeModal(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  const ShiftDialog = {
    // 新規作成
    // options.placementType: 配置の種類ドロップダウンの初期値（チェック表セルから渡される）
    async showCreate(defaultStart, defaultEnd, onSaved, options = {}) {
      const startDateVal = toDateStr(defaultStart);
      const startTimeVal = toTimeStr(defaultStart);
      const endDateVal   = toDateStr(defaultEnd);
      const endTimeVal   = toTimeStr(defaultEnd);
      const breakStartVal = Config.DEFAULT_BREAK_START || '12:00';

      const staffOptions = await buildStaffOptions('');
      const titleSuffix = options.placementType ? `（${options.placementType}）` : '';
      const helperMsg = '※ 資格は従業員マスタから自動取得されます';
      const placementOptions = ['<option value="">— 選択 —</option>']
        .concat((Config.PLACEMENT_TYPES || []).map((p) => {
          const sel = p === options.placementType ? 'selected' : '';
          return `<option value="${p}" ${sel}>${p}</option>`;
        })).join('');

      const html = `
        <h3>シフトを登録${titleSuffix}</h3>
        <div class="field">
          <label>従業員</label>
          <select class="f-staff">${staffOptions}</select>
          <small style="color:#718096;font-size:12px;margin-top:2px;">${helperMsg}</small>
        </div>
        <div class="field">
          <label>配置の種類</label>
          <select class="f-placement">${placementOptions}</select>
        </div>
        <div class="row2">
          <div class="field">
            <label>開始日</label>
            <input type="date" class="f-start-date" value="${startDateVal}">
          </div>
          <div class="field">
            <label>開始時間</label>
            <select class="f-start-time">${buildTimeOptions(startTimeVal)}</select>
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>終了日</label>
            <input type="date" class="f-end-date" value="${endDateVal}">
          </div>
          <div class="field">
            <label>終了時間</label>
            <select class="f-end-time">${buildTimeOptions(endTimeVal)}</select>
          </div>
        </div>
        <div class="row2 break-row">
          <div class="field">
            <label>休憩開始</label>
            <select class="f-break-start">${buildTimeOptions(breakStartVal)}</select>
          </div>
          <div class="field">
            <label>休憩終了</label>
            <select class="f-break-end">${buildTimeOptions('')}</select>
          </div>
        </div>
        <div class="break-hint"></div>
        <div class="actions">
          <button class="btn-cancel">キャンセル</button>
          <button class="btn-save">保存</button>
        </div>`;

      const overlay = openModal(html);
      const modal = overlay.querySelector('.shift-modal');

      // ── 休憩の再計算: 開始/終了/休憩開始の変更時に休憩終了を自動更新 ──
      // trigger: 'breakEnd' のときは自動上書きしない（手動編集を尊重）
      function recalcBreak(trigger) {
        const sDate = modal.querySelector('.f-start-date').value;
        const sTime = modal.querySelector('.f-start-time').value;
        const eDate = modal.querySelector('.f-end-date').value;
        const eTime = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        const hint  = modal.querySelector('.break-hint');
        const breakRow = modal.querySelector('.break-row');

        const workMin = computeWorkMinutes(sDate, sTime, eDate, eTime);
        if (workMin == null) {
          hint.textContent = '';
          return;
        }
        const breakMin = calcBreakMinutes(workMin);

        if (breakMin === 0) {
          hint.textContent = '休憩なし（6時間以下）';
          hint.classList.add('is-none');
          breakRow.classList.add('is-disabled');
          bsSel.disabled = true;
          beSel.disabled = true;
          // 値はクリア（保存時に '' を送る）
          return;
        }

        hint.textContent = `休憩 ${breakMin}分（自動計算）`;
        hint.classList.remove('is-none');
        breakRow.classList.remove('is-disabled');
        bsSel.disabled = false;
        beSel.disabled = false;

        // breakEnd 以外をトリガに受けたときは自動で再設定（休憩開始 + breakMin）
        if (trigger !== 'breakEnd') {
          const bsMin = hhmmToMin(bsSel.value);
          if (bsMin != null) {
            const beMin = bsMin + breakMin;
            const beStr = minToHHMM(beMin);
            // 選択肢に存在する値だけセット（15分刻みなので通常は存在）
            if ([...beSel.options].some((o) => o.value === beStr)) {
              beSel.value = beStr;
            } else {
              beSel.value = '';
            }
          }
        }
      }

      // 変更検知
      ['f-start-date', 'f-start-time', 'f-end-date', 'f-end-time'].forEach((cls) => {
        modal.querySelector('.' + cls).addEventListener('change', () => recalcBreak('work'));
      });
      modal.querySelector('.f-break-start').addEventListener('change', () => recalcBreak('breakStart'));
      modal.querySelector('.f-break-end').addEventListener('change', () => recalcBreak('breakEnd'));

      // 初期計算
      recalcBreak('init');

      modal.querySelector('.btn-cancel').onclick = () => removeModal();
      modal.querySelector('.btn-save').onclick = async () => {
        const staffSel = modal.querySelector('.f-staff');
        const name   = staffSel.value;
        const number = staffSel.options[staffSel.selectedIndex]?.dataset.number || '';
        const placement = modal.querySelector('.f-placement').value;
        const sDate = modal.querySelector('.f-start-date').value;
        const sTime = modal.querySelector('.f-start-time').value;
        const eDate = modal.querySelector('.f-end-date').value;
        const eTime = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        // 休憩入力欄が disabled（=6時間以下休憩なし） なら空文字で保存
        const bsTime = bsSel.disabled ? '' : bsSel.value;
        const beTime = beSel.disabled ? '' : beSel.value;

        if (!name) { alert('従業員を選択してください'); return; }
        if (!sDate || !sTime || !eDate || !eTime) {
          alert('日付と時間を入力してください'); return;
        }

        const saveBtn = modal.querySelector('.btn-save');
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        const payload = {
          '従業員番号':   number,
          '配置の種類':   placement,
          '開始日付':     sDate,
          '開始時間':     sTime,
          '終了日付':     eDate,
          '終了時間':     eTime,
          '休憩開始時間': bsTime,
          '休憩終了時間': beTime,
        };
        log('ダイアログ保存ボタン押下', { name, payload });

        try {
          await Api.createShift(payload);
          log('ダイアログ保存成功');
          removeModal();
          onSaved && onSaved();
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
          // kintone系エラーはerrorsに詳細が入る
          let detail = e && e.message ? e.message : '';
          if (e && e.errors) {
            try { detail += '\n' + JSON.stringify(e.errors, null, 2); } catch (_) {}
          }
          err('ダイアログ保存失敗', e);
          alert('保存に失敗しました。\n' + detail + '\n\n詳細はコンソールの「シフト作成失敗」グループを確認してください。');
        }
      };
    },

    // 既存レコードの編集・削除
    // 従業員・配置の種類・日時・休憩すべて変更可。保存は Api.updateShift
    async showEdit(record, onChanged) {
      const F = Config.SHIFT_FIELDS;
      const recordId = record.$id.value;
      const name   = (record[F.employeeName] && record[F.employeeName].value) || '';
      const number = (record[F.employeeNumber] && record[F.employeeNumber].value) || '';
      const sDate  = (record[F.startDate] && record[F.startDate].value) || '';
      const sTime  = (record[F.startTime] && record[F.startTime].value) || '';
      const eDate  = (record[F.endDate] && record[F.endDate].value) || '';
      const eTime  = (record[F.endTime] && record[F.endTime].value) || '';
      const bsTime = (record[F.breakStartTime] && record[F.breakStartTime].value) || '';
      const beTime = (record[F.breakEndTime]   && record[F.breakEndTime].value)   || '';
      const qualification = readQualification(record);
      const placement = (record[F.placementType] && record[F.placementType].value) || '';

      const staffOptions = await buildStaffOptions(name);
      const placementOptions = ['<option value="">— 選択 —</option>']
        .concat((Config.PLACEMENT_TYPES || []).map((p) => {
          const sel = p === placement ? 'selected' : '';
          return `<option value="${p}" ${sel}>${p}</option>`;
        })).join('');

      const html = `
        <h3>シフトを編集</h3>
        <div class="field">
          <label>従業員</label>
          <select class="f-staff">${staffOptions}</select>
          <small style="color:#718096;font-size:12px;margin-top:2px;">
            資格（現在: ${qualification || '—'}）は従業員マスタから自動取得
          </small>
        </div>
        <div class="field">
          <label>配置の種類</label>
          <select class="f-placement">${placementOptions}</select>
        </div>
        <div class="row2">
          <div class="field">
            <label>開始日</label>
            <input type="date" class="f-start-date" value="${sDate}">
          </div>
          <div class="field">
            <label>開始時間</label>
            <select class="f-start-time">${buildTimeOptions(sTime)}</select>
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>終了日</label>
            <input type="date" class="f-end-date" value="${eDate}">
          </div>
          <div class="field">
            <label>終了時間</label>
            <select class="f-end-time">${buildTimeOptions(eTime)}</select>
          </div>
        </div>
        <div class="row2 break-row">
          <div class="field">
            <label>休憩開始</label>
            <select class="f-break-start">${buildTimeOptions(bsTime || Config.DEFAULT_BREAK_START || '12:00')}</select>
          </div>
          <div class="field">
            <label>休憩終了</label>
            <select class="f-break-end">${buildTimeOptions(beTime)}</select>
          </div>
        </div>
        <div class="break-hint"></div>
        <div class="actions">
          <button class="btn-delete">削除</button>
          <button class="btn-cancel">キャンセル</button>
          <button class="btn-save">保存</button>
        </div>`;

      const overlay = openModal(html);
      const modal = overlay.querySelector('.shift-modal');

      // 休憩再計算（showCreate と同ロジック）
      // - trigger 'breakEnd' は手動編集なので自動上書きしない
      // - 初回ロード時は既存値を尊重（trigger='init'）→ breakEnd に既存値があれば保持
      function recalcBreak(trigger) {
        const sDateV = modal.querySelector('.f-start-date').value;
        const sTimeV = modal.querySelector('.f-start-time').value;
        const eDateV = modal.querySelector('.f-end-date').value;
        const eTimeV = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        const hint  = modal.querySelector('.break-hint');
        const breakRow = modal.querySelector('.break-row');

        const workMin = computeWorkMinutes(sDateV, sTimeV, eDateV, eTimeV);
        if (workMin == null) { hint.textContent = ''; return; }
        const breakMin = calcBreakMinutes(workMin);

        if (breakMin === 0) {
          hint.textContent = '休憩なし（6時間以下）';
          hint.classList.add('is-none');
          breakRow.classList.add('is-disabled');
          bsSel.disabled = true;
          beSel.disabled = true;
          return;
        }

        hint.textContent = `休憩 ${breakMin}分（自動計算）`;
        hint.classList.remove('is-none');
        breakRow.classList.remove('is-disabled');
        bsSel.disabled = false;
        beSel.disabled = false;

        // 初回ロード時は既存値を尊重。既存の休憩終了が空 or 未設定のみ自動補完。
        // breakEnd をユーザーが変更したら自動上書きしない。
        if (trigger === 'init') {
          if (!beSel.value) {
            const bsMin = hhmmToMin(bsSel.value);
            if (bsMin != null) {
              const beStr = minToHHMM(bsMin + breakMin);
              if ([...beSel.options].some((o) => o.value === beStr)) beSel.value = beStr;
            }
          }
          return;
        }
        if (trigger !== 'breakEnd') {
          const bsMin = hhmmToMin(bsSel.value);
          if (bsMin != null) {
            const beStr = minToHHMM(bsMin + breakMin);
            if ([...beSel.options].some((o) => o.value === beStr)) beSel.value = beStr;
            else beSel.value = '';
          }
        }
      }

      ['f-start-date', 'f-start-time', 'f-end-date', 'f-end-time'].forEach((cls) => {
        modal.querySelector('.' + cls).addEventListener('change', () => recalcBreak('work'));
      });
      modal.querySelector('.f-break-start').addEventListener('change', () => recalcBreak('breakStart'));
      modal.querySelector('.f-break-end').addEventListener('change', () => recalcBreak('breakEnd'));

      recalcBreak('init');

      modal.querySelector('.btn-cancel').onclick = () => removeModal();

      modal.querySelector('.btn-delete').onclick = async () => {
        if (!confirm('このシフトを削除しますか？')) return;
        try {
          await Api.deleteShift(recordId);
          removeModal();
          onChanged && onChanged();
        } catch (e) {
          alert('削除に失敗しました: ' + (e.message || JSON.stringify(e)));
        }
      };

      modal.querySelector('.btn-save').onclick = async () => {
        const staffSel = modal.querySelector('.f-staff');
        const newName   = staffSel.value;
        const newNumber = staffSel.options[staffSel.selectedIndex]?.dataset.number || '';
        const newPlacement = modal.querySelector('.f-placement').value;
        const newSDate = modal.querySelector('.f-start-date').value;
        const newSTime = modal.querySelector('.f-start-time').value;
        const newEDate = modal.querySelector('.f-end-date').value;
        const newETime = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        const newBs = bsSel.disabled ? '' : bsSel.value;
        const newBe = beSel.disabled ? '' : beSel.value;

        if (!newName) { alert('従業員を選択してください'); return; }
        if (!newSDate || !newSTime || !newEDate || !newETime) {
          alert('日付と時間を入力してください'); return;
        }

        const saveBtn = modal.querySelector('.btn-save');
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        const payload = {
          '従業員番号':   newNumber,
          '配置の種類':   newPlacement,
          '開始日付':     newSDate,
          '開始時間':     newSTime,
          '終了日付':     newEDate,
          '終了時間':     newETime,
          '休憩開始時間': newBs,
          '休憩終了時間': newBe,
        };
        log('編集ダイアログ保存ボタン押下', { recordId, payload });

        try {
          await Api.updateShift(recordId, payload);
          log('編集ダイアログ保存成功');
          removeModal();
          onChanged && onChanged();
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
          let detail = e && e.message ? e.message : '';
          if (e && e.errors) {
            try { detail += '\n' + JSON.stringify(e.errors, null, 2); } catch (_) {}
          }
          err('編集ダイアログ保存失敗', e);
          alert('保存に失敗しました。\n' + detail);
        }
      };
    },
  };

  App.ShiftDialog = ShiftDialog;
})();
