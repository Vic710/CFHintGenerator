// background.js
const SERVER_BASE_URL = 'https://cfhintgenerator.onrender.com';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processCodeforcesProblem') {
    processCodeforcesProblem(message.tabId, message.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Error processing problem:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});

async function processCodeforcesProblem(tabId, apiKey) {
  try {
    // 1. Extract problem and tutorial URL
    const [{ result: { problemText, tutorialUrl, problemCode } }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const problemEl = document.querySelector('.problem-statement');
        const problemText = problemEl?.innerText || document.body.innerText;
        const tutorialAnchor = Array.from(document.querySelectorAll('a'))
          .find(a => /Tutorial/i.test(a.innerText));
        const tutorialUrl = tutorialAnchor?.href || null;
        const parts = window.location.pathname.split('/');
        const problemCode = parts.at(-2) + parts.at(-1);
        return { problemText, tutorialUrl, problemCode };
      }
    });

    if (!tutorialUrl) throw new Error('Tutorial link not found');

    // Send problem text
    await sendToServer({
      type: 'problem',
      problemCode,
      content: problemText,
      apiKey
    });

    // 2. Open tutorial in hidden tab
    const tutorialTab = await new Promise(resolve => {
      chrome.tabs.create({ url: tutorialUrl, active: false, pinned: true }, resolve);
    });
    await waitForTabLoad(tutorialTab.id);

    // 3. Extract tutorial HTML/text/clean
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tutorialTab.id },
      func: (problemCode) => {
        const bodyHTML = document.body.innerHTML;
        const lines = bodyHTML.split(/<hr ?\/?>/i);
        let capture = false, htmlChunk = '';
        for (const block of lines) {
          if (block.includes(problemCode)) capture = true;
          else if (capture && /\b\d{4}[A-Z]\b/.test(block)) break;
          if (capture) htmlChunk += block + '<hr>';
        }
        const el = document.createElement('div');
        el.innerHTML = htmlChunk;
        const text = el.innerText;
        let cleanedText = (() => {
          const start = text.search(new RegExp(problemCode, 'i'));
          if (start < 0) return text;
          let end = text.length;
          const cIdx = text.toLowerCase().indexOf('comments', start);
          if (cIdx > 0) end = cIdx;
          const nextMatch = text.slice(start + problemCode.length).match(/\b\d{4}[A-Z]\b/);
          if (nextMatch) {
            const nm = start + problemCode.length + nextMatch.index;
            end = Math.min(end, nm);
          }
          return text.slice(start, end).trim();
        })();
        return { html: htmlChunk, text, cleanedText };
      },
      args: [problemCode]
    });

    // 4. Send tutorial data
    await sendToServer({ type: 'tutorial_html',  problemCode, content: result.html,       apiKey });
    await sendToServer({ type: 'tutorial_text',  problemCode, content: result.text,       apiKey });
    await sendToServer({ type: 'tutorial_clean', problemCode, content: result.cleanedText, apiKey });

    // 5. Clean up
    setTimeout(() => chrome.tabs.remove(tutorialTab.id), 2000);
    return true;

  } catch (error) {
    console.error('Error in processCodeforcesProblem:', error);
    throw error;
  }
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendToServer(data) {
  const url = `${SERVER_BASE_URL}/save-data`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(r => {
    if (!r.ok) throw new Error(`Server ${r.status}`);
    return r.json();
  })
  .then(json => {
    console.log('✅ Data sent:', data.type);
    return json;
  })
  .catch(err => {
    console.error('❌ sendToServer failed:', err);
    throw err;
  });
}
