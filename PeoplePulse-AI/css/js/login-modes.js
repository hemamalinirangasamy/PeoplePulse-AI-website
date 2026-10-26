(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('.login-mode')];
  if (!tabs.length) return;
  const panels = {
    userModeTab: document.querySelector('#userLoginPanel, #loginForm'),
    adminModeTab: document.querySelector('#adminLoginPanel, #adminLoginForm')
  };
  function activate(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      const panel = panels[item.id];
      if (!panel) return;
      panel.hidden = !selected;
      panel.classList.toggle('hidden', !selected);
    });
  }
  tabs.forEach(tab => tab.addEventListener('click', () => activate(tab)));
  activate(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
})();
