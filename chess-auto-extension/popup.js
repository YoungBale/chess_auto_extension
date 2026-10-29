/**
 * Chess Auto Tool - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const connPill = document.getElementById('conn-pill');
  const connText = document.getElementById('conn-text');
  const boardBadge = document.getElementById('board-badge');
  const statusMessage = document.getElementById('status-message');
  const detailTurn = document.getElementById('detail-turn');
  const detailFen = document.getElementById('detail-fen');

  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const segButtons = document.querySelectorAll('.seg-btn');
  const engineSelect = document.getElementById('engine-select');
  const delaySlider = document.getElementById('delay-slider');
  const delayVal = document.getElementById('delay-val');
  const eloSlider = document.getElementById('elo-slider');
  const eloVal = document.getElementById('elo-val');
  const depthSlider = document.getElementById('depth-slider');
  const depthVal = document.getElementById('depth-val');
  const hudToggle = document.getElementById('hud-toggle');
  const btnOpenTest = document.getElementById('btn-open-test');

  let currentConfig = {
    side: 'auto',
    moveDelay: 700,
    engineMode: 'stockfish_offline',
    elo: 3200,
    depth: 14,
    showHUD: true
  };

  // Lấy tab hiện tại
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Gửi lệnh đến content script (tự động nạp script nếu tab chưa có)
  async function sendToContentScript(command, extra = {}) {
    const tab = await getActiveTab();
    if (!tab?.id) return null;

    try {
      return await chrome.tabs.sendMessage(tab.id, {
        type: 'CHESS_COMMAND',
        command,
        ...extra
      });
    } catch (err) {
      // Tab có thể mở trước khi cài tiện ích -> Thử tự động inject script
      try {
        if (chrome.scripting && tab.url && !tab.url.startsWith('chrome://')) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['chess.js', 'engine.js', 'content.js']
          });
          await new Promise(r => setTimeout(r, 250));
          return await chrome.tabs.sendMessage(tab.id, {
            type: 'CHESS_COMMAND',
            command,
            ...extra
          });
        }
      } catch (injectErr) {
        // Tab không cho phép inject (ví dụ chrome://) -> bỏ qua
      }
      return null;
    }
  }

  // Cập nhật giao diện cài đặt theo config
  function applyConfigToUI(cfg) {
    currentConfig = { ...currentConfig, ...cfg };

    // Side buttons
    segButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.side === currentConfig.side);
    });

    // Engine select
    engineSelect.value = currentConfig.engineMode || 'stockfish_offline';

    // Elo
    const elo = currentConfig.elo || 3200;
    if (eloSlider && eloVal) {
      eloSlider.value = elo;
      if (elo >= 3000) eloVal.textContent = `${elo} (Đại kiện tướng GM)`;
      else if (elo >= 2200) eloVal.textContent = `${elo} (Kiện tướng Master)`;
      else if (elo >= 1600) eloVal.textContent = `${elo} (Cao thủ Club)`;
      else eloVal.textContent = `${elo} (Nghiệp dư Casual)`;
    }

    // Delay (3 đến 7 giây)
    const delay = (currentConfig.moveDelay && currentConfig.moveDelay >= 3000 && currentConfig.moveDelay <= 7000) ? currentConfig.moveDelay : 5000;
    delaySlider.value = delay;
    delayVal.textContent = (delay / 1000).toFixed(1) + 's (3s - 7s Tự nhiên)';

    // Depth
    const depth = currentConfig.depth || 16;
    depthSlider.value = depth;
    depthVal.textContent = `${depth} (Elo 3500+ GM)`;

    // HUD
    hudToggle.checked = currentConfig.showHUD !== false;
  }

  // Lưu và đồng bộ cấu hình
  async function saveConfig() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ chess_auto_config: currentConfig });
    }
    await sendToContentScript('UPDATE_CONFIG', { newConfig: currentConfig });
  }

  // Nạp cấu hình từ storage nếu có (tự động tối ưu nếu cài đặt cũ bị chậm)
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['chess_auto_config'], (res) => {
      if (res && res.chess_auto_config) {
        let loaded = { ...res.chess_auto_config };
        // Cài đặt mặc định thời gian suy nghĩ: 3 đến 7 giây (mặc định 5s)
        if (!loaded.moveDelay || loaded.moveDelay < 3000 || loaded.moveDelay > 7000) {
          loaded.moveDelay = 5000;
        }
        loaded.minDelay = 3000;
        loaded.maxDelay = 7000;
        // Tự động chuyển sang Stockfish GM Offline nếu đang dùng Online Cloud
        if (loaded.engineMode === 'stockfish_online') {
          loaded.engineMode = 'stockfish_offline';
        }
        applyConfigToUI(loaded);
        saveConfig();
      }
    });
  }

  // Kiểm tra trạng thái hiện tại từ content script
  async function refreshStatus() {
    const res = await sendToContentScript('GET_STATUS');
    if (!res) {
      connPill.className = 'conn-pill standby';
      connText.textContent = 'Chưa kết nối';
      boardBadge.className = 'board-badge not-found';
      boardBadge.textContent = 'Chưa sẵn sàng';
      statusMessage.textContent = 'Chưa phát hiện content script trên trang này. Hãy tải lại tab hoặc mở bàn cờ thử nghiệm.';
      return;
    }

    if (res.boardFound) {
      boardBadge.className = 'board-badge found';
      boardBadge.textContent = 'Đã thấy bàn cờ';
    } else {
      boardBadge.className = 'board-badge not-found';
      boardBadge.textContent = 'Chưa thấy bàn cờ';
    }

    if (res.running) {
      connPill.className = 'conn-pill running';
      connText.textContent = 'Đang tự đánh';
      statusMessage.textContent = res.isThinking ? 'Engine đang phân tích nước đi...' : 'Bot đang hoạt động và theo dõi lượt đi.';
    } else {
      connPill.className = 'conn-pill standby';
      connText.textContent = 'Đã dừng';
      statusMessage.textContent = res.boardFound ? 'Bàn cờ sẵn sàng. Nhấn "Bắt đầu" để bot tự đánh.' : 'Không tìm thấy bàn cờ tương thích.';
    }

    detailTurn.textContent = res.turn === 'w' ? 'Trắng đi (White)' : res.turn === 'b' ? 'Đen đi (Black)' : '--';
    detailFen.textContent = res.fen || '--';
    if (res.config) {
      applyConfigToUI(res.config);
    }
  }

  // Bắt đầu
  btnStart.addEventListener('click', async () => {
    statusMessage.textContent = 'Đang gửi lệnh bắt đầu...';
    const res = await sendToContentScript('START');
    if (res) {
      statusMessage.textContent = res.status;
      refreshStatus();
    } else {
      statusMessage.textContent = 'Lỗi kết nối: Tab hiện tại chưa nạp extension hoặc không phải trang web.';
    }
  });

  // Dừng lại
  btnStop.addEventListener('click', async () => {
    statusMessage.textContent = 'Đang dừng...';
    const res = await sendToContentScript('STOP');
    if (res) {
      statusMessage.textContent = res.status;
      refreshStatus();
    }
  });

  // Đi ngay nước này
  const btnForce = document.getElementById('btn-force');
  if (btnForce) {
    btnForce.addEventListener('click', async () => {
      statusMessage.textContent = 'Đang tính và đi ngay nước này...';
      const res = await sendToContentScript('FORCE_MOVE');
      if (res) {
        statusMessage.textContent = res.status;
        refreshStatus();
      }
    });
  }

  // Chuyển phe
  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      segButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentConfig.side = btn.dataset.side;
      saveConfig();
    });
  });

  // Đổi engine
  engineSelect.addEventListener('change', () => {
    currentConfig.engineMode = engineSelect.value;
    saveConfig();
  });

  // Đổi delay (3 đến 7 giây)
  delaySlider.addEventListener('input', () => {
    const val = parseInt(delaySlider.value, 10);
    delayVal.textContent = (val / 1000).toFixed(1) + 's (3s - 7s Tự nhiên)';
    currentConfig.moveDelay = val;
    currentConfig.minDelay = 3000;
    currentConfig.maxDelay = 7000;
    saveConfig();
  });

  // Đổi Elo
  if (eloSlider) {
    eloSlider.addEventListener('input', () => {
      const elo = parseInt(eloSlider.value, 10);
      if (elo >= 3000) eloVal.textContent = `${elo} (Đại kiện tướng GM)`;
      else if (elo >= 2200) eloVal.textContent = `${elo} (Kiện tướng Master)`;
      else if (elo >= 1600) eloVal.textContent = `${elo} (Cao thủ Club)`;
      else eloVal.textContent = `${elo} (Nghiệp dư Casual)`;
      currentConfig.elo = elo;
      saveConfig();
    });
  }

  // Đổi depth
  depthSlider.addEventListener('input', () => {
    depthVal.textContent = `${depthSlider.value} (Elo 3500+ GM)`;
    currentConfig.depth = parseInt(depthSlider.value, 10);
    saveConfig();
  });

  // HUD toggle
  hudToggle.addEventListener('change', () => {
    currentConfig.showHUD = hudToggle.checked;
    saveConfig();
  });

  // Mở bàn cờ thử nghiệm
  btnOpenTest.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test-board/index.html') });
  });

  // Tự động kiểm tra trạng thái lúc mở
  await refreshStatus();
});
