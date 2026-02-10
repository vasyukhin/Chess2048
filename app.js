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

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");

let selectedSquare = null;
let legalTargets = [];

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

let state = createInitialState();

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
      if (target && colorOf(target) !== color) {
        moves.push(coordsToSquare(cx, cy));
      }
      if (customState.enPassant === coordsToSquare(cx, cy)) {
        moves.push(coordsToSquare(cx, cy));
      }
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
      if (!target || colorOf(target) !== color) moves.push(coordsToSquare(cx, cy));
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
        if (!target || colorOf(target) !== color) moves.push(coordsToSquare(cx, cy));
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
        if (colorOf(target) !== color) moves.push(coordsToSquare(cx, cy));
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
      const sq = `${file}${rank}`;
      const piece = getPiece(sq, customState);
      if (!piece || colorOf(piece) !== color) continue;
      for (const to of legalMovesFrom(sq, { ...customState, turn: color })) {
        moves.push({ from: sq, to });
      }
    }
  }
  return moves;
}

function move(from, to) {
  const legal = legalMovesFrom(from);
  if (!legal.includes(to)) return false;
  history.push(JSON.stringify(state));
  state = applyMove(state, from, to);
  return true;
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  state = JSON.parse(prev);
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
  const side = state.turn === "w" ? "Белые" : "Чёрные";
  const legal = allLegalMoves(state.turn);
  const checked = isCheck(state.turn);

  if (legal.length === 0 && checked) {
    statusEl.textContent = `Мат! Победили ${state.turn === "w" ? "чёрные" : "белые"}.`;
    return;
  }
  if (legal.length === 0) {
    statusEl.textContent = "Пат. Ничья.";
    return;
  }
  if (state.halfMove >= 100) {
    statusEl.textContent = "Ничья по правилу 50 ходов.";
    return;
  }

  statusEl.textContent = `${side} ходят${checked ? ", шах." : "."}`;
}

function onSquareClick(event) {
  const square = event.currentTarget.dataset.square;

  if (selectedSquare && legalTargets.includes(square)) {
    move(selectedSquare, square);
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
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
  renderBoard();
});

undoBtn.addEventListener("click", () => {
  undo();
  selectedSquare = null;
  legalTargets = [];
  renderBoard();
});

createBoard();
renderBoard();
