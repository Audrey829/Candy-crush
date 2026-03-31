/**
 * analysis.js
 *
 * Purpose:
 * 1. Derive interpretable round-level metrics from telemetry
 * 2. Compare measured rounds against baseline
 * 3. Apply dynamic threshold calibration when possible
 * 4. Produce a rule-based behavioral type and cautious summary
 *
 * This is intentionally rule-based and transparent.
 * It does NOT claim scientific diagnosis.
 */

/* --------------------------------------------------
   Heuristic fallback thresholds
   Used when there is not enough historical session data.
-------------------------------------------------- */
window.HEURISTIC_THRESHOLDS = window.HEURISTIC_THRESHOLDS || {
    fastDecisionMs: 1800,
    slowDecisionMs: 4000,
    highSuccessRate: 0.70,
    lowSuccessRate: 0.40,
    highExploration: 0.55,
    highHesitation: 0.35,
    highImpulsivity: 0.35,
    highEfficiency: 55,
    highCandyEfficiency: 5.5,
    highCascadeDepth: 1.8,
    smallChange: 0.10,
    moderateChange: 0.30
};

const METRIC_DIRECTIONS = {
    averageDecisionTime: "lower_is_faster",
    successRate: "higher_is_better",
    scoringEfficiency: "higher_is_better",
    candyEfficiency: "higher_is_better",
    explorationIndex: "higher_is_more",
    hesitationIndex: "higher_is_more",
    impulsivityIndex: "higher_is_more",
    cascadeDepth: "higher_is_more"
};

/* --------------------------------------------------
   Public entry point
-------------------------------------------------- */
window.analyzeSession = function analyzeSession(roundResults) {
    const measuredRoundIds = ["baseline", "easy", "medium", "hard"];
    const measuredRounds = measuredRoundIds
        .map(id => roundResults[id])
        .filter(Boolean);

    const roundMetricsMap = {};
    for (const round of measuredRounds) {
        roundMetricsMap[round.roundId] = computeRoundMetrics(round);
    }

    const history = loadHistoricalSessionMetrics();
    const dynamicThresholds = computeDynamicThresholds(history, roundMetricsMap);

    const baselineMetrics = roundMetricsMap.baseline || null;

    const baselineComparisons = {
        easy: baselineMetrics && roundMetricsMap.easy
            ? compareMetricsToBaseline(baselineMetrics, roundMetricsMap.easy, history)
            : null,
        medium: baselineMetrics && roundMetricsMap.medium
            ? compareMetricsToBaseline(baselineMetrics, roundMetricsMap.medium, history)
            : null,
        hard: baselineMetrics && roundMetricsMap.hard
            ? compareMetricsToBaseline(baselineMetrics, roundMetricsMap.hard, history)
            : null
    };

    const overallMeasuredMetrics = computeOverallMeasuredMetrics(roundMetricsMap);
    const metricCategories = categorizeMetrics(overallMeasuredMetrics, dynamicThresholds);
    const typing = classifyPlayerType(overallMeasuredMetrics, metricCategories, baselineComparisons);
    const pressureResponse = summarizePressureResponse(baselineComparisons);
    const summary = buildInterpretationSummary(typing, pressureResponse, overallMeasuredMetrics);

    return {
        roundMetricsMap,
        overallMeasuredMetrics,
        dynamicThresholds,
        metricCategories,
        baselineComparisons,
        mainType: typing.mainType,
        tags: typing.tags,
        summary,
        pressureResponse,
        metricsByRound: buildMetricsByRoundForUI(roundMetricsMap),
        developerNotes: [
            "This result is a contextual behavioral snapshot from gameplay telemetry.",
            "Some behavioral signals use explainable approximations rather than experimental-grade models."
        ]
    };
};

/* --------------------------------------------------
   Core round metrics
-------------------------------------------------- */
function computeRoundMetrics(roundResult) {
    const moves = roundResult?.telemetry?.moves || [];
    const attemptedMoves = moves.length;
    const validMoves = moves.filter(m => m.validMove).length;
    const invalidMoves = moves.filter(m => !m.validMove).length;

    const decisionTimes = moves.map(m => safeNumber(m.decisionTimeMs));
    const totalDecisionTime = sum(decisionTimes);
    const averageDecisionTime = attemptedMoves > 0
        ? totalDecisionTime / attemptedMoves
        : 0;

    const totalScore = safeNumber(roundResult?.score);
    const totalCleared = sum(moves.map(m => safeNumber(m.clearedCount)));
    const totalCascadeDepth = sum(moves.map(m => safeNumber(m.cascadeDepth)));

    const successRate = attemptedMoves > 0
        ? validMoves / attemptedMoves
        : 0;

    // Meaning: score gained per valid move
    const scoringEfficiency = validMoves > 0
        ? totalScore / validMoves
        : 0;

    // Meaning: candies cleared per valid move
    const candyEfficiency = validMoves > 0
        ? totalCleared / validMoves
        : 0;

    // Meaning: region switching / exploration tendency
    const regionShiftCount = moves.filter(m => !!m.regionShift).length;
    const explorationMoveCount = moves.filter(m => !!m.exploratoryMove).length;
    const explorationIndex = attemptedMoves > 0
        ? (regionShiftCount + explorationMoveCount) / (2 * attemptedMoves)
        : 0;

    // Meaning: fraction of moves showing hesitation
    const hesitationCount = moves.filter(m => !!m.hesitationFlag).length;
    const hesitationIndex = attemptedMoves > 0
        ? hesitationCount / attemptedMoves
        : 0;

    // Meaning: fraction of moves showing impulsive pattern
    const impulsiveCount = moves.filter(m => !!m.impulsiveFlag).length;
    const impulsivityIndex = attemptedMoves > 0
        ? impulsiveCount / attemptedMoves
        : 0;

    // Meaning: average cascade depth per valid move
    const cascadeDepth = validMoves > 0
        ? totalCascadeDepth / validMoves
        : 0;

    return {
        roundId: roundResult?.roundId || "unknown",
        label: roundResult?.label || "Round",
        score: totalScore,
        attemptedMoves,
        validMoves,
        invalidMoves,
        successRate,
        averageDecisionTime,
        scoringEfficiency,
        candyEfficiency,
        explorationIndex,
        hesitationIndex,
        impulsivityIndex,
        cascadeDepth
    };
}

function computeOverallMeasuredMetrics(roundMetricsMap) {
    const ids = ["easy", "medium", "hard"];
    const rounds = ids.map(id => roundMetricsMap[id]).filter(Boolean);

    if (rounds.length === 0) {
        return zeroMetrics("Overall");
    }

    return {
        label: "Overall Measured Rounds",
        successRate: mean(rounds.map(r => r.successRate)),
        averageDecisionTime: mean(rounds.map(r => r.averageDecisionTime)),
        scoringEfficiency: mean(rounds.map(r => r.scoringEfficiency)),
        candyEfficiency: mean(rounds.map(r => r.candyEfficiency)),
        explorationIndex: mean(rounds.map(r => r.explorationIndex)),
        hesitationIndex: mean(rounds.map(r => r.hesitationIndex)),
        impulsivityIndex: mean(rounds.map(r => r.impulsivityIndex)),
        cascadeDepth: mean(rounds.map(r => r.cascadeDepth))
    };
}

function zeroMetrics(label = "Metrics") {
    return {
        label,
        successRate: 0,
        averageDecisionTime: 0,
        scoringEfficiency: 0,
        candyEfficiency: 0,
        explorationIndex: 0,
        hesitationIndex: 0,
        impulsivityIndex: 0,
        cascadeDepth: 0
    };
}

/* --------------------------------------------------
   Dynamic thresholds
-------------------------------------------------- */
function computeDynamicThresholds(history, currentRoundMetricsMap) {
    const metricsToCalibrate = [
        "successRate",
        "averageDecisionTime",
        "scoringEfficiency",
        "candyEfficiency",
        "explorationIndex",
        "hesitationIndex",
        "impulsivityIndex",
        "cascadeDepth"
    ];

    const thresholds = {};

    for (const metric of metricsToCalibrate) {
        const historicalValues = collectHistoricalMetricValues(history, metric);

        if (historicalValues.length >= 8) {
            const sorted = [...historicalValues].sort((a, b) => a - b);
            thresholds[metric] = {
                source: "dynamic",
                low: percentile(sorted, 25),
                high: percentile(sorted, 75)
            };
        } else {
            thresholds[metric] = {
                source: "heuristic",
                ...getHeuristicThresholdForMetric(metric)
            };
        }
    }

    return thresholds;
}

function collectHistoricalMetricValues(history, metric) {
    const values = [];

    for (const session of history) {
        const overall = session?.finalAnalysis?.overallMeasuredMetrics;
        if (overall && isFiniteNumber(overall[metric])) {
            values.push(overall[metric]);
        }
    }

    return values;
}

function getHeuristicThresholdForMetric(metric) {
    const h = window.HEURISTIC_THRESHOLDS;

    switch (metric) {
        case "averageDecisionTime":
            return { low: h.fastDecisionMs, high: h.slowDecisionMs };
        case "successRate":
            return { low: h.lowSuccessRate, high: h.highSuccessRate };
        case "explorationIndex":
            return { low: 0.25, high: h.highExploration };
        case "hesitationIndex":
            return { low: 0.15, high: h.highHesitation };
        case "impulsivityIndex":
            return { low: 0.15, high: h.highImpulsivity };
        case "scoringEfficiency":
            return { low: 30, high: h.highEfficiency };
        case "candyEfficiency":
            return { low: 3.5, high: h.highCandyEfficiency };
        case "cascadeDepth":
            return { low: 1.1, high: h.highCascadeDepth };
        default:
            return { low: 0.25, high: 0.75 };
    }
}

/* --------------------------------------------------
   Categorization
-------------------------------------------------- */
function categorizeMetrics(metrics, thresholds) {
    const categories = {};

    for (const metricName of Object.keys(METRIC_DIRECTIONS)) {
        const value = safeNumber(metrics[metricName]);
        const threshold = thresholds[metricName];
        const direction = METRIC_DIRECTIONS[metricName];

        categories[metricName] = categorizeMetric(metricName, value, threshold, direction);
    }

    return categories;
}

function categorizeMetric(metricName, value, threshold, direction) {
    if (!threshold) {
        return { label: "moderate", value };
    }

    const low = threshold.low;
    const high = threshold.high;

    if (direction === "lower_is_faster") {
        if (value <= low) return { label: "fast", value };
        if (value >= high) return { label: "slow", value };
        return { label: "moderate", value };
    }

    if (direction === "higher_is_better") {
        if (value <= low) return { label: "low", value };
        if (value >= high) return { label: "high", value };
        return { label: "moderate", value };
    }

    if (direction === "higher_is_more") {
        if (value <= low) return { label: "low", value };
        if (value >= high) return { label: "high", value };
        return { label: "moderate", value };
    }

    return { label: "moderate", value };
}

/* --------------------------------------------------
   Baseline-relative comparison
-------------------------------------------------- */
function compareMetricsToBaseline(baselineMetrics, currentMetrics, history) {
    const metricNames = [
        "successRate",
        "averageDecisionTime",
        "scoringEfficiency",
        "candyEfficiency",
        "explorationIndex",
        "hesitationIndex",
        "impulsivityIndex",
        "cascadeDepth"
    ];

    const result = {};

    for (const metric of metricNames) {
        const baselineValue = safeNumber(baselineMetrics[metric]);
        const currentValue = safeNumber(currentMetrics[metric]);
        const changeRate = computeChangeRate(baselineValue, currentValue);
        const magnitude = classifyChangeMagnitude(metric, Math.abs(changeRate), history);

        result[metric] = {
            baselineValue,
            currentValue,
            changeRate,
            magnitude
        };
    }

    return result;
}

function computeChangeRate(baselineValue, currentValue) {
    const epsilon = 0.0001;
    const safeBaseline = Math.abs(baselineValue) < epsilon ? epsilon : baselineValue;
    return (currentValue - baselineValue) / safeBaseline;
}

function classifyChangeMagnitude(metric, absoluteChangeRate, history) {
    const dynamic = collectHistoricalChangeRates(history, metric);

    if (dynamic.length >= 8) {
        const sorted = [...dynamic].sort((a, b) => a - b);
        const smallCutoff = percentile(sorted, 33);
        const moderateCutoff = percentile(sorted, 66);

        if (absoluteChangeRate <= smallCutoff) return "small";
        if (absoluteChangeRate <= moderateCutoff) return "moderate";
        return "large";
    }

    const h = window.HEURISTIC_THRESHOLDS;
    if (absoluteChangeRate < h.smallChange) return "small";
    if (absoluteChangeRate < h.moderateChange) return "moderate";
    return "large";
}

function collectHistoricalChangeRates(history, metric) {
    const values = [];

    for (const session of history) {
        const comparisons = session?.finalAnalysis?.baselineComparisons;
        if (!comparisons) continue;

        for (const roundId of ["easy", "medium", "hard"]) {
            const entry = comparisons[roundId]?.[metric];
            if (entry && isFiniteNumber(entry.changeRate)) {
                values.push(Math.abs(entry.changeRate));
            }
        }
    }

    return values;
}

/* --------------------------------------------------
   Rule-based player typing
-------------------------------------------------- */
function classifyPlayerType(overallMetrics, metricCategories, baselineComparisons) {
    const speedLabel = metricCategories.averageDecisionTime?.label || "moderate";
    const successLabel = metricCategories.successRate?.label || "moderate";

    let mainType = "Fast and Effective";

    if (speedLabel === "fast" && successLabel === "high") {
        mainType = "Fast and Effective";
    } else if (speedLabel === "fast" && successLabel === "low") {
        mainType = "Impulsive";
    } else if (speedLabel === "slow" && successLabel === "high") {
        mainType = "Analytical";
    } else if (speedLabel === "slow" && successLabel === "low") {
        mainType = "Hesitant";
    } else {
        // Tie-breaker for moderate cases
        mainType = resolveModerateTyping(overallMetrics, metricCategories);
    }

    const tags = [];

    if ((metricCategories.scoringEfficiency?.label === "high") ||
        (metricCategories.candyEfficiency?.label === "high")) {
        tags.push("Goal-Oriented");
    }

    if (metricCategories.explorationIndex?.label === "high") {
        tags.push("Exploratory");
    }

    if (metricCategories.cascadeDepth?.label === "high") {
        tags.push("Strategic Planner");
    }

    if (metricCategories.hesitationIndex?.label === "high") {
        tags.push("Hesitation-Prone");
    }

    if (metricCategories.impulsivityIndex?.label === "high") {
        tags.push("Quick-to-Act");
    }

    const stabilityTag = inferStabilityTag(baselineComparisons);
    if (stabilityTag) tags.push(stabilityTag);

    return {
        mainType,
        tags: dedupe(tags)
    };
}

function resolveModerateTyping(overallMetrics, metricCategories) {
    const hesitationHigh = metricCategories.hesitationIndex?.label === "high";
    const impulsiveHigh = metricCategories.impulsivityIndex?.label === "high";
    const success = safeNumber(overallMetrics.successRate);
    const speed = safeNumber(overallMetrics.averageDecisionTime);

    if (impulsiveHigh && success < 0.5) return "Impulsive";
    if (hesitationHigh && speed > 3000) return "Hesitant";
    if (success >= 0.6 && speed > 2200) return "Analytical";
    return "Fast and Effective";
}

function inferStabilityTag(baselineComparisons) {
    if (!baselineComparisons) return null;

    const monitored = [];
    for (const roundId of ["easy", "medium", "hard"]) {
        const c = baselineComparisons[roundId];
        if (!c) continue;

        for (const key of ["successRate", "averageDecisionTime", "hesitationIndex", "impulsivityIndex"]) {
            if (c[key] && isFiniteNumber(c[key].changeRate)) {
                monitored.push(Math.abs(c[key].changeRate));
            }
        }
    }

    if (monitored.length === 0) return null;

    const avgShift = mean(monitored);
    if (avgShift < 0.12) return "Stable Under Pressure";
    if (avgShift > 0.35) return "Shifts Under Pressure";
    return null;
}

/* --------------------------------------------------
   Pressure response summary
-------------------------------------------------- */
function summarizePressureResponse(baselineComparisons) {
    if (!baselineComparisons) {
        return "No baseline comparison was available for this session.";
    }

    const hard = baselineComparisons.hard;
    if (!hard) {
        return "Pressure response could not be fully summarized because the higher-difficulty comparison was incomplete.";
    }

    const dt = hard.averageDecisionTime?.changeRate || 0;
    const success = hard.successRate?.changeRate || 0;
    const hesitation = hard.hesitationIndex?.changeRate || 0;
    const impulsivity = hard.impulsivityIndex?.changeRate || 0;
    const cascade = hard.cascadeDepth?.changeRate || 0;

    if (Math.abs(dt) < 0.1 && Math.abs(success) < 0.1 && Math.abs(hesitation) < 0.1) {
        return "Behavior remained relatively stable as difficulty increased.";
    }

    if (hesitation > 0.2 && dt > 0.2) {
        return "Under higher difficulty, decision-making became slower and more hesitant.";
    }

    if (impulsivity > 0.2 && success < -0.15) {
        return "Under higher difficulty, decisions became quicker but less reliable, suggesting a more impulsive response.";
    }

    if (cascade > 0.2 && success >= 0) {
        return "Under higher difficulty, play appeared to adapt strategically, with stronger multi-step outcomes.";
    }

    if (success < -0.2) {
        return "Performance quality dropped under higher difficulty, even when the pace of decisions did not shift dramatically.";
    }

    return "Behavior changed under higher difficulty, but not in a single dominant direction.";
}

/* --------------------------------------------------
   Plain-language summary
-------------------------------------------------- */
function buildInterpretationSummary(typing, pressureResponse, overallMetrics) {
    const intro = `In this game context, you appear ${typing.mainType.toLowerCase()}.`;

    const efficiencySentence =
        overallMetrics.scoringEfficiency >= 50
            ? "Your moves were often effective at turning decisions into score."
            : "Your score output per effective move was more moderate than strong.";

    const explorationSentence =
        overallMetrics.explorationIndex >= 0.5
            ? "You also showed a relatively exploratory pattern across board regions."
            : "Your play was relatively consistent rather than highly exploratory.";

    return `${intro} ${efficiencySentence} ${explorationSentence} ${pressureResponse}`;
}

/* --------------------------------------------------
   UI formatting helpers
-------------------------------------------------- */
function buildMetricsByRoundForUI(roundMetricsMap) {
    return ["baseline", "easy", "medium", "hard"]
        .filter(id => !!roundMetricsMap[id])
        .map(id => {
            const m = roundMetricsMap[id];
            return {
                id,
                label: m.label,
                score: m.score,
                successRate: m.successRate,
                averageDecisionTime: m.averageDecisionTime,
                scoringEfficiency: m.scoringEfficiency,
                candyEfficiency: m.candyEfficiency,
                explorationIndex: m.explorationIndex,
                hesitationIndex: m.hesitationIndex,
                impulsivityIndex: m.impulsivityIndex,
                cascadeDepth: m.cascadeDepth
            };
        });
}

/* --------------------------------------------------
   History loading
-------------------------------------------------- */
function loadHistoricalSessionMetrics() {
    if (typeof window.loadSessionHistory === "function") {
        const history = window.loadSessionHistory();
        return Array.isArray(history) ? history : [];
    }

    try {
        const raw = localStorage.getItem("candy-crush-behavior-history");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

/* --------------------------------------------------
   Small utilities
-------------------------------------------------- */
function safeNumber(value) {
    return isFiniteNumber(value) ? Number(value) : 0;
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function sum(values) {
    return values.reduce((acc, v) => acc + safeNumber(v), 0);
}

function mean(values) {
    if (!values || values.length === 0) return 0;
    return sum(values) / values.length;
}

function percentile(sortedValues, p) {
    if (!sortedValues || sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) return sortedValues[lower];

    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function dedupe(arr) {
    return Array.from(new Set(arr));
}