const PIECE_ICONS = {
  wp: "♙",
  wr: "♖",
  wn: "♘",
  wb: "♗",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  br: "♜",
  bn: "♞",
  bb: "♝",
  bq: "♛",
  bk: "♚",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 };
const SELF_CAPTURE_TRANSFORM = { p: "n", n: "b", b: "r", r: "q" };

const HUMAN_COLOR = "w";
const COMPUTER_COLOR = "b";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");

let selectedSquare = null;
let legalTargets = [];
let isComputerThinking = false;

const history = [];

function squareToCoords(square) {
  return { x: FILES.indexOf(square[0]), y: Number(square[1]) - 1 };
}

function coordsToSquare(x, y) {
  return `${FILES[x]}${y + 1}`;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function initialBoard() {
  return [
    ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"],
    ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
    ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
  ];
}

function createInitialState() {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfMove: 0,
    fullMove: 1,
  };
}

let state = createInitialState();

function getPiece(square, customState = state) {
  const { x, y } = squareToCoords(square);
  return customState.board[y][x];
}

function setPiece(square, piece, customState = state) {
  const { x, y } = squareToCoords(square);
  customState.board[y][x] = piece;
}

function colorOf(piece) {
  return piece ? piece[0] : null;
}

function typeOf(piece) {
  return piece ? piece[1] : null;
}

function inBounds(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function canSelfCaptureAndTransform(movingPiece, targetPiece) {
  if (!movingPiece || !targetPiece) return false;
  const sameColor = colorOf(movingPiece) === colorOf(targetPiece);
  const movingType = typeOf(movingPiece);
  const targetType = typeOf(targetPiece);
  return sameColor && movingType === targetType && Boolean(SELF_CAPTURE_TRANSFORM[movingType]);
}

function canLandOnSquare(movingPiece, targetPiece) {
  if (!movingPiece) return false;
  if (!targetPiece) return true;
  if (colorOf(targetPiece) !== colorOf(movingPiece)) return true;
  return canSelfCaptureAndTransform(movingPiece, targetPiece);
}

function isSquareAttacked(square, byColor, customState = state) {
  const { x: tx, y: ty } = squareToCoords(square);

  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = customState.board[y][x];
      if (!piece || colorOf(piece) !== byColor) continue;
      const t = typeOf(piece);

      if (t === "p") {
        const dir = byColor === "w" ? 1 : -1;
        if (tx === x - 1 && ty === y + dir) return true;
        if (tx === x + 1 && ty === y + dir) return true;
        continue;
      }

      if (t === "n") {
        const steps = [
          [1, 2], [2, 1], [2, -1], [1, -2],
          [-1, -2], [-2, -1], [-2, 1], [-1, 2],
        ];
        if (steps.some(([dx, dy]) => tx === x + dx && ty === y + dy)) return true;
        continue;
      }

      if (t === "k") {
        if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) === 1) return true;
        continue;
      }

      const dirs = [];
      if (t === "b" || t === "q") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      if (t === "r" || t === "q") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);

      for (const [dx, dy] of dirs) {
        let cx = x + dx;
        let cy = y + dy;
        while (inBounds(cx, cy)) {
          if (cx === tx && cy === ty) return true;
          if (customState.board[cy][cx]) break;
          cx += dx;
          cy += dy;
        }
      }
    }
  }

  return false;
}

function kingSquare(color, customState = state) {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (customState.board[y][x] === `${color}k`) {
        return coordsToSquare(x, y);
      }
    }
  }
  return null;
}

function isCheck(color, customState = state) {
  const king = kingSquare(color, customState);
  if (!king) return false;
  return isSquareAttacked(king, color === "w" ? "b" : "w", customState);
}

function pseudoMovesFrom(square, customState = state) {
  const piece = getPiece(square, customState);
  if (!piece) return [];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const { x, y } = squareToCoords(square);
  const moves = [];

  if (type === "p") {
    const dir = color === "w" ? 1 : -1;
    const startRank = color === "w" ? 1 : 6;
    const oneY = y + dir;
    if (inBounds(x, oneY) && !customState.board[oneY][x]) {
      moves.push(coordsToSquare(x, oneY));
      const twoY = y + 2 * dir;
      if (y === startRank && !customState.board[twoY][x]) {
        moves.push(coordsToSquare(x, twoY));
      }
    }
    for (const dx of [-1, 1]) {
      const cx = x + dx;
      const cy = y + dir;
      if (!inBounds(cx, cy)) continue;
      const target = customState.board[cy][cx];
      if (target && canLandOnSquare(piece, target)) moves.push(coordsToSquare(cx, cy));
      if (customState.enPassant === coordsToSquare(cx, cy)) moves.push(coordsToSquare(cx, cy));
    }
    return moves;
  }

  if (type === "n") {
    const jumps = [
      [1, 2], [2, 1], [2, -1], [1, -2],
      [-1, -2], [-2, -1], [-2, 1], [-1, 2],
    ];
    for (const [dx, dy] of jumps) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(cx, cy)) continue;
      const target = customState.board[cy][cx];
      if (canLandOnSquare(piece, target)) moves.push(coordsToSquare(cx, cy));
    }
    return moves;
  }

  if (type === "k") {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const cx = x + dx;
        const cy = y + dy;
        if (!inBounds(cx, cy)) continue;
        const target = customState.board[cy][cx];
        if (canLandOnSquare(piece, target)) moves.push(coordsToSquare(cx, cy));
      }
    }

    if (!isCheck(color, customState)) {
      const enemy = color === "w" ? "b" : "w";
      if (color === "w" && y === 0 && x === 4) {
        if (customState.castling.wK && !customState.board[0][5] && !customState.board[0][6]
          && !isSquareAttacked("f1", enemy, customState) && !isSquareAttacked("g1", enemy, customState)) {
          moves.push("g1");
        }
        if (customState.castling.wQ && !customState.board[0][1] && !customState.board[0][2] && !customState.board[0][3]
          && !isSquareAttacked("d1", enemy, customState) && !isSquareAttacked("c1", enemy, customState)) {
          moves.push("c1");
        }
      }
      if (color === "b" && y === 7 && x === 4) {
        if (customState.castling.bK && !customState.board[7][5] && !customState.board[7][6]
          && !isSquareAttacked("f8", enemy, customState) && !isSquareAttacked("g8", enemy, customState)) {
          moves.push("g8");
        }
        if (customState.castling.bQ && !customState.board[7][1] && !customState.board[7][2] && !customState.board[7][3]
          && !isSquareAttacked("d8", enemy, customState) && !isSquareAttacked("c8", enemy, customState)) {
          moves.push("c8");
        }
      }
    }

    return moves;
  }

  const dirs = [];
  if (type === "b" || type === "q") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  if (type === "r" || type === "q") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);

  for (const [dx, dy] of dirs) {
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy)) {
      const target = customState.board[cy][cx];
      if (!target) {
        moves.push(coordsToSquare(cx, cy));
      } else {
        if (canLandOnSquare(piece, target)) moves.push(coordsToSquare(cx, cy));
        break;
      }
      cx += dx;
      cy += dy;
    }
  }

  return moves;
}

function applyMove(localState, from, to) {
  const next = {
    board: cloneBoard(localState.board),
    turn: localState.turn,
    castling: { ...localState.castling },
    enPassant: null,
    halfMove: localState.halfMove + 1,
    fullMove: localState.fullMove,
  };

  const moving = getPiece(from, next);
  const target = getPiece(to, next);
  const color = colorOf(moving);
  const type = typeOf(moving);

  setPiece(from, null, next);

  if (type === "p" || target) next.halfMove = 0;

  if (type === "p" && to === localState.enPassant && !target) {
    const { x: tx, y: ty } = squareToCoords(to);
    const dir = color === "w" ? -1 : 1;
    next.board[ty + dir][tx] = null;
  }

  if (type === "k") {
    if (color === "w") {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }

    if (from === "e1" && to === "g1") {
      setPiece("h1", null, next);
      setPiece("f1", "wr", next);
    }
    if (from === "e1" && to === "c1") {
      setPiece("a1", null, next);
      setPiece("d1", "wr", next);
    }
    if (from === "e8" && to === "g8") {
      setPiece("h8", null, next);
      setPiece("f8", "br", next);
    }
    if (from === "e8" && to === "c8") {
      setPiece("a8", null, next);
      setPiece("d8", "br", next);
    }
  }

  if (moving === "wr" && from === "a1") next.castling.wQ = false;
  if (moving === "wr" && from === "h1") next.castling.wK = false;
  if (moving === "br" && from === "a8") next.castling.bQ = false;
  if (moving === "br" && from === "h8") next.castling.bK = false;
  if (target === "wr" && to === "a1") next.castling.wQ = false;
  if (target === "wr" && to === "h1") next.castling.wK = false;
  if (target === "br" && to === "a8") next.castling.bQ = false;
  if (target === "br" && to === "h8") next.castling.bK = false;

  let placed = moving;
  if (canSelfCaptureAndTransform(moving, target)) {
    placed = `${color}${SELF_CAPTURE_TRANSFORM[type]}`;
  }

  if (type === "p") {
    const { y: ty } = squareToCoords(to);
    if ((color === "w" && ty === 7) || (color === "b" && ty === 0)) {
      placed = `${color}q`;
    }

    const { y: fy } = squareToCoords(from);
    if (Math.abs(ty - fy) === 2) {
      const middleY = (fy + ty) / 2;
      const { x: fx } = squareToCoords(from);
      next.enPassant = coordsToSquare(fx, middleY);
    }
  }

  setPiece(to, placed, next);

  next.turn = localState.turn === "w" ? "b" : "w";
  if (next.turn === "w") next.fullMove += 1;

  return next;
}

function legalMovesFrom(square, customState = state) {
  const piece = getPiece(square, customState);
  if (!piece || colorOf(piece) !== customState.turn) return [];
  const candidate = pseudoMovesFrom(square, customState);
  return candidate.filter((to) => {
    const simulated = applyMove(customState, square, to);
    return !isCheck(customState.turn, simulated);
  });
}

function allLegalMoves(color = state.turn, customState = state) {
  const moves = [];
  for (const rank of RANKS) {
    for (const file of FILES) {
      const from = `${file}${rank}`;
      const piece = getPiece(from, customState);
      if (!piece || colorOf(piece) !== color) continue;
      for (const to of legalMovesFrom(from, { ...customState, turn: color })) {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

function getGameResult(customState = state) {
  const legal = allLegalMoves(customState.turn, customState);
  const checked = isCheck(customState.turn, customState);
  if (legal.length === 0 && checked) {
    return customState.turn === "w" ? "black_win" : "white_win";
  }
  if (legal.length === 0) return "stalemate";
  if (customState.halfMove >= 100) return "draw_50";
  return "ongoing";
}

function evaluatePosition(customState) {
  const result = getGameResult(customState);
  if (result === "black_win") return 100000;
  if (result === "white_win") return -100000;
  if (result === "stalemate" || result === "draw_50") return 0;

  let score = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = customState.board[y][x];
      if (!piece) continue;
      const value = PIECE_VALUES[typeOf(piece)] ?? 0;
      score += colorOf(piece) === "b" ? value : -value;
    }
  }

  if (isCheck("w", customState)) score += 20;
  if (isCheck("b", customState)) score -= 20;

  return score;
}

function minimax(customState, depth, alpha, beta, maximizing) {
  const result = getGameResult(customState);
  if (depth === 0 || result !== "ongoing") {
    return evaluatePosition(customState);
  }

  const color = maximizing ? "b" : "w";
  const moves = allLegalMoves(color, { ...customState, turn: color });
  if (moves.length === 0) return evaluatePosition({ ...customState, turn: color });

  if (maximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const next = applyMove({ ...customState, turn: color }, mv.from, mv.to);
      const val = minimax(next, depth - 1, alpha, beta, false);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const mv of moves) {
    const next = applyMove({ ...customState, turn: color }, mv.from, mv.to);
    const val = minimax(next, depth - 1, alpha, beta, true);
    best = Math.min(best, val);
    beta = Math.min(beta, val);
    if (beta <= alpha) break;
  }
  return best;
}

function pickComputerMove() {
  const moves = allLegalMoves(COMPUTER_COLOR, { ...state, turn: COMPUTER_COLOR });
  if (!moves.length) return null;

  let bestScore = -Infinity;
  let bestMoves = [];

  for (const mv of moves) {
    const next = applyMove({ ...state, turn: COMPUTER_COLOR }, mv.from, mv.to);
    const score = minimax(next, 1, -Infinity, Infinity, false);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [mv];
    } else if (score === bestScore) {
      bestMoves.push(mv);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? null;
}

function move(from, to) {
  const legal = legalMovesFrom(from);
  if (!legal.includes(to)) return false;
  history.push(JSON.stringify(state));
  state = applyMove(state, from, to);
  return true;
}

function undoTurn() {
  const prev = history.pop();
  if (!prev) return;
  state = JSON.parse(prev);
}

function maybeComputerTurn() {
  if (state.turn !== COMPUTER_COLOR) return;
  if (getGameResult(state) !== "ongoing") return;

  isComputerThinking = true;
  updateStatus();

  setTimeout(() => {
    const best = pickComputerMove();
    if (best) move(best.from, best.to);
    isComputerThinking = false;
    renderBoard();
  }, 250);
}

function createBoard() {
  boardEl.innerHTML = "";
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const file = FILES[fileIndex];
      const squareName = `${file}${rank}`;
      const squareEl = document.createElement("button");
      squareEl.type = "button";
      squareEl.className = `square ${(fileIndex + rank) % 2 === 0 ? "dark" : "light"}`;
      squareEl.dataset.square = squareName;
      squareEl.setAttribute("aria-label", `Клетка ${squareName}`);
      squareEl.addEventListener("click", onSquareClick);

      if (rank === 1) {
        const fileCoord = document.createElement("span");
        fileCoord.className = "coord file";
        fileCoord.textContent = file;
        squareEl.append(fileCoord);
      }
      if (fileIndex === 0) {
        const rankCoord = document.createElement("span");
        rankCoord.className = "coord rank";
        rankCoord.textContent = String(rank);
        squareEl.append(rankCoord);
      }
      boardEl.append(squareEl);
    }
  }
}

function renderBoard() {
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const file = FILES[fileIndex];
      const squareName = `${file}${rank}`;
      const squareEl = boardEl.querySelector(`[data-square="${squareName}"]`);
      if (!squareEl) continue;

      squareEl.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) squareEl.removeChild(node);
      });

      const piece = getPiece(squareName);
      if (piece) {
        squareEl.insertBefore(document.createTextNode(PIECE_ICONS[piece]), squareEl.firstChild);
      }

      squareEl.classList.toggle("selected", squareName === selectedSquare);
      squareEl.classList.toggle("legal", legalTargets.includes(squareName));
    }
  }
  updateStatus();
}

function updateStatus() {
  if (isComputerThinking) {
    statusEl.textContent = "Компьютер думает…";
    return;
  }

  const result = getGameResult(state);
  if (result === "white_win") {
    statusEl.textContent = "Мат! Победили белые.";
    return;
  }
  if (result === "black_win") {
    statusEl.textContent = "Мат! Победили чёрные.";
    return;
  }
  if (result === "stalemate") {
    statusEl.textContent = "Пат. Ничья.";
    return;
  }
  if (result === "draw_50") {
    statusEl.textContent = "Ничья по правилу 50 ходов.";
    return;
  }

  const side = state.turn === "w" ? "Белые" : "Чёрные";
  const computerHint = state.turn === COMPUTER_COLOR ? " (компьютер)" : " (вы)";
  statusEl.textContent = `${side}${computerHint} ходят${isCheck(state.turn, state) ? ", шах." : "."}`;
}

function onSquareClick(event) {
  if (state.turn !== HUMAN_COLOR || isComputerThinking) return;

  const square = event.currentTarget.dataset.square;

  if (selectedSquare && legalTargets.includes(square)) {
    move(selectedSquare, square);
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
    maybeComputerTurn();
    return;
  }

  const piece = getPiece(square);
  if (piece && colorOf(piece) === state.turn) {
    selectedSquare = square;
    legalTargets = legalMovesFrom(square);
  } else {
    selectedSquare = null;
    legalTargets = [];
  }
  renderBoard();
}

newGameBtn.addEventListener("click", () => {
  state = createInitialState();
  history.length = 0;
  selectedSquare = null;
  legalTargets = [];
  isComputerThinking = false;
  renderBoard();
  maybeComputerTurn();
});

undoBtn.addEventListener("click", () => {
  if (isComputerThinking) return;

  // В режиме против компьютера откатываем пару полуходов, чтобы снова ходил человек.
  undoTurn();
  if (state.turn !== HUMAN_COLOR) undoTurn();

  selectedSquare = null;
  legalTargets = [];
  renderBoard();
});

createBoard();
renderBoard();
maybeComputerTurn();
