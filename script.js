const ROWS = 9;
const COLS = 9;
const DEFAULT_COLORS = ["red", "blue", "green", "yellow", "purple"];

/**
 * Core runtime state for the current round.
 * This file remains the gameplay engine.
 * Session flow and stage progression are handled by session.js.
 */
const GameEngine = {
    board: [],
    selected: null,
    score: 0,
    movesLeft: 0,
    isAnimating: false,
    currentRoundConfig: null,
    roundStartTime: null,
    moveCounter: 0,
    moveDecisionStartTime: null,
    onRoundComplete: null,
    telemetry: null,
    colors: [...DEFAULT_COLORS],
    roundFinished: false
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRoundConfigValue(key, fallback) {
    return GameEngine.currentRoundConfig && key in GameEngine.currentRoundConfig
        ? GameEngine.currentRoundConfig[key]
        : fallback;
}

function randomColor() {
    const pool = GameEngine.colors && GameEngine.colors.length > 0
        ? GameEngine.colors
        : DEFAULT_COLORS;
    return pool[Math.floor(Math.random() * pool.length)];
}

function createCandy(color = randomColor(), type = "plain") {
    return {
        color,
        type, // plain | stripedH | stripedV | wrapped | colorBomb
        marked: false
    };
}

function cloneBoard(board = GameEngine.board) {
    return board.map(row =>
        row.map(cell => {
            if (!cell) return null;
            return { ...cell };
        })
    );
}

function serializeBoard(board = GameEngine.board) {
    return board.map(row =>
        row.map(cell => {
            if (!cell) return null;
            return {
                color: cell.color,
                type: cell.type
            };
        })
    );
}

function resetRoundState(roundConfig = {}) {
    GameEngine.board = [];
    GameEngine.selected = null;
    GameEngine.score = 0;
    GameEngine.movesLeft = roundConfig.moves ?? 20;
    GameEngine.isAnimating = false;
    GameEngine.currentRoundConfig = roundConfig;
    GameEngine.roundStartTime = Date.now();
    GameEngine.moveCounter = 0;
    GameEngine.moveDecisionStartTime = null;
    GameEngine.onRoundComplete = roundConfig.onRoundComplete || null;
    GameEngine.telemetry = createTelemetryRound(roundConfig);
    GameEngine.colors = roundConfig.colors || DEFAULT_COLORS;
    GameEngine.roundFinished = false;
}

function initBoard() {
    GameEngine.board = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            row.push(createCandy());
        }
        GameEngine.board.push(row);
    }

    stabilizeInitialBoard();
}

function stabilizeInitialBoard() {
    let groups = findMatchGroups();
    while (groups.length > 0) {
        const affected = collectCellsFromGroups(groups);
        for (const pos of affected) {
            const [row, col] = pos.split("-").map(Number);
            GameEngine.board[row][col] = null;
        }
        dropCandies();
        refillBoard();
        groups = findMatchGroups();
    }
}

function renderBoard() {
    const boardElement = document.getElementById("game-board");
    if (!boardElement) return;

    boardElement.innerHTML = "";

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.row = r;
            cell.dataset.col = c;

            const candy = GameEngine.board[r][c];

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

                if (GameEngine.selected && GameEngine.selected.row === r && GameEngine.selected.col === c) {
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
    const stageNameEl = document.getElementById("stage-name");

    if (scoreEl) scoreEl.textContent = GameEngine.score;
    if (movesEl) movesEl.textContent = GameEngine.movesLeft;
    if (stageNameEl) {
        stageNameEl.textContent = GameEngine.currentRoundConfig?.label || "Game";
    }
}

async function onCellClick(event) {
    if (GameEngine.movesLeft <= 0 || GameEngine.isAnimating || GameEngine.roundFinished) return;

    const row = parseInt(event.currentTarget.dataset.row, 10);
    const col = parseInt(event.currentTarget.dataset.col, 10);

    if (!GameEngine.selected) {
        GameEngine.selected = { row, col };
        GameEngine.moveDecisionStartTime = Date.now();

        safeTelemetrySelection({
            row,
            col,
            timestamp: GameEngine.moveDecisionStartTime
        });

        renderBoard();
        return;
    }

    if (GameEngine.selected.row === row && GameEngine.selected.col === col) {
        GameEngine.selected = null;
        GameEngine.moveDecisionStartTime = null;
        renderBoard();
        return;
    }

    if (!isAdjacent(GameEngine.selected.row, GameEngine.selected.col, row, col)) {
        GameEngine.selected = { row, col };
        GameEngine.moveDecisionStartTime = Date.now();

        safeTelemetrySelection({
            row,
            col,
            timestamp: GameEngine.moveDecisionStartTime
        });

        renderBoard();
        return;
    }

    const first = { ...GameEngine.selected };
    const second = { row, col };
    const decisionEnd = Date.now();
    const decisionTimeMs = GameEngine.moveDecisionStartTime
        ? decisionEnd - GameEngine.moveDecisionStartTime
        : 0;

    const boardBefore = serializeBoard();
    const candidateMoveCountBefore = countCandidateMoves(GameEngine.board);
    const scoreBefore = GameEngine.score;

    const candyA = GameEngine.board[first.row][first.col];
    const candyB = GameEngine.board[second.row][second.col];

    const moveRecord = {
        stageId: GameEngine.currentRoundConfig?.id || "unknown",
        moveIndex: GameEngine.moveCounter + 1,
        timestampStart: GameEngine.moveDecisionStartTime || decisionEnd,
        timestampEnd: decisionEnd,
        decisionTimeMs,
        firstSelectedCell: first,
        secondSelectedCell: second,
        swapFrom: first,
        swapTo: second,
        adjacentAttempt: true,
        validMove: false,
        revertedSwap: false,
        scoreBefore,
        scoreAfter: scoreBefore,
        scoreDelta: 0,
        clearedCount: 0,
        cascadeDepth: 0,
        createdSpecialTypes: [],
        usedSpecialSwap: false,
        candidateMoveCountBefore,
        boardBefore,
        boardAfter: null,
        regionFrom: getBoardRegion(first),
        regionTo: getBoardRegion(second),
        regionShift: getBoardRegion(first) !== getBoardRegion(second),
        exploratoryMove: false,
        hesitationFlag: false,
        impulsiveFlag: false,
        lowValueMoveFlag: false
    };

    swapCells(first.row, first.col, second.row, second.col);
    renderBoard();

    // color bomb direct swap
    if (candyA?.type === "colorBomb" || candyB?.type === "colorBomb") {
        GameEngine.movesLeft--;
        GameEngine.selected = null;
        GameEngine.isAnimating = true;

        moveRecord.usedSpecialSwap = true;
        moveRecord.validMove = true;

        const otherCandy = candyA?.type === "colorBomb" ? candyB : candyA;
        const targetColor = otherCandy?.color;

        const affected = new Set();
        affected.add(`${first.row}-${first.col}`);
        affected.add(`${second.row}-${second.col}`);

        if (targetColor) {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const candy = GameEngine.board[r][c];
                    if (candy && candy.color === targetColor) {
                        affected.add(`${r}-${c}`);
                    }
                }
            }
        }

        const resolutionSummary = await resolveSpecialSet(affected);

        GameEngine.isAnimating = false;

        moveRecord.scoreAfter = GameEngine.score;
        moveRecord.scoreDelta = GameEngine.score - scoreBefore;
        moveRecord.clearedCount = resolutionSummary.clearedCount;
        moveRecord.cascadeDepth = resolutionSummary.cascadeDepth;
        moveRecord.createdSpecialTypes = resolutionSummary.createdSpecialTypes;
        moveRecord.boardAfter = serializeBoard();
        finalizeMoveTelemetry(moveRecord);

        GameEngine.moveCounter++;
        GameEngine.moveDecisionStartTime = null;

        renderBoard();
        checkGameOver();
        return;
    }

    const initialGroups = findMatchGroups();

    if (initialGroups.length === 0) {
        await delay(120);
        swapCells(first.row, first.col, second.row, second.col);
        GameEngine.selected = null;

        moveRecord.validMove = false;
        moveRecord.revertedSwap = true;
        moveRecord.boardAfter = serializeBoard();
        finalizeMoveTelemetry(moveRecord);

        GameEngine.moveCounter++;
        GameEngine.moveDecisionStartTime = null;

        renderBoard();
        return;
    }

    GameEngine.movesLeft--;
    GameEngine.selected = null;
    GameEngine.isAnimating = true;

    moveRecord.validMove = true;

    const resolutionSummary = await resolveBoard(initialGroups, first, second);

    GameEngine.isAnimating = false;

    moveRecord.scoreAfter = GameEngine.score;
    moveRecord.scoreDelta = GameEngine.score - scoreBefore;
    moveRecord.clearedCount = resolutionSummary.clearedCount;
    moveRecord.cascadeDepth = resolutionSummary.cascadeDepth;
    moveRecord.createdSpecialTypes = resolutionSummary.createdSpecialTypes;
    moveRecord.boardAfter = serializeBoard();
    finalizeMoveTelemetry(moveRecord);

    GameEngine.moveCounter++;
    GameEngine.moveDecisionStartTime = null;

    renderBoard();
    checkGameOver();
}

function finalizeMoveTelemetry(moveRecord) {
    const thresholds = getHeuristicThresholds();

    moveRecord.hesitationFlag =
        moveRecord.decisionTimeMs >= (thresholds.slowDecisionMs || 4000);

    moveRecord.impulsiveFlag =
        moveRecord.decisionTimeMs <= (thresholds.fastDecisionMs || 1800) &&
        (!moveRecord.validMove || moveRecord.scoreDelta <= 30);

    moveRecord.lowValueMoveFlag =
        moveRecord.validMove &&
        moveRecord.scoreDelta <= 30 &&
        moveRecord.clearedCount <= 3 &&
        moveRecord.cascadeDepth <= 1 &&
        (!moveRecord.createdSpecialTypes || moveRecord.createdSpecialTypes.length === 0);

    moveRecord.exploratoryMove = inferExploratoryMove(moveRecord);

    safeTelemetryMove(moveRecord);
}

function inferExploratoryMove(moveRecord) {
    const existingMoves = GameEngine.telemetry?.moves || [];
    if (existingMoves.length === 0) return false;

    const prev = existingMoves[existingMoves.length - 1];
    if (!prev) return false;

    return prev.regionTo !== moveRecord.regionTo;
}

function isAdjacent(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function swapCells(r1, c1, r2, c2) {
    const temp = GameEngine.board[r1][c1];
    GameEngine.board[r1][c1] = GameEngine.board[r2][c2];
    GameEngine.board[r2][c2] = temp;
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

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        let start = 0;

        for (let c = 1; c <= COLS; c++) {
            if (c < COLS && sameColor(GameEngine.board[r][c], GameEngine.board[r][c - 1])) {
                continue;
            }

            const len = c - start;
            if (GameEngine.board[r][start] && GameEngine.board[r][start].type !== "colorBomb" && len >= 3) {
                const cells = [];
                for (let k = start; k < c; k++) {
                    cells.push({ row: r, col: k });
                }
                groups.push({
                    orientation: "horizontal",
                    cells,
                    color: GameEngine.board[r][start].color
                });
            }

            start = c;
        }
    }

    // Vertical
    for (let c = 0; c < COLS; c++) {
        let start = 0;

        for (let r = 1; r <= ROWS; r++) {
            if (r < ROWS && sameColor(GameEngine.board[r][c], GameEngine.board[r - 1][c])) {
                continue;
            }

            const len = r - start;
            if (GameEngine.board[start][c] && GameEngine.board[start][c].type !== "colorBomb" && len >= 3) {
                const cells = [];
                for (let k = start; k < r; k++) {
                    cells.push({ row: k, col: c });
                }
                groups.push({
                    orientation: "vertical",
                    cells,
                    color: GameEngine.board[start][c].color
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
            const candy = GameEngine.board[r][c];
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
            const candy = GameEngine.board[row][col];
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
                                color: GameEngine.board[hc.row][hc.col].color
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
    let totalClearedCount = 0;
    let cascadeDepth = 0;
    let createdSpecialTypes = [];

    expandSpecialEffects(affected);

    const matchList = Array.from(affected).map(pos => {
        const [row, col] = pos.split("-").map(Number);
        return { row, col };
    });

    for (const cell of matchList) {
        if (GameEngine.board[cell.row][cell.col]) {
            GameEngine.board[cell.row][cell.col].marked = true;
        }
    }

    renderBoard();
    await delay(260);

    GameEngine.score += matchList.length * 10;
    totalClearedCount += matchList.length;
    cascadeDepth = 1;

    for (const cell of matchList) {
        GameEngine.board[cell.row][cell.col] = null;
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
        const nested = await resolveBoard(groups, { row: -1, col: -1 }, { row: -1, col: -1 });
        totalClearedCount += nested.clearedCount;
        cascadeDepth += nested.cascadeDepth;
        createdSpecialTypes = createdSpecialTypes.concat(nested.createdSpecialTypes || []);
    }

    return {
        clearedCount: totalClearedCount,
        cascadeDepth,
        createdSpecialTypes
    };
}

async function resolveBoard(initialGroups, swapA, swapB) {
    let groups = initialGroups;
    let totalClearedCount = 0;
    let cascadeDepth = 0;
    let createdSpecialTypes = [];

    while (groups.length > 0) {
        cascadeDepth++;
        const affected = collectCellsFromGroups(groups);
        let specialCreations = [];

        // 5 straight -> color bomb
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

        // L/T -> wrapped
        const wrappedCandidates = findWrappedCandidates(groups);
        for (const w of wrappedCandidates) {
            const key = `${w.row}-${w.col}`;

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

        // 4 straight -> striped
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
        createdSpecialTypes.push(...specialCreations.map(s => s.type));

        expandSpecialEffects(affected);

        const matchList = Array.from(affected).map(pos => {
            const [row, col] = pos.split("-").map(Number);
            return { row, col };
        });

        for (const cell of matchList) {
            if (GameEngine.board[cell.row][cell.col]) {
                GameEngine.board[cell.row][cell.col].marked = true;
            }
        }

        renderBoard();
        await delay(260);

        GameEngine.score += matchList.length * 10;
        totalClearedCount += matchList.length;

        for (const cell of matchList) {
            GameEngine.board[cell.row][cell.col] = null;
        }

        for (const s of specialCreations) {
            GameEngine.board[s.row][s.col] = {
                color: s.color,
                type: s.type,
                marked: false
            };
        }

        renderBoard();
        await delay(140);

        dropCandies();
        renderBoard();
        await delay(220);

        refillBoard();
        renderBoard();
        await delay(200);

        groups = findMatchGroups();
        swapA = { row: -1, col: -1 };
        swapB = { row: -1, col: -1 };
    }

    return {
        clearedCount: totalClearedCount,
        cascadeDepth,
        createdSpecialTypes
    };
}

function dropCandies() {
    for (let c = 0; c < COLS; c++) {
        let writeRow = ROWS - 1;

        for (let r = ROWS - 1; r >= 0; r--) {
            if (GameEngine.board[r][c] !== null) {
                GameEngine.board[writeRow][c] = GameEngine.board[r][c];
                if (writeRow !== r) {
                    GameEngine.board[r][c] = null;
                }
                writeRow--;
            }
        }

        while (writeRow >= 0) {
            GameEngine.board[writeRow][c] = null;
            writeRow--;
        }
    }
}

function refillBoard() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (GameEngine.board[r][c] === null) {
                GameEngine.board[r][c] = createCandy();
            } else {
                GameEngine.board[r][c].marked = false;
            }
        }
    }
}

function checkGameOver() {
    if (GameEngine.movesLeft <= 0 && !GameEngine.roundFinished) {
        GameEngine.roundFinished = true;

        const result = {
            roundId: GameEngine.currentRoundConfig?.id || "unknown",
            label: GameEngine.currentRoundConfig?.label || "Round",
            score: GameEngine.score,
            movesPlanned: GameEngine.currentRoundConfig?.moves ?? 0,
            movesUsed: GameEngine.moveCounter,
            measured: !!GameEngine.currentRoundConfig?.measured,
            telemetry: finalizeTelemetryRound(GameEngine.telemetry, {
                score: GameEngine.score,
                movesUsed: GameEngine.moveCounter,
                durationMs: Date.now() - GameEngine.roundStartTime
            }),
            boardSnapshot: serializeBoard()
        };

        if (typeof GameEngine.onRoundComplete === "function") {
            setTimeout(() => {
                GameEngine.onRoundComplete(result);
            }, 180);
        }
    }
}

function getGameState() {
    return {
        score: GameEngine.score,
        movesLeft: GameEngine.movesLeft,
        moveCounter: GameEngine.moveCounter,
        selected: GameEngine.selected,
        roundConfig: GameEngine.currentRoundConfig,
        board: serializeBoard()
    };
}

function startRound(roundConfig = {}) {
    resetRoundState(roundConfig);
    initBoard();
    renderBoard();
}

function setRoundCompleteCallback(callback) {
    GameEngine.onRoundComplete = callback;
}

function clearBoardUI() {
    const boardElement = document.getElementById("game-board");
    if (boardElement) {
        boardElement.innerHTML = "";
    }
}

/* ---------- telemetry-safe helpers ---------- */

function createTelemetryRound(roundConfig) {
    if (typeof window.createRoundTelemetry === "function") {
        return window.createRoundTelemetry(roundConfig);
    }
    return {
        meta: roundConfig,
        moves: [],
        selections: [],
        summary: {}
    };
}

function safeTelemetrySelection(selection) {
    if (typeof window.markTelemetrySelection === "function") {
        window.markTelemetrySelection(GameEngine.telemetry, selection);
    } else {
        GameEngine.telemetry?.selections?.push(selection);
    }
}

function safeTelemetryMove(moveRecord) {
    if (typeof window.recordTelemetryMove === "function") {
        window.recordTelemetryMove(GameEngine.telemetry, moveRecord);
    } else {
        GameEngine.telemetry?.moves?.push(moveRecord);
    }
}

function finalizeTelemetryRound(telemetry, summary) {
    if (typeof window.finalizeRoundTelemetry === "function") {
        return window.finalizeRoundTelemetry(telemetry, summary);
    }
    return {
        ...telemetry,
        summary
    };
}

/* ---------- helper approximations ---------- */

function getHeuristicThresholds() {
    if (window.HEURISTIC_THRESHOLDS) return window.HEURISTIC_THRESHOLDS;

    return {
        fastDecisionMs: 1800,
        slowDecisionMs: 4000
    };
}

function getBoardRegion(cell) {
    const rowBand = cell.row < 3 ? "top" : cell.row < 6 ? "middle" : "bottom";
    const colBand = cell.col < 3 ? "left" : cell.col < 6 ? "center" : "right";
    return `${rowBand}-${colBand}`;
}

function countCandidateMoves(board) {
    let count = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const neighbors = [
                [r + 1, c],
                [r, c + 1]
            ];

            for (const [nr, nc] of neighbors) {
                if (nr >= ROWS || nc >= COLS) continue;

                swapBoardCells(board, r, c, nr, nc);
                const valid = hasAnyMatch(board);
                swapBoardCells(board, r, c, nr, nc);

                if (valid) count++;
            }
        }
    }

    return count;
}

function swapBoardCells(board, r1, c1, r2, c2) {
    const temp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = temp;
}

function hasAnyMatch(board) {
    // horizontal
    for (let r = 0; r < ROWS; r++) {
        let streak = 1;
        for (let c = 1; c < COLS; c++) {
            if (
                board[r][c] &&
                board[r][c - 1] &&
                board[r][c].type !== "colorBomb" &&
                board[r][c - 1].type !== "colorBomb" &&
                board[r][c].color === board[r][c - 1].color
            ) {
                streak++;
                if (streak >= 3) return true;
            } else {
                streak = 1;
            }
        }
    }

    // vertical
    for (let c = 0; c < COLS; c++) {
        let streak = 1;
        for (let r = 1; r < ROWS; r++) {
            if (
                board[r][c] &&
                board[r - 1][c] &&
                board[r][c].type !== "colorBomb" &&
                board[r - 1][c].type !== "colorBomb" &&
                board[r][c].color === board[r - 1][c].color
            ) {
                streak++;
                if (streak >= 3) return true;
            } else {
                streak = 1;
            }
        }
    }

    return false;
}