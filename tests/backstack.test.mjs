import assert from 'node:assert/strict';
import { createBackStack } from './.build/backstack.js';

// A fake browser tab: a list of history entries; go() fires popstate later, like real browsers.
function fakeBrowser(initial = [null]) {
  const tasks = [];
  const h = {
    entries: [...initial], index: initial.length - 1, exited: false, ops: 0, onpop: () => {},
    get state() { return h.entries[h.index]; },
    pushState(s) { h.ops++; h.entries = h.entries.slice(0, h.index + 1); h.entries.push(s); h.index++; },
    go(n) {
      h.ops++;
      const to = h.index + n;
      if (to < 0) { h.exited = true; return; } // left the app (Android minimizes it)
      if (to >= h.entries.length) return;
      tasks.push(() => { h.index = to; h.onpop(); });
    },
    back() { h.go(-1); },
  };
  const defer = (fn) => tasks.push(fn);
  const flush = () => { let guard = 0; while (tasks.length && guard++ < 100) tasks.shift()(); };
  return { h, defer, flush };
}

function app(browserInit, startPane = 'nav') {
  const { h, defer, flush } = fakeBrowser(browserInit);
  const ui = { pane: startPane };
  const depth = { nav: 0, list: 1, editor: 2 };
  const stack = createBackStack({
    history: h, defer,
    paneDepth: () => depth[ui.pane],
    backPane: () => { ui.pane = ui.pane === 'editor' ? 'list' : 'nav'; },
  });
  h.onpop = () => stack.onPopState();
  const setPane = (p) => { ui.pane = p; stack.changed(); flush(); };
  stack.start(); flush();
  return { h, ui, stack, flush, setPane };
}

// 1. Notebooks → pages → note, then Back, Back, Back.
{
  const a = app();
  assert.equal(a.h.ops, 0);
  a.setPane('list'); a.setPane('editor');
  assert.equal(a.h.entries.length, 3);
  a.h.back(); a.flush();
  assert.equal(a.ui.pane, 'list');
  a.h.back(); a.flush();
  assert.equal(a.ui.pane, 'nav');
  assert.equal(a.h.exited, false);
  a.h.back(); a.flush();
  assert.equal(a.h.exited, true, 'Back on the first screen leaves the app, as on any Android app');
  console.log('✓ Back goes note → pages → notebooks, then leaves the app');
}

// 2. The in-app "back" arrow keeps history in step, so the phone's Back still works afterwards.
{
  const a = app();
  a.setPane('list'); a.setPane('editor');
  a.setPane('list'); // tapped the on-screen back arrow
  assert.equal(a.ui.pane, 'list', 'our own history.go must not move the screen again');
  assert.equal(a.h.index, 1);
  a.h.back(); a.flush();
  assert.equal(a.ui.pane, 'nav');
  assert.equal(a.h.exited, false);
  console.log('✓ on-screen back arrow and phone Back agree');
}

// 3. Back closes an open dialog first, then the note.
{
  const a = app();
  a.setPane('list'); a.setPane('editor');
  let closed = 0, remove;
  remove = a.stack.addLayer(() => { closed++; remove(); }); a.flush();
  assert.equal(a.h.entries.length, 4);
  a.h.back(); a.flush();
  assert.equal(closed, 1);
  assert.equal(a.ui.pane, 'editor', 'only the dialog closes');
  a.h.back(); a.flush();
  assert.equal(a.ui.pane, 'list');
  console.log('✓ Back closes dialogs and menus first');
}

// 4. A dialog closed with Cancel / tapping outside removes its history entry.
{
  const a = app();
  a.setPane('list');
  const remove = a.stack.addLayer(() => {}); a.flush();
  remove(); a.flush();
  assert.equal(a.h.index, 1);
  a.h.back(); a.flush();
  assert.equal(a.ui.pane, 'nav');
  console.log('✓ dialogs closed by tapping Cancel keep history in step');
}

// 5. A menu item that opens a dialog (menu closes, dialog opens at once) adds no extra steps.
{
  const a = app();
  const closeMenu = a.stack.addLayer(() => {}); a.flush();
  const ops = a.h.ops;
  closeMenu(); const closeDialog = a.stack.addLayer(() => {}); a.flush();
  assert.equal(a.h.ops, ops);
  assert.equal(a.stack.depth, 1);
  closeDialog(); a.flush();
  console.log('✓ swapping a menu for a dialog adds no extra Back steps');
}

// 6. After a reload (e.g. an automatic update) the tab's history is reused, not stacked again.
{
  const a = app([null, { zakar: 1 }, { zakar: 2 }], 'editor');
  assert.equal(a.h.ops, 0);
  a.h.back(); a.flush(); assert.equal(a.ui.pane, 'list');
  a.h.back(); a.flush(); assert.equal(a.ui.pane, 'nav');
  assert.equal(a.h.exited, false);
  console.log('✓ reloading keeps Back working without extra presses');
}

// 7. Opening the app straight into the last note: Back still goes to its pages first.
{
  const a = app([null], 'editor');
  assert.equal(a.h.entries.length, 3);
  a.h.back(); a.flush(); assert.equal(a.ui.pane, 'list');
  console.log('✓ reopening on a note: Back goes to its pages');
}

console.log('All back-navigation tests passed');
