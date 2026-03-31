/**
 * config.js
 *
 * Centralized configuration for:
 * - session flow round settings
 * - heuristic thresholds
 * - stage copy / descriptions
 *
 * This keeps tuning values out of the gameplay engine.
 */

/* --------------------------------------------------
   Round configs
   These are intentionally practical and lightweight.
   We are not redesigning the whole game.
-------------------------------------------------- */
window.ROUND_CONFIGS = {
    practice: {
        id: "practice",
        label: "Practice Round",
        stageType: "practice",
        moves: 8,
        measured: false,
        difficulty: "practice",
        colors: ["red", "blue", "green", "yellow", "purple"],
        goalType: "score",
        targetScore: 180,
        description: "A short warm-up round to get comfortable with the controls."
    },

    baseline: {
        id: "baseline",
        label: "Baseline Calibration",
        stageType: "baseline",
        moves: 10,
        measured: true,
        difficulty: "baseline",
        colors: ["red", "blue", "green", "yellow", "purple"],
        goalType: "score",
        targetScore: 220,
        description: "A lower-pressure round used as a personal reference point."
    },

    easy: {
        id: "easy",
        label: "Easy",
        stageType: "main",
        moves: 14,
        measured: true,
        difficulty: "easy",
        colors: ["red", "blue", "green", "yellow", "purple"],
        goalType: "score",
        targetScore: 320,
        description: "The first measured difficulty round with relatively forgiving move pressure."
    },

    medium: {
        id: "medium",
        label: "Medium",
        stageType: "main",
        moves: 12,
        measured: true,
        difficulty: "medium",
        colors: ["red", "blue", "green", "yellow", "purple"],
        goalType: "score",
        targetScore: 340,
        description: "A more demanding round with increased decision pressure."
    },

    hard: {
        id: "hard",
        label: "Hard",
        stageType: "main",
        moves: 10,
        measured: true,
        difficulty: "hard",
        colors: ["red", "blue", "green", "yellow", "purple"],
        goalType: "score",
        targetScore: 360,
        description: "The highest-pressure round in this fixed sequence."
    }
};

/* --------------------------------------------------
   Heuristic thresholds
   Used when historical session data is still limited.
-------------------------------------------------- */
window.HEURISTIC_THRESHOLDS = {
    // Decision time
    fastDecisionMs: 1800,
    slowDecisionMs: 4000,

    // Success quality
    highSuccessRate: 0.70,
    lowSuccessRate: 0.40,

    // Exploration
    highExploration: 0.55,

    // Hesitation / impulsivity
    highHesitation: 0.35,
    highImpulsivity: 0.35,

    // Efficiency
    highEfficiency: 55,
    highCandyEfficiency: 5.5,

    // Cascade / planning
    highCascadeDepth: 1.8,

    // Baseline-relative change
    smallChange: 0.10,
    moderateChange: 0.30
};

/* --------------------------------------------------
   Stage copy
   These are optional helpers for session / UI code.
-------------------------------------------------- */
window.STAGE_COPY = {
    tutorial: {
        badge: "Tutorial",
        title: "Welcome to Candy Crush Mini",
        description: "Learn the basics before any measured round begins."
    },
    practice: {
        badge: "Practice",
        title: "Practice Round",
        description: "A short warm-up round. This round is not used for final behavioral typing."
    },
    baseline: {
        badge: "Baseline",
        title: "Baseline Calibration",
        description: "This round establishes your personal reference behavior under lower pressure."
    },
    easy: {
        badge: "Easy",
        title: "Easy Round",
        description: "The first measured difficulty round."
    },
    medium: {
        badge: "Medium",
        title: "Medium Round",
        description: "A more demanding round with higher decision pressure."
    },
    hard: {
        badge: "Hard",
        title: "Hard Round",
        description: "The highest-pressure round in the sequence."
    },
    analysis: {
        badge: "Analysis",
        title: "Analyzing Session",
        description: "Summarizing measured gameplay across rounds."
    },
    results: {
        badge: "Results",
        title: "Behavioral Snapshot",
        description: "A contextual summary of your decision-making style in this game session."
    }
};

/* --------------------------------------------------
   Optional helper methods
-------------------------------------------------- */
window.getRoundConfig = function getRoundConfig(roundId) {
    return window.ROUND_CONFIGS?.[roundId] || null;
};

window.getStageCopy = function getStageCopy(stageId) {
    return window.STAGE_COPY?.[stageId] || null;
};