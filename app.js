const PIECE_ICONS = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");

const game = new Chess();
let selectedSquare = null;
let legalTargets = [];

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
  const board = game.board();

  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const file = FILES[fileIndex];
      const squareName = `${file}${rank}`;
      const piece = board[8 - rank][fileIndex];
      const squareEl = boardEl.querySelector(`[data-square="${squareName}"]`);
      if (!squareEl) continue;

      squareEl.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          squareEl.removeChild(node);
        }
      });

      if (piece) {
        const symbol = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
        squareEl.insertBefore(document.createTextNode(PIECE_ICONS[symbol]), squareEl.firstChild);
      }

      squareEl.classList.toggle("selected", squareName === selectedSquare);
      squareEl.classList.toggle("legal", legalTargets.includes(squareName));
    }
  }

  updateStatus();
}

function getMovesFrom(square) {
  return game
    .moves({ square, verbose: true })
    .map((move) => move.to);
}

function onSquareClick(event) {
  const square = event.currentTarget.dataset.square;

  if (selectedSquare && legalTargets.includes(square)) {
    const move = {
      from: selectedSquare,
      to: square,
      promotion: "q",
    };

    const result = game.move(move);
    selectedSquare = null;
    legalTargets = [];

    if (!result) {
      statusEl.textContent = "Недопустимый ход.";
    }

    renderBoard();
    return;
  }

  const piece = game.get(square);
  const sideToMove = game.turn();

  if (piece && piece.color === sideToMove) {
    selectedSquare = square;
    legalTargets = getMovesFrom(square);
  } else {
    selectedSquare = null;
    legalTargets = [];
  }

  renderBoard();
}

function updateStatus() {
  if (game.isCheckmate()) {
    statusEl.textContent = `Мат! Победили ${game.turn() === "w" ? "чёрные" : "белые"}.`;
    return;
  }

  if (game.isDraw()) {
    if (game.isStalemate()) {
      statusEl.textContent = "Пат. Ничья.";
      return;
    }

    if (game.isThreefoldRepetition()) {
      statusEl.textContent = "Троекратное повторение. Ничья.";
      return;
    }

    if (game.isInsufficientMaterial()) {
      statusEl.textContent = "Недостаточно материала. Ничья.";
      return;
    }

    statusEl.textContent = "Ничья по правилу 50 ходов.";
    return;
  }

  const side = game.turn() === "w" ? "Белые" : "Чёрные";
  statusEl.textContent = `${side} ходят${game.isCheck() ? ", шах." : "."}`;
}

newGameBtn.addEventListener("click", () => {
  game.reset();
  selectedSquare = null;
  legalTargets = [];
  renderBoard();
});

undoBtn.addEventListener("click", () => {
  game.undo();
  selectedSquare = null;
  legalTargets = [];
  renderBoard();
});

createBoard();
renderBoard();
