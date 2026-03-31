// Terror color theme — purple-forward ANSI terminal aesthetic

export const PURPLE = "\x1b[38;5;135m";
export const PURPLE_BRIGHT = "\x1b[38;5;177m";
export const PURPLE_DIM = "\x1b[38;5;97m";
export const GHOST_WHITE = "\x1b[38;5;255m";
export const BLOOD_RED = "\x1b[38;5;196m";
export const SPECTRAL_GREEN = "\x1b[38;5;114m";
export const AMBER = "\x1b[38;5;214m";
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

export function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

export function strip(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export const TERROR_BANNER = colorize(
  `▄▄▄▄▄ ▄▄▄▄▄ ▄▄▄▄  ▄▄▄▄  ▄▄▄▄  ▄▄▄▄
  █   █   █▄▄ █▄▄ █▄▄█ █▄▄
  █   █   █▄▄ █  ██  █ █  █`,
  PURPLE,
);
