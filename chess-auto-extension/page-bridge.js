/**
 * Chess Auto Tool - Page Bridge (Runs in MAIN World)
 * Chạy trực tiếp trong ngữ cảnh trang web, có toàn quyền truy cập React Fiber và props
 */

(function () {
  window.__CHESS_PAGE_BRIDGE_LOADED__ = true;
  console.log('[Chess Auto Bridge] Bridge đã được nạp vào Main World.');

  // Tìm hàm onPieceDrop hoặc onSquareClick từ React Fiber / Props
  function findReactChessHandlers(fromSquare, toSquare) {
    const candidates = [
      document.getElementById('chessboard-board'),
      document.getElementById(`chessboard-square-${fromSquare}`),
      document.querySelector(`[data-square="${fromSquare}"]`),
      document.querySelector('[id*="chessboard-piece-"]'),
      document.querySelector('[id*="chessboard-board"]'),
      document.querySelector('[data-boardid]')
    ].filter(Boolean);

    for (let target of candidates) {
      let el = target;
      while (el && el !== document.body) {
        // Kiểm tra __reactProps
        for (let key of Object.keys(el)) {
          if (key.startsWith('__reactProps')) {
            const props = el[key];
            if (props) {
              if (typeof props.onPieceDrop === 'function') {
                return { type: 'pieceDrop', fn: props.onPieceDrop };
              }
              if (typeof props.onSquareClick === 'function') {
                return { type: 'squareClick', fn: props.onSquareClick };
              }
            }
          }

          // Kiểm tra __reactFiber
          if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
            let fiber = el[key];
            let depth = 0;
            while (fiber && depth < 35) {
              const memo = fiber.memoizedProps;
              if (memo) {
                if (typeof memo.onPieceDrop === 'function') {
                  return { type: 'pieceDrop', fn: memo.onPieceDrop };
                }
                if (typeof memo.onSquareClick === 'function') {
                  return { type: 'squareClick', fn: memo.onSquareClick };
                }
              }

              const stateNode = fiber.stateNode;
              if (stateNode && stateNode.props) {
                if (typeof stateNode.props.onPieceDrop === 'function') {
                  return { type: 'pieceDrop', fn: stateNode.props.onPieceDrop };
                }
                if (typeof stateNode.props.onSquareClick === 'function') {
                  return { type: 'squareClick', fn: stateNode.props.onSquareClick };
                }
              }

              fiber = fiber.return;
              depth++;
            }
          }
        }
        el = el.parentElement;
      }
    }

    return null;
  }

  // Mô phỏng kéo thả chuẩn xác cho @dnd-kit
  async function simulateDndKitDrag(fromSquare, toSquare) {
    const fromEl = document.getElementById(`chessboard-square-${fromSquare}`) ||
                   document.querySelector(`[data-square="${fromSquare}"]`);
    const toEl = document.getElementById(`chessboard-square-${toSquare}`) ||
                 document.querySelector(`[data-square="${toSquare}"]`);

    if (!fromEl || !toEl) return false;

    const piece = fromEl.querySelector('[data-piece]') ||
                  fromEl.querySelector('[role="button"]') ||
                  fromEl;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    const pointerId = 1;

    // 1. Pointer Down
    const pDown = new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, view: window,
      clientX: startX, clientY: startY,
      pointerId, isPrimary: true, button: 0, buttons: 1
    });
    piece.dispatchEvent(pDown);

    // Mouse Down song song
    piece.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, view: window,
      clientX: startX, clientY: startY, button: 0, buttons: 1
    }));

    await new Promise(r => setTimeout(r, 40));

    // 2. Kích hoạt ngưỡng kéo dnd-kit (>5px)
    const pMove1 = new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, view: window,
      clientX: startX + 10, clientY: startY + 10,
      pointerId, isPrimary: true, button: 0, buttons: 1
    });
    window.dispatchEvent(pMove1);

    await new Promise(r => setTimeout(r, 40));

    // 3. Kéo tới giữa quãng đường
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const pMoveMid = new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, view: window,
      clientX: midX, clientY: midY,
      pointerId, isPrimary: true, button: 0, buttons: 1
    });
    window.dispatchEvent(pMoveMid);

    await new Promise(r => setTimeout(r, 50));

    // 4. Kéo tới đích
    const pMoveEnd = new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, view: window,
      clientX: endX, clientY: endY,
      pointerId, isPrimary: true, button: 0, buttons: 1
    });
    window.dispatchEvent(pMoveEnd);

    await new Promise(r => setTimeout(r, 60));

    // 5. Thả chuột (Pointer Up)
    const pUp = new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, view: window,
      clientX: endX, clientY: endY,
      pointerId, isPrimary: true, button: 0, buttons: 0
    });
    toEl.dispatchEvent(pUp);
    window.dispatchEvent(pUp);

    toEl.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, view: window,
      clientX: endX, clientY: endY, button: 0, buttons: 0
    }));

    // 6. Click ô đích
    toEl.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: endX, clientY: endY, button: 0, buttons: 0
    }));

    return true;
  }

  // Thực thi nước đi
  async function performMove(from, to, promo = 'q') {
    console.log(`[Chess Auto Bridge] Yêu cầu đi nước: ${from} -> ${to}`);

    // Xác định mã quân cờ (ví dụ wP, bB, wN...)
    const fromEl = document.getElementById(`chessboard-square-${from}`) || document.querySelector(`[data-square="${from}"]`);
    let pieceCode = fromEl?.querySelector('[data-piece]')?.getAttribute('data-piece') || '';
    if (!pieceCode) {
      const pId = fromEl?.querySelector('[id*="piece-"]')?.id || '';
      const match = pId.match(/piece-([wb][pnbrqk])/i);
      if (match) pieceCode = match[1];
    }
    if (!pieceCode) pieceCode = 'p';

    // Cách 1: Gọi trực tiếp handler của React Component
    const handler = findReactChessHandlers(from, to);
    if (handler) {
      if (handler.type === 'pieceDrop') {
        try {
          console.log('[Chess Auto Bridge] Gọi onPieceDrop() trực tiếp vào React với pieceCode:', pieceCode);
          const res = handler.fn(from, to, pieceCode);
          if (res !== false) {
            console.log('[Chess Auto Bridge] onPieceDrop() thành công!');
            return true;
          }
        } catch (e) {
          console.warn('[Chess Auto Bridge] Lỗi gọi onPieceDrop:', e);
        }
      } else if (handler.type === 'squareClick') {
        try {
          console.log('[Chess Auto Bridge] Gọi onSquareClick() tuần tự!');
          handler.fn(from);
          await new Promise(r => setTimeout(r, 100));
          handler.fn(to);
          return true;
        } catch (e) {
          console.warn('[Chess Auto Bridge] Lỗi gọi onSquareClick:', e);
        }
      }
    }

    // Cách 2: Mô phỏng Drag-and-drop cho dnd-kit
    console.log('[Chess Auto Bridge] Thử mô phỏng dnd-kit Pointer Drag...');
    await simulateDndKitDrag(from, to);

    // Cách 3: Click-to-move thông thường
    const toSquareEl = document.getElementById(`chessboard-square-${to}`) || document.querySelector(`[data-square="${to}"]`);
    if (fromEl && toSquareEl) {
      const piece = fromEl.querySelector('[data-piece]') || fromEl;
      piece.click();
      await new Promise(r => setTimeout(r, 100));
      toSquareEl.click();
    }

    return true;
  }

  // Lắng nghe lệnh từ Content Script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'CHESS_AUTO_EXECUTE_MOVE') {
      const { from, to, promotion } = event.data;
      const success = await performMove(from, to, promotion);
      window.postMessage({
        type: 'CHESS_AUTO_EXECUTE_RESULT',
        from, to, success
      }, '*');
    }
  });
})();
