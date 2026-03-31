/**
 * ui.js
 *
 * Purpose:
 * 1. Provide stage overlay helpers
 * 2. Render final results clearly
 * 3. Keep presentation cautious and contextual
 */

window.showOverlay = function showOverlay({
    title = "Notice",
    text = "",
    extra = "",
    buttonText = "Continue",
    onClick = null
}) {
    const overlay = document.getElementById("overlay");
    const titleEl = document.getElementById("overlay-title");
    const textEl = document.getElementById("overlay-text");
    const extraEl = document.getElementById("overlay-extra");
    const buttonEl = document.getElementById("overlay-button");

    if (!overlay || !titleEl || !textEl || !extraEl || !buttonEl) return;

    overlay.classList.remove("hidden");
    titleEl.textContent = title;
    textEl.textContent = text;
    extraEl.innerHTML = formatOverlayExtra(extra);
    buttonEl.textContent = buttonText;
    buttonEl.onclick = typeof onClick === "function" ? onClick : null;
};

window.hideOverlay = function hideOverlay() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
};

window.renderFinalResults = function renderFinalResults(finalAnalysis, roundResults) {
    const panel = document.getElementById("results-panel");
    if (!panel) return;

    panel.classList.remove("hidden");

    renderMainType(finalAnalysis);
    renderSecondaryTags(finalAnalysis?.tags || []);
    renderMetricsGrid(finalAnalysis?.metricsByRound || []);
    renderPressureSummary(finalAnalysis?.pressureResponse || "-");
    renderSessionSummary(finalAnalysis, roundResults);
    renderResultsSubtitle(finalAnalysis);
};

function renderResultsSubtitle(finalAnalysis) {
    const subtitle = document.getElementById("results-subtitle");
    if (!subtitle) return;

    subtitle.textContent =
        "A contextual summary of your decision-making style in this game session.";
}

function renderMainType(finalAnalysis) {
    const mainTypeEl = document.getElementById("main-type");
    const mainSummaryEl = document.getElementById("main-summary");

    if (mainTypeEl) {
        mainTypeEl.textContent = finalAnalysis?.mainType || "-";
    }

    if (mainSummaryEl) {
        mainSummaryEl.textContent =
            finalAnalysis?.summary ||
            "This session summary reflects gameplay behavior in context, not a full personality diagnosis.";
    }
}

function renderSecondaryTags(tags) {
    const tagsEl = document.getElementById("secondary-tags");
    if (!tagsEl) return;

    tagsEl.innerHTML = "";

    const tagList = tags.length > 0 ? tags : ["No strong secondary tags detected"];

    for (const tag of tagList) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        chip.textContent = tag;
        tagsEl.appendChild(chip);
    }
}

function renderMetricsGrid(metricsByRound) {
    const container = document.getElementById("metrics-grid");
    if (!container) return;

    container.innerHTML = "";

    if (!metricsByRound || metricsByRound.length === 0) {
        const empty = document.createElement("div");
        empty.className = "metric-card";
        empty.innerHTML = `
            <h4>No metrics available</h4>
            <p>No measured round data was available to display.</p>
        `;
        container.appendChild(empty);
        return;
    }

    for (const round of metricsByRound) {
        const card = document.createElement("div");
        card.className = "metric-card";

        card.innerHTML = `
            <h4>${escapeHtml(round.label)}</h4>
            <p><strong>Success Rate:</strong> ${formatPercent(round.successRate)}</p>
            <p><strong>Avg Decision Time:</strong> ${formatMs(round.averageDecisionTime)}</p>
            <p><strong>Scoring Efficiency:</strong> ${formatNumber(round.scoringEfficiency)}</p>
            <p><strong>Candy Efficiency:</strong> ${formatNumber(round.candyEfficiency)}</p>
            <p><strong>Exploration Index:</strong> ${formatPercent(round.explorationIndex)}</p>
            <p><strong>Hesitation Index:</strong> ${formatPercent(round.hesitationIndex)}</p>
            <p><strong>Impulsivity Index:</strong> ${formatPercent(round.impulsivityIndex)}</p>
            <p><strong>Cascade Depth:</strong> ${formatNumber(round.cascadeDepth)}</p>
        `;

        container.appendChild(card);
    }
}

function renderPressureSummary(text) {
    const el = document.getElementById("pressure-summary");
    if (!el) return;

    el.innerHTML = `<p>${escapeHtml(text)}</p>`;
}

function renderSessionSummary(finalAnalysis, roundResults) {
    const el = document.getElementById("session-summary");
    if (!el) return;

    const playedRounds = ["practice", "baseline", "easy", "medium", "hard"]
        .filter(id => !!roundResults?.[id])
        .length;

    const notes = finalAnalysis?.developerNotes || [];

    el.innerHTML = `
        <p>
            You completed ${playedRounds} stage(s) in this session.
            The result is intended as a game-based behavioral snapshot rather than a fixed personality label.
        </p>
        ${notes.length > 0 ? `
            <p>${escapeHtml(notes[0])}</p>
        ` : ""}
    `;
}

/* --------------------------------------------------
   Optional stage helpers
-------------------------------------------------- */
window.updateStageHeaderUI = function updateStageHeaderUI(stageName, description) {
    const badge = document.getElementById("stage-badge");
    const stageNameEl = document.getElementById("stage-name");
    const desc = document.getElementById("stage-description");

    if (badge) badge.textContent = stageName;
    if (stageNameEl) stageNameEl.textContent = stageName;
    if (desc) desc.textContent = description;
};

window.showAnalysisLoading = function showAnalysisLoading() {
    window.showOverlay({
        title: "Analyzing",
        text: "Summarizing your measured gameplay now.",
        extra: "This produces a contextual behavioral snapshot for this game session.",
        buttonText: "Continue",
        onClick: () => window.hideOverlay()
    });
};

/* --------------------------------------------------
   Formatting helpers
-------------------------------------------------- */
function formatOverlayExtra(extra) {
    if (!extra) return "";
    const escaped = escapeHtml(extra);
    return escaped.replace(/\n/g, "<br>");
}

function formatPercent(value) {
    if (!isFiniteNumber(value)) return "-";
    return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value) {
    if (!isFiniteNumber(value)) return "-";
    return `${Math.round(value)} ms`;
}

function formatNumber(value) {
    if (!isFiniteNumber(value)) return "-";
    return Number(value).toFixed(2);
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}