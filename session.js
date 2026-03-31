/**
 * Session controller
 * Handles:
 * tutorial -> practice -> baseline -> easy -> medium -> hard -> analysis -> results
 *
 * This file does NOT replace the game engine.
 * It orchestrates the stages around the existing Candy Crush gameplay.
 */

const DEFAULT_ROUND_CONFIGS = {
    practice: {
        id: "practice",
        label: "Practice Round",
        moves: 8,
        measured: false,
        colors: ["red", "blue", "green", "yellow", "purple"]
    },
    baseline: {
        id: "baseline",
        label: "Baseline Calibration",
        moves: 10,
        measured: true,
        colors: ["red", "blue", "green", "yellow", "purple"]
    },
    easy: {
        id: "easy",
        label: "Easy",
        moves: 14,
        measured: true,
        colors: ["red", "blue", "green", "yellow", "purple"]
    },
    medium: {
        id: "medium",
        label: "Medium",
        moves: 12,
        measured: true,
        colors: ["red", "blue", "green", "yellow", "purple"]
    },
    hard: {
        id: "hard",
        label: "Hard",
        moves: 10,
        measured: true,
        colors: ["red", "blue", "green", "yellow", "purple"]
    }
};

const SessionController = {
    stageIndex: 0,
    flow: [
        { type: "tutorial", id: "tutorial" },
        { type: "round", id: "practice" },
        { type: "round", id: "baseline" },
        { type: "round", id: "easy" },
        { type: "round", id: "medium" },
        { type: "round", id: "hard" },
        { type: "analysis", id: "analysis" },
        { type: "results", id: "results" }
    ],
    sessionId: null,
    roundResults: {},
    finalAnalysis: null
};

function getRoundConfigs() {
    return window.ROUND_CONFIGS || DEFAULT_ROUND_CONFIGS;
}

function startSession() {
    SessionController.stageIndex = 0;
    SessionController.sessionId = `session-${Date.now()}`;
    SessionController.roundResults = {};
    SessionController.finalAnalysis = null;

    hideResultsPanel();
    goToCurrentStage();
}

function goToCurrentStage() {
    const stage = SessionController.flow[SessionController.stageIndex];
    if (!stage) return;

    if (stage.type === "tutorial") {
        runTutorialStage();
        return;
    }

    if (stage.type === "round") {
        runRoundStage(stage.id);
        return;
    }

    if (stage.type === "analysis") {
        runAnalysisStage();
        return;
    }

    if (stage.type === "results") {
        runResultsStage();
    }
}

function advanceStage() {
    SessionController.stageIndex += 1;
    goToCurrentStage();
}

function runTutorialStage() {
    updateStageUI("Tutorial", "Learn the basics before any measured round begins.");

    clearBoardUI();

    showOverlayCard({
        title: "Welcome to Candy Crush Mini",
        text: `
This session has a fixed flow:
Tutorial → Practice → Baseline → Easy → Medium → Hard.

The goal is not to diagnose your “true personality.”
Instead, the game will produce a short behavioral snapshot based on how you make decisions in this game context.
        `.trim(),
        extra: `
How to play:
• Click one candy, then an adjacent candy to swap.
• Make rows or columns of 3+ matching candies.
• Special candies can create stronger effects.
• Practice is not scored for the final behavioral summary.
        `.trim(),
        buttonText: "Continue",
        onClick: () => showTutorialStep2()
    });
}

function showTutorialStep2() {
    showOverlayCard({
        title: "Tutorial: What matters here",
        text: `
We care more about your decision process than just the final score.

Later rounds will look at patterns such as:
• decision speed
• success rate
• efficiency
• exploration
• hesitation
• behavior changes under higher difficulty
        `.trim(),
        extra: `
You do not choose the difficulty yourself.
Everyone goes through the same sequence.
        `.trim(),
        buttonText: "Start Practice",
        onClick: () => {
            hideOverlayCard();
            advanceStage();
        }
    });
}

function runRoundStage(roundId) {
    const configs = getRoundConfigs();
    const baseConfig = configs[roundId];

    if (!baseConfig) {
        console.error(`Missing round config for: ${roundId}`);
        return;
    }

    updateStageUI(baseConfig.label, buildRoundDescription(roundId));

    showOverlayCard({
        title: baseConfig.label,
        text: buildRoundIntroText(roundId),
        extra: buildRoundExtraText(roundId),
        buttonText: "Start",
        onClick: () => {
            hideOverlayCard();

            startRound({
                ...baseConfig,
                onRoundComplete: result => {
                    handleRoundComplete(roundId, result);
                }
            });
        }
    });
}

function buildRoundDescription(roundId) {
    const descriptions = {
        practice: "A short warm-up round. This is not used for final behavioral typing.",
        baseline: "A lower-pressure reference round used as your personal baseline.",
        easy: "The first measured difficulty round.",
        medium: "A more demanding round with higher decision pressure.",
        hard: "The tightest round in the sequence, intended to increase pressure."
    };

    return descriptions[roundId] || "Round in progress.";
}

function buildRoundIntroText(roundId) {
    const texts = {
        practice: `
This is a short practice round.
Use it to get comfortable with the controls, the board, and the special candy behavior.
        `,
        baseline: `
This round establishes your personal reference pattern under relatively low pressure.
It is not used to place you into a difficulty level.
Everyone still goes on to Easy, Medium, and Hard.
        `,
        easy: `
This is the first measured difficulty round.
It should feel manageable, but your decisions here will still be recorded.
        `,
        medium: `
This round increases decision pressure.
The goal is not just whether you win, but how your decision style shifts compared with your baseline.
        `,
        hard: `
This is the highest-pressure round in the session.
The focus is still on your gameplay behavior, not just the final outcome.
        `
    };

    return (texts[roundId] || "Get ready for the next round.").trim();
}

function buildRoundExtraText(roundId) {
    const configs = getRoundConfigs();
    const cfg = configs[roundId];

    if (!cfg) return "";

    const measuredText = cfg.measured
        ? "This round is included in behavioral analysis."
        : "This round is excluded from the final behavioral analysis.";

    return `
Moves: ${cfg.moves}
${measuredText}
    `.trim();
}

function handleRoundComplete(roundId, result) {
    SessionController.roundResults[roundId] = result;

    showOverlayCard({
        title: `${result.label} Complete`,
        text: `
Score: ${result.score}
Moves used: ${result.movesUsed}
        `.trim(),
        extra: roundId === "hard"
            ? "Next, the session will summarize your measured gameplay."
            : "Continue to the next stage when you are ready.",
        buttonText: roundId === "hard" ? "See Analysis" : "Continue",
        onClick: () => {
            hideOverlayCard();
            advanceStage();
        }
    });
}

function runAnalysisStage() {
    updateStageUI("Analysis", "Summarizing your measured gameplay across rounds.");

    clearBoardUI();

    showOverlayCard({
        title: "Analyzing Session",
        text: `
The system is now summarizing your measured rounds.

This is meant to produce a contextual behavioral snapshot in this game,
not a full real-world personality diagnosis.
        `.trim(),
        extra: "Press continue to generate the summary.",
        buttonText: "Generate Results",
        onClick: () => {
            hideOverlayCard();
            SessionController.finalAnalysis = analyzeSessionResults(SessionController.roundResults);
            advanceStage();
        }
    });
}

function runResultsStage() {
    updateStageUI("Results", "Your session summary is ready.");
    clearBoardUI();
    renderFinalResultsSafe(SessionController.finalAnalysis, SessionController.roundResults);
    saveSessionSummarySafe(SessionController.finalAnalysis, SessionController.roundResults);
}

function analyzeSessionResults(roundResults) {
    if (typeof window.analyzeSession === "function") {
        return window.analyzeSession(roundResults);
    }

    // Fallback simple analysis so the flow still works even before analysis.js is finished.
    const measuredRounds = ["baseline", "easy", "medium", "hard"]
        .map(id => roundResults[id])
        .filter(Boolean);

    const simpleMetrics = measuredRounds.map(round => {
        const moves = round?.telemetry?.moves || [];
        const validMoves = moves.filter(m => m.validMove).length;
        const avgDecisionTime = moves.length
            ? Math.round(moves.reduce((sum, m) => sum + (m.decisionTimeMs || 0), 0) / moves.length)
            : 0;
        const successRate = moves.length ? validMoves / moves.length : 0;

        return {
            id: round.roundId,
            label: round.label,
            score: round.score,
            moveCount: moves.length,
            avgDecisionTime,
            successRate
        };
    });

    const baseline = simpleMetrics.find(r => r.id === "baseline");
    const hard = simpleMetrics.find(r => r.id === "hard");

    let mainType = "Fast and Effective";
    let summary = "In this game context, your decisions appeared relatively efficient.";

    if (hard && hard.avgDecisionTime > 3500 && hard.successRate < 0.5) {
        mainType = "Hesitant";
        summary = "In this game context, you became slower and less effective under higher difficulty.";
    } else if (hard && hard.avgDecisionTime <= 1800 && hard.successRate < 0.5) {
        mainType = "Impulsive";
        summary = "In this game context, your quick decisions were not always effective under pressure.";
    } else if (hard && hard.avgDecisionTime > 2500 && hard.successRate >= 0.5) {
        mainType = "Analytical";
        summary = "In this game context, you appeared slower but relatively effective, especially under pressure.";
    }

    let pressureResponse = "Behavior was fairly stable across the measured rounds.";
    if (baseline && hard) {
        const dtChange = baseline.avgDecisionTime
            ? (hard.avgDecisionTime - baseline.avgDecisionTime) / baseline.avgDecisionTime
            : 0;

        if (dtChange > 0.3) {
            pressureResponse = "Decision speed slowed noticeably as difficulty increased.";
        }
    }

    return {
        mainType,
        summary,
        pressureResponse,
        tags: [],
        metricsByRound: simpleMetrics
    };
}

function renderFinalResultsSafe(finalAnalysis, roundResults) {
    hideOverlayCard();

    const panel = document.getElementById("results-panel");
    if (!panel) return;

    panel.classList.remove("hidden");

    if (typeof window.renderFinalResults === "function") {
        window.renderFinalResults(finalAnalysis, roundResults);
    } else {
        renderFallbackResults(finalAnalysis, roundResults);
    }

    const restartBtn = document.getElementById("restart-button");
    if (restartBtn) {
        restartBtn.onclick = () => {
            panel.classList.add("hidden");
            startSession();
        };
    }
}

function renderFallbackResults(finalAnalysis) {
    const mainTypeEl = document.getElementById("main-type");
    const mainSummaryEl = document.getElementById("main-summary");
    const tagsEl = document.getElementById("secondary-tags");
    const metricsGridEl = document.getElementById("metrics-grid");
    const pressureSummaryEl = document.getElementById("pressure-summary");
    const sessionSummaryEl = document.getElementById("session-summary");

    if (mainTypeEl) mainTypeEl.textContent = finalAnalysis?.mainType || "-";
    if (mainSummaryEl) mainSummaryEl.textContent = finalAnalysis?.summary || "-";

    if (tagsEl) {
        tagsEl.innerHTML = "";
        const tags = finalAnalysis?.tags?.length ? finalAnalysis.tags : ["No secondary tags yet"];
        tags.forEach(tag => {
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = tag;
            tagsEl.appendChild(chip);
        });
    }

    if (metricsGridEl) {
        metricsGridEl.innerHTML = "";
        (finalAnalysis?.metricsByRound || []).forEach(metric => {
            const card = document.createElement("div");
            card.className = "metric-card";
            card.innerHTML = `
                <h4>${metric.label}</h4>
                <p>Score: ${metric.score}</p>
                <p>Avg decision time: ${metric.avgDecisionTime} ms</p>
                <p>Success rate: ${(metric.successRate * 100).toFixed(1)}%</p>
            `;
            metricsGridEl.appendChild(card);
        });
    }

    if (pressureSummaryEl) {
        pressureSummaryEl.innerHTML = `<p>${finalAnalysis?.pressureResponse || "-"}</p>`;
    }

    if (sessionSummaryEl) {
        sessionSummaryEl.innerHTML = `
            <p>
                This summary reflects your behavior in this game session only.
                It should be interpreted as a contextual behavioral snapshot, not a full personality diagnosis.
            </p>
        `;
    }
}

function saveSessionSummarySafe(finalAnalysis, roundResults) {
    if (typeof window.saveSessionSummary === "function") {
        window.saveSessionSummary({
            sessionId: SessionController.sessionId,
            finalAnalysis,
            roundResults,
            timestamp: Date.now()
        });
    }
}

/* ---------- UI-safe wrappers ---------- */

function updateStageUI(stageName, description) {
    const badge = document.getElementById("stage-badge");
    const desc = document.getElementById("stage-description");
    const stageNameEl = document.getElementById("stage-name");

    if (badge) badge.textContent = stageName;
    if (desc) desc.textContent = description;
    if (stageNameEl) stageNameEl.textContent = stageName;
}

function showOverlayCard({ title, text, extra = "", buttonText = "Continue", onClick }) {
    if (typeof window.showOverlay === "function") {
        window.showOverlay({ title, text, extra, buttonText, onClick });
        return;
    }

    const overlay = document.getElementById("overlay");
    const titleEl = document.getElementById("overlay-title");
    const textEl = document.getElementById("overlay-text");
    const extraEl = document.getElementById("overlay-extra");
    const buttonEl = document.getElementById("overlay-button");

    if (!overlay || !titleEl || !textEl || !extraEl || !buttonEl) return;

    overlay.classList.remove("hidden");
    titleEl.textContent = title;
    textEl.textContent = text;
    extraEl.textContent = extra;
    buttonEl.textContent = buttonText;
    buttonEl.onclick = onClick;
}

function hideOverlayCard() {
    if (typeof window.hideOverlay === "function") {
        window.hideOverlay();
        return;
    }

    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.add("hidden");
}

function hideResultsPanel() {
    const panel = document.getElementById("results-panel");
    if (panel) panel.classList.add("hidden");
}

/* ---------- startup ---------- */

window.addEventListener("DOMContentLoaded", () => {
    const overlayButton = document.getElementById("overlay-button");
    if (overlayButton) {
        overlayButton.onclick = null;
    }

    const restartButton = document.getElementById("restart-button");
    if (restartButton) {
        restartButton.onclick = () => startSession();
    }

    startSession();
});