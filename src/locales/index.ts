import { ja } from './ja';
import { en } from './en';

export type Locale = typeof ja;

export const locales: { [key: string]: Locale } = {
    ja,
    en
};

export const defaultLocale = ja;