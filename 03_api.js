/**
 * 放デイシフト - kintone API
 * 日付マスタ/従業員マスタの取得・保存
 * 読み込み順: 3
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, State, Utils, log, err } = App;

  // 従業員マスタ (児発管) のキャッシュ ─── ビューごとに一度だけ取得
  let jihatsukanCache = null;

  const Api = {
    // 児発管として選択可能なスタッフ氏名リストを取得
    async fetchJihatsukanStaff() {
      if (jihatsukanCache !== null) return jihatsukanCache;
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
          .map((r) => r['氏名'] && r['氏名'].value)
          .filter(Boolean);
        log('児発管スタッフ取得成功', { 件数: jihatsukanCache.length, list: jihatsukanCache });
        return jihatsukanCache;
      } catch (e) {
        err('従業員マスタ取得失敗（App未作成／権限不足／フィールドコード相違の可能性）', e);
        return [];
      }
    },

    // 指定週(7日)分の日付マスタを取得し YYYY-MM-DD キーの map で返す
    async fetchDayMasters(startDate) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);
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
  };

  App.Api = Api;
})();
