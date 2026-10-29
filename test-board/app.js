/**
 * Test Board - UI Controller & Sound Synthesizer
 */

document.addEventListener('DOMContentLoaded', () => {
  const chess = new ChessBoardState();
  const boardEl = document.getElementById('chess-board');
  const turnBadge = document.getElementById('turn-badge');
  const turnDot = document.getElementById('turn-dot');
  const turnText = document.getElementById('turn-text');
  const fenInput = document.getElementById('fen-input');
  const movesList = document.getElementById('moves-list');

  const btnReset = document.getElementById('btn-reset');
  const btnFlip = document.getElementById('btn-flip');
  const btnUndo = document.getElementById('btn-undo');
  const btnSetFen = document.getElementById('btn-set-fen');
  const btnCopyFen = document.getElementById('btn-copy-fen');

  let orientation = 'white'; // 'white' hoặc 'black'
  let selectedSquare = null;
  let validDests = [];
  let lastMove = null;

  // Chess Piece Unicode Characters
  const PIECE_SYMBOLS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

  // Web Audio Sound Synthesizer (Không cần tải file mp3 ngoài)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(isCapture = false) {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isCapture ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(isCapture ? 280 : 350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isCapture ? 90 : 120, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      // Audio có thể bị chặn trước khi user tương tác
    }
  }

  // Cập nhật thuộc tính adapter trên DOM
  function updateAdapterAttributes() {
    const currentFen = chess.getFEN();
    boardEl.setAttribute('data-chess-board', 'true');
    boardEl.setAttribute('data-fen', currentFen);
    boardEl.setAttribute('data-turn', chess.turn);
    boardEl.setAttribute('data-orientation', orientation);

    fenInput.value = currentFen;

    // Cập nhật lượt
    if (chess.turn === 'w') {
      turnDot.className = 'turn-dot';
      turnText.textContent = 'Lượt đi: Trắng (White)';
    } else {
      turnDot.className = 'turn-dot black';
      turnText.textContent = 'Lượt đi: Đen (Black)';
    }
  }

  // Cập nhật danh sách nước đi
  function updateMoveHistory() {
    movesList.innerHTML = '';
    const history = chess.history;

    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = history[i]?.notation || '';
      const blackMove = history[i + 1]?.notation || '';

      const row = document.createElement('div');
      row.className = 'move-row';
      row.innerHTML = `
        <span class="move-num">${moveNum}.</span>
        <span class="move-white">${whiteMove}</span>
        <span class="move-black">${blackMove}</span>
      `;
      movesList.appendChild(row);
    }

    movesList.scrollTop = movesList.scrollHeight;
  }

  // Render bàn cờ
  function renderBoard() {
    boardEl.innerHTML = '';
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

    const displayFiles = orientation === 'white' ? files : files.slice().reverse();
    const displayRanks = orientation === 'white' ? ranks : ranks.slice().reverse();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = displayFiles[f];
        const rank = displayRanks[r];
        const sq = file + rank;
        const idx = chess.squareToIndex(sq);
        const piece = chess.board[idx];

        const isLight = (f + r) % 2 === 0;
        const squareDiv = document.createElement('div');
        squareDiv.className = `square ${isLight ? 'light' : 'dark'}`;
        squareDiv.setAttribute('data-square', sq);

        // Highlight ô đang chọn
        if (selectedSquare === sq) {
          squareDiv.classList.add('selected');
        }

        // Highlight nước đi vừa rồi
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) {
          squareDiv.classList.add('last-move');
        }

        // Đánh dấu ô có thể đi tới
        if (validDests.includes(sq)) {
          squareDiv.classList.add('valid-dest');
        }

        // Tọa độ góc ô
        if (f === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord-rank';
          rankLabel.textContent = rank;
          squareDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord-file';
          fileLabel.textContent = file;
          squareDiv.appendChild(fileLabel);
        }

        // Quân cờ
        if (piece) {
          const pieceDiv = document.createElement('div');
          const isWhitePiece = chess.isWhite(piece);
          pieceDiv.className = `piece ${isWhitePiece ? 'white' : 'black'}`;
          pieceDiv.textContent = PIECE_SYMBOLS[piece] || piece;
          squareDiv.appendChild(pieceDiv);
        }

        // Sự kiện click ô cờ
        squareDiv.addEventListener('click', (e) => onSquareClick(sq));

        boardEl.appendChild(squareDiv);
      }
    }

    updateAdapterAttributes();
  }

  // Xử lý khi click vào 1 ô cờ
  function onSquareClick(sq) {
    const idx = chess.squareToIndex(sq);
    const piece = chess.board[idx];
    const isPieceMine = piece && ((chess.turn === 'w' && chess.isWhite(piece)) || (chess.turn === 'b' && chess.isBlack(piece)));

    // Nếu đã chọn 1 ô trước đó
    if (selectedSquare) {
      if (validDests.includes(sq)) {
        // Thực hiện nước đi
        const isCapture = !!chess.board[idx];
        chess.makeMove(selectedSquare, sq);
        lastMove = { from: selectedSquare, to: sq };
        playSound(isCapture);

        selectedSquare = null;
        validDests = [];
        renderBoard();
        updateMoveHistory();
        return;
      }

      // Nếu click vào chính quân mình -> chọn lại quân khác
      if (isPieceMine) {
        selectedSquare = sq;
        validDests = chess.getValidMovesForSquare(sq);
        renderBoard();
        return;
      }

      // Hủy chọn
      selectedSquare = null;
      validDests = [];
      renderBoard();
      return;
    }

    // Nếu chưa chọn ô nào và click vào quân đúng lượt
    if (isPieceMine) {
      selectedSquare = sq;
      validDests = chess.getValidMovesForSquare(sq);
      renderBoard();
    }
  }

  // Lắng nghe sự kiện custom `chess-auto-move` từ extension
  boardEl.addEventListener('chess-auto-move', (e) => {
    const { from, to, promotion } = e.detail || {};
    if (from && to) {
      console.log('[TestBoard] Nhận được auto move event:', from, '->', to);
      const isCapture = !!chess.board[chess.squareToIndex(to)];
      chess.makeMove(from, to, promotion || 'q');
      lastMove = { from, to };
      playSound(isCapture);

      selectedSquare = null;
      validDests = [];
      renderBoard();
      updateMoveHistory();
    }
  });

  // Buttons Toolbar
  btnReset.addEventListener('click', () => {
    chess.reset();
    lastMove = null;
    selectedSquare = null;
    validDests = [];
    renderBoard();
    updateMoveHistory();
  });

  btnFlip.addEventListener('click', () => {
    orientation = orientation === 'white' ? 'black' : 'white';
    renderBoard();
  });

  btnUndo.addEventListener('click', () => {
    chess.undo();
    lastMove = chess.history.length > 0 ? chess.history[chess.history.length - 1] : null;
    selectedSquare = null;
    validDests = [];
    renderBoard();
    updateMoveHistory();
  });

  btnSetFen.addEventListener('click', () => {
    const fen = fenInput.value.trim();
    if (fen) {
      const ok = chess.loadFEN(fen);
      if (ok) {
        lastMove = null;
        selectedSquare = null;
        validDests = [];
        renderBoard();
        updateMoveHistory();
      } else {
        alert('Chuỗi FEN không hợp lệ!');
      }
    }
  });

  btnCopyFen.addEventListener('click', () => {
    fenInput.select();
    navigator.clipboard.writeText(fenInput.value);
    btnCopyFen.textContent = 'Đã chép!';
    setTimeout(() => { btnCopyFen.textContent = 'Sao chép FEN'; }, 1500);
  });

  // Khởi tạo bàn cờ lần đầu
  renderBoard();
  updateMoveHistory();
});
