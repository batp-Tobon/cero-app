/**
 * Emojis que se pueden usar como foto de perfil.
 *
 * Es una lista cerrada y compartida por el selector y la validación del
 * servidor: sin ella, el campo aceptaría cualquier texto corto y alguien
 * podría guardar "ADMIN" donde la interfaz espera un símbolo.
 */
export const AVATAR_EMOJIS = [
  "🙂", "😎", "🤓", "🥳", "😇", "🤠", "🦊", "🐼",
  "🐨", "🦁", "🐯", "🐸", "🐙", "🦉", "🦄", "🐝",
  "🌻", "🌵", "🍀", "🔥", "⚡", "🌙", "⭐", "🌈",
  "🚀", "⚽", "🎸", "🎯", "🏔️", "🌊", "☕", "🍕",
  "💎", "🧩", "📚", "🎨", "🛠️", "💡", "🏆", "🐢",
] as const;

export type AvatarEmoji = (typeof AVATAR_EMOJIS)[number];

export function isAvatarEmoji(value: string): value is AvatarEmoji {
  return (AVATAR_EMOJIS as readonly string[]).includes(value);
}
