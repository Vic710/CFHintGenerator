// popup/popup.js
const SERVER_BASE_URL = 'https://cf-hint-generator.vercel.app/';

document.addEventListener('DOMContentLoaded', () => {
  // API key UI
  const apiKeyInput   = document.getElementById('api-key-input');
  const saveKeyBtn    = document.getElementById('save-api-key-btn');
  const keyError      = document.getElementById('key-error');
  const keyEntry      = document.getElementById('key-entry');
  const changeKeyBtn  = document.getElementById('change-api-key-btn');
  const changeKeyCont = document.getElementById('change-key-container');

  // Hints UI
  const getHintsBtn    = document.getElementById('get-hints-btn');
  const loading        = document.getElementById('loading');
  const statusMessage  = document.getElementById('status-message');
  const hintsContainer = document.getElementById('hints-container');
  const errorContainer = document.getElementById('error-container');
  const hintButtons    = [
    { btn: document.getElementById('hint1-btn'), content: document.getElementById('hint1-content'), next: document.getElementById('hint2-box') },
    { btn: document.getElementById('hint2-btn'), content: document.getElementById('hint2-content'), next: document.getElementById('hint3-box') },
    { btn: document.getElementById('hint3-btn'), content: document.getElementById('hint3-content') }
  ];

  let currentProblemCode = null;

  // Load key
  chrome.storage.sync.get('apiKey', ({ apiKey }) => {
    if (apiKey) {
      keyEntry.classList.add('hidden');
      changeKeyCont.classList.remove('hidden');
      getHintsBtn.disabled = false;
    } else {
      keyEntry.classList.remove('hidden');
      changeKeyCont.classList.add('hidden');
      getHintsBtn.disabled = true;
    }
  });

  // Save key
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyError.textContent = 'API key cannot be empty.';
      keyError.classList.remove('hidden');
      return;
    }
    chrome.storage.sync.set({ apiKey: key }, () => {
      keyError.classList.add('hidden');
      keyEntry.classList.add('hidden');
      changeKeyCont.classList.remove('hidden');
      getHintsBtn.disabled = false;
    });
  });

  // Change key
  changeKeyBtn.addEventListener('click', () => {
    apiKeyInput.value = '';
    keyEntry.classList.remove('hidden');
    changeKeyCont.classList.add('hidden');
    getHintsBtn.disabled = true;
  });

  // Toggle hints
  hintButtons.forEach(({ btn, content, next }) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        btn.textContent = btn.textContent.replace('Show', 'Hide');
        next?.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
        btn.textContent = btn.textContent.replace('Hide', 'Show');
      }
    });
  });

  // Server status
  checkServerStatus();

  // Get hints
  getHintsBtn.addEventListener('click', handleGetHints);

  function checkServerStatus() {
    fetch(`${SERVER_BASE_URL}/status`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => {
        statusMessage.innerHTML = `<p>Server is online. Ready to generate hints. Try every way you can think of solving the problem before seeing the hints.</p>`;
      })
      .catch(() => {
        statusMessage.innerHTML = `
          <p>Server is offline. Please start or deploy your backend.</p>`;
        getHintsBtn.disabled = true;
      });
  }

  function handleGetHints() {
    resetUI();
    loading.classList.remove('hidden');
    getHintsBtn.disabled = true;

    chrome.storage.sync.get('apiKey', ({ apiKey }) => {
      if (!apiKey) {
        showError('Please enter your API key first.');
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const url = tabs[0].url;
        if (!url.includes('codeforces.com/problemset/problem/')) {
          showError('Navigate to a Codeforces problem page.');
          return;
        }
        const parts = new URL(url).pathname.split('/');
        currentProblemCode = parts.at(-2) + parts.at(-1);

        chrome.runtime.sendMessage({
          action: 'processCodeforcesProblem',
          tabId: tabs[0].id,
          apiKey
        }, res => {
          if (res?.success) pollForHints(currentProblemCode);
          else showError('Failed to start hint generation.');
        });
      });
    });
  }

  function pollForHints(code) {
    let attempts = 0, max = 30;
    const check = () => {
      if (attempts++ >= max) return showError('Timeout, please try again.');
      fetch(`${SERVER_BASE_URL}/check-hints?problemCode=${code}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => d.hintsAvailable ? getAndDisplay(code) : setTimeout(check, 2000))
        .catch(() => setTimeout(check, 2000));
    };
    check();
  }

  function getAndDisplay(code) {
    fetch(`${SERVER_BASE_URL}/get-hints?problemCode=${code}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        if (d.hints?.length === 3) {
          loading.classList.add('hidden');
          hintsContainer.classList.remove('hidden');
          d.hints.forEach((h, i) => hintButtons[i].content.textContent = h);
          statusMessage.innerHTML = `<p>Hints ready for ${code}.</p>`;
          getHintsBtn.disabled = false;
        } else showError('Invalid hints received.');
      })
      .catch(e => showError('Error: ' + e.message));
  }

  function showError(msg) {
    loading.classList.add('hidden');
    errorContainer.classList.remove('hidden');
    errorContainer.querySelector('p').textContent = msg;
    getHintsBtn.disabled = false;
  }

  function resetUI() {
    hintsContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
    hintButtons.forEach(({ btn, content, next }) => {
      btn.textContent = btn.textContent.replace(/Hide|Show/, 'Show');
      btn.classList.remove('active');
      content.classList.add('hidden');
      next?.classList.add('hidden');
    });
  }
});
