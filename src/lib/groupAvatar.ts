// Group.avatar accepts either a hosted image URL or a short emoji string.
// Emoji is rendered as text; URLs go through next/image. This helper picks the
// right branch.
//
// Tag sequences (England 🏴󠁧󠁢󠁥󠁮󠁧󠁿, Scotland, Wales) are 14 UTF-16 units, so we
// can't gate on length alone — we just rule out the URL shapes.
export function isEmojiAvatar(value: string | null | undefined): value is string {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (value.startsWith("/")) return false;
  // Heuristic: anything ≤32 chars without a dot+TLD pattern is treated as emoji.
  if (value.length > 32) return false;
  if (/\.[a-z]{2,}/i.test(value)) return false;
  return true;
}

// Curated emoji set offered in the admin "Create Group" form.
export const GROUP_EMOJI_OPTIONS = [
  "⚽", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "👑",
  "⭐", "🔥", "💪", "🎯", "🚀", "🎉", "🍻", "🥅",
] as const;
