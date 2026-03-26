const loginShell = document.getElementById('login-shell');
const dashboardShell = document.getElementById('dashboard-shell');
const loginPanel = document.getElementById('login-panel');
const loginForm = document.getElementById('login-form');
const settingsForm = document.getElementById('settings-form');
const screensForm = document.getElementById('screens-form');
const messageForm = document.getElementById('message-form');
const logoutBtn = document.getElementById('logout-btn');
const clearMessageBtn = document.getElementById('clear-message-btn');
const statusMessage = document.getElementById('status-message');

const colsInput = document.getElementById('cols');
const rowsInput = document.getElementById('rows');
const durationInput = document.getElementById('api-duration');
const passwordInput = document.getElementById('password');
const remoteMessageInput = document.getElementById('remote-message');

const screensList = document.getElementById('screens-list');
const screensDraftNote = document.getElementById('screens-draft-note');
const addScreenBtn = document.getElementById('add-screen-btn');
const screenModal = document.getElementById('screen-modal');
const screenModalForm = document.getElementById('screen-modal-form');
const screenModalTitle = document.getElementById('screen-modal-title');
const screenLineFields = document.getElementById('screen-line-fields');
const closeScreenModalBtn = document.getElementById('close-screen-modal-btn');
const cancelScreenModalBtn = document.getElementById('cancel-screen-modal-btn');

const workspaceTitle = document.getElementById('workspace-title');
const workspaceCopy = document.getElementById('workspace-copy');
const navButtons = Array.from(document.querySelectorAll('[data-page-target]'));
const pagePanels = Array.from(document.querySelectorAll('.workspace-page'));

let currentConfig = null;
let screenDraftMessages = [];
let screensDirty = false;
let activePage = 'home';
let editingScreenIndex = null;
let draggedScreenIndex = null;

loginForm.addEventListener('submit', handleLogin);
settingsForm.addEventListener('submit', handleSaveSettings);
screensForm.addEventListener('submit', handleSaveScreens);
messageForm.addEventListener('submit', handleSendMessage);
logoutBtn.addEventListener('click', handleLogout);
clearMessageBtn.addEventListener('click', handleClearMessage);
addScreenBtn.addEventListener('click', () => openScreenModal());
screensList.addEventListener('click', handleScreensListClick);
screensList.addEventListener('dragstart', handleScreenDragStart);
screensList.addEventListener('dragover', handleScreenDragOver);
screensList.addEventListener('drop', handleScreenDrop);
screensList.addEventListener('dragend', clearDragState);
screenModalForm.addEventListener('submit', handleSaveScreenModal);
closeScreenModalBtn.addEventListener('click', closeScreenModal);
cancelScreenModalBtn.addEventListener('click', closeScreenModal);
screenModal.addEventListener('cancel', () => {
  editingScreenIndex = null;
});

for (const navButton of navButtons) {
  navButton.addEventListener('click', () => {
    switchPage(navButton.dataset.pageTarget);
  });
}

void loadAdminConfig();

async function loadAdminConfig() {
  try {
    const response = await fetch('/api/admin/config', { credentials: 'same-origin' });

    if (response.status === 401) {
      showLogin();
      return;
    }

    if (!response.ok) {
      const error = await readError(response, 'Unable to load admin configuration.');
      showLogin();
      setStatus(error, 'error');
      return;
    }

    const config = await response.json();
    showDashboard(config);
    setStatus('Admin ready.', 'success');
  } catch {
    showLogin();
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setStatus('Checking password...');

  try {
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: passwordInput.value }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Login failed.'), 'error');
      return;
    }

    passwordInput.value = '';
    await loadAdminConfig();
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before saving settings.', 'error');
    return;
  }

  if (screensDirty) {
    setStatus('Save screens before changing settings so the draft list is not lost.', 'error');
    return;
  }

  const payload = {
    cols: Number(colsInput.value),
    rows: Number(rowsInput.value),
    apiMessageDurationSeconds: Number(durationInput.value),
    defaultMessages: cloneMessages(currentConfig.defaultMessages),
  };

  await saveConfig(payload, 'Saving settings...', 'Settings saved. Display pages will refresh automatically.');
}

async function handleSaveScreens(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before saving screens.', 'error');
    return;
  }

  const payload = {
    cols: currentConfig.cols,
    rows: currentConfig.rows,
    apiMessageDurationSeconds: currentConfig.apiMessageDurationSeconds,
    defaultMessages: cloneMessages(screenDraftMessages),
  };

  await saveConfig(payload, 'Saving screens...', 'Screens saved. Display pages will refresh automatically.');
}

async function saveConfig(payload, pendingMessage, successMessage) {
  setStatus(pendingMessage);

  try {
    const response = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Save failed.'), 'error');
      return;
    }

    const config = await response.json();
    applyConfig(config);
    setStatus(successMessage, 'success');
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // The local session should still be cleared client-side even if the request fails.
  }

  currentConfig = null;
  screenDraftMessages = [];
  screensDirty = false;
  editingScreenIndex = null;
  remoteMessageInput.value = '';
  closeScreenModal();
  showLogin();
  setStatus('Logged out.');
}

async function handleSendMessage(event) {
  event.preventDefault();

  const message = remoteMessageInput.value.trim();
  if (!message) {
    setStatus('Enter a message before sending it.', 'error');
    return;
  }

  setStatus('Sending remote message...');

  try {
    const response = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to send the remote message.'), 'error');
      return;
    }

    setStatus('Remote message sent.', 'success');
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

async function handleClearMessage() {
  setStatus('Clearing active override...');

  try {
    const response = await fetch('/api/message', {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      setStatus(await readError(response, 'Unable to clear the remote message.'), 'error');
      return;
    }

    setStatus('Remote override cleared.', 'success');
  } catch {
    setStatus('Unable to reach the admin API.', 'error');
  }
}

function handleScreensListClick(event) {
  const actionButton = event.target.closest('[data-screen-action]');
  if (!actionButton) {
    return;
  }

  const screenItem = actionButton.closest('.screen-item');
  if (!screenItem) {
    return;
  }

  const index = Number(screenItem.dataset.index);
  const action = actionButton.dataset.screenAction;

  if (action === 'edit') {
    openScreenModal(index);
    return;
  }

  if (action === 'delete') {
    if (screenDraftMessages.length <= 1) {
      setStatus('At least one screen is required.', 'error');
      return;
    }

    screenDraftMessages.splice(index, 1);
    markScreensDirty();
    renderScreensList();
  }
}

function handleScreenDragStart(event) {
  const screenItem = event.target.closest('.screen-item');
  if (!screenItem) {
    return;
  }

  draggedScreenIndex = Number(screenItem.dataset.index);
  screenItem.classList.add('dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', screenItem.dataset.index);
  }
}

function handleScreenDragOver(event) {
  if (draggedScreenIndex === null) {
    return;
  }

  const targetItem = event.target.closest('.screen-item');
  if (!targetItem) {
    return;
  }

  event.preventDefault();
  clearDragIndicators();

  const targetIndex = Number(targetItem.dataset.index);
  if (targetIndex !== draggedScreenIndex) {
    targetItem.classList.add('drag-over');
  }
}

function handleScreenDrop(event) {
  if (draggedScreenIndex === null) {
    return;
  }

  const targetItem = event.target.closest('.screen-item');
  if (!targetItem) {
    return;
  }

  event.preventDefault();

  const targetIndex = Number(targetItem.dataset.index);
  if (targetIndex === draggedScreenIndex) {
    clearDragState();
    return;
  }

  const targetBounds = targetItem.getBoundingClientRect();
  const placeAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
  const movedScreen = screenDraftMessages.splice(draggedScreenIndex, 1)[0];
  let insertIndex = targetIndex;

  if (draggedScreenIndex < targetIndex) {
    insertIndex = placeAfter ? targetIndex : targetIndex - 1;
  } else if (placeAfter) {
    insertIndex = targetIndex + 1;
  }

  screenDraftMessages.splice(insertIndex, 0, movedScreen);

  markScreensDirty();
  renderScreensList();
}

function handleSaveScreenModal(event) {
  event.preventDefault();

  if (!currentConfig) {
    setStatus('Load the admin config before editing screens.', 'error');
    return;
  }

  const lineInputs = Array.from(screenLineFields.querySelectorAll('input'));
  const lines = lineInputs.map((input) => input.value.trim());
  const lastPopulatedIndex = findLastPopulatedIndex(lines);

  if (lastPopulatedIndex === -1) {
    setStatus('Enter at least one line for the screen.', 'error');
    return;
  }

  const nextScreen = lines.slice(0, lastPopulatedIndex + 1);
  if (editingScreenIndex === null) {
    screenDraftMessages.push(nextScreen);
  } else {
    screenDraftMessages[editingScreenIndex] = nextScreen;
  }

  markScreensDirty();
  renderScreensList();
  closeScreenModal();
}

function showLogin() {
  loginShell.classList.remove('hidden');
  dashboardShell.classList.add('hidden');
  loginPanel.classList.remove('hidden');
  switchPage('home');
  passwordInput.focus();
}

function showDashboard(config) {
  loginShell.classList.add('hidden');
  dashboardShell.classList.remove('hidden');
  applyConfig(config);
  switchPage(activePage);
}

function applyConfig(config) {
  currentConfig = {
    ...config,
    defaultMessages: cloneMessages(config.defaultMessages),
  };
  screenDraftMessages = cloneMessages(config.defaultMessages);
  screensDirty = false;

  colsInput.value = String(config.cols);
  rowsInput.value = String(config.rows);
  durationInput.value = String(config.apiMessageDurationSeconds);

  updateScreensDraftNote();
  renderScreensList();
}

function renderScreensList() {
  screensList.replaceChildren();

  for (const [index, screen] of screenDraftMessages.entries()) {
    const screenItem = document.createElement('article');
    screenItem.className = 'screen-item';
    screenItem.draggable = true;
    screenItem.dataset.index = String(index);

    const header = document.createElement('div');
    header.className = 'screen-item-header';

    const title = document.createElement('h3');
    title.className = 'screen-item-title';
    title.textContent = `Screen ${index + 1}`;

    const actions = document.createElement('div');
    actions.className = 'screen-item-actions';

    actions.append(
      buildScreenActionButton('drag-handle', 'Drag to reorder'),
      buildScreenActionButton('', 'Edit', 'edit'),
      buildScreenActionButton('danger', 'Delete', 'delete'),
    );

    header.append(title, actions);

    const preview = document.createElement('div');
    preview.className = 'screen-preview';

    for (let lineIndex = 0; lineIndex < currentConfig.rows; lineIndex += 1) {
      const line = screen[lineIndex] ?? '';
      const lineElement = document.createElement('div');
      lineElement.className = 'screen-preview-line';
      if (!line) {
        lineElement.classList.add('is-empty');
      } else {
        lineElement.textContent = line;
      }
      preview.append(lineElement);
    }

    screenItem.append(header, preview);
    screensList.append(screenItem);
  }
}

function buildScreenActionButton(extraClassName, label, action = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['screen-action', extraClassName].filter(Boolean).join(' ');
  button.textContent = label;

  if (action) {
    button.dataset.screenAction = action;
  }

  return button;
}

function openScreenModal(index = null) {
  if (!currentConfig) {
    setStatus('Load the admin config before editing screens.', 'error');
    return;
  }

  editingScreenIndex = index;
  screenModalTitle.textContent = index === null ? 'Add Screen' : `Edit Screen ${index + 1}`;
  screenLineFields.replaceChildren();

  const sourceLines = index === null ? [] : screenDraftMessages[index];

  for (let lineIndex = 0; lineIndex < currentConfig.rows; lineIndex += 1) {
    const field = document.createElement('label');
    field.className = 'field';

    const label = document.createElement('span');
    label.textContent = `Line ${lineIndex + 1}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = currentConfig.cols;
    input.value = sourceLines?.[lineIndex] ?? '';
    input.placeholder = `Up to ${currentConfig.cols} characters`;

    field.append(label, input);
    screenLineFields.append(field);
  }

  if (typeof screenModal.showModal === 'function') {
    screenModal.showModal();
  } else {
    screenModal.setAttribute('open', 'open');
  }

  const firstInput = screenLineFields.querySelector('input');
  if (firstInput) {
    firstInput.focus();
  }
}

function closeScreenModal() {
  editingScreenIndex = null;

  if (typeof screenModal.close === 'function' && screenModal.open) {
    screenModal.close();
    return;
  }

  screenModal.removeAttribute('open');
}

function switchPage(pageId) {
  activePage = pageId;

  for (const navButton of navButtons) {
    const isActive = navButton.dataset.pageTarget === pageId;
    navButton.classList.toggle('active', isActive);

    if (isActive) {
      navButton.setAttribute('aria-current', 'page');
      workspaceTitle.textContent = navButton.dataset.pageTitle;
      workspaceCopy.textContent = navButton.dataset.pageCopy;
    } else {
      navButton.removeAttribute('aria-current');
    }
  }

  for (const pagePanel of pagePanels) {
    pagePanel.classList.toggle('hidden', pagePanel.dataset.page !== pageId);
  }
}

function markScreensDirty() {
  screensDirty = true;
  updateScreensDraftNote();
  setStatus('Screens changed locally. Save screens to persist them.');
}

function updateScreensDraftNote() {
  screensDraftNote.classList.toggle('hidden', !screensDirty);
}

function clearDragIndicators() {
  for (const item of screensList.querySelectorAll('.screen-item')) {
    item.classList.remove('drag-over');
  }
}

function clearDragState() {
  draggedScreenIndex = null;
  clearDragIndicators();

  for (const item of screensList.querySelectorAll('.screen-item')) {
    item.classList.remove('dragging');
  }
}

function cloneMessages(messages) {
  return messages.map((message) => [...message]);
}

function findLastPopulatedIndex(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]) {
      return index;
    }
  }

  return -1;
}

function setStatus(message, kind = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';
  if (kind) {
    statusMessage.classList.add(kind);
  }
}

async function readError(response, fallback) {
  try {
    const payload = await response.json();
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}
