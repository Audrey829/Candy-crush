const ROWS = 9;
const COLS = 9;
const COLORS = ["red", "blue", "green", "yellow", "purple"];

let board = [];
let selected = null;
let score = 0;
let moves = 20;
let isAnimating = false;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function createCandy(color = randomColor(), type = "plain") {
    return {
        color,
        type, // plain | stripedH | stripedV | wrapped | colorBomb
        marked: false
    };
}

function initBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            row.push(createCandy());
        }
        board.push(row);
    }

    stabilizeInitialBoard();
}

function stabilizeInitialBoard() {
    let groups = findMatchGroups();
    while (groups.length > 0) {
        const affected = collectCellsFromGroups(groups);
        for (const pos of affected) {
            const [row, col] = pos.split("-").map(Number);
            board[row][col] = null;
        }
        dropCandies();
        refillBoard();
        groups = findMatchGroups();
    }
}

function renderBoard() {
    const boardElement = document.getElementById("game-board");
    boardElement.innerHTML = "";

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.row = r;
            cell.dataset.col = c;

            const candy = board[r][c];

            if (candy !== null) {
                const candyEl = document.createElement("div");
                candyEl.classList.add("candy");

                if (candy.type === "colorBomb") {
                    candyEl.classList.add("colorBomb");
                } else {
                    candyEl.classList.add(candy.color);
                }

                if (candy.type === "stripedH") {
                    candyEl.classList.add("stripedH");
                } else if (candy.type === "stripedV") {
                    candyEl.classList.add("stripedV");
                } else if (candy.type === "wrapped") {
                    candyEl.classList.add("wrapped");
                }

                if (candy.marked) {
                    candyEl.classList.add("crushing");
                }

                if (selected && selected.row === r && selected.col === c) {
                    candyEl.classList.add("selected");
                }

                cell.appendChild(candyEl);
            }

            cell.addEventListener("click", onCellClick);
            boardElement.appendChild(cell);
        }
    }

    const scoreEl = document.getElementById("score");
    const movesEl = document.getElementById("moves");
    if (scoreEl) scoreEl.textContent = score;
    if (movesEl) movesEl.textContent = moves;
}

async function onCellClick(event) {
    if (moves <= 0 || isAnimating) return;

    const row = parseInt(event.currentTarget.dataset.row, 10);
    const col = parseInt(event.currentTarget.dataset.col, 10);

    if (!selected) {
        selected = { row, col };
        renderBoard();
        return;
    }

    if (selected.row === row && selected.col === col) {
        selected = null;
        renderBoard();
        return;
    }

    if (!isAdjacent(selected.row, selected.col, row, col)) {
        selected = { row, col };
        renderBoard();
        return;
    }

    const first = { ...selected };
    const second = { row, col };

    const candyA = board[first.row][first.col];
    const candyB = board[second.row][second.col];

    swapCells(first.row, first.col, second.row, second.col);
    renderBoard();

    // Special direct swap: color bomb + any normal/special color candy
    if (candyA?.type === "colorBomb" || candyB?.type === "colorBomb") {
        moves--;
        selected = null;
        isAnimating = true;

        const otherCandy = candyA.type === "colorBomb" ? candyB : candyA;
        const targetColor = otherCandy?.color;

        const affected = new Set();

        // both swapped cells are affected too
        affected.add(`${first.row}-${first.col}`);
        affected.add(`${second.row}-${second.col}`);

        if (targetColor) {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const candy = board[r][c];
                    if (candy && candy.color === targetColor) {
                        affected.add(`${r}-${c}`);
                    }
                }
            }
        }

        await resolveSpecialSet(affected);

        isAnimating = false;
        renderBoard();
        checkGameOver();
        return;
    }

    const initialGroups = findMatchGroups();

    if (initialGroups.length === 0) {
        await delay(120);
        swapCells(first.row, first.col, second.row, second.col);
        selected = null;
        renderBoard();
        return;
    }

    moves--;
    selected = null;
    isAnimating = true;

    await resolveBoard(initialGroups, first, second);

    isAnimating = false;
    renderBoard();
    checkGameOver();
}

function isAdjacent(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function swapCells(r1, c1, r2, c2) {
    const temp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = temp;
}

function sameColor(c1, c2) {
    return (
        c1 &&
        c2 &&
        c1.type !== "colorBomb" &&
        c2.type !== "colorBomb" &&
        c1.color === c2.color
    );
}

function findMatchGroups() {
    const groups = [];

    // Horizontal groups
    for (let r = 0; r < ROWS; r++) {
        let start = 0;

        for (let c = 1; c <= COLS; c++) {
            if (c < COLS && sameColor(board[r][c], board[r][c - 1])) {
                continue;
            }

            const len = c - start;
            if (board[r][start] && board[r][start].type !== "colorBomb" && len >= 3) {
                const cells = [];
                for (let k = start; k < c; k++) {
                    cells.push({ row: r, col: k });
                }
                groups.push({
                    orientation: "horizontal",
                    cells,
                    color: board[r][start].color
                });
            }

            start = c;
        }
    }

    // Vertical groups
    for (let c = 0; c < COLS; c++) {
        let start = 0;

        for (let r = 1; r <= ROWS; r++) {
            if (r < ROWS && sameColor(board[r][c], board[r - 1][c])) {
                continue;
            }

            const len = r - start;
            if (board[start][c] && board[start][c].type !== "colorBomb" && len >= 3) {
                const cells = [];
                for (let k = start; k < r; k++) {
                    cells.push({ row: k, col: c });
                }
                groups.push({
                    orientation: "vertical",
                    cells,
                    color: board[start][c].color
                });
            }

            start = r;
        }
    }

    return groups;
}

function collectCellsFromGroups(groups) {
    const set = new Set();
    for (const group of groups) {
        for (const cell of group.cells) {
            set.add(`${cell.row}-${cell.col}`);
        }
    }
    return set;
}

function cellInGroup(cell, group) {
    return group.cells.some(c => c.row === cell.row && c.col === cell.col);
}

function chooseSpecialAnchor(group, swapA, swapB) {
    if (cellInGroup(swapA, group)) return swapA;
    if (cellInGroup(swapB, group)) return swapB;
    return group.cells[1];
}

function addStripedEffect(row, col, type, affected) {
    if (type === "stripedH") {
        for (let c = 0; c < COLS; c++) {
            affected.add(`${row}-${c}`);
        }
    } else if (type === "stripedV") {
        for (let r = 0; r < ROWS; r++) {
            affected.add(`${r}-${col}`);
        }
    }
}

function addWrappedEffect(row, col, affected) {
    for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                affected.add(`${r}-${c}`);
            }
        }
    }
}

function addColorBombEffect(color, affected) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const candy = board[r][c];
            if (candy && candy.color === color) {
                affected.add(`${r}-${c}`);
            }
        }
    }
}

function expandSpecialEffects(affected) {
    const processed = new Set();
    let changed = true;

    while (changed) {
        changed = false;

        for (const pos of Array.from(affected)) {
            if (processed.has(pos)) continue;

            const [row, col] = pos.split("-").map(Number);
            const candy = board[row][col];
            if (!candy) continue;

            const before = affected.size;

            if (candy.type === "stripedH" || candy.type === "stripedV") {
                addStripedEffect(row, col, candy.type, affected);
            } else if (candy.type === "wrapped") {
                addWrappedEffect(row, col, affected);
            } else if (candy.type === "colorBomb") {
                addColorBombEffect(candy.color, affected);
            }

            if (affected.size > before) changed = true;
            processed.add(pos);
        }
    }
}

function findWrappedCandidates(groups) {
    const wrapped = [];

    const horizontalGroups = groups.filter(g => g.orientation === "horizontal");
    const verticalGroups = groups.filter(g => g.orientation === "vertical");

    for (const h of horizontalGroups) {
        for (const v of verticalGroups) {
            for (const hc of h.cells) {
                for (const vc of v.cells) {
                    if (hc.row === vc.row && hc.col === vc.col) {
                        const merged = new Set([
                            ...h.cells.map(c => `${c.row}-${c.col}`),
                            ...v.cells.map(c => `${c.row}-${c.col}`)
                        ]);

                        if (merged.size >= 5) {
                            wrapped.push({
                                row: hc.row,
                                col: hc.col,
                                color: board[hc.row][hc.col].color
                            });
                        }
                    }
                }
            }
        }
    }

    return wrapped;
}

function uniqueSpecials(list) {
    const map = new Map();
    for (const item of list) {
        map.set(`${item.row}-${item.col}`, item);
    }
    return Array.from(map.values());
}

async function resolveSpecialSet(affected) {
    expandSpecialEffects(affected);

    const matchList = Array.from(affected).map(pos => {
        const [row, col] = pos.split("-").map(Number);
        return { row, col };
    });

    for (const cell of matchList) {
        if (board[cell.row][cell.col]) {
            board[cell.row][cell.col].marked = true;
        }
    }

    renderBoard();
    await delay(260);

    score += matchList.length * 10;

    for (const cell of matchList) {
        board[cell.row][cell.col] = null;
    }

    renderBoard();
    await delay(140);

    dropCandies();
    renderBoard();
    await delay(220);

    refillBoard();
    renderBoard();
    await delay(200);

    let groups = findMatchGroups();
    if (groups.length > 0) {
        await resolveBoard(groups, { row: -1, col: -1 }, { row: -1, col: -1 });
    }
}

async function resolveBoard(initialGroups, swapA, swapB) {
    let groups = initialGroups;

    while (groups.length > 0) {
        const affected = collectCellsFromGroups(groups);
        let specialCreations = [];

        // 1) 5 straight -> color bomb
        for (const group of groups) {
            if (group.cells.length >= 5) {
                const anchor = chooseSpecialAnchor(group, swapA, swapB);
                const anchorKey = `${anchor.row}-${anchor.col}`;

                specialCreations.push({
                    row: anchor.row,
                    col: anchor.col,
                    color: group.color,
                    type: "colorBomb"
                });

                affected.delete(anchorKey);
            }
        }

        // 2) L / T intersection -> wrapped
        const wrappedCandidates = findWrappedCandidates(groups);
        for (const w of wrappedCandidates) {
            const key = `${w.row}-${w.col}`;

            // if same cell already reserved for color bomb, skip wrapped
            const alreadyReserved = specialCreations.some(s => s.row === w.row && s.col === w.col);
            if (!alreadyReserved) {
                specialCreations.push({
                    row: w.row,
                    col: w.col,
                    color: w.color,
                    type: "wrapped"
                });
                affected.delete(key);
            }
        }

        // 3) 4 straight -> striped
        for (const group of groups) {
            if (group.cells.length === 4) {
                const anchor = chooseSpecialAnchor(group, swapA, swapB);
                const key = `${anchor.row}-${anchor.col}`;

                const alreadyReserved = specialCreations.some(s => s.row === anchor.row && s.col === anchor.col);
                if (!alreadyReserved) {
                    specialCreations.push({
                        row: anchor.row,
                        col: anchor.col,
                        color: group.color,
                        type: group.orientation === "horizontal" ? "stripedH" : "stripedV"
                    });

                    affected.delete(key);
                }
            }
        }

        specialCreations = uniqueSpecials(specialCreations);

        // Existing specials caught in blast should trigger
        expandSpecialEffects(affected);

        const matchList = Array.from(affected).map(pos => {
            const [row, col] = pos.split("-").map(Number);
            return { row, col };
        });

        // Phase 1: mark animation
        for (const cell of matchList) {
            if (board[cell.row][cell.col]) {
                board[cell.row][cell.col].marked = true;
            }
        }

        renderBoard();
        await delay(260);

        // Phase 2: remove
        score += matchList.length * 10;

        for (const cell of matchList) {
            board[cell.row][cell.col] = null;
        }

        // Recreate newly generated specials
        for (const s of specialCreations) {
            board[s.row][s.col] = {
                color: s.color,
                type: s.type,
                marked: false
            };
        }

        renderBoard();
        await delay(140);

        // Phase 3: drop
        dropCandies();
        renderBoard();
        await delay(220);

        // Phase 4: refill
        refillBoard();
        renderBoard();
        await delay(200);

        groups = findMatchGroups();
        swapA = { row: -1, col: -1 };
        swapB = { row: -1, col: -1 };
    }
}

function dropCandies() {
    for (let c = 0; c < COLS; c++) {
        let writeRow = ROWS - 1;

        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r][c] !== null) {
                board[writeRow][c] = board[r][c];
                if (writeRow !== r) {
                    board[r][c] = null;
                }
                writeRow--;
            }
        }

        while (writeRow >= 0) {
            board[writeRow][c] = null;
            writeRow--;
        }
    }
}

function refillBoard() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === null) {
                board[r][c] = createCandy();
            } else {
                board[r][c].marked = false;
            }
        }
    }
}

function checkGameOver() {
    if (moves <= 0) {
        setTimeout(() => {
            alert(`Game Over! Your score: ${score}`);
        }, 100);
    }
}

initBoard();
renderBoard();