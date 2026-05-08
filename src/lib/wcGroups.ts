export const WC_GROUPS: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Bosnia-Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Turkey"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Austria", "Jordan", "Argentina", "Algeria"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

// Teams ordered by their group (A→L) which approximates chronological first-game order.
export const TEAMS_BY_GAME_ORDER: string[] = Object.values(WC_GROUPS).flat();

// First kickoff is 2026-06-11T19:00:00Z (Mexico vs South Africa).
// Advancement picks lock 1 hour before that first kickoff.
export const ADVANCEMENT_LOCK_TIME = new Date("2026-06-11T18:00:00Z");
