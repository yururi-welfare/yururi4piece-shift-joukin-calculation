/**
 * 放デイシフト - kintone API
 * 日付マスタ/従業員マスタの取得・保存
 * 読み込み順: 3
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, State, Utils, log, err } = App;

  // 全スタッフキャッシュ（ダイアログ用）
  let allStaffCache = null;

  const Api = {
    // 指定期間分の日付マスタを取得し YYYY-MM-DD キーの map で返す
    // endDate 省略時は startDate から7日間
    async fetchDayMasters(startDate, endDate) {
      const end = endDate
        ? new Date(endDate)
        : (() => { const d = new Date(startDate); d.setDate(d.getDate() + 6); return d; })();
      const query =
        `営業日 >= "${Utils.fmtDate(startDate)}" and 営業日 <= "${Utils.fmtDate(end)}" order by 営業日 asc`;
      log('日付マスタ取得開始', { app: Config.DAY_MASTER_APP_ID, query });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.DAY_MASTER_APP_ID, query: query }
        );
        log('日付マスタ取得成功', { 件数: res.records.length });
        const map = {};
        res.records.forEach((r) => { map[r['営業日'].value] = r; });
        return map;
      } catch (e) {
        err('日付マスタ取得失敗（App未作成／権限不足／フィールドコード相違の可能性）', e);
        return {};
      }
    },

    // 指定日のフィールド値を更新。全フィールド空なら既存レコードを削除
    // updates = { 営業パターン: '10:00〜18:00', 児発管: '高橋', ... }
    async saveDayField(dateStr, updates, existingRecordId) {
      try {
        const existingRec = State.currentDayMap[dateStr];
        // 更新後の全トラッキングフィールド値をシミュレート
        const finalValues = {};
        for (const field of Config.TRACKED_FIELDS) {
          finalValues[field] = (field in updates)
            ? updates[field]
            : (existingRec && existingRec[field] && existingRec[field].value) || '';
        }
        const anyNonEmpty = Object.values(finalValues).some((v) => v);

        // 全フィールド空 & 既存レコードあり → 削除
        if (!anyNonEmpty && existingRecordId) {
          log('レコード削除', { recordId: existingRecordId, date: dateStr });
          await kintone.api(
            kintone.api.url('/k/v1/records', true),
            'DELETE',
            { app: Config.DAY_MASTER_APP_ID, ids: [existingRecordId] }
          );
          return;
        }
        // 既存更新
        if (existingRecordId) {
          const recordBody = {};
          for (const [key, val] of Object.entries(updates)) {
            recordBody[key] = { value: val };
          }
          log('レコード更新', { recordId: existingRecordId, date: dateStr, updates });
          await kintone.api(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            { app: Config.DAY_MASTER_APP_ID, id: existingRecordId, record: recordBody }
          );
          return;
        }
        // 新規作成
        if (anyNonEmpty) {
          const recordBody = { 営業日: { value: dateStr } };
          for (const [key, val] of Object.entries(updates)) {
            if (val) recordBody[key] = { value: val };
          }
          log('レコード新規作成', { date: dateStr, updates });
          await kintone.api(
            kintone.api.url('/k/v1/record', true),
            'POST',
            { app: Config.DAY_MASTER_APP_ID, record: recordBody }
          );
        }
      } catch (e) {
        err('保存失敗', e);
        alert('保存に失敗しました: ' + (e.message || JSON.stringify(e)));
        throw e;
      }
    },

    // 全スタッフ取得（就業先=放デイゆるりフォーピースのみ絞込）
    async fetchAllStaff() {
      if (allStaffCache !== null) return allStaffCache;
      const query =
        '就業先 in ("放デイ　ゆるりフォーピース") order by 従業員番号 asc';
      log('全スタッフ取得開始', { app: Config.EMPLOYEE_APP_ID, query });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.EMPLOYEE_APP_ID, query: query }
        );
        allStaffCache = res.records
          .map((r) => ({
            氏名: r['氏名'] && r['氏名'].value,
            従業員番号: r['従業員番号'] && r['従業員番号'].value,
          }))
          .filter((e) => e.氏名);
        log('全スタッフ取得成功', { 件数: allStaffCache.length });
        return allStaffCache;
      } catch (e) {
        err('全スタッフ取得失敗', e);
        return [];
      }
    },

    // 週分のシフトを取得し、配置の種類→日付→レコード配列(開始時間昇順) の map にして返す
    // 例: { '常勤換算': { '2026-04-27': [rec1, rec2, rec3] } }
    async fetchShiftsGroupedByPlacement(startDate, endDate) {
      const F = Config.SHIFT_FIELDS;
      const records = await Api.fetchShifts(startDate, endDate);
      const map = {};
      records.forEach((r) => {
        const p = r[F.placementType] && r[F.placementType].value;
        const d = r[F.startDate] && r[F.startDate].value;
        if (!p || !d) return;
        if (!map[p]) map[p] = {};
        if (!map[p][d]) map[p][d] = [];
        map[p][d].push(r);
      });
      // 各日付の配列を開始時間昇順にソート（常勤換算の 1人目→2人目 割当のため）
      Object.keys(map).forEach((p) => {
        Object.keys(map[p]).forEach((d) => {
          map[p][d].sort((a, b) => {
            const t1 = (a[F.startTime] && a[F.startTime].value) || '';
            const t2 = (b[F.startTime] && b[F.startTime].value) || '';
            return t1.localeCompare(t2);
          });
        });
      });
      log('配置別グルーピング完了', {
        placements: Object.keys(map),
        件数: records.length,
      });
      return map;
    },

    // アプリ60から期間内のシフトを取得（カレンダー表示用）
    async fetchShifts(startDate, endDate) {
      const F = Config.SHIFT_FIELDS;
      const query =
        `${F.startDate} >= "${Utils.fmtDate(startDate)}" and ${F.startDate} <= "${Utils.fmtDate(endDate)}" order by ${F.startDate} asc, ${F.startTime} asc limit 500`;
      log('シフト取得開始', { app: Config.SHIFT_APP_ID, query });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.SHIFT_APP_ID, query: query }
        );
        log('シフト取得成功', { 件数: res.records.length });
        return res.records;
      } catch (e) {
        err('シフト取得失敗（App60未作成／権限不足の可能性）', e);
        return [];
      }
    },

    // 汎用シフト作成（ダイアログから使用）
    // data = { 従業員番号, 配置の種類, 開始日付, 開始時間, 終了日付, 終了時間, 休憩開始時間, 休憩終了時間 }
    // ※ 従業員名・資格はルックアップで自動コピーされるためAPIでは設定しない
    // ※ 休憩フィールドは '' を渡せば明示的に空にする（6時間以下の休憩なし）
    async createShift(data) {
      const F = Config.SHIFT_FIELDS;
      const record = {};
      if (data[F.employeeNumber]) record[F.employeeNumber] = { value: data[F.employeeNumber] };
      if (data[F.placementType])  record[F.placementType]  = { value: data[F.placementType] };
      if (data[F.startDate])      record[F.startDate]      = { value: data[F.startDate] };
      if (data[F.startTime])      record[F.startTime]      = { value: data[F.startTime] };
      if (data[F.endDate])        record[F.endDate]        = { value: data[F.endDate] };
      if (data[F.endTime])        record[F.endTime]        = { value: data[F.endTime] };
      // 休憩は空文字でも送る（明示的な空）
      if (F.breakStartTime in data) record[F.breakStartTime] = { value: data[F.breakStartTime] || '' };
      if (F.breakEndTime   in data) record[F.breakEndTime]   = { value: data[F.breakEndTime]   || '' };
      const id = await Api._postShiftRecord(record, { via: 'createShift', input: data });
      if (id == null) throw new Error('シフト作成に失敗しました（詳細はコンソール）');
      return id;
    },

    // 内部: 共通POST処理（詳細ログ付き）
    async _postShiftRecord(record, context) {
      const body = { app: Config.SHIFT_APP_ID, record: record };
      // ─ リクエスト詳細を JSON で可読出力
      console.groupCollapsed('[放デイシフト] シフト作成リクエスト');
      console.log('context:', context);
      console.log('app:', Config.SHIFT_APP_ID);
      console.log('record JSON:', JSON.stringify(record, null, 2));
      console.groupEnd();
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'POST',
          body
        );
        log('シフト作成成功 id=' + res.id + ' revision=' + res.revision);
        return res.id;
      } catch (e) {
        // kintone エラーは e.message / e.code / e.id / e.errors に詳細が入る
        console.group('[放デイシフト] シフト作成失敗 (400等)');
        console.error('message:', e && e.message);
        console.error('code:',    e && e.code);
        console.error('id:',      e && e.id);
        console.error('errors:',  e && e.errors);
        try {
          console.error('errors(JSON):', JSON.stringify(e && e.errors, null, 2));
        } catch (_) { /* 循環参照などで失敗した場合は無視 */ }
        console.error('送信record(JSON):', JSON.stringify(record, null, 2));
        console.error('context:', context);
        console.error('raw error object:', e);
        console.groupEnd();
        return null;
      }
    },

    // シフト更新（ドラッグ/リサイズ／編集モーダルから使用）
    // data に含まれるキーのみ更新
    // - 開始日付/開始時間/終了日付/終了時間（ドラッグ・リサイズ・編集）
    // - 従業員番号/配置の種類（編集モーダル）※従業員名・資格はルックアップで自動再取得
    // - 休憩開始時間/休憩終了時間（編集モーダル）※空文字で明示的クリア
    async updateShift(recordId, data) {
      const F = Config.SHIFT_FIELDS;
      const record = {};
      if (F.employeeNumber in data) record[F.employeeNumber] = { value: data[F.employeeNumber] };
      if (F.placementType  in data) record[F.placementType]  = { value: data[F.placementType] };
      if (data[F.startDate]) record[F.startDate] = { value: data[F.startDate] };
      if (data[F.startTime]) record[F.startTime] = { value: data[F.startTime] };
      if (data[F.endDate])   record[F.endDate]   = { value: data[F.endDate] };
      if (data[F.endTime])   record[F.endTime]   = { value: data[F.endTime] };
      if (F.breakStartTime in data) record[F.breakStartTime] = { value: data[F.breakStartTime] || '' };
      if (F.breakEndTime   in data) record[F.breakEndTime]   = { value: data[F.breakEndTime]   || '' };
      console.groupCollapsed('[放デイシフト] シフト更新リクエスト');
      console.log('id:', recordId);
      console.log('record JSON:', JSON.stringify(record, null, 2));
      console.groupEnd();
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'PUT',
          { app: Config.SHIFT_APP_ID, id: recordId, record: record }
        );
        log('シフト更新成功 id=' + recordId + ' revision=' + res.revision);
        return res.revision;
      } catch (e) {
        console.group('[放デイシフト] シフト更新失敗');
        console.error('message:', e && e.message);
        console.error('code:',    e && e.code);
        console.error('errors:',  e && e.errors);
        try { console.error('errors(JSON):', JSON.stringify(e && e.errors, null, 2)); } catch (_) {}
        console.error('送信record:', JSON.stringify(record, null, 2));
        console.error('raw:', e);
        console.groupEnd();
        throw e;
      }
    },

    // シフト削除
    async deleteShift(recordId) {
      log('シフト削除', { id: recordId });
      try {
        await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'DELETE',
          { app: Config.SHIFT_APP_ID, ids: [recordId] }
        );
      } catch (e) {
        err('シフト削除失敗', e);
        throw e;
      }
    },
  };

  App.Api = Api;
})();
