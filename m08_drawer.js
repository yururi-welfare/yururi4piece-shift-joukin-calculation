/**
 * 放デイシフト モバイル - ドロワー（左スライドイン）
 * 読み込み順: 8
 *
 * ハンバーガーボタンで開閉。中にミニカレンダー＋凡例を配置。
 */
(function () {
  'use strict';

  const App = window.ShiftMobile;
  if (!App) return;
  const { Config } = App;

  const Drawer = {
    open() {
      const root = document.getElementById(Config.ROOT_ID);
      if (!root) return;
      root.classList.add('is-drawer-open');
      // ミニカレンダーはdisplay:none→表示時にサイズ再計算が必要
      setTimeout(() => {
        if (App.MiniCalendar && App.MiniCalendar.updateSize) App.MiniCalendar.updateSize();
      }, 50);
    },

    close() {
      const root = document.getElementById(Config.ROOT_ID);
      if (!root) return;
      root.classList.remove('is-drawer-open');
    },

    bind(root) {
      const hamburger = root.querySelector('.m-hamburger');
      const closeBtn  = root.querySelector('.m-drawer-close');
      const overlay   = root.querySelector('.m-drawer-overlay');
      if (hamburger) hamburger.onclick = Drawer.open;
      if (closeBtn)  closeBtn.onclick  = Drawer.close;
      if (overlay)   overlay.onclick   = Drawer.close;
    },
  };

  App.Drawer = Drawer;
})();
