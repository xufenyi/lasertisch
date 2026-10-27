import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from '../../../locales/de.json';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';
import ko from '../../../locales/ko.json';
import zhCN from '../../../locales/zh-CN.json';

export const supportedLanguages = [zhCN, en, fr, de, ko].map((pack) => pack._meta);

const resources = Object.fromEntries(
  [zhCN, en, fr, de, ko].map((pack) => [
    pack._meta.locale,
    { translation: pack.messages },
  ]),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

