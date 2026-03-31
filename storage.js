/**
 * storage.js
 *
 * Lightweight localStorage persistence for session summaries.
 *
 * Purpose:
 * - store prior session summaries
 * - support dynamic threshold calibration
 * - avoid needing a backend for early-stage testing
 *
 * We intentionally store compact summaries, not huge raw board histories.
 */

const STORAGE_KEY = "candy-crush-behavior-history";
const STORAGE_LIMIT = 50;

/* --------------------------------------------------
   Public API
-------------------------------------------------- */
window.saveSessionSummary = function saveSessionSummary(sessionPayload) {
    try {
        const history = loadSessionHistoryInternal();

        const compact = compactSessionPayload(sessionPayload);
        history.push(compact);

        const trimmed = trimHistory(history, STORAGE_LIMIT);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

        return true;
    } catch (err) {
        console.warn("Failed to save session summary:", err);
        return false;
    }
};

window.loadSessionHistory = function loadSessionHistory() {
    try {
        return loadSessionHistoryInternal();
    } catch (err) {
        console.warn("Failed to load session history:", err);
        return [];
    }
};

window.clearSessionHistory = function clearSessionHistory() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (err) {
        console.warn("Failed to clear session history:", err);
        return false;
    }
};

window.getSessionHistoryCount = function getSessionHistoryCount() {
    const history = window.loadSessionHistory();
    return Array.isArray(history) ? history.length : 0;
};

/* --------------------------------------------------
   Internal helpers
-------------------------------------------------- */
function loadSessionHistoryInternal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function trimHistory(history, limit) {
    if (!Array.isArray(history)) return [];
    if (history.length <= limit) return history;
    return history.slice(history.length - limit);
}

function compactSessionPayload(sessionPayload) {
    const sessionId = sessionPayload?.sessionId || `session-${Date.now()}`;
    const timestamp = sessionPayload?.timestamp || Date.now();
    const finalAnalysis = sessionPayload?.finalAnalysis || {};
    const roundResults = sessionPayload?.roundResults || {};

    return {
        sessionId,
        timestamp,
        finalAnalysis: compactFinalAnalysis(finalAnalysis),
        roundResults: compactRoundResults(roundResults)
    };
}

function compactFinalAnalysis(finalAnalysis) {
    return {
        mainType: finalAnalysis?.mainType || null,
        tags: Array.isArray(finalAnalysis?.tags) ? finalAnalysis.tags : [],
        summary: finalAnalysis?.summary || null,
        pressureResponse: finalAnalysis?.pressureResponse || null,
        overallMeasuredMetrics: compactMetrics(finalAnalysis?.overallMeasuredMetrics),
        baselineComparisons: compactBaselineComparisons(finalAnalysis?.baselineComparisons),
        metricsByRound: compactMetricsByRound(finalAnalysis?.metricsByRound),
        developerNotes: Array.isArray(finalAnalysis?.developerNotes)
            ? finalAnalysis.developerNotes.slice(0, 3)
            : []
    };
}

function compactRoundResults(roundResults) {
    const compacted = {};

    for (const key of Object.keys(roundResults || {})) {
        const round = roundResults[key];
        if (!round) continue;

        compacted[key] = {
            roundId: round.roundId || key,
            label: round.label || key,
            score: safeNumber(round.score),
            movesPlanned: safeNumber(round.movesPlanned),
            movesUsed: safeNumber(round.movesUsed),
            measured: !!round.measured
        };
    }

    return compacted;
}

function compactMetrics(metrics) {
    if (!metrics) return null;

    return {
        successRate: safeNumber(metrics.successRate),
        averageDecisionTime: safeNumber(metrics.averageDecisionTime),
        scoringEfficiency: safeNumber(metrics.scoringEfficiency),
        candyEfficiency: safeNumber(metrics.candyEfficiency),
        explorationIndex: safeNumber(metrics.explorationIndex),
        hesitationIndex: safeNumber(metrics.hesitationIndex),
        impulsivityIndex: safeNumber(metrics.impulsivityIndex),
        cascadeDepth: safeNumber(metrics.cascadeDepth)
    };
}

function compactMetricsByRound(metricsByRound) {
    if (!Array.isArray(metricsByRound)) return [];

    return metricsByRound.map(round => ({
        id: round?.id || null,
        label: round?.label || null,
        score: safeNumber(round?.score),
        successRate: safeNumber(round?.successRate),
        averageDecisionTime: safeNumber(round?.averageDecisionTime),
        scoringEfficiency: safeNumber(round?.scoringEfficiency),
        candyEfficiency: safeNumber(round?.candyEfficiency),
        explorationIndex: safeNumber(round?.explorationIndex),
        hesitationIndex: safeNumber(round?.hesitationIndex),
        impulsivityIndex: safeNumber(round?.impulsivityIndex),
        cascadeDepth: safeNumber(round?.cascadeDepth)
    }));
}

function compactBaselineComparisons(baselineComparisons) {
    if (!baselineComparisons) return null;

    const result = {};

    for (const roundId of ["easy", "medium", "hard"]) {
        const comparison = baselineComparisons[roundId];
        if (!comparison) {
            result[roundId] = null;
            continue;
        }

        result[roundId] = {};
        for (const metric of Object.keys(comparison)) {
            result[roundId][metric] = {
                baselineValue: safeNumber(comparison[metric]?.baselineValue),
                currentValue: safeNumber(comparison[metric]?.currentValue),
                changeRate: safeNumber(comparison[metric]?.changeRate),
                magnitude: comparison[metric]?.magnitude || "unknown"
            };
        }
    }

    return result;
}

function safeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}