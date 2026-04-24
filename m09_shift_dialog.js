/**
 * 放デイシフト モバイル - シフト登録/編集ダイアログ（ボトムシート）
 * 読み込み順: 9
 *
 * 休憩自動計算ルール:
 *   - 6時間以下      → 休憩なし（disabled, 空文字で保存）
 *   - 6時間超〜8時間 → 45分
 *   - 8時間超        → 60分
 * 編集モード初回は既存値を尊重（手動変更した休憩終了は自動上書きしない）
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils, Api, State, toast, err } = App;
  const F = Config.SHIFT_FIELDS;

  function calcBreakMinutes(workMin) {
    if (workMin <= 360) return 0;
    if (workMin <= 480) return 45;
    return 60;
  }

  // 15分刻みの時刻オプション
  function buildTimeOptions(selected) {
    const sMin = Utils.toMin(Config.CALENDAR.SLOT_MIN_TIME.slice(0, 5));
    const eMin = Utils.toMin(Config.CALENDAR.SLOT_MAX_TIME.slice(0, 5));
    const opts = [];
    for (let m = sMin; m <= eMin; m += 15) {
      const t = Utils.toHHMM(m);
      opts.push(`<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`);
    }
    return opts.join('');
  }

  function removeModal() {
    const ex = document.querySelector('.m-modal-overlay');
    if (ex) ex.remove();
  }

  const ShiftDialog = {
    /**
     * options:
     *   mode:       'create' | 'edit'
     *   record:     編集対象(edit時必須)
     *   date:       'YYYY-MM-DD' (create時任意)
     *   placement:  配置の種類 初期値 (create時任意)
     *   start, end: Date (create時任意、FCの select から)
     *   onChanged:  保存/削除後のコールバック
     */
    async open(options) {
      const { mode, record, date, placement, start, end, onChanged } = options;
      const isEdit = mode === 'edit';
      const recordId = isEdit ? record.$id.value : '';

      // ── 初期値 ──
      let sDate, sTime, eDate, eTime, bsTime, beTime, empName, empNumber, placValue;
      if (isEdit) {
        sDate     = (record[F.startDate]      && record[F.startDate].value)      || '';
        sTime     = (record[F.startTime]      && record[F.startTime].value)      || '';
        eDate     = (record[F.endDate]        && record[F.endDate].value)        || '';
        eTime     = (record[F.endTime]        && record[F.endTime].value)        || '';
        bsTime    = (record[F.breakStartTime] && record[F.breakStartTime].value) || '';
        beTime    = (record[F.breakEndTime]   && record[F.breakEndTime].value)   || '';
        empName   = (record[F.employeeName]   && record[F.employeeName].value)   || '';
        empNumber = (record[F.employeeNumber] && record[F.employeeNumber].value) || '';
        placValue = (record[F.placementType]  && record[F.placementType].value)  || '';
      } else {
        if (start && end) {
          sDate = Utils.fmtDate(start);
          sTime = Utils.toHHMM(start.getHours() * 60 + start.getMinutes());
          eDate = Utils.fmtDate(end);
          eTime = Utils.toHHMM(end.getHours()   * 60 + end.getMinutes());
        } else {
          sDate = date || Utils.fmtDate(State.currentDate);
          eDate = sDate;
          const rec = State.currentDayMap && State.currentDayMap[sDate];
          const pat = Utils.parseHourRange(rec && rec['営業パターン'] && rec['営業パターン'].value);
          sTime = pat ? pat.start : Config.DEFAULT_SHIFT_TIME.start;
          eTime = pat ? pat.end   : Config.DEFAULT_SHIFT_TIME.end;
        }
        bsTime = Config.DEFAULT_BREAK_START || '12:00';
        beTime = '';
        empName = ''; empNumber = '';
        placValue = placement || '';
      }

      const staff = await Api.fetchAllStaff();
      const staffOpts = ['<option value="">— 選択 —</option>']
        .concat(staff.map((s) => {
          const sel = s.氏名 === empName ? 'selected' : '';
          return `<option value="${s.氏名}" data-number="${s.従業員番号 || ''}" ${sel}>${s.氏名}</option>`;
        })).join('');
      const placOpts = ['<option value="">— 選択 —</option>']
        .concat((Config.PLACEMENT_TYPES || []).map((p) => {
          const sel = p === placValue ? 'selected' : '';
          return `<option value="${p}" ${sel}>${p}</option>`;
        })).join('');
      const qualText = isEdit ? (() => {
        const v = record[F.qualification] && record[F.qualification].value;
        if (Array.isArray(v)) return v.join(' / ');
        return v || '';
      })() : '';

      // ── モーダル構築 ──
      removeModal();
      const overlay = document.createElement('div');
      overlay.className = 'm-modal-overlay';
      overlay.innerHTML = `
        <div class="m-modal">
          <div class="m-modal-header">
            <h3>${isEdit ? 'シフトを編集' : 'シフトを登録'}</h3>
            <button class="m-modal-close" type="button">×</button>
          </div>
          <div class="m-modal-body">
            <div class="m-field">
              <label>従業員</label>
              <select class="f-staff">${staffOpts}</select>
              <small>資格${qualText ? `（現在: ${qualText}）` : ''}は従業員マスタから自動取得</small>
            </div>
            <div class="m-field">
              <label>配置の種類</label>
              <select class="f-placement">${placOpts}</select>
            </div>
            <div class="m-row2">
              <div class="m-field">
                <label>開始日</label>
                <input type="date" class="f-start-date" value="${sDate}">
              </div>
              <div class="m-field">
                <label>開始時間</label>
                <select class="f-start-time">${buildTimeOptions(sTime)}</select>
              </div>
            </div>
            <div class="m-row2">
              <div class="m-field">
                <label>終了日</label>
                <input type="date" class="f-end-date" value="${eDate}">
              </div>
              <div class="m-field">
                <label>終了時間</label>
                <select class="f-end-time">${buildTimeOptions(eTime)}</select>
              </div>
            </div>
            <div class="m-row2 m-break-row">
              <div class="m-field">
                <label>休憩開始</label>
                <select class="f-break-start">${buildTimeOptions(bsTime)}</select>
              </div>
              <div class="m-field">
                <label>休憩終了</label>
                <select class="f-break-end">${buildTimeOptions(beTime)}</select>
              </div>
            </div>
            <div class="m-break-hint"></div>
          </div>
          <div class="m-modal-actions">
            ${isEdit ? '<button class="m-btn m-btn-delete">削除</button>' : ''}
            <button class="m-btn m-btn-cancel">キャンセル</button>
            <button class="m-btn m-btn-save">保存</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const modal = overlay.querySelector('.m-modal');

      overlay.addEventListener('click', (e) => { if (e.target === overlay) removeModal(); });
      modal.querySelector('.m-modal-close').onclick = removeModal;
      modal.querySelector('.m-btn-cancel').onclick = removeModal;

      function recalc(trigger) {
        const sd = modal.querySelector('.f-start-date').value;
        const st = modal.querySelector('.f-start-time').value;
        const ed = modal.querySelector('.f-end-date').value;
        const et = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        const hint  = modal.querySelector('.m-break-hint');
        const row   = modal.querySelector('.m-break-row');
        if (!sd || !st || !ed || !et) { hint.textContent = ''; return; }

        const s = new Date(`${sd}T${st}:00`);
        const e = new Date(`${ed}T${et}:00`);
        const workMin = Math.round((e - s) / 60000);
        if (workMin <= 0) { hint.textContent = ''; return; }

        const bMin = calcBreakMinutes(workMin);
        if (bMin === 0) {
          hint.textContent = '休憩なし（6時間以下）';
          hint.classList.add('is-none');
          row.classList.add('is-disabled');
          bsSel.disabled = true; beSel.disabled = true;
          return;
        }
        hint.textContent = `休憩 ${bMin}分（自動計算）`;
        hint.classList.remove('is-none');
        row.classList.remove('is-disabled');
        bsSel.disabled = false; beSel.disabled = false;

        // init: 既存値尊重、emptyなら自動補完
        if (trigger === 'init') {
          if (!beSel.value) {
            const bm = Utils.toMin(bsSel.value);
            if (bm != null) {
              const beStr = Utils.toHHMM(bm + bMin);
              if ([...beSel.options].some((o) => o.value === beStr)) beSel.value = beStr;
            }
          }
          return;
        }
        // breakEndをユーザーが変更したら自動上書きしない
        if (trigger !== 'breakEnd') {
          const bm = Utils.toMin(bsSel.value);
          if (bm != null) {
            const beStr = Utils.toHHMM(bm + bMin);
            if ([...beSel.options].some((o) => o.value === beStr)) beSel.value = beStr;
            else beSel.value = '';
          }
        }
      }
      ['f-start-date', 'f-start-time', 'f-end-date', 'f-end-time'].forEach((c) => {
        modal.querySelector('.' + c).addEventListener('change', () => recalc('work'));
      });
      modal.querySelector('.f-break-start').addEventListener('change', () => recalc('breakStart'));
      modal.querySelector('.f-break-end').addEventListener('change',   () => recalc('breakEnd'));
      recalc('init');

      // 削除
      if (isEdit) {
        modal.querySelector('.m-btn-delete').onclick = async () => {
          if (!confirm('このシフトを削除しますか？')) return;
          try {
            await Api.deleteShift(recordId, Config.SIMULATION_APP_ID);
            removeModal();
            toast('✓ 削除しました', 'success');
            onChanged && onChanged();
          } catch (e) {
            alert('削除失敗: ' + (e.message || JSON.stringify(e)));
          }
        };
      }

      // 保存
      modal.querySelector('.m-btn-save').onclick = async () => {
        const staffSel = modal.querySelector('.f-staff');
        const name   = staffSel.value;
        const number = staffSel.options[staffSel.selectedIndex]
          ? (staffSel.options[staffSel.selectedIndex].dataset.number || '')
          : '';
        const plac = modal.querySelector('.f-placement').value;
        const nsd = modal.querySelector('.f-start-date').value;
        const nst = modal.querySelector('.f-start-time').value;
        const ned = modal.querySelector('.f-end-date').value;
        const net = modal.querySelector('.f-end-time').value;
        const bsSel = modal.querySelector('.f-break-start');
        const beSel = modal.querySelector('.f-break-end');
        const nbs = bsSel.disabled ? '' : bsSel.value;
        const nbe = beSel.disabled ? '' : beSel.value;
        if (!name) { alert('従業員を選択してください'); return; }
        if (!nsd || !nst || !ned || !net) { alert('日付と時間を入力してください'); return; }

        const payload = {
          [F.employeeNumber]: number,
          [F.placementType]:  plac,
          [F.startDate]:      nsd,
          [F.startTime]:      nst,
          [F.endDate]:        ned,
          [F.endTime]:        net,
          [F.breakStartTime]: nbs,
          [F.breakEndTime]:   nbe,
        };
        const saveBtn = modal.querySelector('.m-btn-save');
        saveBtn.disabled = true; saveBtn.textContent = '保存中...';
        try {
          if (isEdit) await Api.updateShift(recordId, payload, Config.SIMULATION_APP_ID);
          else        await Api.createShift(payload, Config.SIMULATION_APP_ID);
          removeModal();
          toast('✓ 保存しました', 'success');
          onChanged && onChanged();
        } catch (e) {
          saveBtn.disabled = false; saveBtn.textContent = '保存';
          err('保存失敗', e);
          alert('保存失敗: ' + (e && e.message ? e.message : JSON.stringify(e)));
        }
      };
    },

    remove: removeModal,
  };

  App.ShiftDialog = ShiftDialog;
})();
