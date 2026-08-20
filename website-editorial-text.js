/* Website-only editorial text helpers. */
'use strict';

(() => {
  const TERMINAL = /[.!?\u3002\uff01\uff1f]["'\u2019\u201c\u201d\u201e\u00bb)\]]*$/u;
  const ELLIPSIS = /(?:\.{3}|\u2026)["'\u2019\u201c\u201d\u201e\u00bb)\]]*$/u;

  function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function selectFirstComplete(segments) {
    let sentence = '';
    for (let index = 0; index < segments.length; index += 1) {
      sentence = normalize(`${sentence} ${segments[index]}`);
      const stripped = sentence.replace(/["'\u2019\u201c\u201d\u201e\u00bb)\]]+$/u, '');
      const hasMore = index < segments.length - 1;
      const abbreviation = /\b(?:mr|mrs|ms|dr|prof|jr|sr|st|nr|no|vs|etc|pl)\.$/iu.test(stripped);
      const nextStartsWithMonth = /^(?:Januars?|Februars?|März(?:es)?|Aprils?|Mais?|Junis?|Julis?|Augusts?|Septembers?|Oktobers?|Novembers?|Dezembers?)\b/iu.test(segments[index + 1] || '');
      const numericOrdinal = /\b(?:[1-9]|[12]\d|3[01])\.$/u.test(stripped);
      const numericDateOrdinal = numericOrdinal && nextStartsWithMonth;
      if (TERMINAL.test(sentence)) {
        if ((abbreviation || numericDateOrdinal) && hasMore) continue;
        if (numericOrdinal) return '';
        return sentence;
      }
    }
    return sentence;
  }

  function fallbackFirstSentence(text) {
    const segments = [];
    const terminators = /[.!?\u3002\uff01\uff1f]+["'\u2019\u201c\u201d\u201e\u00bb)\]]*/gu;
    let start = 0;
    for (const match of text.matchAll(terminators)) {
      const after = match.index + match[0].length;
      if (after < text.length && !/\s/u.test(text[after])) continue;
      segments.push(normalize(text.slice(start, after)));
      start = after;
      while (/\s/u.test(text[start] || '')) start += 1;
    }
    if (start < text.length) segments.push(normalize(text.slice(start)));
    return selectFirstComplete(segments.filter(Boolean));
  }

  function firstCompleteSentence(value, locale = 'de', options = {}) {
    const text = normalize(value);
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : 240;
    if (!text) return '';

    let sentence = '';
    try {
      const segmenter = new Intl.Segmenter(locale || 'de', { granularity: 'sentence' });
      const segments = Array.from(segmenter.segment(text), entry => normalize(entry.segment)).filter(Boolean);
      sentence = selectFirstComplete(segments);
    } catch {
      sentence = fallbackFirstSentence(text);
    }

    if (!sentence || !TERMINAL.test(sentence) || ELLIPSIS.test(sentence)) return '';
    if (sentence.length > maxLength) return '';
    const words = sentence.match(/[\p{L}\p{N}]+/gu) || [];
    return sentence.length >= 12 && words.length >= 3 ? sentence : '';
  }

  function editorialTeaser(translatedValue, originalValue, locale = 'de', options = {}) {
    const translated = firstCompleteSentence(translatedValue, locale, options);
    if (translated) return translated;
    return firstCompleteSentence(originalValue, locale, options);
  }

  window.WRNWebsiteEditorialText = Object.freeze({
    editorialTeaser,
    firstCompleteSentence
  });
})();
