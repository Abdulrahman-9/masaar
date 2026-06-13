import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export const LANG_KEY = 'masaar-lang';

function applyDir(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
}

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANG_KEY, lng);
  applyDir(lng);
  document.title = i18n.t('app.docTitle');
});

applyDir(i18n.language);

export default i18n;
