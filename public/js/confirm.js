// IskolarLink UI helpers (UI only, no app logic):
//  1. uiConfirm(): styled confirm dialog
//     Gamitin: if (!(await uiConfirm({ title, message, confirmText, danger }))) return;
//  2. Log out confirmation
//  3. Custom dropdowns: every <select> gets a styled menu (the real <select> stays
//     in the page, hidden, and keeps the value and the change events).

(function () {
  // ===================== 1 + 2. CONFIRM DIALOG =====================
  let dlg = null;
  let titleEl, msgEl, iconEl, okBtn, cancelBtn;
  let resolver = null;

  function build() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'confirm-dialog';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.innerHTML =
      '<div class="dialog-body">' +
        '<div class="confirm-icon" id="confirm-icon" aria-hidden="true">?</div>' +
        '<h2 id="confirm-title"></h2>' +
        '<p id="confirm-message"></p>' +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn" id="confirm-cancel">Cancel</button>' +
          '<button type="button" class="btn primary" id="confirm-ok">Confirm</button>' +
        '</div>' +
      '</div>';
    document.body.append(dlg);

    titleEl = dlg.querySelector('#confirm-title');
    msgEl = dlg.querySelector('#confirm-message');
    iconEl = dlg.querySelector('#confirm-icon');
    okBtn = dlg.querySelector('#confirm-ok');
    cancelBtn = dlg.querySelector('#confirm-cancel');

    okBtn.addEventListener('click', () => dlg.close('ok'));
    cancelBtn.addEventListener('click', () => dlg.close('cancel'));
    dlg.addEventListener('close', () => {
      const result = dlg.returnValue === 'ok';
      const done = resolver;
      resolver = null;
      if (done) done(result);
    });
  }

  window.uiConfirm = function (options) {
    const o = typeof options === 'string' ? { message: options } : (options || {});
    build();
    if (resolver) { resolver(false); resolver = null; }

    titleEl.textContent = o.title || 'Are you sure?';
    msgEl.textContent = o.message || '';
    okBtn.textContent = o.confirmText || 'Confirm';
    cancelBtn.textContent = o.cancelText || 'Cancel';
    okBtn.className = 'btn ' + (o.danger ? 'danger-fill' : 'primary');
    dlg.classList.toggle('is-danger', Boolean(o.danger));
    iconEl.textContent = o.danger ? '!' : '?';

    dlg.returnValue = 'cancel';
    dlg.showModal();
    (o.danger ? cancelBtn : okBtn).focus();

    return new Promise((resolve) => { resolver = resolve; });
  };

  // Log out: ask first, then let the original button handler run.
  let passing = false;
  document.addEventListener('click', async (event) => {
    if (passing) return;
    const btn = event.target.closest && event.target.closest('.topbar .btn');
    if (!btn || !/log\s*out/i.test(btn.textContent)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const ok = await window.uiConfirm({
      title: 'Log out of IskolarLink?',
      message: 'You will need to sign in again to continue.',
      confirmText: 'Log out',
      danger: true
    });
    if (ok) {
      passing = true;
      btn.click();
      passing = false;
    }
  }, true);

  // ===================== 3. CUSTOM SELECT =====================
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let openState = null; // { select, btn, menu, items, index }
  let typed = '';
  let typedTimer = null;
  let uid = 0;

  function labelOf(select) {
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent.trim() : '';
  }

  // Copy the current state of the real <select> onto the styled button.
  function sync(select) {
    const w = select._cs;
    if (!w) return;
    w.text.textContent = labelOf(select);
    w.btn.disabled = select.disabled;
    if (select.disabled && openState && openState.select === select) closeMenu();
  }

    function setActive(index) {
    if (!openState) return;
    const { items, btn, menu } = openState;
    if (items[openState.index]) items[openState.index].classList.remove('is-active');
    openState.index = index;
    const item = items[index];
    if (!item) return;
    item.classList.add('is-active');
    btn.setAttribute('aria-activedescendant', item.id);

    // Scroll only the dropdown list itself, never the dialog or the page
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
  }

  function move(step) {
    if (!openState) return;
    const { items } = openState;
    let i = openState.index;
    do { i += step; } while (i >= 0 && i < items.length && items[i].classList.contains('is-disabled'));
    if (i >= 0 && i < items.length) setActive(i);
  }

  function jump(first) {
    if (!openState) return;
    const { items } = openState;
    const order = items.map((_, i) => i);
    if (!first) order.reverse();
    const target = order.find((i) => !items[i].classList.contains('is-disabled'));
    if (target !== undefined) setActive(target);
  }

  function typeahead(character) {
    if (!openState) return;
    typed += character.toLowerCase();
    clearTimeout(typedTimer);
    typedTimer = setTimeout(() => { typed = ''; }, 600);
    const options = Array.from(openState.select.options);
    const start = typed.length === 1 ? openState.index + 1 : openState.index;
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (!options[i].disabled && options[i].textContent.trim().toLowerCase().startsWith(typed)) {
        setActive(i);
        return;
      }
    }
  }

  function choose(select, index) {
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      sync(select);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function commit() {
    if (!openState) return;
    const { select, items, index } = openState;
    if (items[index] && items[index].classList.contains('is-disabled')) return;
    choose(select, index);
    closeMenu(true);
  }

  function closeMenu(focusButton) {
    if (!openState) return;
    const { btn, menu } = openState;
    menu.remove();
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
    openState = null;
    if (focusButton) btn.focus();
  }

  function openMenu(select) {
    const w = select._cs;
    if (!w || select.disabled) return;
    if (openState && openState.select === select) { closeMenu(true); return; }
    closeMenu();

    const menu = document.createElement('div');
    menu.className = 'cs-menu';
    menu.setAttribute('role', 'listbox');
    menu.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the button

    const items = Array.from(select.options).map((opt, i) => {
      const item = document.createElement('div');
      item.className = 'cs-item';
      item.id = `cs-opt-${++uid}`;
      item.setAttribute('role', 'option');
      const text = document.createElement('span');
      text.textContent = opt.textContent.trim();
      item.append(text);
      if (opt.disabled) {
        item.classList.add('is-disabled');
        item.setAttribute('aria-disabled', 'true');
      }
      if (i === select.selectedIndex) {
        item.classList.add('is-selected');
        item.setAttribute('aria-selected', 'true');
      }
      item.addEventListener('mousemove', () => {
        if (!opt.disabled && openState && openState.index !== i) setActive(i);
      });
      item.addEventListener('click', () => {
        if (opt.disabled) return;
        choose(select, i);
        closeMenu(true);
      });
      menu.append(item);
      return item;
    });

    // Inside a dialog the menu must live in the dialog, or it would hide behind it.
    (select.closest('dialog') || document.body).append(menu);

    openState = { select, btn: w.btn, menu, items, index: -1 };
    w.btn.setAttribute('aria-expanded', 'true');

    const start = select.selectedIndex >= 0 ? select.selectedIndex : 0;
    setActive(start);

    // Same width as the button; below it, or above if there is no room.
    const rect = w.btn.getBoundingClientRect();
    menu.style.minWidth = rect.width + 'px';
    const height = menu.offsetHeight;
    const width = menu.offsetWidth;
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const roomAbove = rect.top - 8;
    let top = rect.bottom + 6;
    if (height > roomBelow && roomAbove > roomBelow) top = rect.top - height - 6;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
        const wantLeft = Math.max(8, left);
    const wantTop = Math.max(8, top);
    menu.style.left = wantLeft + 'px';
    menu.style.top = wantTop + 'px';

    // Inside a dialog, "fixed" can be measured from the dialog instead of the screen.
    // Check where the menu really landed and shift it back by the difference.
    const landed = menu.getBoundingClientRect();
    const offX = landed.left - wantLeft;
    const offY = landed.top - wantTop;
    if (offX || offY) {
      menu.style.left = (wantLeft - offX) + 'px';
      menu.style.top = (wantTop - offY) + 'px';
    }
  }

  function enhance(select) {
    if (select._cs || select.multiple || select.size > 1) return;
    if (!select.parentNode) return;

    const wrap = document.createElement('div');
    wrap.className = 'cs';
    if (select.id) wrap.dataset.for = select.id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const text = document.createElement('span');
    text.className = 'cs-text';
    btn.append(text);

    select.parentNode.insertBefore(wrap, select);
    wrap.append(btn, select);
    select.classList.add('cs-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select._cs = { wrap, btn, text };

    // Accessible name: aria-label, or the <label for="..."> text.
    const label = select.getAttribute('aria-label') || (select.labels && select.labels[0] && select.labels[0].textContent.trim());
    if (label) btn.setAttribute('aria-label', label);

    // Clicking a <label for="..."> focuses the hidden select: send the focus to the button.
    select.addEventListener('focus', () => btn.focus());

    // Keep the button in step when the page changes options, disabled state or value.
    new MutationObserver(() => sync(select)).observe(select, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled']
    });
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); sync(this); }
    });
    if (select.form) select.form.addEventListener('reset', () => setTimeout(() => sync(select), 0));

    btn.addEventListener('click', () => openMenu(select));
    btn.addEventListener('blur', () => { if (openState && openState.select === select) closeMenu(); });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
    btn.addEventListener('keydown', (e) => {
      const isOpen = openState && openState.select === select;
      if (!isOpen) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          openMenu(select);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'ArrowUp': e.preventDefault(); move(-1); break;
        case 'Home': e.preventDefault(); jump(true); break;
        case 'End': e.preventDefault(); jump(false); break;
        case 'Enter':
        case ' ': e.preventDefault(); commit(); break;
        case 'Tab': closeMenu(); break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
      }
    });

    sync(select);
  }

  function enhanceAll(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('select')) enhance(root);
    root.querySelectorAll('select').forEach(enhance);
  }

  // Esc closes only the menu, not the dialog behind it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openState) return;
    e.preventDefault();
    e.stopPropagation();
    closeMenu(true);
  }, true);
  document.addEventListener('mousedown', (e) => {
    if (!openState) return;
    if (openState.menu.contains(e.target) || openState.btn.contains(e.target)) return;
    closeMenu();
  }, true);
  window.addEventListener('scroll', (e) => {
    if (openState && !openState.menu.contains(e.target)) closeMenu();
  }, true);
  window.addEventListener('resize', () => closeMenu());

  function start() {
    enhanceAll(document.body);
    // Selects that the page creates later (forms, workflow panel) are picked up here.
    new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(enhanceAll);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();