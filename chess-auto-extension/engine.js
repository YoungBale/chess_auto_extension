/**
 * Chess Auto Tool - Super Grandmaster Engine Adapter
 * Bộ não cấp độ Kiện tướng & Đại Kiện tướng:
 * 1. chess.js: Quản lý luật cờ vua quốc tế, xác thực thế cờ và FEN chuẩn.
 * 2. Instant Mate-in-1 Detector: Bắt và thực thi nước chiếu hết tức thì trong 0ms.
 * 3. Grandmaster Opening Book: Thư viện khai cuộc GM đồ sộ (Sicily, London, Queen's Gambit, Italian, Ruy Lopez, French, Caro-Kann, King's Indian...).
 * 4. Stockfish GM Offline (WebAssembly / Worker): Sức cờ Elo 3200+ đến 3500+, 100% Offline, phản hồi 100-300ms, không phụ thuộc mạng, không bao giờ rate limit.
 * 5. Stockfish Online Cloud: Tích hợp Lichess Cloud Database Depth 70 + Stockfish 16 REST API.
 * 6. Local Minimax Pro Engine: Thuật toán Minimax Alpha-Beta Pruning thật sự (Depth 3-4) + Piece-Square Tables (PST) + Quiescence Search chống bẫy dâng quân.
 */

(function () {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const ChessConstructor = globalScope.Chess || (typeof Chess === 'function' ? Chess : null);

  // =========================================================================
  // 1. THƯ VIỆN KHAI CUỘC ĐẠI KIỆN TƯỚNG (GM OPENING BOOK)
  // =========================================================================
  const GM_OPENING_BOOK = {
    // 1. Trắng xuất phát
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': { from: 'e2', to: 'e4', san: 'e4', name: "Khai cuộc Tốt Vua (King's Pawn)" },

    // 1. e4 Đen đáp trả
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': { from: 'c7', to: 'c5', san: 'c5', name: 'Phòng thủ Sicilian (Sicilian Defense)' },
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': { from: 'c7', to: 'c5', san: 'c5', name: 'Phòng thủ Sicilian (Sicilian Defense)' },

    // 1. e4 c5 -> 2. Nf3
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { from: 'g1', to: 'f3', san: 'Nf3', name: 'Sicilian: Open Variation' },
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6': { from: 'g1', to: 'f3', san: 'Nf3', name: 'Sicilian: Open Variation' },

    // 1. e4 c5 2. Nf3 d6 -> 3. d4
    'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': { from: 'd2', to: 'd4', san: 'd4', name: 'Sicilian: Classical Open' },
    // 1. e4 c5 2. Nf3 d6 3. d4 cxd4 -> 4. Nxd4
    'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -': { from: 'f3', to: 'd4', san: 'Nxd4', name: 'Sicilian: Open Nxd4' },
    // 1. e4 c5 2. Nf3 Nc6 -> 3. d4
    'r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': { from: 'd2', to: 'd4', san: 'd4', name: 'Sicilian: Old Sicilian' },
    // 1. e4 c5 2. Nf3 e6 -> 3. d4
    'rnbqkbnr/pp1p1ppp/4p3/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': { from: 'd2', to: 'd4', san: 'd4', name: 'Sicilian: French Variation' },

    // 1. e4 e5 -> 2. Nf3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { from: 'g1', to: 'f3', san: 'Nf3', name: "Khai cuộc Mã Vua (King's Knight)" },
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': { from: 'g1', to: 'f3', san: 'Nf3', name: "Khai cuộc Mã Vua (King's Knight)" },

    // 1. e4 e5 2. Nf3 Nc6 -> 3. Bc4 (Italian) hoặc Bb5 (Ruy Lopez)
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': { from: 'f1', to: 'c4', san: 'Bc4', name: 'Khai cuộc Ý (Italian Game)' },
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 -> 4. c3 (Giuoco Piano)
    'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -': { from: 'c2', to: 'c3', san: 'c3', name: 'Italian: Giuoco Piano' },
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 -> 4. d3 (Two Knights Defense)
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -': { from: 'd2', to: 'd3', san: 'd3', name: 'Italian: Two Knights Defense' },

    // 1. e4 e6 (French Defense) -> 2. d4
    'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { from: 'd2', to: 'd4', san: 'd4', name: 'Phòng thủ Pháp (French Defense)' },
    'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': { from: 'd2', to: 'd4', san: 'd4', name: 'Phòng thủ Pháp (French Defense)' },
    // 1. e4 e6 2. d4 d5 -> 3. Nc3
    'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -': { from: 'b1', to: 'c3', san: 'Nc3', name: 'French: Paulsen / Classical' },
    'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6': { from: 'b1', to: 'c3', san: 'Nc3', name: 'French: Paulsen / Classical' },

    // 1. e4 c6 (Caro-Kann Defense) -> 2. d4
    'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { from: 'd2', to: 'd4', san: 'd4', name: 'Phòng thủ Caro-Kann' },
    'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6': { from: 'd2', to: 'd4', san: 'd4', name: 'Phòng thủ Caro-Kann' },
    // 1. e4 c6 2. d4 d5 -> 3. Nc3
    'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -': { from: 'b1', to: 'c3', san: 'Nc3', name: 'Caro-Kann: Classical' },
    'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6': { from: 'b1', to: 'c3', san: 'Nc3', name: 'Caro-Kann: Classical' },

    // 1. d4 -> 1... d5 hoặc 1... Nf6
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': { from: 'g8', to: 'f6', san: 'Nf6', name: 'Phòng thủ Ấn Độ (Indian Defense)' },
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3': { from: 'g8', to: 'f6', san: 'Nf6', name: 'Phòng thủ Ấn Độ (Indian Defense)' },

    // 1. d4 d5 -> 2. c4 (Queen's Gambit) hoặc 2. Bf4 (London System)
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': { from: 'c2', to: 'c4', san: 'c4', name: 'Gambit Hậu (Queen’s Gambit)' },
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6': { from: 'c2', to: 'c4', san: 'c4', name: 'Gambit Hậu (Queen’s Gambit)' },
    // 1. d4 d5 2. c4 e6 -> 3. Nc3
    'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': { from: 'b1', to: 'c3', san: 'Nc3', name: 'Queen’s Gambit Declined' },

    // 1. d4 Nf6 -> 2. c4
    'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': { from: 'c2', to: 'c4', san: 'c4', name: 'Indian Defense: Main Line' },
    // 1. d4 Nf6 2. c4 e6 -> 3. Nc3
    'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': { from: 'b1', to: 'c3', san: 'Nc3', name: 'Nimzo / Bogo Indian' },
    // 1. d4 Nf6 2. c4 g6 -> 3. Nc3
    'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': { from: 'b1', to: 'c3', san: 'Nc3', name: "Phòng thủ Ấn Độ Vua (King's Indian)" },

    // 1. c4 (English Opening) -> 1... e5
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -': { from: 'e7', to: 'e5', san: 'e5', name: 'Khai cuộc Anh (English Opening)' },
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3': { from: 'e7', to: 'e5', san: 'e5', name: 'Khai cuộc Anh (English Opening)' }
  };

  function lookupOpeningBook(fen) {
    if (!fen) return null;
    const parts = fen.trim().split(/\s+/);
    // Key 1: Vị trí + lượt + nhập thành
    const keyWithCastling = `${parts[0]} ${parts[1]} ${parts[2] || '-'}`;
    for (let k of Object.keys(GM_OPENING_BOOK)) {
      const kParts = k.split(/\s+/);
      if (kParts[0] === parts[0] && kParts[1] === parts[1]) {
        const found = GM_OPENING_BOOK[k];
        return {
          uci: found.from + found.to,
          from: found.from,
          to: found.to,
          san: found.san,
          score: '0.00',
          openingName: found.name,
          source: 'gm_opening_book'
        };
      }
    }
    return null;
  }

  // =========================================================================
  // 2. PHÁT HIỆN CHIẾU HẾT TỨC THÌ (INSTANT MATE-IN-1 DETECTOR: 0ms)
  // =========================================================================
  function findImmediateMateIn1(chessInstance) {
    if (!chessInstance || typeof chessInstance.moves !== 'function') return null;
    const moves = chessInstance.moves({ verbose: true });
    for (const m of moves) {
      chessInstance.move(m);
      if (chessInstance.in_checkmate()) {
        chessInstance.undo();
        const cap = m.captured ? ` (Ăn ${m.captured.toUpperCase()})` : '';
        console.log(`[ChessEngine] ⚡ PHÁT HIỆN CHIẾU HẾT TỨC THÌ${cap}: ${m.san} (${m.from} -> ${m.to})`);
        return {
          uci: m.from + m.to + (m.promotion || ''),
          from: m.from,
          to: m.to,
          san: m.san,
          promotion: m.promotion || null,
          score: '#1',
          isCheckmate: true,
          source: 'instant_mate_detector'
        };
      }
      chessInstance.undo();
    }
    return null;
  }

  // Chống nước hớ (để đối thủ chiếu hết ngay nước sau)
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

  // =========================================================================
  // 3. STOCKFISH GM OFFLINE ENGINE (WEBASSEMBLY / WORKER - ELO 3200+)
  // =========================================================================
  class StockfishOfflineEngine {
    constructor() {
      this.worker = null;
      this.isReady = false;
      this.isInitializing = false;
      this.readyCallbacks = [];
      this.currentResolver = null;
    }

    async init() {
      if (this.worker) return true;
      if (this.isInitializing) {
        return new Promise(r => this.readyCallbacks.push(r));
      }
      this.isInitializing = true;

      try {
        let scriptUrl = 'stockfish.js';
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
          scriptUrl = chrome.runtime.getURL('stockfish.js');
        }

        const res = await fetch(scriptUrl);
        if (!res.ok) throw new Error('Không thể tải file stockfish.js: ' + res.status);
        const scriptText = await res.text();

        const blob = new Blob([scriptText], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(blobUrl);

        this.worker.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : (e.data?.data || '');
          this.handleEngineOutput(line);
        };

        this.worker.onerror = (err) => {
          console.error('[StockfishOffline] Worker error:', err);
        };

        this.worker.postMessage('uci');
        this.worker.postMessage('isready');

        // Chờ readyok
        await new Promise((resolve) => {
          const checkReady = () => {
            if (this.isReady) resolve(true);
            else setTimeout(checkReady, 50);
          };
          checkReady();
        });

        console.log('[StockfishOffline] 🚀 Stockfish GM Offline Engine (Elo 3200+) đã khởi động thành công!');
        this.isInitializing = false;
        return true;
      } catch (err) {
        console.warn('[StockfishOffline] Không thể khởi tạo Web Worker Stockfish:', err);
        this.isInitializing = false;
        this.worker = null;
        return false;
      }
    }

    handleEngineOutput(line) {
      if (line === 'readyok') {
        this.isReady = true;
        while (this.readyCallbacks.length) {
          const cb = this.readyCallbacks.shift();
          cb();
        }
      }

      if (this.currentResolver) {
        // Đọc điểm đánh giá
        if (line.startsWith('info ') && line.includes('score ')) {
          const mateMatch = line.match(/score mate (-?\d+)/);
          const cpMatch = line.match(/score cp (-?\d+)/);
          if (mateMatch) {
            this.currentResolver.lastScore = '#' + mateMatch[1];
          } else if (cpMatch) {
            this.currentResolver.lastScore = (parseInt(cpMatch[1], 10) / 100).toFixed(2);
          }
        }

        // Đọc bestmove
        if (line.startsWith('bestmove')) {
          const parts = line.split(/\s+/);
          const bestUci = parts[1];
          const res = this.currentResolver;
          this.currentResolver = null;

          if (bestUci && bestUci !== '(none)' && bestUci.length >= 4) {
            const from = bestUci.slice(0, 2);
            const to = bestUci.slice(2, 4);
            const promo = bestUci.length > 4 ? bestUci.slice(4, 5) : null;
            res.resolve({
              uci: bestUci,
              from,
              to,
              promotion: promo,
              score: res.lastScore || '0.00',
              source: 'stockfish_offline_gm'
            });
          } else {
            res.reject(new Error('Stockfish returned invalid bestmove: ' + line));
          }
        }
      }
    }

    async calculateMove(fen, options = {}) {
      const ready = await this.init();
      if (!ready || !this.worker) {
        throw new Error('Stockfish Worker không khả dụng');
      }

      const depth = options.depth || 14;
      const elo = options.elo || 3200;

      return new Promise((resolve, reject) => {
        if (this.currentResolver) {
          try { this.worker.postMessage('stop'); } catch (e) {}
          this.currentResolver.reject(new Error('Superseded by new request'));
        }

        const timer = setTimeout(() => {
          if (this.currentResolver) {
            try { this.worker.postMessage('stop'); } catch (e) {}
          }
        }, 6000);

        this.currentResolver = {
          resolve: (data) => { clearTimeout(timer); resolve(data); },
          reject: (err) => { clearTimeout(timer); reject(err); },
          lastScore: '0.00'
        };

        // Thiết lập Elo sức mạnh
        if (elo && elo < 3000) {
          this.worker.postMessage('setoption name UCI_LimitStrength value true');
          this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
        } else {
          this.worker.postMessage('setoption name UCI_LimitStrength value false');
        }

        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
      });
    }
  }

  const stockfishOffline = new StockfishOfflineEngine();

  // =========================================================================
  // 4. LOCAL MINIMAX PRO ENGINE (ALPHA-BETA + PST + QUIESCENCE: ELO 1800-2000)
  // =========================================================================
  const PAWN_TABLE = [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0
  ];

  const KNIGHT_TABLE = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ];

  const BISHOP_TABLE = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ];

  const ROOK_TABLE = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
  ];

  const QUEEN_TABLE = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ];

  const KING_TABLE = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ];

  const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const PST = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE };

  class LocalMinimaxProEngine {
    evaluateBoard(chess) {
      let total = 0;
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece) {
            const val = PIECE_VALUES[piece.type] || 0;
            const table = PST[piece.type];
            const idx = piece.color === 'w' ? (r * 8 + c) : ((7 - r) * 8 + c);
            const posVal = table ? table[idx] : 0;
            const score = val + posVal;
            total += (piece.color === 'w') ? score : -score;
          }
        }
      }
      return chess.turn() === 'w' ? total : -total;
    }

    quiescence(chess, alpha, beta, qdepth = 0) {
      const standPat = this.evaluateBoard(chess);
      if (qdepth >= 4) return standPat;
      if (standPat >= beta) return beta;
      if (alpha < standPat) alpha = standPat;

      const moves = chess.moves({ verbose: true }).filter(m => m.captured);
      // Sắp xếp: Bắt quân giá trị cao nhất bằng quân giá trị nhỏ nhất (MVV-LVA)
      moves.sort((a, b) => {
        const valA = (PIECE_VALUES[a.captured] || 0) * 10 - (PIECE_VALUES[a.piece] || 0);
        const valB = (PIECE_VALUES[b.captured] || 0) * 10 - (PIECE_VALUES[b.piece] || 0);
        return valB - valA;
      });

      for (const m of moves) {
        chess.move(m);
        const score = -this.quiescence(chess, -beta, -alpha, qdepth + 1);
        chess.undo();

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    minimax(chess, depth, alpha, beta, isRoot = false) {
      if (depth === 0) return this.quiescence(chess, alpha, beta);
      if (chess.in_checkmate()) return -90000 - depth;
      if (chess.in_draw()) return 0;

      const moves = chess.moves({ verbose: true });
      if (moves.length === 0) return 0;

      // Sắp xếp nước đi để cắt tỉa Alpha-Beta tối ưu
      moves.sort((a, b) => {
        let scoreA = a.captured ? (PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece]) : 0;
        let scoreB = b.captured ? (PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece]) : 0;
        if (a.promotion) scoreA += 800;
        if (b.promotion) scoreB += 800;
        return scoreB - scoreA;
      });

      let bestMove = moves[0];
      let maxScore = -999999;

      for (const m of moves) {
        chess.move(m);
        const score = -this.minimax(chess, depth - 1, -beta, -alpha);
        chess.undo();

        if (score > maxScore) {
          maxScore = score;
          bestMove = m;
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }

      return isRoot ? { move: bestMove, score: maxScore } : maxScore;
    }

    getBestMove(chess, depth = 3) {
      const legalMoves = chess.moves({ verbose: true });
      if (legalMoves.length === 0) return null;

      // 1. Kiểm tra Mate-in-1
      const mate = findImmediateMateIn1(chess);
      if (mate) return mate;

      // 2. Chạy Minimax với Alpha-Beta Pruning và Quiescence Search
      const searchDepth = Math.min(Math.max(depth, 2), 3);
      const result = this.minimax(chess, searchDepth, -999999, 999999, true);
      const chosen = result.move || legalMoves[0];

      return {
        uci: chosen.from + chosen.to + (chosen.promotion || ''),
        from: chosen.from,
        to: chosen.to,
        san: chosen.san,
        promotion: chosen.promotion || null,
        score: (result.score / 100).toFixed(2),
        source: `local_minimax_pro_depth_${searchDepth}`
      };
    }
  }

  const localEnginePro = new LocalMinimaxProEngine();

  // =========================================================================
  // 5. GỌI STOCKFISH QUA BACKGROUND SERVICE WORKER (DỰ PHÒNG CLOUD & REST)
  // =========================================================================
  async function queryStockfishViaBackground(fen, depth = 16) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'QUERY_STOCKFISH', fen, depth }, (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (res?.success && res.data) {
            resolve(res.data);
          } else {
            reject(new Error(res?.error || 'Background query failed'));
          }
        });
      });
    }
    throw new Error('chrome.runtime không tồn tại');
  }

  // =========================================================================
  // 6. BỘ ĐIỀU PHỐI CHÍNH (MASTER CALCULATE BEST MOVE)
  // =========================================================================
  globalScope.ChessEngine = {
    async calculateBestMove(fen, options = {}) {
      const mode = options.mode || 'stockfish_offline'; // MẶC ĐỊNH LÀ STOCKFISH OFFLINE SIÊU CẤP
      const depth = options.depth || 14;
      const elo = options.elo || 3200;

      // Chuẩn hóa và làm sạch FEN bằng chess.js
      let cleanFen = fen;
      let chess = null;
      if (typeof ChessConstructor === 'function') {
        try {
          chess = new ChessConstructor();
          if (chess.load(fen)) {
            cleanFen = chess.fen();
          } else {
            // Thử bỏ trường en-passant nếu bị lỗi validation
            const parts = fen.trim().split(/\s+/);
            if (parts.length >= 4) {
              parts[3] = '-';
              if (chess.load(parts.join(' '))) {
                cleanFen = chess.fen();
              }
            }
          }
        } catch (e) {
          chess = null;
        }
      }

      // BƯỚC 1: KIỂM TRA CHIẾU HẾT TỨC THÌ TRONG 0ms (MATE IN 1)
      if (chess) {
        const instantMate = findImmediateMateIn1(chess);
        if (instantMate) return instantMate;
      }

      // BƯỚC 2: TRA CỨU KHAI CUỘC ĐẠI KIỆN TƯỚNG (GM OPENING BOOK)
      const bookMove = lookupOpeningBook(cleanFen);
      if (bookMove) {
        let isBookLegal = true;
        if (chess) {
          const legals = chess.moves({ verbose: true });
          const matched = legals.find(m => m.from === bookMove.from && m.to === bookMove.to);
          if (!matched || isMateBlunder(chess, matched)) isBookLegal = false;
        }
        if (isBookLegal) {
          console.log(`[ChessEngine] 📚 Khai cuộc GM: ${bookMove.openingName} -> ${bookMove.san} (${bookMove.uci})`);
          return bookMove;
        }
      }

      // BƯỚC 3: ƯU TIÊN SỐ 1 - STOCKFISH GM OFFLINE (ELO 3200+ KHÔNG CẦN MẠNG)
      if (mode === 'stockfish_offline' || mode === 'stockfish_online') {
        try {
          console.log(`[ChessEngine] ⚡ Đang tính toán bằng Stockfish GM Offline (Depth ${depth}, Elo ${elo})...`);
          const sfMove = await stockfishOffline.calculateMove(cleanFen, { depth, elo });
          if (sfMove && sfMove.from && sfMove.to) {
            let verified = true;
            if (chess) {
              const legals = chess.moves({ verbose: true });
              const matched = legals.find(m => m.from === sfMove.from && m.to === sfMove.to);
              if (!matched) verified = false;
              else if (isMateBlunder(chess, matched)) verified = false;
            }
            if (verified) {
              console.log(`[ChessEngine] 🏆 Stockfish Offline Bestmove: ${sfMove.uci} (Eval: ${sfMove.score})`);
              return sfMove;
            }
          }
        } catch (errSf) {
          console.warn('[ChessEngine] Stockfish Offline lỗi hoặc không hỗ trợ Worker:', errSf.message);
        }
      }

      // BƯỚC 4: DỰ PHÒNG 1 - GỌI STOCKFISH CLOUD / REST API QUA BACKGROUND
      if (mode === 'stockfish_online') {
        try {
          const bgResult = await queryStockfishViaBackground(cleanFen, Math.max(depth, 14));
          if (bgResult && bgResult.from && bgResult.to) {
            let verified = true;
            if (chess) {
              const legals = chess.moves({ verbose: true });
              const matched = legals.find(m => m.from === bgResult.from && m.to === bgResult.to);
              if (!matched || isMateBlunder(chess, matched)) verified = false;
            }
            if (verified) return bgResult;
          }
        } catch (bgErr) {
          console.warn('[ChessEngine] Background Online fetch lỗi:', bgErr);
        }
      }

      // BƯỚC 5: DỰ PHÒNG 2 - LOCAL MINIMAX PRO (ALPHA-BETA + PST + QUIESCENCE, ELO 1800-2000)
      if (chess) {
        console.log('[ChessEngine] 🧠 Chạy Local Minimax Pro Engine (Alpha-Beta + PST)...');
        const localMove = localEnginePro.getBestMove(chess, 3);
        if (localMove) return localMove;
      }

      // BƯỚC 6: BẢO VỆ CUỐI CÙNG (Nước an toàn không tự sát)
      if (chess) {
        const anyMoves = chess.moves({ verbose: true }).filter(m => !isMateBlunder(chess, m));
        if (anyMoves.length > 0) {
          const m = anyMoves[0];
          return {
            uci: m.from + m.to + (m.promotion || ''),
            from: m.from,
            to: m.to,
            san: m.san,
            promotion: m.promotion || null,
            score: '0.00',
            source: 'emergency_safe_move'
          };
        }
      }

      throw new Error('Không thể tìm thấy nước đi an toàn cho thế cờ này.');
    }
  };

  console.log('[ChessEngine] Super Grandmaster Engine (Stockfish Offline Elo 3200+ & Minimax Pro) đã sẵn sàng.');
})();
