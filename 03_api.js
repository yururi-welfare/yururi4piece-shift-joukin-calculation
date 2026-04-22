/**
 * 放デイシフト - kintone API
 * 日付マスタ/従業員マスタの取得・保存
 * 読み込み順: 3
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, State, Utils, log, err } = App;

  // 従業員マスタ (児発管) のキャッシュ ─── {氏名, 従業員番号} の配列
  let jihatsukanCache = null;
  // 全スタッフキャッシュ（カレンダー側のダイアログ用）
  let allStaffCache = null;

  const Api = {
    // 児発管として選択可能なスタッフ氏名リストを取得
    async fetchJihatsukanStaff() {
      if (jihatsukanCache !== null) return jihatsukanCache.map((e) => e.氏名);
      const query =
        '就業先 in ("放デイ　ゆるりフォーピース") and 放デイゆるり_資格 in ("児発管") order by 従業員番号 asc';
      log('児発管スタッフ取得開始', { app: Config.EMPLOYEE_APP_ID, query });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.EMPLOYEE_APP_ID, query: query }
        );
        jihatsukanCache = res.records
          .map((r) => ({
            氏名: r['氏名'] && r['氏名'].value,
            従業員番号: r['従業員番号'] && r['従業員番号'].value,
          }))
          .filter((e) => e.氏名);
        const names = jihatsukanCache.map((e) => e.氏名);
        log('児発管スタッフ取得成功', { 件数: names.length, list: names });
        return names;
      } catch (e) {
        err('従業員マスタ取得失敗（App未作成／権限不足／フィールドコード相違の可能性）', e);
        return [];
      }
    },

    // 氏名から従業員番号を引く（キャッシュ参照のみ）
    getEmployeeNumberByName(name) {
      if (!jihatsukanCache) return null;
      const emp = jihatsukanCache.find((e) => e.氏名 === name);
      return emp ? emp.従業員番号 : null;
    },

    // アプリ60に児発管シフトレコードを新規作成
    // ※ 更新・削除は未実装（変更時に古いレコードは残る）
    async createJihatsukanShift(name) {
      if (!name) return null;
      if (!jihatsukanCache) await Api.fetchJihatsukanStaff();
      const number = Api.getEmployeeNumberByName(name);
      if (!number) {
        err('従業員番号が見つかりません（従業員マスタに該当氏名なし）', name);
        return null;
      }
      const record = { '従業員番号': { value: number } };
      return Api._postShiftRecord(record, { via: 'createJihatsukanShift', name, number });
    },

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

    // 資格で絞ったスタッフリストを返す（ダイアログの従業員ドロップダウン用）
    // 現状は '児発管' のみ特化。他の資格は fetchAllStaff にフォールバック
    async fetchStaffByQualification(qualification) {
      if (qualification === '児発管') {
        if (jihatsukanCache === null) await Api.fetchJihatsukanStaff();
        return Array.isArray(jihatsukanCache) ? jihatsukanCache : [];
      }
      return Api.fetchAllStaff();
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

    // 週分のシフトを資格で絞り込み、日付→レコード の map で返す
    // 同日複数ある場合は先頭のレコードのみ採用（警告ログを出す）
    async fetchShiftsByQualification(startDate, endDate, qualification) {
      const F = Config.SHIFT_FIELDS;
      const q =
        `${F.qualification} in ("${qualification}") and ` +
        `${F.startDate} >= "${Utils.fmtDate(startDate)}" and ${F.startDate} <= "${Utils.fmtDate(endDate)}" ` +
        `order by ${F.startDate} asc, ${F.startTime} asc limit 500`;
      log('資格別シフト取得開始', { app: Config.SHIFT_APP_ID, qualification, query: q });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.SHIFT_APP_ID, query: q }
        );
        const map = {};
        res.records.forEach((r) => {
          const d = r[F.startDate] && r[F.startDate].value;
          if (!d) return;
          if (map[d]) {
            App.warn(`同日に${qualification}シフトが複数あり（先頭を採用）`, { date: d });
            return;
          }
          map[d] = r;
        });
        log('資格別シフト取得成功', { 件数: res.records.length, 日数: Object.keys(map).length });
        return map;
      } catch (e) {
        err('資格別シフト取得失敗', e);
        return {};
      }
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
    // data = { 従業員番号, 開始日付, 開始時間, 終了日付, 終了時間 }
    // ※ 従業員名・資格はルックアップで自動コピーされるためAPIでは設定しない
    async createShift(data) {
      const F = Config.SHIFT_FIELDS;
      const record = {};
      if (data[F.employeeNumber]) record[F.employeeNumber] = { value: data[F.employeeNumber] };
      if (data[F.startDate])      record[F.startDate]      = { value: data[F.startDate] };
      if (data[F.startTime])      record[F.startTime]      = { value: data[F.startTime] };
      if (data[F.endDate])        record[F.endDate]        = { value: data[F.endDate] };
      if (data[F.endTime])        record[F.endTime]        = { value: data[F.endTime] };
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

    // シフト更新（ドラッグ/リサイズ用）
    // data = { 開始日付, 開始時間, 終了日付, 終了時間 }
    async updateShift(recordId, data) {
      const F = Config.SHIFT_FIELDS;
      const record = {};
      if (data[F.startDate]) record[F.startDate] = { value: data[F.startDate] };
      if (data[F.startTime]) record[F.startTime] = { value: data[F.startTime] };
      if (data[F.endDate])   record[F.endDate]   = { value: data[F.endDate] };
      if (data[F.endTime])   record[F.endTime]   = { value: data[F.endTime] };
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
