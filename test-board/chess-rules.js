/**
 * Test Board - Chess Rules Logic
 * Quản lý trạng thái bàn cờ, nước đi hợp lệ và chuyển đổi FEN
 */

class ChessBoardState {
  constructor() {
    this.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    this.reset();
  }

  reset() {
    this.board = [
      'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
      'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
      null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
      'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
    ];
    this.turn = 'w';
    this.castling = { K: true, Q: true, k: true, q: true };
    this.enPassant = '-';
    this.halfMoves = 0;
    this.fullMoves = 1;
    this.history = [];
  }

  isWhite(p) { return p && p === p.toUpperCase(); }
  isBlack(p) { return p && p === p.toLowerCase(); }

  squareToIndex(sq) {
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - parseInt(sq[1], 10);
    return rank * 8 + file;
  }

  indexToSquare(i) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    return this.files[col] + (8 - row);
  }

  getFEN() {
    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r * 8 + c];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) {
            fen += empty;
            empty = 0;
          }
          fen += piece;
        }
      }
      if (empty > 0) fen += empty;
      if (r < 7) fen += '/';
    }

    // Castling string
    let castle = '';
    if (this.castling.K) castle += 'K';
    if (this.castling.Q) castle += 'Q';
    if (this.castling.k) castle += 'k';
    if (this.castling.q) castle += 'q';
    if (!castle) castle = '-';

    return `${fen} ${this.turn} ${castle} ${this.enPassant} ${this.halfMoves} ${this.fullMoves}`;
  }

  loadFEN(fen) {
    try {
      const parts = fen.trim().split(/\s+/);
      const rows = parts[0].split('/');
      const newBoard = new Array(64).fill(null);

      for (let r = 0; r < 8; r++) {
        let col = 0;
        for (let char of rows[r]) {
          if (char >= '1' && char <= '8') {
            col += parseInt(char, 10);
          } else {
            newBoard[r * 8 + col] = char;
            col++;
          }
        }
      }

      this.board = newBoard;
      this.turn = parts[1] || 'w';
      const c = parts[2] || '-';
      this.castling = {
        K: c.includes('K'),
        Q: c.includes('Q'),
        k: c.includes('k'),
        q: c.includes('q')
      };
      this.enPassant = parts[3] || '-';
      this.halfMoves = parseInt(parts[4] || '0', 10);
      this.fullMoves = parseInt(parts[5] || '1', 10);
      this.history = [];
      return true;
    } catch (e) {
      console.error('Invalid FEN:', e);
      return false;
    }
  }

  // Lấy các nước đi hợp lệ cho 1 ô vuông
  getValidMovesForSquare(sq) {
    const idx = this.squareToIndex(sq);
    const p = this.board[idx];
    if (!p) return [];
    if (this.turn === 'w' && !this.isWhite(p)) return [];
    if (this.turn === 'b' && !this.isBlack(p)) return [];

    const isWhiteTurn = this.turn === 'w';
    const type = p.toLowerCase();
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    const dests = [];

    if (type === 'p') {
      const dir = isWhiteTurn ? -1 : 1;
      const startRow = isWhiteTurn ? 6 : 1;
      const fRow = row + dir;

      if (fRow >= 0 && fRow < 8 && !this.board[fRow * 8 + col]) {
        dests.push(this.indexToSquare(fRow * 8 + col));
        const ffRow = row + dir * 2;
        if (row === startRow && !this.board[ffRow * 8 + col]) {
          dests.push(this.indexToSquare(ffRow * 8 + col));
        }
      }

      [-1, 1].forEach(dCol => {
        const tCol = col + dCol;
        if (tCol >= 0 && tCol < 8 && fRow >= 0 && fRow < 8) {
          const target = this.board[fRow * 8 + tCol];
          if (target && (isWhiteTurn ? this.isBlack(target) : this.isWhite(target))) {
            dests.push(this.indexToSquare(fRow * 8 + tCol));
          } else if (this.enPassant === this.files[tCol] + (8 - fRow)) {
            dests.push(this.indexToSquare(fRow * 8 + tCol));
          }
        }
      });
    } else if (type === 'n') {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      offsets.forEach(([dr, dc]) => {
        const tr = row + dr;
        const tc = col + dc;
        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
          const target = this.board[tr * 8 + tc];
          if (!target || (isWhiteTurn ? this.isBlack(target) : this.isWhite(target))) {
            dests.push(this.indexToSquare(tr * 8 + tc));
          }
        }
      });
    } else if (type === 'b' || type === 'r' || type === 'q') {
      const dirs = [];
      if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

      dirs.forEach(([dr, dc]) => {
        let tr = row + dr;
        let tc = col + dc;
        while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
          const target = this.board[tr * 8 + tc];
          if (!target) {
            dests.push(this.indexToSquare(tr * 8 + tc));
          } else {
            if (isWhiteTurn ? this.isBlack(target) : this.isWhite(target)) {
              dests.push(this.indexToSquare(tr * 8 + tc));
            }
            break;
          }
          tr += dr;
          tc += dc;
        }
      });
    } else if (type === 'k') {
      const dirs = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      dirs.forEach(([dr, dc]) => {
        const tr = row + dr;
        const tc = col + dc;
        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
          const target = this.board[tr * 8 + tc];
          if (!target || (isWhiteTurn ? this.isBlack(target) : this.isWhite(target))) {
            dests.push(this.indexToSquare(tr * 8 + tc));
          }
        }
      });

      // Nhập thành
      if (isWhiteTurn && idx === 60) {
        if (this.castling.K && !this.board[61] && !this.board[62] && this.board[63] === 'R') {
          dests.push('g1');
        }
        if (this.castling.Q && !this.board[59] && !this.board[58] && !this.board[57] && this.board[56] === 'R') {
          dests.push('c1');
        }
      } else if (!isWhiteTurn && idx === 4) {
        if (this.castling.k && !this.board[5] && !this.board[6] && this.board[7] === 'r') {
          dests.push('g8');
        }
        if (this.castling.q && !this.board[3] && !this.board[2] && !this.board[1] && this.board[0] === 'r') {
          dests.push('c8');
        }
      }
    }

    return dests;
  }

  // Thực hiện nước đi
  makeMove(fromSq, toSq, promo = 'q') {
    const fromIdx = this.squareToIndex(fromSq);
    const toIdx = this.squareToIndex(toSq);
    const piece = this.board[fromIdx];
    if (!piece) return false;

    const captured = this.board[toIdx];
    const prevFEN = this.getFEN();

    // Di chuyển quân
    this.board[fromIdx] = null;

    // Kiểm tra phong cấp tốt
    const type = piece.toLowerCase();
    const isPromoRow = (this.turn === 'w' && toIdx < 8) || (this.turn === 'b' && toIdx >= 56);
    if (type === 'p' && isPromoRow) {
      this.board[toIdx] = this.turn === 'w' ? promo.toUpperCase() : promo.toLowerCase();
    } else {
      this.board[toIdx] = piece;
    }

    // Xử lý xe khi nhập thành
    if (type === 'k') {
      if (fromSq === 'e1' && toSq === 'g1') { this.board[63] = null; this.board[61] = 'R'; }
      if (fromSq === 'e1' && toSq === 'c1') { this.board[56] = null; this.board[59] = 'R'; }
      if (fromSq === 'e8' && toSq === 'g8') { this.board[7] = null; this.board[5] = 'r'; }
      if (fromSq === 'e8' && toSq === 'c8') { this.board[0] = null; this.board[3] = 'r'; }

      if (this.turn === 'w') { this.castling.K = false; this.castling.Q = false; }
      else { this.castling.k = false; this.castling.q = false; }
    }

    // Hủy quyền nhập thành nếu xe di chuyển
    if (fromSq === 'h1') this.castling.K = false;
    if (fromSq === 'a1') this.castling.Q = false;
    if (fromSq === 'h8') this.castling.k = false;
    if (fromSq === 'a8') this.castling.q = false;

    // Cập nhật lượt
    const moveNotation = `${fromSq}-${toSq}`;
    this.history.push({
      from: fromSq,
      to: toSq,
      piece,
      captured,
      prevFEN,
      notation: moveNotation
    });

    this.turn = this.turn === 'w' ? 'b' : 'w';
    if (this.turn === 'w') this.fullMoves++;

    return true;
  }

  undo() {
    if (this.history.length === 0) return null;
    const last = this.history.pop();
    this.loadFEN(last.prevFEN);
    return last;
  }
}

if (typeof window !== 'undefined') {
  window.ChessBoardState = ChessBoardState;
} else if (typeof globalThis !== 'undefined') {
  globalThis.ChessBoardState = ChessBoardState;
}
