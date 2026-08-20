/* Website-only language-origin validation and localized display names. */
'use strict';

(() => {
  const INVALID = new Set([
    '', 'und', 'mul', 'zxx', 'mis', 'unknown', 'undefined', 'null', 'auto',
    'n/a', 'n-a', 'na', 'none', 'other', 'garbage'
  ]);
  const NAME_ALIASES = new Map(Object.entries({
    deutsch: 'de', german: 'de', allemand: 'de',
    english: 'en', englisch: 'en', anglais: 'en',
    español: 'es', spanish: 'es', spanisch: 'es',
    français: 'fr', french: 'fr', französisch: 'fr',
    italiano: 'it', italian: 'it', italienisch: 'it',
    português: 'pt', portuguese: 'pt', portugiesisch: 'pt',
    русский: 'ru', russian: 'ru', russisch: 'ru',
    ελληνικά: 'el', greek: 'el', griechisch: 'el',
    türkçe: 'tr', turkish: 'tr', türkisch: 'tr',
    kurdî: 'ku', kurdish: 'ku', kurdisch: 'ku',
    العربية: 'ar', arabic: 'ar', arabisch: 'ar'
  }));
  const FALLBACK = {
    de: { de: 'Deutsch', en: 'Englisch', es: 'Spanisch', fr: 'Französisch', it: 'Italienisch', pt: 'Portugiesisch', ru: 'Russisch', el: 'Griechisch', tr: 'Türkisch', ku: 'Kurdisch', ar: 'Arabisch' },
    en: { de: 'German', en: 'English', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian', el: 'Greek', tr: 'Turkish', ku: 'Kurdish', ar: 'Arabic' }
  };
  const COPY = {
    de: { machine: 'Maschinell übersetzt', from: 'aus' },
    en: { machine: 'Machine translated', from: 'from' },
    es: { machine: 'Traducción automática', from: 'del' },
    fr: { machine: 'Traduit automatiquement', from: 'du' },
    it: { machine: 'Traduzione automatica', from: 'da' },
    pt: { machine: 'Tradução automática', from: 'de' },
    ru: { machine: 'Машинный перевод', from: 'с' },
    el: { machine: 'Μηχανική μετάφραση', from: 'από' },
    tr: { machine: 'Makine çevirisi', from: 'dilinden' }
  };

  function uiPrimary(value) {
    const candidate = String(value || 'en').trim().toLowerCase().replace(/_/g, '-');
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(candidate)
      ? candidate.split('-')[0]
      : 'en';
  }

  function normalize(value) {
    let candidate = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
    if (NAME_ALIASES.has(candidate)) candidate = NAME_ALIASES.get(candidate);
    if (INVALID.has(candidate) || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(candidate)) return '';
    let primary = candidate.split('-')[0];
    if (INVALID.has(primary)) return '';
    try {
      primary = new Intl.Locale(candidate).language.toLowerCase();
    } catch {
      return '';
    }
    if (INVALID.has(primary) || !/^[a-z]{2,3}$/.test(primary)) return '';

    // A raw syntactically valid token is accepted only when the runtime knows
    // it as a language or the deterministic fallback table explicitly does.
    if (FALLBACK.de[primary] || FALLBACK.en[primary]) return primary;
    try {
      const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(primary);
      if (!name || name.toLowerCase() === primary) return '';
    } catch {
      return '';
    }
    return primary;
  }

  function displayName(value, uiLocale = document.documentElement.lang || 'en') {
    const code = normalize(value);
    if (!code) return '';
    const locale = uiPrimary(uiLocale);
    try {
      const name = new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }).of(code);
      if (name && name.toLowerCase() !== code) return name;
    } catch {
      // Deterministic table below.
    }
    return (FALLBACK[locale] || FALLBACK.en)[code] || FALLBACK.en[code] || '';
  }

  function machineTranslationLabel(value, uiLocale = document.documentElement.lang || 'en') {
    const locale = uiPrimary(uiLocale);
    const copy = COPY[locale] || COPY.en;
    const origin = displayName(value, locale);
    return origin ? `${copy.machine} ${copy.from} ${origin}` : copy.machine;
  }

  window.WRNLanguageOrigin = Object.freeze({
    normalize,
    displayName,
    machineTranslationLabel,
    isValid: value => Boolean(normalize(value))
  });
})();
