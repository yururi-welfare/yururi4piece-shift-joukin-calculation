/**
 * 放デイシフト モバイル - kintone API
 * 日付マスタ/従業員マスタ/シフトの取得・作成・更新・削除
 * 読み込み順: 3
 *
 * 全シフト系APIは第3引数 appId で書込先を切替:
 *   - 省略時: Config.SHIFT_APP_ID (60, 現場)
 *   - 編集機能: Config.SIMULATION_APP_ID (62)
 *
 * 休憩フィールドは '' を明示すれば空にする（6時間以下の休憩なし対応）
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Utils, State, log, err } = App;

  // 全スタッフキャッシュ（ダイアログ間で共有）
  let allStaffCache = null;

  const Api = {
    // 指定期間の日付マスタを取得し YYYY-MM-DD キーの map で返す
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
        err('日付マスタ取得失敗', e);
        return {};
      }
    },

    // 指定日のフィールド値を更新。全フィールド空なら既存レコードを削除
    async saveDayField(dateStr, updates, existingRecordId) {
      try {
        const existingRec = State.currentDayMap[dateStr];
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
    // 並び順: 資格優先（管理者兼児発管→常勤専従→常勤換算→未設定）
    //         常勤換算はふりがな順、それ以外は従業員番号順
    async fetchAllStaff() {
      if (allStaffCache !== null) return allStaffCache;
      const query = '就業先 in ("放デイ　ゆるりフォーピース　常勤換算シミュレーション") order by 従業員番号 asc';
      log('全スタッフ取得開始', { app: Config.EMPLOYEE_APP_ID });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: Config.EMPLOYEE_APP_ID, query: query }
        );
        const priority = { '管理者兼児発管': 1, '常勤専従': 2, '常勤換算': 3 };
        allStaffCache = res.records
          .map((r) => ({
            氏名:       r['氏名']           && r['氏名'].value,
            ふりがな:   (r['氏名_ふりがな'] && r['氏名_ふりがな'].value) || '',
            従業員番号: r['従業員番号']     && r['従業員番号'].value,
            資格:       (r['放デイゆるり_常勤区分'] && r['放デイゆるり_常勤区分'].value) || '',
          }))
          .filter((e) => e.氏名)
          .sort((a, b) => {
            const pa = priority[a.資格] || 99;
            const pb = priority[b.資格] || 99;
            if (pa !== pb) return pa - pb;
            if (a.資格 === '常勤換算' && b.資格 === '常勤換算') {
              return a.ふりがな.localeCompare(b.ふりがな, 'ja');
            }
            return String(a.従業員番号 || '').localeCompare(String(b.従業員番号 || ''));
          });
        log('全スタッフ取得成功', { 件数: allStaffCache.length });
        return allStaffCache;
      } catch (e) {
        err('全スタッフ取得失敗', e);
        return [];
      }
    },

    // 指定アプリから期間内のシフトを取得（appId省略時はConfig.SHIFT_APP_ID）
    async fetchShifts(startDate, endDate, appId) {
      const F = Config.SHIFT_FIELDS;
      const app = appId || Config.SHIFT_APP_ID;
      const query =
        `${F.startDate} >= "${Utils.fmtDate(startDate)}" and ${F.startDate} <= "${Utils.fmtDate(endDate)}" order by ${F.startDate} asc, ${F.startTime} asc limit 500`;
      log('シフト取得開始', { app, query });
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'GET',
          { app: app, query: query }
        );
        log('シフト取得成功', { app, 件数: res.records.length });
        return res.records;
      } catch (e) {
        err('シフト取得失敗', { app, e });
        return [];
      }
    },

    // 新規シフト作成
    async createShift(data, appId) {
      const F = Config.SHIFT_FIELDS;
      const record = {};
      if (data[F.employeeNumber]) record[F.employeeNumber] = { value: data[F.employeeNumber] };
      if (data[F.placementType])  record[F.placementType]  = { value: data[F.placementType] };
      if (data[F.startDate])      record[F.startDate]      = { value: data[F.startDate] };
      if (data[F.startTime])      record[F.startTime]      = { value: data[F.startTime] };
      if (data[F.endDate])        record[F.endDate]        = { value: data[F.endDate] };
      if (data[F.endTime])        record[F.endTime]        = { value: data[F.endTime] };
      if (F.breakStartTime in data) record[F.breakStartTime] = { value: data[F.breakStartTime] || '' };
      if (F.breakEndTime   in data) record[F.breakEndTime]   = { value: data[F.breakEndTime]   || '' };
      const id = await Api._postShiftRecord(record, { via: 'createShift', input: data }, appId);
      if (id == null) throw new Error('シフト作成に失敗しました（詳細はコンソール）');
      return id;
    },

    async _postShiftRecord(record, context, appId) {
      const app = appId || Config.SHIFT_APP_ID;
      const body = { app: app, record: record };
      console.groupCollapsed('[放デイシフト モバイル] シフト作成リクエスト');
      console.log('context:', context);
      console.log('app:', app);
      console.log('record JSON:', JSON.stringify(record, null, 2));
      console.groupEnd();
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'POST', body
        );
        log('シフト作成成功 id=' + res.id + ' revision=' + res.revision);
        return res.id;
      } catch (e) {
        console.group('[放デイシフト モバイル] シフト作成失敗');
        console.error('message:', e && e.message);
        console.error('code:',    e && e.code);
        console.error('errors:',  e && e.errors);
        try { console.error('errors(JSON):', JSON.stringify(e && e.errors, null, 2)); } catch (_) {}
        console.error('raw:', e);
        console.groupEnd();
        return null;
      }
    },

    // シフト更新
    async updateShift(recordId, data, appId) {
      const F = Config.SHIFT_FIELDS;
      const app = appId || Config.SHIFT_APP_ID;
      const record = {};
      if (F.employeeNumber in data) record[F.employeeNumber] = { value: data[F.employeeNumber] };
      if (F.placementType  in data) record[F.placementType]  = { value: data[F.placementType] };
      if (data[F.startDate]) record[F.startDate] = { value: data[F.startDate] };
      if (data[F.startTime]) record[F.startTime] = { value: data[F.startTime] };
      if (data[F.endDate])   record[F.endDate]   = { value: data[F.endDate] };
      if (data[F.endTime])   record[F.endTime]   = { value: data[F.endTime] };
      if (F.breakStartTime in data) record[F.breakStartTime] = { value: data[F.breakStartTime] || '' };
      if (F.breakEndTime   in data) record[F.breakEndTime]   = { value: data[F.breakEndTime]   || '' };
      try {
        const res = await kintone.api(
          kintone.api.url('/k/v1/record', true),
          'PUT',
          { app: app, id: recordId, record: record }
        );
        log('シフト更新成功 id=' + recordId + ' revision=' + res.revision);
        return res.revision;
      } catch (e) {
        console.group('[放デイシフト モバイル] シフト更新失敗');
        console.error('message:', e && e.message);
        console.error('errors:',  e && e.errors);
        console.error('raw:', e);
        console.groupEnd();
        throw e;
      }
    },

    // シフト削除
    async deleteShift(recordId, appId) {
      const app = appId || Config.SHIFT_APP_ID;
      log('シフト削除', { app, id: recordId });
      try {
        await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'DELETE',
          { app: app, ids: [recordId] }
        );
      } catch (e) {
        err('シフト削除失敗', e);
        throw e;
      }
    },

    // 複数レコード一括削除（最大100件/回）
    async deleteShiftsBulk(recordIds, appId) {
      const app = appId || Config.SHIFT_APP_ID;
      if (!recordIds || recordIds.length === 0) return;
      const chunkSize = 100;
      for (let i = 0; i < recordIds.length; i += chunkSize) {
        const ids = recordIds.slice(i, i + chunkSize);
        log('シフト一括削除', { app, 件数: ids.length });
        await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'DELETE',
          { app: app, ids: ids }
        );
      }
    },

    // 複数レコード一括作成（最大100件/回）
    async createShiftsBulk(dataList, appId) {
      const F = Config.SHIFT_FIELDS;
      const app = appId || Config.SHIFT_APP_ID;
      if (!dataList || dataList.length === 0) return [];
      const toRecord = (d) => {
        const r = {};
        if (d[F.employeeNumber]) r[F.employeeNumber] = { value: d[F.employeeNumber] };
        if (d[F.placementType])  r[F.placementType]  = { value: d[F.placementType] };
        if (d[F.startDate])      r[F.startDate]      = { value: d[F.startDate] };
        if (d[F.startTime])      r[F.startTime]      = { value: d[F.startTime] };
        if (d[F.endDate])        r[F.endDate]        = { value: d[F.endDate] };
        if (d[F.endTime])        r[F.endTime]        = { value: d[F.endTime] };
        if (F.breakStartTime in d) r[F.breakStartTime] = { value: d[F.breakStartTime] || '' };
        if (F.breakEndTime   in d) r[F.breakEndTime]   = { value: d[F.breakEndTime]   || '' };
        return r;
      };
      const chunkSize = 100;
      const results = [];
      for (let i = 0; i < dataList.length; i += chunkSize) {
        const chunk = dataList.slice(i, i + chunkSize).map(toRecord);
        log('シフト一括作成', { app, 件数: chunk.length });
        const res = await kintone.api(
          kintone.api.url('/k/v1/records', true),
          'POST',
          { app: app, records: chunk }
        );
        if (res && res.ids) results.push(...res.ids);
      }
      return results;
    },
  };

  App.Api = Api;
})();
