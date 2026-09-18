/**
 * Injected on demand, once, when the user clicks Read this posting.
 *
 * It captures raw page content and returns it. It does not parse, does not judge, does not
 * store, and does not send anything anywhere: the panel does the parsing with the same
 * module the tests exercise, entirely on this machine.
 */
(() => ({
  url: location.href,
  title: document.title,
  html: document.documentElement.outerHTML,
}))();
