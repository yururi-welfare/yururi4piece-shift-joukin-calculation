/**
 * 放デイシフト モバイル - 凡例（配置・スタッフ個人フィルタ）
 * 読み込み順: 6
 *
 * ドロワー内 #m-legend に表示。localStorageで表示ON/OFFを永続化。
 * FCタブのイベント表示制御（display:none スタイル動的生成）も担当。
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config, Api, Utils, State, warn } = App;

  const FILTER_STYLE_ID = 'm-legend-filter-style';

  const Legend = {
    async init() {
      Legend.loadState();

      Object.keys(Config.LEGEND_COLORS.placement).forEach((k) => {
        if (!(k in State.legendState.placement)) State.legendState.placement[k] = true;
      });
      Object.keys(State.legendState.placement).forEach((k) => {
        if (!(k in Config.LEGEND_COLORS.placement)) delete State.legendState.placement[k];
      });

      State.allStaff = await Api.fetchAllStaff();
      State.allStaff.forEach((s) => {
        if (!(s.従業員番号 in State.legendState.persons)
            && !(s.従業員番号 in State.legendState.deactivatedPersons)) {
          State.legendState.persons[s.従業員番号] = true;
        }
      });

      Legend.render();
    },

    loadState() {
      try {
        const raw = localStorage.getItem(Config.STORAGE.LEGEND_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          State.legendState.placement          = s.placement          || {};
          State.legendState.persons            = s.persons            || {};
          State.legendState.deactivatedPersons = s.deactivatedPersons || {};
        }
      } catch (e) { warn('凡例状態復元失敗', e); }
    },
    saveState() {
      try {
        localStorage.setItem(Config.STORAGE.LEGEND_KEY, JSON.stringify(State.legendState));
      } catch (e) { warn('凡例状態保存失敗', e); }
    },

    render() {
      const host = document.getElementById('m-legend');
      if (!host) return;
      host.innerHTML = Legend._buildPlacementBlock() + Legend._buildPersonsBlock();
      Legend._bindEvents(host);
      Legend.applyFilter();
    },

    _buildPlacementBlock() {
      const colors = Config.LEGEND_COLORS.placement;
      const MH = App.MonthlyHours;
      const items = Object.entries(colors).map(([name, color]) => {
        const checked = State.legendState.placement[name] ? 'checked' : '';
        const hours = MH ? MH.getPlacementHoursText(name) : '';
        const hoursHtml = hours ? `<span class="m-leg-hours">${hours}</span>` : '';
        const row = `
          <label class="m-leg-item m-leg-placement" data-placement="${name}">
            <input type="checkbox" data-kind="placement" data-key="${name}" ${checked}>
            <span class="m-leg-color" style="background:${color}"></span>
            <span class="m-leg-name">${name}</span>
            ${hoursHtml}
          </label>`;
        if (name === '常勤換算') return row + Legend._buildFteBreakdown();
        return row;
      }).join('');
      return `
        <div class="m-leg-block">
          <div class="m-leg-block-title">配置の種類</div>
          ${items}
        </div>`;
    },

    _buildFteBreakdown() {
      const MH = App.MonthlyHours;
      if (!MH || !MH.getFteBreakdown) return '';
      const data = MH.getFteBreakdown();
      if (!data || data.people.length === 0) return '';
      const FTE = 128;
      const rows = data.people.map((p) => {
        const pct = Math.min(100, (p.hours / FTE) * 100);
        const cls = p.filled ? 'is-filled' : 'is-pending';
        const right = p.filled
          ? `${p.hours}h ✓`
          : `${p.hours}h <span class="fte-minus">(-${p.remaining}h)</span>`;
        return `
          <div class="m-fte-row ${cls}">
            <span class="m-fte-label">${p.index}人目</span>
            <span class="m-fte-bar"><span class="m-fte-fill" style="width:${pct}%"></span></span>
            <span class="m-fte-hours">${right}</span>
          </div>`;
      }).join('');
      return `<div class="m-leg-fte">${rows}</div>`;
    },

    _buildPersonsBlock() {
      const MH = App.MonthlyHours;
      const items = State.allStaff.map((s) => {
        const checked = State.legendState.persons[s.従業員番号] ? 'checked' : '';
        const hours = MH ? MH.getPersonHoursText(s.従業員番号) : '';
        const hoursHtml = hours ? `<span class="m-leg-hours">${hours}</span>` : '';
        return `
          <label class="m-leg-item m-leg-person" data-employee-number="${s.従業員番号}">
            <input type="checkbox" data-kind="person" data-key="${s.従業員番号}" ${checked}>
            <span class="m-leg-name">${s.氏名}</span>
            ${hoursHtml}
          </label>`;
      }).join('');
      return `
        <div class="m-leg-block">
          <div class="m-leg-block-title">
            <span>スタッフ</span>
            <span class="m-leg-actions">
              <button type="button" class="m-leg-mini" data-act="all">全選択</button>
              <button type="button" class="m-leg-mini" data-act="none">全解除</button>
            </span>
          </div>
          ${items || '<div class="m-leg-empty">スタッフデータなし</div>'}
        </div>`;
    },

    _bindEvents(host) {
      host.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.onchange = () => {
          const kind = cb.dataset.kind, key = cb.dataset.key, on = cb.checked;
          if (kind === 'placement') State.legendState.placement[key] = on;
          if (kind === 'person') {
            State.legendState.persons[key] = on;
            if (on) delete State.legendState.deactivatedPersons[key];
            else State.legendState.deactivatedPersons[key] = true;
          }
          Legend.saveState();
          Legend.applyFilter();
        };
      });
      host.querySelectorAll('.m-leg-mini').forEach((btn) => {
        btn.onclick = () => {
          const target = btn.dataset.act === 'all';
          State.allStaff.forEach((s) => {
            State.legendState.persons[s.従業員番号] = target;
            if (target) delete State.legendState.deactivatedPersons[s.従業員番号];
            else State.legendState.deactivatedPersons[s.従業員番号] = true;
          });
          Legend.saveState();
          Legend.render();
        };
      });
    },

    // FCタブのイベントを display:none するスタイルを動的生成
    applyFilter() {
      let el = document.getElementById(FILTER_STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = FILTER_STYLE_ID;
        document.head.appendChild(el);
      }
      const hide = [];
      Object.entries(State.legendState.placement).forEach(([k, v]) => {
        if (!v) hide.push(`.fc-event[data-placement="${Utils.escAttr(k)}"]`);
      });
      Object.entries(State.legendState.persons).forEach(([n, v]) => {
        if (!v) hide.push(`.fc-event[data-employee-number="${Utils.escAttr(n)}"]`);
      });
      el.textContent = hide.length ? hide.join(',\n') + ' { display: none !important; }' : '';
    },

    // 月間時間の数字だけ再描画（構造は維持）
    refreshHoursText() {
      const MH = App.MonthlyHours;
      if (!MH) return;
      const update = (el, text) => {
        let span = el.querySelector('.m-leg-hours');
        if (!span && text) {
          span = document.createElement('span');
          span.className = 'm-leg-hours';
          el.appendChild(span);
        }
        if (span) span.textContent = text;
      };
      document.querySelectorAll('.m-leg-person').forEach((el) => {
        update(el, MH.getPersonHoursText(el.dataset.employeeNumber));
      });
      document.querySelectorAll('.m-leg-placement').forEach((el) => {
        update(el, MH.getPlacementHoursText(el.dataset.placement));
      });
      // 常勤換算の人数内訳バーを再生成
      const fteHost = document.querySelector('.m-leg-placement[data-placement="常勤換算"]');
      if (fteHost) {
        const next = fteHost.nextElementSibling;
        if (next && next.classList.contains('m-leg-fte')) next.remove();
        const html = Legend._buildFteBreakdown();
        if (html) fteHost.insertAdjacentHTML('afterend', html);
      }
    },

    updateTitleWithMonth(month) {
      const el = document.getElementById('m-legend-title');
      if (!el) return;
      el.textContent = `表示項目（28日までの合計時間 / ${month + 1}月合計時間）`;
    },
  };

  App.Legend = Legend;
})();
