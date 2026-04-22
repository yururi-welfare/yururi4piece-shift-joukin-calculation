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
    async showCreate(defaultStart, defaultEnd, onSaved) {
      const startDateVal = toDateStr(defaultStart);
      const startTimeVal = toTimeStr(defaultStart);
      const endDateVal   = toDateStr(defaultEnd);
      const endTimeVal   = toTimeStr(defaultEnd);

      const staffOptions = await buildStaffOptions('');

      const html = `
        <h3>シフトを登録</h3>
        <div class="field">
          <label>従業員</label>
          <select class="f-staff">${staffOptions}</select>
          <small style="color:#718096;font-size:12px;margin-top:2px;">※ 資格は従業員マスタから自動取得されます</small>
        </div>
        <div class="row2">
          <div class="field">
            <label>開始日</label>
            <input type="date" class="f-start-date" value="${startDateVal}">
          </div>
          <div class="field">
            <label>開始時間</label>
            <input type="time" class="f-start-time" value="${startTimeVal}" step="900">
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>終了日</label>
            <input type="date" class="f-end-date" value="${endDateVal}">
          </div>
          <div class="field">
            <label>終了時間</label>
            <input type="time" class="f-end-time" value="${endTimeVal}" step="900">
          </div>
        </div>
        <div class="actions">
          <button class="btn-cancel">キャンセル</button>
          <button class="btn-save">保存</button>
        </div>`;

      const overlay = openModal(html);
      const modal = overlay.querySelector('.shift-modal');

      modal.querySelector('.btn-cancel').onclick = () => removeModal();
      modal.querySelector('.btn-save').onclick = async () => {
        const staffSel = modal.querySelector('.f-staff');
        const name   = staffSel.value;
        const number = staffSel.options[staffSel.selectedIndex]?.dataset.number || '';
        const sDate = modal.querySelector('.f-start-date').value;
        const sTime = modal.querySelector('.f-start-time').value;
        const eDate = modal.querySelector('.f-end-date').value;
        const eTime = modal.querySelector('.f-end-time').value;

        if (!name) { alert('従業員を選択してください'); return; }
        if (!sDate || !sTime || !eDate || !eTime) {
          alert('日付と時間を入力してください'); return;
        }

        const saveBtn = modal.querySelector('.btn-save');
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        const payload = {
          '従業員番号': number,
          '開始日付':   sDate,
          '開始時間':   sTime,
          '終了日付':   eDate,
          '終了時間':   eTime,
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

    // 既存レコードの表示・削除のみ（編集は今回非対応。次フェーズで）
    async showEdit(record, onChanged) {
      const F = Config.SHIFT_FIELDS;
      const name   = (record[F.employeeName] && record[F.employeeName].value) || '';
      const number = (record[F.employeeNumber] && record[F.employeeNumber].value) || '';
      const sDate  = (record[F.startDate] && record[F.startDate].value) || '';
      const sTime  = (record[F.startTime] && record[F.startTime].value) || '';
      const eDate  = (record[F.endDate] && record[F.endDate].value) || '';
      const eTime  = (record[F.endTime] && record[F.endTime].value) || '';
      const qualification = readQualification(record);

      const html = `
        <h3>シフト詳細</h3>
        <div class="field"><label>従業員</label><div>${name}${number ? `（${number}）` : ''}</div></div>
        <div class="field"><label>資格</label><div>${qualification || '—'}</div></div>
        <div class="row2">
          <div class="field"><label>開始</label><div>${sDate} ${sTime}</div></div>
          <div class="field"><label>終了</label><div>${eDate} ${eTime}</div></div>
        </div>
        <div class="actions">
          <button class="btn-delete">削除</button>
          <button class="btn-cancel">閉じる</button>
        </div>`;

      const overlay = openModal(html);
      const modal = overlay.querySelector('.shift-modal');

      modal.querySelector('.btn-cancel').onclick = () => removeModal();
      modal.querySelector('.btn-delete').onclick = async () => {
        if (!confirm('このシフトを削除しますか？')) return;
        try {
          await Api.deleteShift(record.$id.value);
          removeModal();
          onChanged && onChanged();
        } catch (e) {
          alert('削除に失敗しました: ' + (e.message || JSON.stringify(e)));
        }
      };
    },
  };

  App.ShiftDialog = ShiftDialog;
})();
