/**
 * 放デイシフト - 凡例（配置の種類・スタッフ個人フィルタ）
 * localStorageで状態永続化。フィルタはFCタブのみ効く（チェック表は全量表示）
 * 読み込み順: 10
 */
(function () {
  'use strict';

  const App = window.ShiftApp;
  const { Config, Api, log, warn } = App;
  const FILTER_STYLE_ID = 'shift-legend-filter-style';

  const Legend = {
    state: {
      placement:     {},            // { [name]: boolean }
      persons:       {},            // { [employeeNumber]: boolean }
      deactivatedPersons: {},       // 明示的にOFFにした番号
    },
    _allStaff: [],

    // ── 状態の永続化 ────────────────────────────
    loadState() {
      try {
        const raw = localStorage.getItem(Config.SIDEBAR.STORAGE_LEGEND_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          Legend.state.placement          = s.placement          || {};
          Legend.state.persons            = s.persons            || {};
          Legend.state.deactivatedPersons = s.deactivatedPersons || {};
        }
      } catch (e) { warn('凡例状態復元失敗', e); }
    },

    saveState() {
      try {
        localStorage.setItem(
          Config.SIDEBAR.STORAGE_LEGEND_KEY,
          JSON.stringify(Legend.state)
        );
      } catch (e) { warn('凡例状態保存失敗', e); }
    },

    // ── 初期化（初回のみ全スタッフを取得して人物リストを確定） ────
    async init(container) {
      Legend.loadState();

      // 配置は固定リスト。未設定キーは true(表示)で初期化
      Object.keys(Config.LEGEND_COLORS.placement).forEach((k) => {
        if (!(k in Legend.state.placement)) Legend.state.placement[k] = true;
      });

      Legend._allStaff = await Api.fetchAllStaff();
      Legend._allStaff.forEach((s) => {
        if (!(s.従業員番号 in Legend.state.persons)
            && !(s.従業員番号 in Legend.state.deactivatedPersons)) {
          Legend.state.persons[s.従業員番号] = true;
        }
      });

      Legend.render(container);
    },

    // ── レンダリング ───────────────────────────
    render(container) {
      const root = container.querySelector('#shift-legend');
      if (!root) return;

      const placementHtml = Legend._buildPlacementSection();
      const personsHtml   = Legend._buildPersonsSection();

      root.innerHTML = placementHtml + personsHtml;
      Legend._bindEvents(root);
      Legend.applyFilter();
    },

    _buildPlacementSection() {
      const colors = Config.LEGEND_COLORS.placement;
      const items = Object.entries(colors).map(([name, color]) => {
        const checked = Legend.state.placement[name] ? 'checked' : '';
        return `
          <label class="legend-item">
            <input type="checkbox" class="legend-cb" data-kind="placement" data-key="${name}" ${checked}>
            <span class="legend-color" style="background:${color}"></span>
            <span class="legend-name">${name}</span>
          </label>`;
      }).join('');
      return `
        <div class="legend-block">
          <div class="legend-block-title">配置の種類</div>
          ${items}
        </div>`;
    },

    _buildPersonsSection() {
      const items = Legend._allStaff.map((s) => {
        const checked = Legend.state.persons[s.従業員番号] ? 'checked' : '';
        const hours = App.MonthlyHours
          ? App.MonthlyHours.getPersonHoursText(s.従業員番号)
          : '';
        const hoursHtml = hours ? `<span class="legend-hours">${hours}</span>` : '';
        return `
          <label class="legend-item legend-person" data-employee-number="${s.従業員番号}">
            <input type="checkbox" class="legend-cb" data-kind="person" data-key="${s.従業員番号}" ${checked}>
            <span class="legend-name">${s.氏名}</span>
            ${hoursHtml}
          </label>`;
      }).join('');
      return `
        <div class="legend-block legend-persons">
          <div class="legend-block-title">
            <span>スタッフ</span>
            <span class="legend-persons-actions">
              <button type="button" class="legend-mini-btn" data-act="all">全選択</button>
              <button type="button" class="legend-mini-btn" data-act="none">全解除</button>
            </span>
          </div>
          ${items || '<div class="legend-empty">スタッフデータなし</div>'}
        </div>`;
    },

    _bindEvents(root) {
      root.querySelectorAll('.legend-cb').forEach((cb) => {
        cb.addEventListener('change', () => {
          const kind = cb.dataset.kind;
          const key  = cb.dataset.key;
          const on   = cb.checked;
          if (kind === 'placement')     Legend.state.placement[key] = on;
          if (kind === 'person') {
            Legend.state.persons[key] = on;
            if (on) delete Legend.state.deactivatedPersons[key];
            else Legend.state.deactivatedPersons[key] = true;
          }
          Legend.saveState();
          Legend.applyFilter();
        });
      });

      root.querySelectorAll('.legend-mini-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          const target = (act === 'all');
          Legend._allStaff.forEach((s) => {
            Legend.state.persons[s.従業員番号] = target;
            if (target) delete Legend.state.deactivatedPersons[s.従業員番号];
            else Legend.state.deactivatedPersons[s.従業員番号] = true;
          });
          root.querySelectorAll('.legend-cb[data-kind="person"]').forEach((cb) => {
            cb.checked = target;
          });
          Legend.saveState();
          Legend.applyFilter();
        });
      });
    },

    // ── フィルタ適用（FCタブのイベントを display:none するCSSを動的生成） ──
    applyFilter() {
      let styleEl = document.getElementById(FILTER_STYLE_ID);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = FILTER_STYLE_ID;
        document.head.appendChild(styleEl);
      }

      const hide = [];
      // 配置: OFFのものを隠す
      Object.entries(Legend.state.placement).forEach(([k, v]) => {
        if (!v) hide.push(`.fc-event[data-placement="${cssAttrEscape(k)}"]`);
      });
      // 個人: OFFのものを隠す
      Object.entries(Legend.state.persons).forEach(([num, v]) => {
        if (!v) hide.push(`.fc-event[data-employee-number="${cssAttrEscape(num)}"]`);
      });

      styleEl.textContent = hide.length
        ? hide.join(',\n') + ' { display: none !important; }'
        : '';
    },

    // 月間時間データが更新された時、凡例の数字部分だけ再描画
    refreshHoursText() {
      if (!App.MonthlyHours) return;
      document.querySelectorAll('.legend-person').forEach((el) => {
        const num = el.dataset.employeeNumber;
        const text = App.MonthlyHours.getPersonHoursText(num);
        let span = el.querySelector('.legend-hours');
        if (!span && text) {
          span = document.createElement('span');
          span.className = 'legend-hours';
          el.appendChild(span);
        }
        if (span) span.textContent = text;
      });
    },

    // 見出しに対象月を表示
    updateTitleWithMonth(month) {
      const el = document.getElementById('legend-section-title');
      if (!el) return;
      el.textContent = `表示項目（${month + 1}月合計時間）`;
    },
  };

  // 属性セレクタ値内に " や \ が混ざった場合のエスケープ（従業員番号は数字想定だが安全策）
  function cssAttrEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  App.Legend = Legend;
})();
