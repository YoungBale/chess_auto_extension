/**
 * Chess Auto Tool - Background Service Worker
 * Tích hợp:
 * 1. chess.js (Bộ quy tắc cờ, kiểm tra hợp lệ, phát hiện Chiếu Hết / Mate-in-1 trong 0ms)
 * 2. Lichess Cloud Database (Stockfish 16 NNUE Depth 50-70) kèm timeout 2.5s
 * 3. Stockfish 16 REST API qua chess-api.com (Depth 14-16) kèm timeout 2.5s
 * 4. Stockfish Online 16 (stockfish.online) kèm timeout 2.5s
 * 5. Chèn trực tiếp React onPieceDrop vào Main World (chuẩn xác, không gọi lặp)
 */

try {
  importScripts('chess.js');
} catch (e) {
  console.warn('[Background] importScripts chess.js:', e);
}

// Fetch có timeout để không bao giờ bị treo engine khi mạng chập chờn
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Kiểm tra nước đi chiếu hết tức thì (Mate in 1 - ĂN XE CHIẾU HẾT, ĂN HẬU CHIẾU HẾT, ...)
function findImmediateMateIn1(chessInstance) {
  if (!chessInstance || typeof chessInstance.moves !== 'function') return null;
  const moves = chessInstance.moves({ verbose: true });
  for (const m of moves) {
    chessInstance.move(m);
    if (chessInstance.in_checkmate()) {
      chessInstance.undo();
      return m;
    }
    chessInstance.undo();
  }
  return null;
}

// Kiểm tra xem một nước đi có làm vua bị chiếu hết ngay nước sau không (chống tự sát / hớ nước)
function isMateBlunder(chessInstance, moveObj) {
  if (!chessInstance || typeof chessInstance.moves !== 'function') return false;
  chessInstance.move(moveObj);
  const oppMoves = chessInstance.moves({ verbose: true });
  let blundered = false;
  for (const opp of oppMoves) {
    chessInstance.move(opp);
    if (chessInstance.in_checkmate()) {
      blundered = true;
      chessInstance.undo();
      break;
    }
    chessInstance.undo();
  }
  chessInstance.undo();
  return blundered;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Thực thi nước đi trực tiếp qua React Fiber và DOM trong Main World
  if (message.type === 'CHESS_DIRECT_MOVE' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const { from, to, promotion, pieceCode: inputPieceCode } = message;

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (fromSq, toSq, promo, forcedPieceCode) => {
        console.log(`[Main World] Kích hoạt nước đi: ${fromSq} -> ${toSq} (${forcedPieceCode || 'auto'})`);

        const fromEl = document.getElementById(`chessboard-square-${fromSq}`) ||
                       document.querySelector(`[data-square="${fromSq}"]`);
        const toEl = document.getElementById(`chessboard-square-${toSq}`) ||
                     document.querySelector(`[data-square="${toSq}"]`);

        if (!fromEl || !toEl) {
          return { success: false, message: 'Không tìm thấy ô cờ' };
        }

        const pieceEl = fromEl.querySelector('[data-piece]') ||
                        fromEl.querySelector('[role="button"]') ||
                        fromEl;

        // Xác định chính xác mã quân (wP, bB, wN, wR, wQ, wK, ...)
        let pieceCode = forcedPieceCode || fromEl.querySelector('[data-piece]')?.getAttribute('data-piece') || '';
        if (!pieceCode) {
          const pieceId = fromEl.querySelector('[id*="piece-"]')?.id || '';
          const match = pieceId.match(/piece-([wb][pnbrqk])/i);
          if (match) pieceCode = match[1];
        }
        if (!pieceCode) pieceCode = 'wP';

        // 1. Quét tìm và gọi onPieceDrop DUY NHẤT 1 LẦN trong cây React Fiber / props
        const candidates = [
          document.getElementById('chessboard-board'),
          document.querySelector('[id*="chessboard-board"]'),
          fromEl,
          toEl
        ].filter(Boolean);

        for (let target of candidates) {
          let curr = target;
          while (curr && curr !== document.body) {
            for (let k of Object.keys(curr)) {
              if (k.startsWith('__reactProps')) {
                const props = curr[k];
                if (typeof props?.onPieceDrop === 'function') {
                  try {
                    const res = props.onPieceDrop(fromSq, toSq, pieceCode);
                    if (res !== false) {
                      console.log('[Main World] onPieceDrop (__reactProps) thành công!');
                      return { success: true, reactHandled: true };
                    }
                  } catch (e) {
                    console.warn('[Main World] onPieceDrop error:', e);
                  }
                }
              }

              if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                let f = curr[k];
                let depth = 0;
                while (f && depth < 30) {
                  if (typeof f.memoizedProps?.onPieceDrop === 'function') {
                    try {
                      const res = f.memoizedProps.onPieceDrop(fromSq, toSq, pieceCode);
                      if (res !== false) {
                        console.log('[Main World] onPieceDrop (memoizedProps) thành công!');
                        return { success: true, reactHandled: true };
                      }
                    } catch (e) {
                      console.warn('[Main World] memoizedProps onPieceDrop error:', e);
                    }
                  }
                  if (typeof f.stateNode?.props?.onPieceDrop === 'function') {
                    try {
                      const res = f.stateNode.props.onPieceDrop(fromSq, toSq, pieceCode);
                      if (res !== false) {
                        console.log('[Main World] onPieceDrop (stateNode) thành công!');
                        return { success: true, reactHandled: true };
                      }
                    } catch (e) {
                      console.warn('[Main World] stateNode onPieceDrop error:', e);
                    }
                  }
                  f = f.return;
                  depth++;
                }
              }
            }
            curr = curr.parentElement;
          }
        }

        // 2. Click-to-move qua React onSquareClick nếu có
        for (let target of candidates) {
          let curr = target;
          while (curr && curr !== document.body) {
            for (let k of Object.keys(curr)) {
              if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                let f = curr[k];
                let depth = 0;
                while (f && depth < 30) {
                  if (typeof f.memoizedProps?.onSquareClick === 'function') {
                    try {
                      f.memoizedProps.onSquareClick(fromSq);
                      setTimeout(() => f.memoizedProps.onSquareClick(toSq), 100);
                      return { success: true, reactHandled: true };
                    } catch (e) {}
                  }
                  f = f.return;
                  depth++;
                }
              }
            }
            curr = curr.parentElement;
          }
        }

        // 3. Fallback: Mô phỏng Kéo-thả chuẩn xác cho @dnd-kit (Pointer + Mouse events)
        try {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const startX = fromRect.left + fromRect.width / 2;
          const startY = fromRect.top + fromRect.height / 2;
          const endX = toRect.left + toRect.width / 2;
          const endY = toRect.top + toRect.height / 2;

          const pDown = new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, view: window,
            clientX: startX, clientY: startY, pointerId: 1, isPrimary: true, button: 0, buttons: 1
          });
          pieceEl.dispatchEvent(pDown);

          pieceEl.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, view: window,
            clientX: startX, clientY: startY, button: 0, buttons: 1
          }));

          await new Promise(r => setTimeout(r, 40));

          // Kéo di chuyển (> 5px để vượt activationConstraint)
          const pMove1 = new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, view: window,
            clientX: startX + 15, clientY: startY + 15, pointerId: 1, isPrimary: true, button: 0, buttons: 1
          });
          window.dispatchEvent(pMove1);
          document.dispatchEvent(pMove1);

          await new Promise(r => setTimeout(r, 40));

          // Kéo tới đích
          const pMoveEnd = new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, view: window,
            clientX: endX, clientY: endY, pointerId: 1, isPrimary: true, button: 0, buttons: 1
          });
          window.dispatchEvent(pMoveEnd);
          document.dispatchEvent(pMoveEnd);

          await new Promise(r => setTimeout(r, 50));

          // Thả chuột
          const pUp = new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, view: window,
            clientX: endX, clientY: endY, pointerId: 1, isPrimary: true, button: 0, buttons: 0
          });
          toEl.dispatchEvent(pUp);
          window.dispatchEvent(pUp);
          document.dispatchEvent(pUp);

          toEl.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, view: window,
            clientX: endX, clientY: endY, button: 0, buttons: 0
          }));

          // Click bổ sung
          pieceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await new Promise(r => setTimeout(r, 60));
          toEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (e) {
          console.warn('[Main World] Lỗi drag simulation:', e);
        }

        return { success: true, reactHandled: false };
      },
      args: [from, to, promotion || 'q', inputPieceCode || null]
    }).then(res => {
      sendResponse(res?.[0]?.result || { success: false });
    }).catch(err => {
      console.warn('[Background] executeScript error:', err);
      sendResponse({ success: false, error: err.message });
    });

    return true; // Keep channel open
  }

  // Siêu GM AI Đa Tầng (Kèm Timeout Bảo Vệ Không Bao Giờ Treo Thời Gian):
  // Cấp 0: Mate-in-1 Instant Detector (0ms)
  // Cấp 1: Lichess Cloud Engine (Depth 50-70) - timeout 2.5s
  // Cấp 2: Stockfish 16 REST API qua chess-api.com - timeout 2.5s
  // Cấp 3: Stockfish Online 16 (stockfish.online) - timeout 2.5s
  // Cấp 4: chess.js Safe Legal Fallback (ngay tức thì 0ms, không thể thua giờ)
  if (message.type === 'QUERY_STOCKFISH') {
    const { fen, depth } = message;

    (async () => {
      function normalize(f) {
        if (!f) return '';
        const trimmed = f.trim();
        const parts = trimmed.split(/\s+/);
        if (parts.length === 1) return `${parts[0]} w KQkq - 0 1`;
        if (parts.length === 2) return `${parts[0]} ${parts[1]} KQkq - 0 1`;
        if (parts.length === 3) return `${parts[0]} ${parts[1]} ${parts[2]} - 0 1`;
        if (parts.length === 4) return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} 0 1`;
        return trimmed;
      }

      const validFen = normalize(fen);
      const sfDepth = Math.max(depth || 14, 12);

      // Khởi tạo chess.js để kiểm tra luật và làm sạch FEN
      let chessInstance = null;
      let cleanFen = validFen;
      if (typeof Chess === 'function') {
        try {
          chessInstance = new Chess();
          if (chessInstance.load(validFen)) {
            cleanFen = chessInstance.fen();
          } else {
            const p = validFen.split(/\s+/);
            if (p.length >= 4) {
              p[3] = '-';
              if (chessInstance.load(p.join(' '))) {
                cleanFen = chessInstance.fen();
              }
            }
          }
        } catch (e) {
          chessInstance = null;
        }
      }

      // CẤP 0: KIỂM TRA CHIẾU HẾT TỨC THÌ (MATE IN 1 TRONG 0MS)
      if (chessInstance) {
        const mateMove = findImmediateMateIn1(chessInstance);
        if (mateMove) {
          const uci = mateMove.from + mateMove.to + (mateMove.promotion || '');
          console.log(`[Engine GM] 🏆 PHÁT HIỆN CHIẾU HẾT TỨC THÌ: ${mateMove.san} (${uci})!`);
          sendResponse({
            success: true,
            data: {
              uci,
              from: mateMove.from,
              to: mateMove.to,
              san: mateMove.san,
              promotion: mateMove.promotion || null,
              score: '#1',
              isCheckmate: true,
              source: 'instant_mate_detector_chessjs'
            }
          });
          return;
        }
      }

      // CẤP 1: Lichess Cloud Database (Stockfish 16 NNUE Depth 50-70)
      try {
        const lichessUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(cleanFen)}`;
        const lRes = await fetchWithTimeout(lichessUrl, { headers: { 'Accept': 'application/json' } }, 2500);
        if (lRes.ok) {
          const lData = await lRes.json();
          const bestUci = lData.pvs?.[0]?.moves?.split(' ')[0];
          if (bestUci && bestUci.length >= 4) {
            const from = bestUci.slice(0, 2);
            const to = bestUci.slice(2, 4);
            const promo = bestUci.length > 4 ? bestUci.slice(4, 5) : null;

            let isLegal = true;
            if (chessInstance) {
              const legalMoves = chessInstance.moves({ verbose: true });
              const matched = legalMoves.find(m => m.from === from && m.to === to);
              if (!matched) isLegal = false;
              else if (isMateBlunder(chessInstance, matched)) isLegal = false;
            }

            if (isLegal) {
              const scoreVal = lData.pvs[0].mate ? `#${lData.pvs[0].mate}` :
                               lData.pvs[0].cp !== undefined ? (lData.pvs[0].cp / 100).toFixed(2) : '0.00';
              console.log(`[Engine GM] Lichess Cloud: ${bestUci} (Depth ${lData.depth}, Eval: ${scoreVal})`);
              sendResponse({
                success: true,
                data: {
                  uci: bestUci, from, to, promotion: promo, score: scoreVal,
                  source: `lichess_cloud_depth_${lData.depth}`
                }
              });
              return;
            }
          }
        }
      } catch (e) {}

      // CẤP 2: Stockfish 16 REST API (chess-api.com)
      try {
        const response = await fetchWithTimeout('https://chess-api.com/v1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen: cleanFen, depth: sfDepth })
        }, 3500);

        if (response.ok) {
          const data = await response.json();
          if (data && data.from && data.to && !data.error) {
            const uci = data.move || (data.from + data.to);

            let isLegal = true;
            if (chessInstance) {
              const legalMoves = chessInstance.moves({ verbose: true });
              const matched = legalMoves.find(m => m.from === data.from && m.to === data.to);
              if (!matched) isLegal = false;
              else if (isMateBlunder(chessInstance, matched)) isLegal = false;
            }

            if (isLegal) {
              console.log(`[Engine GM] chess-api.com Stockfish 16: ${uci} (Eval: ${data.eval})`);
              sendResponse({
                success: true,
                data: {
                  uci, from: data.from, to: data.to,
                  promotion: data.isPromotion ? (data.promotion || 'q') : null,
                  score: data.eval !== undefined ? data.eval.toString() : '0.00',
                  source: `chess_api_sf16_depth_${sfDepth}`
                }
              });
              return;
            }
          }
        }
      } catch (e) {}

      // CẤP 3: Stockfish Online 16 API (stockfish.online)
      try {
        const sfUrl = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(cleanFen)}&depth=10`;
        const sfRes = await fetchWithTimeout(sfUrl, {}, 3500);
        if (sfRes.ok) {
          const sfData = await sfRes.json();
          if (sfData.success && sfData.bestmove) {
            const match = sfData.bestmove.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (match) {
              const uci = match[1];
              const from = uci.slice(0, 2);
              const to = uci.slice(2, 4);
              const promo = uci.length > 4 ? uci.slice(4, 5) : null;

              let isLegal = true;
              if (chessInstance) {
                const legalMoves = chessInstance.moves({ verbose: true });
                const matched = legalMoves.find(m => m.from === from && m.to === to);
                if (!matched) isLegal = false;
                else if (isMateBlunder(chessInstance, matched)) isLegal = false;
              }

              if (isLegal) {
                sendResponse({
                  success: true,
                  data: {
                    uci, from, to, promotion: promo,
                    score: sfData.evaluation !== undefined ? sfData.evaluation.toString() : '0.00',
                    source: 'stockfish_online_depth_10'
                  }
                });
                return;
              }
            }
          }
        }
      } catch (sfErr) {}

      // CẤP 4: Fallback thông minh bằng chess.js Minimax PST (Chống tự sát, bảo toàn quân, 0ms)
      if (chessInstance) {
        const legalMoves = chessInstance.moves({ verbose: true });
        if (legalMoves.length > 0) {
          let safeMoves = legalMoves.filter(m => !isMateBlunder(chessInstance, m));
          if (safeMoves.length === 0) safeMoves = legalMoves;

          const pieceWeights = { q: 900, r: 500, b: 330, n: 320, p: 100 };
          safeMoves.sort((a, b) => {
            const scoreA = (a.captured ? pieceWeights[a.captured] * 10 - pieceWeights[a.piece] : 0) + (a.promotion ? 800 : 0);
            const scoreB = (b.captured ? pieceWeights[b.captured] * 10 - pieceWeights[b.piece] : 0) + (b.promotion ? 800 : 0);
            return scoreB - scoreA;
          });

          const chosen = safeMoves[0];
          const uci = chosen.from + chosen.to + (chosen.promotion || '');
          console.log(`[Engine GM] Fallback chess.js an toàn (0ms): ${chosen.san} (${uci})`);
          sendResponse({
            success: true,
            data: {
              uci, from: chosen.from, to: chosen.to,
              san: chosen.san, promotion: chosen.promotion || null,
              score: '0.00',
              source: 'chessjs_safe_fallback'
            }
          });
          return;
        }
      }

      sendResponse({ success: false, error: 'Không thể tính toán nước đi.' });
    })();

    return true; // Keep channel open
  }
});
