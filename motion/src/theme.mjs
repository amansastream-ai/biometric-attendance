/**
 * Direction artistique — reprise de l'identité de BioPointage RH
 * (fond slate-950, accents cyan-500 / emerald-500, cartes arrondies, mono pour les chiffres).
 */

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const PAD = 84; // marge de sécurité verticale

export const C = {
  bg: "#020617",
  bgSoft: "#060d1f",
  panel: "#0b1425",
  panel2: "#0f1b2e",
  stroke: "#1e293b",
  strokeSoft: "#16233a",

  text: "#e8eefc",
  textMuted: "#94a3b8",
  textDim: "#5d6b82",

  cyan: "#22d3ee",
  cyan600: "#0891b2",
  teal: "#14b8a6",
  emerald: "#34d399",
  emerald600: "#10b981",
  emeraldDim: "#059669",

  amber: "#fbbf24",
  rose: "#fb7185",
  violet: "#a78bfa",
};

export const GRAD = {
  brand: [
    [0, C.cyan],
    [1, C.emerald],
  ],
  cyanDeep: [
    [0, "#67e8f9"],
    [0.5, C.cyan],
    [1, C.teal],
  ],
  emeraldDeep: [
    [0, "#6ee7b7"],
    [1, C.emerald600],
  ],
  fade: [
    [0, "rgba(34,211,238,0.95)"],
    [1, "rgba(52,211,153,0)"],
  ],
};

export const FONT = {
  ui: "Poppins",
  mono: "JetBrains Mono",
};

/** Couleurs de scène : utilisées pour les fonds, ambiances et transitions. */
export const AMBIENT = {
  boot: [C.cyan, C.teal],
  hook: [C.cyan, C.violet],
  scan: [C.emerald, C.cyan],
  confirm: [C.emerald, C.teal],
  dashboard: [C.cyan, "#38bdf8"],
  features: [C.teal, C.emerald],
  export: [C.emerald, C.cyan],
  outro: [C.cyan, C.emerald],
};
