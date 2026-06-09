export const supportedLocales = ["ru", "en", "zh-Hans", "ja"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
