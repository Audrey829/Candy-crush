/**
 * telemetry.js
 *
 * Purpose:
 * - collect real move-level gameplay telemetry
 * - keep the raw logs structured and interpretable
 * - support later behavioral analysis without using black-box models
 *
 * Notes:
 * - raw event fields are real gameplay logs
 * - some higher-level flags are heuristic approximations added by script.js
 * - this file does not invent fake data
 */

/* --------------------------------------------------
   Public API
-------------------------------------------------- */

/**
 * Create a telemetry container for one round.
 *
 * roundConfig example:
 * {
 *   id: "baseline",
 *   label: "Baseline Calibration",
 *   measured: true,
 *   moves: 10,
 *   difficulty: "baseline"
 * }
 */
window.createRoundTelemetry = function createRoundTelemetry(roundConfig = {}) {
    return {
        meta: {
            roundId: roundConfig.id || "unknown",
            label: roundConfig.label || "Round",
            measured: !!roundConfig.measured,
            difficulty: roundConfig.difficulty || "unknown",
            movesPlanned: safeNumber(roundConfig.moves),
            createdAt: Date.now()
        },

        /**
         * selection events are optional lightweight logs
         * they record when the user first clicks/selects a cell
         */
        selections: [],

        /**
         * move logs are the core telemetry
         * one record per attempted adjacent swap
         */
        moves: [],

        /**
         * summary is filled in when the round ends
         */
        summary: {
            totalSelections: 0,
            totalMoves: 0,
            validMoves: 0,
            invalidMoves: 0,
            totalScoreDelta: 0,
            totalCleared: 0,
            totalDecisionTimeMs: 0,
            averageDecisionTimeMs: 0,
            averageCascadeDepth: 0,
            practiceExcluded: !roundConfig.measured
        }
    };
};

/**
 * Record a selection event.
 * Usually called when a player first selects a candy.
 */
window.markTelemetrySelection = function markTelemetrySelection(telemetry, selection = {}) {
    if (!telemetry || !Array.isArray(telemetry.selections)) return;

    telemetry.selections.push({
        row: safeInt(selection.row),
        col: safeInt(selection.col),
        timestamp: safeNumber(selection.timestamp) || Date.now()
    });

    telemetry.summary.totalSelections = telemetry.selections.length;
};

/**
 * Record one move-level telemetry event.
 * This should be called after the move has fully resolved.
 */
window.recordTelemetryMove = function recordTelemetryMove(telemetry, moveRecord = {}) {
    if (!telemetry || !Array.isArray(telemetry.moves)) return;

    const normalized = normalizeMoveRecord(moveRecord);
    telemetry.moves.push(normalized);

    refreshTelemetrySummary(telemetry);
};

/**
 * Finalize round telemetry and return a compact enriched result.
 * This does not destroy raw data; it just computes summary fields.
 */
window.finalizeRoundTelemetry = function finalizeRoundTelemetry(telemetry, finalRoundSummary = {}) {
    if (!telemetry) {
        return {
            meta: {},
            selections: [],
            moves: [],
            summary: {}
        };
    }

    refreshTelemetrySummary(telemetry);

    telemetry.summary.roundScore = safeNumber(finalRoundSummary.score);
    telemetry.summary.movesUsed = safeNumber(finalRoundSummary.movesUsed);
    telemetry.summary.durationMs = safeNumber(finalRoundSummary.durationMs);
    telemetry.summary.finishedAt = Date.now();

    telemetry.summary.validMoveRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.validMoves / telemetry.summary.totalMoves
            : 0;

    telemetry.summary.invalidMoveRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.invalidMoves / telemetry.summary.totalMoves
            : 0;

    telemetry.summary.specialUsageRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.specialSwapCount / telemetry.summary.totalMoves
            : 0;

    telemetry.summary.hesitationRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.hesitationCount / telemetry.summary.totalMoves
            : 0;

    telemetry.summary.impulsivityRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.impulsivityCount / telemetry.summary.totalMoves
            : 0;

    telemetry.summary.explorationRate =
        telemetry.summary.totalMoves > 0
            ? telemetry.summary.exploratoryMoveCount / telemetry.summary.totalMoves
            : 0;

    return telemetry;
};

/* --------------------------------------------------
   Normalization
-------------------------------------------------- */

function normalizeMoveRecord(moveRecord) {
    return {
        stageId: moveRecord.stageId || "unknown",
        moveIndex: safeInt(moveRecord.moveIndex),

        timestampStart: safeNumber(moveRecord.timestampStart),
        timestampEnd: safeNumber(moveRecord.timestampEnd),
        decisionTimeMs: safeNumber(moveRecord.decisionTimeMs),

        firstSelectedCell: normalizeCell(moveRecord.firstSelectedCell),
        secondSelectedCell: normalizeCell(moveRecord.secondSelectedCell),
        swapFrom: normalizeCell(moveRecord.swapFrom),
        swapTo: normalizeCell(moveRecord.swapTo),

        adjacentAttempt: !!moveRecord.adjacentAttempt,
        validMove: !!moveRecord.validMove,
        revertedSwap: !!moveRecord.revertedSwap,

        scoreBefore: safeNumber(moveRecord.scoreBefore),
        scoreAfter: safeNumber(moveRecord.scoreAfter),
        scoreDelta: safeNumber(moveRecord.scoreDelta),

        clearedCount: safeNumber(moveRecord.clearedCount),
        cascadeDepth: safeNumber(moveRecord.cascadeDepth),

        createdSpecialTypes: normalizeSpecialList(moveRecord.createdSpecialTypes),
        usedSpecialSwap: !!moveRecord.usedSpecialSwap,

        candidateMoveCountBefore: safeNumber(moveRecord.candidateMoveCountBefore),

        boardBefore: normalizeBoardSnapshot(moveRecord.boardBefore),
        boardAfter: normalizeBoardSnapshot(moveRecord.boardAfter),

        regionFrom: normalizeRegion(moveRecord.regionFrom),
        regionTo: normalizeRegion(moveRecord.regionTo),
        regionShift: !!moveRecord.regionShift,

        exploratoryMove: !!moveRecord.exploratoryMove,
        hesitationFlag: !!moveRecord.hesitationFlag,
        impulsiveFlag: !!moveRecord.impulsiveFlag,
        lowValueMoveFlag: !!moveRecord.lowValueMoveFlag
    };
}

function normalizeCell(cell) {
    if (!cell || typeof cell !== "object") return null;

    return {
        row: safeInt(cell.row),
        col: safeInt(cell.col)
    };
}

function normalizeSpecialList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => String(item));
}

function normalizeRegion(region) {
    return region == null ? null : String(region);
}

/**
 * Board snapshots can get large.
 * For a demo, keeping them is fine, but we normalize them to a safe structure.
 */
function normalizeBoardSnapshot(board) {
    if (!Array.isArray(board)) return null;

    return board.map(row => {
        if (!Array.isArray(row)) return [];
        return row.map(cell => {
            if (!cell) return null;
            return {
                color: cell.color || null,
                type: cell.type || "plain"
            };
        });
    });
}

/* --------------------------------------------------
   Summary computation
-------------------------------------------------- */

function refreshTelemetrySummary(telemetry) {
    const moves = Array.isArray(telemetry.moves) ? telemetry.moves : [];

    const validMoves = moves.filter(m => m.validMove).length;
    const invalidMoves = moves.filter(m => !m.validMove).length;

    const totalScoreDelta = sum(moves.map(m => m.scoreDelta));
    const totalCleared = sum(moves.map(m => m.clearedCount));
    const totalDecisionTimeMs = sum(moves.map(m => m.decisionTimeMs));

    const hesitationCount = moves.filter(m => m.hesitationFlag).length;
    const impulsivityCount = moves.filter(m => m.impulsiveFlag).length;
    const exploratoryMoveCount = moves.filter(m => m.exploratoryMove).length;
    const lowValueMoveCount = moves.filter(m => m.lowValueMoveFlag).length;
    const regionShiftCount = moves.filter(m => m.regionShift).length;
    const specialSwapCount = moves.filter(m => m.usedSpecialSwap).length;

    const avgDecisionTimeMs =
        moves.length > 0 ? totalDecisionTimeMs / moves.length : 0;

    const validCascadeMoves = moves.filter(m => m.validMove);
    const avgCascadeDepth =
        validCascadeMoves.length > 0
            ? sum(validCascadeMoves.map(m => m.cascadeDepth)) / validCascadeMoves.length
            : 0;

    telemetry.summary.totalSelections = Array.isArray(telemetry.selections)
        ? telemetry.selections.length
        : 0;

    telemetry.summary.totalMoves = moves.length;
    telemetry.summary.validMoves = validMoves;
    telemetry.summary.invalidMoves = invalidMoves;

    telemetry.summary.totalScoreDelta = totalScoreDelta;
    telemetry.summary.totalCleared = totalCleared;
    telemetry.summary.totalDecisionTimeMs = totalDecisionTimeMs;
    telemetry.summary.averageDecisionTimeMs = avgDecisionTimeMs;
    telemetry.summary.averageCascadeDepth = avgCascadeDepth;

    telemetry.summary.hesitationCount = hesitationCount;
    telemetry.summary.impulsivityCount = impulsivityCount;
    telemetry.summary.exploratoryMoveCount = exploratoryMoveCount;
    telemetry.summary.lowValueMoveCount = lowValueMoveCount;
    telemetry.summary.regionShiftCount = regionShiftCount;
    telemetry.summary.specialSwapCount = specialSwapCount;
}

/* --------------------------------------------------
   Optional helper for debugging
-------------------------------------------------- */

/**
 * Convert telemetry into a cleaner developer-facing object for console inspection.
 * This is optional, but useful when checking whether the demo is collecting real data.
 */
window.telemetryToDebugView = function telemetryToDebugView(telemetry) {
    if (!telemetry) return null;

    return {
        meta: telemetry.meta,
        summary: telemetry.summary,
        moves: (telemetry.moves || []).map(m => ({
            moveIndex: m.moveIndex,
            decisionTimeMs: m.decisionTimeMs,
            validMove: m.validMove,
            scoreDelta: m.scoreDelta,
            clearedCount: m.clearedCount,
            cascadeDepth: m.cascadeDepth,
            usedSpecialSwap: m.usedSpecialSwap,
            candidateMoveCountBefore: m.candidateMoveCountBefore,
            regionFrom: m.regionFrom,
            regionTo: m.regionTo,
            exploratoryMove: m.exploratoryMove,
            hesitationFlag: m.hesitationFlag,
            impulsiveFlag: m.impulsiveFlag,
            lowValueMoveFlag: m.lowValueMoveFlag
        }))
    };
};

/**
 * Quick console helper.
 * Example usage in browser console:
 *   printTelemetry(SessionController.roundResults.hard.telemetry)
 */
window.printTelemetry = function printTelemetry(telemetry) {
    const view = window.telemetryToDebugView(telemetry);
    console.log(view);
    return view;
};

/* --------------------------------------------------
   Small utilities
-------------------------------------------------- */

function safeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeInt(value) {
    return Number.isInteger(value) ? value : parseInt(value, 10) || 0;
}

function sum(values) {
    return values.reduce((acc, v) => acc + safeNumber(v), 0);
}