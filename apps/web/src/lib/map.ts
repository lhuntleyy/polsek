export const REGION_COLORS = [
  "#0d8577",
  "#1768c4",
  "#b26a00",
  "#6c46bf",
  "#2e8b57",
  "#c92a38",
  "#0e7490",
  "#8a5a00"
];

export function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length] ?? "#0d8577";
}
