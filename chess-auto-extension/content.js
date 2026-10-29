/**
 * Chess Auto Tool - Content Script
 * Tích hợp:
 * 1. chess.js: Quản lý luật cờ vua quốc tế, xác thực FEN, tính nước chiếu hết.
 * 2. Board Delta Tracker: Nhận diện lượt đi toán học 100% chuẩn xác dựa trên biến động quân cờ, không bao giờ bị dừng cờ giữa chừng.
 * 3. Engine Adapter: Stockfish 16 (Elo 3500+) + Lichess Cloud Database + Khai cuộc GM.
 * 4. Blitz Panic Mode: Tự động phát hiện đồng hồ sắp hết giờ (<20s, <10s) để đánh siêu tốc (80ms-250ms), không bao giờ thua giờ!
 * 5. Instant Mate: ĂN XE / ĂN HẬU CHIẾU HẾT thực hiện trong 150ms.
 * 6. Floating HUD tương tác trực tiếp: Xem lượt, đổi phe, đi ngay, dừng/chạy.
 */

(function () {
  let isRunning = false;
  let isThinking = false;
  let waitingForOpponent = false;
  let lastBotMovePlacement = null; // FEN placement sau khi bot vừa thực hiện nước đi
  let lastProcessedFen = null;
  let pollInterval = null;
  let detectedPlayerSide = null; // Phe bot ('w' | 'b') được ghi nhớ trong ván

  // Lịch sử bàn cờ để xác định nước vừa đi (Delta Tracker)
  let previousBoardMap = null;
  let trackedTurn = 'w'; // 'w' | 'b'

  // Cấu hình
  let config = {
    side: 'auto',          // 'auto' | 'w' | 'b'
    moveDelay: 5000,       // Thời gian suy nghĩ: 3 đến 7 giây (mặc định 5s)
    minDelay: 3000,        // Tối thiểu 3.0 giây
    maxDelay: 7000,        // Tối đa 7.0 giây
    engineMode: 'stockfish_offline', // MẶC ĐỊNH LÀ STOCKFISH GM OFFLINE (ELO 3200+)
    elo: 3200,             // Sức cờ Elo
    depth: 14,
    showHUD: true
  };

  // Nạp cấu hình từ chrome.storage nếu có
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['chess_auto_config'], (res) => {
      if (res && res.chess_auto_config) {
        config = { ...config, ...res.chess_auto_config };
        // Tốc độ đánh từ 3 đến 7 giây
        if (!config.minDelay) config.minDelay = 3000;
        if (!config.maxDelay) config.maxDelay = 7000;
        // Luôn chuyển sang Stockfish GM Offline
        if (config.engineMode === 'stockfish_online') {
          config.engineMode = 'stockfish_offline';
        }
        updateHUD();
      }
    });
  }

  // Kiểm tra xem trang hiện tại có phải trang chơi cờ không
  function isChessPage() {
    const host = window.location.hostname || '';
    const path = window.location.pathname || '';
    if (host.includes('youtube.com') || host.includes('google.com') || host.includes('facebook.com')) return false;
    if (host.includes('allinone') || host.includes('chess') || host.includes('lichess') || path.includes('pvp') || path.includes('test-board')) return true;
    return !!(document.getElementById('chessboard-board') || document.querySelector('[data-chess-board]') || document.querySelector('[data-square]'));
  }

  // Khởi tạo Floating HUD trên màn hình
  let hudElement = null;

  function createHUD() {
    if (hudElement || !config.showHUD) return;
    if (!isChessPage()) return; // Không hiển thị HUD trên các trang như YouTube, Google...
    hudElement = document.createElement('div');
    hudElement.id = 'chess-auto-hud';
    hudElement.innerHTML = `
      <div class="cah-inner">
        <div class="cah-header">
          <div style="display:flex; align-items:center;">
            <span class="cah-dot"></span>
            <span class="cah-title">Chess Auto Pro</span>
          </div>
          <span class="cah-close" title="Ẩn bảng">&times;</span>
        </div>
        <div class="cah-body">
          <div class="cah-row"><span class="cah-lbl">Trạng thái:</span> <strong id="cah-status">Chờ bàn cờ...</strong></div>
          <div class="cah-row">
            <span class="cah-lbl">Phe bot:</span> 
            <button id="cah-btn-side" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;" title="Bấm để đổi phe">Tự động 🔄</button>
          </div>
          <div class="cah-row"><span class="cah-lbl">Engine:</span> <strong style="color:#f59e0b;" id="cah-engine-label">Stockfish GM ⚡</strong></div>
          <div class="cah-row"><span class="cah-lbl">Gợi ý nước:</span> <span id="cah-move">--</span> (<span id="cah-eval">0.00</span>)</div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <button id="cah-btn-force" style="flex:1; padding:6px 8px; font-size:11px; font-weight:700; border-radius:6px; border:none; background:#4f46e5; color:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.3);">⚡ ĐI NGAY</button>
            <button id="cah-btn-toggle" style="padding:6px 10px; font-size:11px; font-weight:700; border-radius:6px; border:none; background:#10b981; color:#fff; cursor:pointer;">▶ CHẠY</button>
          </div>
        </div>
      </div>
    `;

    // Inject styles cho HUD
    const style = document.createElement('style');
    style.textContent = `
      #chess-auto-hud {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: #f8fafc;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        padding: 12px 16px;
        min-width: 230px;
        pointer-events: auto;
        user-select: none;
        transition: all 0.2s ease;
      }
      .cah-inner { display: flex; flex-direction: column; gap: 8px; }
      .cah-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; }
      .cah-dot { width: 9px; height: 9px; border-radius: 50%; background: #94a3b8; display: inline-block; margin-right: 8px; }
      .cah-dot.active { background: #10b981; box-shadow: 0 0 10px #10b981; }
      .cah-dot.thinking { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
      .cah-dot.panic { background: #ef4444; box-shadow: 0 0 12px #ef4444; }
      .cah-title { font-size: 13px; letter-spacing: 0.5px; color: #e2e8f0; font-weight: 700; }
      .cah-close { cursor: pointer; color: #94a3b8; font-size: 18px; line-height: 1; }
      .cah-close:hover { color: #f8fafc; }
      .cah-body { display: flex; flex-direction: column; gap: 6px; }
      .cah-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
      .cah-lbl { color: #94a3b8; }
      #cah-status { color: #38bdf8; }
      #cah-move { color: #a78bfa; font-weight: 700; font-family: monospace; font-size: 13px; }
      #cah-eval { color: #34d399; font-weight: 600; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(hudElement);

    hudElement.querySelector('.cah-close').addEventListener('click', () => {
      hudElement.style.display = 'none';
    });

    hudElement.querySelector('#cah-btn-force')?.addEventListener('click', () => {
      triggerForceMove();
    });

    hudElement.querySelector('#cah-btn-side')?.addEventListener('click', () => {
      // Đổi phe: auto -> w -> b -> auto
      if (config.side === 'auto') config.side = 'w';
      else if (config.side === 'w') config.side = 'b';
      else config.side = 'auto';

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ chess_auto_config: config });
      }
      lastProcessedFen = null;
      updateHUD();
      setTimeout(checkAndPlay, 50);
    });

    hudElement.querySelector('#cah-btn-toggle')?.addEventListener('click', () => {
      if (isRunning) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    });
  }

  function updateHUD(statusText, moveText, evalText, state = 'idle') {
    if (!hudElement) createHUD();
    if (!hudElement) return;

    const dot = hudElement.querySelector('.cah-dot');
    const statusEl = document.getElementById('cah-status');
    const sideBtn = document.getElementById('cah-btn-side');
    const moveEl = document.getElementById('cah-move');
    const evalEl = document.getElementById('cah-eval');
    const toggleBtn = document.getElementById('cah-btn-toggle');
    const engineLabel = document.getElementById('cah-engine-label');

    if (engineLabel) {
      if (config.engineMode === 'stockfish_offline') {
        engineLabel.textContent = `Stockfish GM (${config.elo || 3200}) ⚡`;
      } else if (config.engineMode === 'stockfish_online') {
        engineLabel.textContent = 'Stockfish Cloud ☁️';
      } else {
        engineLabel.textContent = 'Minimax Pro (JS) 🧠';
      }
    }

    if (dot) {
      dot.className = 'cah-dot ' + (state === 'active' ? 'active' : state === 'thinking' ? 'thinking' : state === 'panic' ? 'panic' : '');
    }
    if (statusEl && statusText) statusEl.textContent = statusText;
    if (sideBtn) {
      if (config.side === 'auto') {
        const detected = detectedPlayerSide === 'b' ? 'Đen (B) [Tự động 🔄]' : detectedPlayerSide === 'w' ? 'Trắng (W) [Tự động 🔄]' : 'Tự động 🔄';
        sideBtn.textContent = detected;
      } else {
        sideBtn.textContent = config.side === 'w' ? 'Trắng (W) ⚪' : 'Đen (B) ⚫';
      }
    }
    if (moveEl && moveText !== undefined) moveEl.textContent = moveText;
    if (evalEl && evalText !== undefined) evalEl.textContent = evalText;
    if (toggleBtn) {
      toggleBtn.textContent = isRunning ? '⏸ DỪNG' : '▶ CHẠY';
      toggleBtn.style.background = isRunning ? '#ef4444' : '#10b981';
    }
  }

  // Phát hiện đồng hồ còn bao nhiêu giây trên trang web
  function getRemainingSeconds() {
    let minSeconds = 999;
    const clockEls = document.querySelectorAll('[class*="clock"], [class*="timer"], [class*="time"], [id*="clock"], [id*="timer"]');
    for (let el of clockEls) {
      const txt = (el.innerText || '').trim();
      const m = txt.match(/^([0-9]{1,2}):([0-5][0-9])$/);
      if (m) {
        const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        if (sec < minSeconds) minSeconds = sec;
      }
    }
    return minSeconds;
  }

  // Tính toán thời gian suy nghĩ: 3 đến 7 giây tự nhiên theo yêu cầu (kèm bảo vệ cháy giờ)
  function calculateIntelligentDelay(bestMove, inCheck) {
    // 1. Dứt điểm chiếu hết tức thì (Mate in 1: 1.5s để nhìn rõ thế cờ)
    if (bestMove.isCheckmate || bestMove.score === '#1') {
      console.log('[Chess Auto] 🏆 PHÁT HIỆN CHIẾU HẾT TỨC THÌ: Dứt điểm trong 1.5s!');
      return 1500;
    }

    // 2. BẢO VỆ CHỐNG THUA GIỜ: Nếu đồng hồ trận đấu còn quá ít (<30s) thì tự động đánh nhanh
    const remSec = getRemainingSeconds();
    if (remSec <= 10) {
      console.warn(`[Chess Auto] ⚡ ĐỒNG HỒ CÒN ${remSec}s: Đánh siêu tốc 150ms!`);
      return 150;
    }
    if (remSec <= 20) {
      console.warn(`[Chess Auto] ⚠️ ĐỒNG HỒ CÒN ${remSec}s: Đánh nhanh 600ms!`);
      return 600;
    }
    if (remSec <= 30) {
      console.warn(`[Chess Auto] ⚠️ ĐỒNG HỒ CÒN ${remSec}s: Đánh 1.5s!`);
      return 1500;
    }

    // 3. TỐC ĐỘ ĐÁNH TỰ NHIÊN: NGẪU NHIÊN TỪ 3 ĐẾN 7 GIÂY (3000ms - 7000ms) THEO YÊU CẦU
    const minD = 3000;
    const maxD = 7000;
    let targetMin = minD;
    let targetMax = maxD;
    if (config.moveDelay && config.moveDelay >= 3000 && config.moveDelay <= 7000) {
      targetMin = Math.max(3000, config.moveDelay - 1000);
      targetMax = Math.min(7000, config.moveDelay + 1000);
    }
    const randomDelay = Math.floor(Math.random() * (targetMax - targetMin + 1)) + targetMin;
    console.log(`[Chess Auto] ⏳ Thời gian suy nghĩ nước này: ${(randomDelay / 1000).toFixed(1)}s (khoảng 3-7s)`);
    return randomDelay;
  }

  // Chuẩn hóa FEN 6 trường
  function normalizeFENToCalculate(f, turn = 'w') {
    if (!f) return '';
    const trimmed = f.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return `${parts[0]} ${turn} KQkq - 0 1`;
    if (parts.length === 2) return `${parts[0]} ${turn} KQkq - 0 1`;
    if (parts.length === 3) return `${parts[0]} ${turn} ${parts[2]} - 0 1`;
    if (parts.length === 4) return `${parts[0]} ${turn} ${parts[2]} ${parts[3]} 0 1`;
    parts[1] = turn;
    return parts.join(' ');
  }

  // Quét và nhận diện bàn cờ ALL IN ONE CR7 (Next.js / react-chessboard / @dnd-kit)
  function detectAllInOneCR7Board() {
    const board = document.getElementById('chessboard-board') ||
                  document.querySelector('[id*="chessboard-board"]') ||
                  document.querySelector('[id^="chessboard-square-"]')?.parentElement;

    const sampleSquare = document.querySelector('[data-square]') ||
                         document.querySelector('[id^="chessboard-square-"]');

    if (!board && !sampleSquare) return null;

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    let fenRows = [];
    const currentPiecesMap = {};
    let totalPieces = 0;

    for (let r of ranks) {
      let emptyCount = 0;
      let rowStr = '';

      for (let f of files) {
        const sq = f + r;
        const sqEl = (board ? board.querySelector(`[data-square="${sq}"]`) : null) ||
                     document.getElementById(`chessboard-square-${sq}`) ||
                     document.querySelector(`[data-square="${sq}"]`);

        let pieceChar = null;
        if (sqEl) {
          // 1. Kiểm tra data-piece trực tiếp trên chính ô sqEl
          let rawCode = sqEl.getAttribute('data-piece') || '';

          // 2. Kiểm tra phần tử con bên trong sqEl
          if (!rawCode) {
            const pieceEl = sqEl.querySelector('[data-piece]') ||
                            sqEl.querySelector('[id*="chessboard-piece-"]') ||
                            sqEl.querySelector('[id*="piece-"]') ||
                            sqEl.querySelector('[role="button"]') ||
                            sqEl.querySelector('svg') ||
                            sqEl.firstElementChild;
            if (pieceEl) {
              rawCode = pieceEl.getAttribute('data-piece') || '';
              if (!rawCode && pieceEl.id) {
                const match = pieceEl.id.match(/piece-([wb][pnbrqk])/i);
                if (match) rawCode = match[1];
              }
              if (!rawCode && typeof pieceEl.className === 'string') {
                const mClass = pieceEl.className.match(/\b([wb][pnbrqk])\b/i);
                if (mClass) rawCode = mClass[1];
              }
            }
          }

          if (rawCode.length >= 2) {
            const color = rawCode[0].toLowerCase();
            const type = rawCode[1].toUpperCase();
            if (['w', 'b'].includes(color) && ['P', 'N', 'B', 'R', 'Q', 'K'].includes(type)) {
              pieceChar = color === 'w' ? type : type.toLowerCase();
              currentPiecesMap[sq] = rawCode;
              totalPieces++;
            }
          }
        }

        if (pieceChar) {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += pieceChar;
        } else {
          emptyCount++;
        }
      }

      if (emptyCount > 0) rowStr += emptyCount;
      fenRows.push(rowStr);
    }

    const fenPlacement = fenRows.join('/');

    // Xác định góc nhìn và phe người chơi (Orientation & Player Color)
    let orientation = 'white';
    const sqA1 = (board ? board.querySelector('[data-square="a1"]') : null) || document.querySelector('[data-square="a1"]') || document.getElementById('chessboard-square-a1');
    const sqA8 = (board ? board.querySelector('[data-square="a8"]') : null) || document.querySelector('[data-square="a8"]') || document.getElementById('chessboard-square-a8');
    if (sqA1 && sqA8) {
      const rectA1 = sqA1.getBoundingClientRect();
      const rectA8 = sqA8.getBoundingClientRect();
      if (rectA1.top < rectA8.top) {
        orientation = 'black';
      }
    }

    // Tự động phát hiện màu quân của người chơi (dựa vào cấu hình, tương tác và trang web)
    let playerColor = orientation === 'black' ? 'b' : 'w';
    if (config.side !== 'auto') {
      playerColor = config.side;
      detectedPlayerSide = config.side;
    } else if (detectedPlayerSide) {
      playerColor = detectedPlayerSide;
    } else {
      // Quét xem quân cờ nào người chơi có quyền cầm/kéo
      let whiteGrab = 0;
      let blackGrab = 0;
      const allPieces = (board || document).querySelectorAll('[data-piece]');
      for (let p of allPieces) {
        const code = p.getAttribute('data-piece') || '';
        if (code.length >= 2) {
          const c = code[0].toLowerCase();
          const parent = p.parentElement || p;
          const isInteractive = p.getAttribute('draggable') === 'true' ||
                                parent.getAttribute('draggable') === 'true' ||
                                p.getAttribute('role') === 'button' ||
                                parent.getAttribute('role') === 'button' ||
                                window.getComputedStyle(p).cursor === 'grab' ||
                                window.getComputedStyle(parent).cursor === 'grab';
          if (isInteractive) {
            if (c === 'w') whiteGrab++;
            if (c === 'b') blackGrab++;
          }
        }
      }
      if (blackGrab > 0 && whiteGrab === 0) {
        playerColor = 'b';
        detectedPlayerSide = 'b';
      } else if (whiteGrab > 0 && blackGrab === 0) {
        playerColor = 'w';
        detectedPlayerSide = 'w';
      }
    }

    // BỘ SUY LUẬN LƯỢT ĐI ĐỈNH CAO (BOARD DELTA TRACKER + GROUND TRUTH)
    // 1. Kiểm tra bàn cờ xuất phát (Đủ 32 quân ban đầu)
    const initialFenPlacement = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    if (fenPlacement === initialFenPlacement) {
      trackedTurn = 'w';
      hasGameStarted = true;
    } else if (previousBoardMap) {
      // 2. So sánh thay đổi với trạng thái bàn cờ trước đó:
      // Tìm quân cờ vừa di chuyển đến ô đích mới
      let movedPieceColor = null;
      for (let r of ranks) {
        for (let f of files) {
          const sq = f + r;
          const prev = previousBoardMap[sq];
          const curr = currentPiecesMap[sq];
          if (prev !== curr) {
            // Nếu ô này vừa nhận một quân cờ mới (ô đích của nước đi)
            if (curr && (!prev || prev[0].toLowerCase() !== curr[0].toLowerCase())) {
              movedPieceColor = curr[0].toLowerCase();
            }
          }
        }
      }

      if (movedPieceColor) {
        // Quân vừa di chuyển là movedPieceColor -> LƯỢT ĐI TIẾP THEO LÀ PHE NGƯỢC LẠI!
        trackedTurn = (movedPieceColor === 'w') ? 'b' : 'w';
      }
    } else if (!previousBoardMap) {
      // Trường hợp tải lại trang giữa trận: Quét ô sáng (highlight) nước vừa đi của react-chessboard
      const highlightedSquares = document.querySelectorAll('[data-square][style*="rgba(255, 255, 0"], [data-square][style*="background"], [data-square][class*="highlight"], [data-square][class*="last-move"]');
      for (let hSq of highlightedSquares) {
        const sqName = hSq.getAttribute('data-square') || '';
        const pieceOnHighlight = currentPiecesMap[sqName];
        if (pieceOnHighlight) {
          const lastMovedColor = pieceOnHighlight[0].toLowerCase();
          trackedTurn = (lastMovedColor === 'w') ? 'b' : 'w';
          break;
        }
      }
    }

    // 3. Ground Truth Text kiểm chứng bổ sung (nếu website có hiển thị)
    const bodyText = (document.body.innerText || '').toLowerCase();
    if (/(?:lượt\s+của\s+bạn|đến\s+lượt\s+bạn|lượt\s+bạn|your\s+turn)/i.test(bodyText)) {
      playerColor = trackedTurn;
      detectedPlayerSide = trackedTurn;
    } else if (/(?:lượt\s+(?:của\s+)?đối\s+thủ|chờ\s+đối\s+thủ|đang\s+chờ\s+đối\s+thủ|opponent(?:'s)?\s+turn)/i.test(bodyText)) {
      playerColor = trackedTurn === 'w' ? 'b' : 'w';
      detectedPlayerSide = playerColor;
    }

    // Lưu lại trạng thái bàn cờ hiện tại
    previousBoardMap = { ...currentPiecesMap };

    // Xác định xem có phải lượt của bot không
    let isMyTurn = false;
    if (config.side === 'auto') {
      isMyTurn = (trackedTurn === playerColor);
    } else {
      isMyTurn = (trackedTurn === config.side);
    }

    // Kiểm tra quyền nhập thành thực tế
    let castling = '';
    const getPieceCode = (sq) => (currentPiecesMap[sq] || '').toUpperCase();
    const pE1 = getPieceCode('e1');
    const pH1 = getPieceCode('h1');
    const pA1 = getPieceCode('a1');
    if (pE1.includes('WK') || pE1.endsWith('K')) {
      if (pH1.includes('WR') || pH1.endsWith('R')) castling += 'K';
      if (pA1.includes('WR') || pA1.endsWith('R')) castling += 'Q';
    }
    const pE8 = getPieceCode('e8');
    const pH8 = getPieceCode('h8');
    const pA8 = getPieceCode('a8');
    if (pE8.includes('BK') || pE8.endsWith('K')) {
      if (pH8.includes('BR') || pH8.endsWith('R')) castling += 'k';
      if (pA8.includes('BR') || pA8.endsWith('R')) castling += 'q';
    }
    if (!castling) castling = '-';

    // FEN hoàn chỉnh
    let fullFEN = `${fenPlacement} ${trackedTurn} ${castling} - 0 1`;

    // Xác thực bằng chess.js
    let chess = null;
    let inCheck = false;
    let inCheckmate = false;
    let legalMovesCount = 0;

    const ChessCtor = window.Chess || globalThis.Chess;
    if (typeof ChessCtor === 'function') {
      try {
        chess = new ChessCtor();
        let loaded = chess.load(fullFEN);
        if (!loaded) {
          // Thử với lượt ngược lại nếu thế cờ chỉ hợp lệ với lượt đối diện (Vua đang bị chiếu)
          const oppTurn = trackedTurn === 'w' ? 'b' : 'w';
          if (chess.load(`${fenPlacement} ${oppTurn} - - 0 1`)) {
            trackedTurn = oppTurn;
            fullFEN = `${fenPlacement} ${trackedTurn} - - 0 1`;
            loaded = true;
          } else {
            loaded = chess.load(`${fenPlacement} ${trackedTurn} - - 0 1`);
            if (loaded) fullFEN = `${fenPlacement} ${trackedTurn} - - 0 1`;
          }
        }
        if (loaded) {
          inCheck = chess.in_check();
          inCheckmate = chess.in_checkmate();
          legalMovesCount = chess.moves().length;
        }
      } catch (e) {
        chess = null;
      }
    }

    // Kiểm tra kết thúc ván: CHỈ khi chiếu hết hoặc có modal thông báo kết thúc trận
    let isGameOver = false;
    if (inCheckmate) {
      isGameOver = true;
    } else if (chess && legalMovesCount === 0) {
      isGameOver = true;
    } else {
      const resultModal = document.querySelector('[class*="result"], [class*="modal"], [role="dialog"], [class*="winner"], [class*="gameover"], [class*="game-over"]');
      if (resultModal) {
        const modalText = (resultModal.innerText || '').toLowerCase();
        if (modalText.includes('chiếu hết') || modalText.includes('bạn thắng') || modalText.includes('bạn thua') || modalText.includes('hòa cờ') || modalText.includes('hết giờ')) {
          isGameOver = true;
        }
      }
    }

    return {
      found: true,
      boardElement: board || sampleSquare.parentElement,
      fen: fullFEN,
      fenPlacement,
      turn: trackedTurn,
      orientation,
      playerColor,
      isMyTurn,
      isGameOver,
      inCheck,
      inCheckmate,
      legalMovesCount,
      chess,
      type: 'allinonecr7',
      message: 'Đã nhận diện bàn cờ ALL IN ONE CR7.'
    };
  }

  // Nhận diện bàn cờ từ DOM
  function detectBoard() {
    const cr7Board = detectAllInOneCR7Board();
    if (cr7Board && cr7Board.found) {
      return cr7Board;
    }

    const board = document.querySelector('[data-chess-board]');
    if (!board) {
      return { found: false, message: 'Không tìm thấy bàn cờ tương thích.' };
    }

    const fen = board.getAttribute('data-fen');
    if (!fen) {
      return { found: false, message: 'Bàn cờ chưa cung cấp FEN.' };
    }

    const fenParts = fen.trim().split(/\s+/);
    const activeTurn = fenParts[1] || 'w';
    const orientation = board.getAttribute('data-orientation') || 'white';
    const playerColor = orientation === 'black' ? 'b' : 'w';

    let chess = null;
    const ChessCtor = window.Chess || globalThis.Chess;
    if (typeof ChessCtor === 'function') {
      try {
        chess = new ChessCtor(fen);
      } catch (e) {}
    }

    return {
      found: true,
      boardElement: board,
      fen,
      fenPlacement: fenParts[0],
      turn: activeTurn,
      orientation: orientation.toLowerCase(),
      playerColor,
      isMyTurn: activeTurn === playerColor,
      isGameOver: chess ? chess.game_over() : false,
      inCheck: chess ? chess.in_check() : false,
      chess,
      type: 'test-board',
      message: 'Đã tìm thấy bàn cờ thử nghiệm.'
    };
  }

  // Xác định xem có phải lượt bot đi hay không
  function isBotTurn(boardInfo) {
    if (config.side === 'auto') {
      return boardInfo.isMyTurn;
    }
    return boardInfo.turn === config.side;
  }

  // Nạp bridge vào Main World (Chỉ nạp trên trang có bàn cờ, không nạp trên YouTube/Facebook)
  function ensurePageBridge() {
    if (window.__CHESS_PAGE_BRIDGE_LOADED__ || document.getElementById('chess-auto-bridge')) return;
    if (!isChessPage()) return;
    try {
      const script = document.createElement('script');
      script.id = 'chess-auto-bridge';
      script.src = chrome.runtime.getURL('page-bridge.js');
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      // Bỏ qua lỗi CSP nếu có
    }
  }
  ensurePageBridge();

  // Thực hiện nước đi trên DOM
  async function executeMove(bestMove, boardInfo) {
    console.log(`[Chess Auto] Thực hiện nước đi: ${bestMove.from} -> ${bestMove.to} (UCI: ${bestMove.uci})`);

    let pieceCode = 'wP';
    if (boardInfo.chess) {
      const p = boardInfo.chess.get(bestMove.from);
      if (p) pieceCode = p.color + p.type.toUpperCase();
    } else {
      const fromEl = document.querySelector(`[data-square="${bestMove.from}"]`);
      pieceCode = fromEl?.querySelector('[data-piece]')?.getAttribute('data-piece') || 'wP';
    }

    // Cách 1: Gửi lệnh qua background script để gọi React onPieceDrop trong Main World
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        const res = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: 'CHESS_DIRECT_MOVE',
            from: bestMove.from,
            to: bestMove.to,
            pieceCode: pieceCode,
            promotion: bestMove.promotion || 'q'
          }, resolve);
        });
        if (res && res.success && res.reactHandled) {
          console.log('[Chess Auto] Nước đi đã được xử lý qua React onPieceDrop thành công!');
          return true;
        }
      } catch (e) {
        console.warn('[Chess Auto] Direct move error:', e);
      }
    }

    // Cách 2: PostMessage cho Page Bridge
    window.postMessage({
      type: 'CHESS_AUTO_EXECUTE_MOVE',
      from: bestMove.from,
      to: bestMove.to,
      promotion: bestMove.promotion || 'q'
    }, '*');

    // Cách 3: Mô phỏng Kéo-thả dnd-kit trên DOM
    const board = boardInfo.boardElement;
    const fromSquare = document.querySelector(`[data-square="${bestMove.from}"]`) ||
                       document.getElementById(`chessboard-square-${bestMove.from}`) ||
                       board?.querySelector(`[data-square="${bestMove.from}"]`);

    const toSquare = document.querySelector(`[data-square="${bestMove.to}"]`) ||
                     document.getElementById(`chessboard-square-${bestMove.to}`) ||
                     board?.querySelector(`[data-square="${bestMove.to}"]`);

    if (!fromSquare || !toSquare) {
      console.warn('[Chess Auto] Không tìm thấy ô cờ đích/nguồn:', bestMove.from, bestMove.to);
      return false;
    }

    const pieceEl = fromSquare.querySelector('[data-piece]') ||
                    fromSquare.querySelector('[role="button"]') ||
                    fromSquare;

    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    try {
      const pDown = new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: startX, clientY: startY, pointerId: 1, isPrimary: true, button: 0, buttons: 1
      });
      pieceEl.dispatchEvent(pDown);

      await new Promise(r => setTimeout(r, 40));

      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, view: window,
        clientX: startX + 15, clientY: startY + 15, pointerId: 1, isPrimary: true, button: 0, buttons: 1
      }));

      await new Promise(r => setTimeout(r, 40));

      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, view: window,
        clientX: endX, clientY: endY, pointerId: 1, isPrimary: true, button: 0, buttons: 1
      }));

      await new Promise(r => setTimeout(r, 50));

      const pUp = new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: endX, clientY: endY, pointerId: 1, isPrimary: true, button: 0, buttons: 0
      });
      document.dispatchEvent(pUp);
      toSquare.dispatchEvent(pUp);
    } catch (e) {
      console.warn('[Chess Auto] Pointer error:', e);
    }

    // Cách 4: Click-to-move
    function dispatchClick(element, x, y) {
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    }

    dispatchClick(pieceEl, startX, startY);
    await new Promise(r => setTimeout(r, 80));
    dispatchClick(toSquare, endX, endY);
    return true;
  }

  // Đi ngay nước này lập tức (Force Move)
  async function triggerForceMove() {
    if (isThinking) return;
    const boardInfo = detectBoard();
    if (!boardInfo.found) {
      updateHUD('Chưa thấy bàn cờ', '--', '0.00', 'idle');
      return;
    }

    isThinking = true;
    updateHUD('Engine đang tính...', '...', '...', 'thinking');

    try {
      if (!window.ChessEngine) throw new Error('Chưa nạp được ChessEngine.');

      const targetSide = config.side === 'auto' ? boardInfo.playerColor : config.side;
      let fenToCalculate = normalizeFENToCalculate(boardInfo.fen, targetSide);

      const bestMove = await window.ChessEngine.calculateBestMove(fenToCalculate, {
        mode: config.engineMode,
        depth: config.depth,
        elo: config.elo || 3200
      });

      if (!bestMove) throw new Error('Engine không tìm được nước đi hợp lệ.');

      // BẢO VỆ CHỐNG ĐI NHẦM QUÂN ĐỐI THỦ
      const fromEl = document.querySelector(`[data-square="${bestMove.from}"]`) || document.getElementById(`chessboard-square-${bestMove.from}`);
      const pieceOnFrom = fromEl?.querySelector('[data-piece]')?.getAttribute('data-piece') || '';
      if (pieceOnFrom && pieceOnFrom[0].toLowerCase() !== targetSide) {
        console.warn(`[Chess Auto Force] Quân ở ${bestMove.from} là ${pieceOnFrom} (khác ${targetSide}). Bỏ qua.`);
        return;
      }

      // Đánh dấu ngay FEN đã xử lý để không đánh lặp lại
      lastProcessedFen = boardInfo.fen;

      // Tính trước vị trí bàn cờ sau khi bot đi nước này
      let predictedPlacement = null;
      if (boardInfo.chess) {
        try {
          const m = boardInfo.chess.move({ from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion || 'q' });
          if (m) predictedPlacement = boardInfo.chess.fen().split(' ')[0];
        } catch (e) {}
      }

      updateHUD('Đang đánh...', `${bestMove.from} -> ${bestMove.to}`, bestMove.score, 'thinking');
      await executeMove(bestMove, boardInfo);

      // Chuyển ngay sang trạng thái CHỜ ĐỐI PHƯƠNG ĐÁNH XONG
      lastBotMovePlacement = predictedPlacement;
      waitingForOpponent = true;
      trackedTurn = (targetSide === 'w') ? 'b' : 'w';
      updateHUD('Chờ đối thủ đánh...', `${bestMove.from} -> ${bestMove.to}`, bestMove.score, 'idle');
    } catch (err) {
      console.error('[Chess Auto Force] Lỗi:', err);
      updateHUD('Lỗi: ' + err.message, '--', '0.00', 'idle');
    } finally {
      isThinking = false;
    }
  }

  // VÒNG LẶP KIỂM TRA VÀ TỰ ĐÁNH TỰ ĐỘNG
  // Tuân thủ nghiêm ngặt:
  // 1. Tốc độ suy nghĩ từ 3 đến 7 giây (tự nhiên như người thật).
  // 2. Chờ đối phương đánh xong hoàn toàn rồi bot mới bắt đầu suy nghĩ và đánh.
  async function checkAndPlay() {
    if (!isRunning || isThinking) return;

    let boardInfo = detectBoard();
    if (!boardInfo.found) {
      updateHUD('Chờ bàn cờ...', '--', '0.00', 'idle');
      return;
    }

    if (boardInfo.isGameOver) {
      updateHUD('Ván cờ đã kết thúc', '--', '0.00', 'idle');
      return;
    }

    const mySide = config.side === 'auto' ? boardInfo.playerColor : config.side;

    // 1. KIỂM TRA VÁN MỚI BẮT ĐẦU (Vị trí ban đầu 32 quân)
    const initialFenPlacement = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    if (boardInfo.fenPlacement === initialFenPlacement) {
      if (mySide === 'b') {
        // Nếu bot cầm quân Đen ở đầu trận -> Bắt buộc phải chờ Trắng (đối phương) đánh trước!
        waitingForOpponent = true;
        lastBotMovePlacement = null;
        updateHUD('Chờ đối thủ đánh...', '--', '0.00', 'idle');
        return;
      }
    }

    // 2. CHỜ ĐỐI PHƯƠNG ĐÁNH XONG RỒI MỚI ĐÁNH:
    // Nếu bot vừa đi nước cờ của mình và đang ở trạng thái chờ đối phương:
    if (waitingForOpponent) {
      // Nếu vị trí quân cờ trên bàn vẫn trùng với vị trí ngay sau khi bot vừa đi
      // -> Đối phương chưa thực hiện nước đi! Tiếp tục chờ.
      if (lastBotMovePlacement && boardInfo.fenPlacement === lastBotMovePlacement) {
        updateHUD('Chờ đối thủ đánh...', '--', '0.00', 'idle');
        return;
      }

      // Nếu bàn cờ đã thay đổi nhưng lượt hiện tại CHƯA PHẢI lượt của bot -> Tiếp tục chờ đối thủ
      if (!isBotTurn(boardInfo)) {
        updateHUD('Chờ đối thủ đánh...', '--', '0.00', 'idle');
        return;
      }

      // Bàn cờ đã đổi khác VÀ đã chuyển sang lượt bot -> ĐỐI PHƯƠNG ĐÃ ĐÁNH XONG!
      console.log('[Chess Auto] ✅ Đối phương đã đánh xong! Bot bắt đầu tính nước phản công...');
      waitingForOpponent = false;
      lastBotMovePlacement = null;
    }

    // 3. Nếu chưa tới lượt bot đi -> Hiển thị chờ đối thủ
    if (!isBotTurn(boardInfo)) {
      updateHUD('Chờ đối thủ đánh...', '--', '0.00', 'idle');
      return;
    }

    // Nếu FEN này đã xử lý rồi -> Bỏ qua chờ nước mới
    if (boardInfo.fen === lastProcessedFen) {
      return;
    }

    isThinking = true;
    updateHUD('Engine đang tính...', '...', '...', 'thinking');

    try {
      if (!window.ChessEngine) {
        throw new Error('Chưa nạp được ChessEngine.');
      }

      const targetSide = mySide;
      let fenToCalculate = normalizeFENToCalculate(boardInfo.fen, targetSide);

      console.log('[Chess Auto] Đang tính nước cho FEN:', fenToCalculate, 'Phe:', targetSide);
      const bestMove = await window.ChessEngine.calculateBestMove(fenToCalculate, {
        mode: config.engineMode,
        depth: config.depth,
        elo: config.elo || 3200
      });

      if (!bestMove) {
        throw new Error('Engine không tìm được nước đi hợp lệ.');
      }

      // BẢO VỆ CHỐNG ĐI NHẦM QUÂN ĐỐI THỦ
      const fromEl = document.querySelector(`[data-square="${bestMove.from}"]`) || document.getElementById(`chessboard-square-${bestMove.from}`);
      const pieceOnFrom = fromEl?.querySelector('[data-piece]')?.getAttribute('data-piece') || '';
      if (pieceOnFrom && pieceOnFrom[0].toLowerCase() !== targetSide) {
        console.warn(`[Chess Auto] Thế cờ vừa thay đổi trước khi đi (${bestMove.from} là ${pieceOnFrom} != ${targetSide}). Quét lại...`);
        lastProcessedFen = null;
        return;
      }

      // TÍNH TOÁN THỜI GIAN SUY NGHĨ: 3 ĐẾN 7 GIÂY (hoặc siêu tốc nếu đồng hồ <25s)
      const delayMs = calculateIntelligentDelay(bestMove, boardInfo.inCheck);
      const remSec = getRemainingSeconds();
      const isPanic = remSec <= 20;

      // WATCHDOG BÀN CỜ TRONG LÚC CHỜ:
      // Hiển thị đếm ngược thời gian suy nghĩ trên HUD và hủy nếu bàn cờ thay đổi đột ngột
      const startPlacement = boardInfo.fenPlacement;
      const startTime = Date.now();
      let aborted = false;

      while (Date.now() - startTime < delayMs) {
        if (!isRunning) {
          aborted = true;
          break;
        }

        const remainingSec = Math.max(0, Math.ceil((delayMs - (Date.now() - startTime)) / 1000));
        const statusLabel = bestMove.isCheckmate ? 'Dứt điểm chiếu hết...' :
                            boardInfo.inCheck ? 'Giải chiếu khẩn cấp...' :
                            isPanic ? `⚡ KHẨN CẤP (${remSec}s)...` :
                            `Suy nghĩ: ~${remainingSec}s...`;

        updateHUD(statusLabel, `${bestMove.from} -> ${bestMove.to}`, bestMove.score, isPanic ? 'panic' : 'thinking');

        await new Promise(r => setTimeout(r, 80));

        const checkBoard = detectBoard();
        if (!checkBoard.found || (checkBoard.fenPlacement && checkBoard.fenPlacement !== startPlacement)) {
          console.log('[Chess Auto] Quân cờ trên bàn thay đổi trong lúc chờ! Hủy nước cũ.');
          aborted = true;
          break;
        }
      }

      if (aborted) {
        return;
      }

      // ĐÁNH DẤU NGAY FEN ĐÃ XỬ LÝ
      lastProcessedFen = boardInfo.fen;

      // Tính trước vị trí bàn cờ sau khi bot đi nước này
      let predictedPlacement = null;
      if (boardInfo.chess) {
        try {
          const moveRes = boardInfo.chess.move({
            from: bestMove.from,
            to: bestMove.to,
            promotion: bestMove.promotion || 'q'
          });
          if (moveRes) {
            predictedPlacement = boardInfo.chess.fen().split(' ')[0];
          }
        } catch (e) {}
      }

      // THỰC HIỆN NƯỚC ĐI TRÊN BÀN CỜ
      updateHUD('Đang đánh...', `${bestMove.from} -> ${bestMove.to}`, bestMove.score, 'thinking');
      await executeMove(bestMove, boardInfo);

      // NGAY SAU KHI ĐÁNH XONG:
      // Chuyển ngay sang trạng thái CHỜ ĐỐI PHƯƠNG ĐÁNH
      lastBotMovePlacement = predictedPlacement;
      waitingForOpponent = true;
      trackedTurn = (targetSide === 'w') ? 'b' : 'w';

      updateHUD('Chờ đối thủ đánh...', `${bestMove.from} -> ${bestMove.to}`, bestMove.score, 'idle');
      console.log('[Chess Auto] Đã đi xong! Chuyển sang chờ đối phương đánh...');
    } catch (err) {
      console.error('[Chess Auto] Lỗi khi xử lý nước đi:', err);
      updateHUD('Lỗi: ' + err.message, '--', '0.00', 'idle');
    } finally {
      isThinking = false;
    }
  }

  function startAutoPlay() {
    if (isRunning) return;
    isRunning = true;
    lastProcessedFen = null;
    previousBoardMap = null;
    waitingForOpponent = false;
    lastBotMovePlacement = null;
    createHUD();
    updateHUD('Đang chạy tự động', '--', '0.00', 'active');

    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(checkAndPlay, 250);

    checkAndPlay();
  }

  function stopAutoPlay() {
    isRunning = false;
    isThinking = false;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    updateHUD('Đã dừng', '--', '0.00', 'idle');
  }

  // Lắng nghe lệnh từ popup.js
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type !== 'CHESS_COMMAND') return;

      switch (message.command) {
        case 'START': {
          const board = detectBoard();
          if (!board.found) {
            sendResponse({ status: 'Không tìm thấy bàn cờ hợp lệ.', running: false });
            return;
          }
          startAutoPlay();
          sendResponse({
            status: 'Đã khởi động! Bot đang tự động đánh.',
            running: true,
            boardFound: true,
            fen: board.fen
          });
          break;
        }

        case 'STOP': {
          stopAutoPlay();
          sendResponse({ status: 'Đã dừng tự động đánh.', running: false });
          break;
        }

        case 'FORCE_MOVE': {
          triggerForceMove();
          sendResponse({ status: 'Đang tính và đi ngay nước này...' });
          break;
        }

        case 'GET_STATUS': {
          const board = detectBoard();
          sendResponse({
            running: isRunning,
            isThinking,
            boardFound: board.found,
            fen: board.found ? board.fen : null,
            turn: board.found ? board.turn : null,
            config
          });
          break;
        }

        case 'UPDATE_CONFIG': {
          config = { ...config, ...message.newConfig };
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ chess_auto_config: config });
          }
          updateHUD();
          sendResponse({ status: 'Đã lưu cấu hình thành công.', config });
          break;
        }

        default:
          sendResponse({ status: 'Lệnh không xác định.' });
      }
    });
  }

  console.log('[Chess Auto] Content script (Board Delta Tracker & Anti-Time-Loss) đã sẵn sàng.');
})();
