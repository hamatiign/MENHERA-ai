import { ja } from './ja';
import { en } from './en';

// 言語データの型定義（TypeScriptの補完が効くようになります！）
export type Locale = typeof ja;

export const locales = {
    ja,
    en
};

// デフォルトは日本語
export const defaultLocale = ja;