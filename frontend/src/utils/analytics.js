const META_PIXEL_ID = (process.env.REACT_APP_META_PIXEL_ID || '').trim();

let initialized = false;
let lastPageView = null;

function canUseBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function initMetaPixel() {
  if (!META_PIXEL_ID || !canUseBrowser()) return false;
  if (initialized) return true;

  if (!window.fbq) {
    const fbq = function fbqShim() {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }

  window.fbq('init', META_PIXEL_ID);
  initialized = true;
  return true;
}

function track(eventName, params = {}) {
  if (!initMetaPixel()) return;
  window.fbq('track', eventName, params);
}

function trackCustom(eventName, params = {}) {
  if (!initMetaPixel()) return;
  window.fbq('trackCustom', eventName, params);
}

export function trackPageView(path) {
  const pagePath = path || (canUseBrowser() ? `${window.location.pathname}${window.location.search}` : '');
  if (!pagePath || pagePath === lastPageView) return;
  lastPageView = pagePath;
  track('PageView', { page_path: pagePath });
}

export function trackSignUpClick(params = {}) {
  trackCustom('SignUpClick', params);
}

export function trackLead(params = {}) {
  track('Lead', params);
}

export function trackStartTransaction(params = {}) {
  trackCustom('StartTransaction', params);
}

export function trackCompleteRegistration(params = {}) {
  track('CompleteRegistration', params);
}

export function trackTransactionCreated(params = {}) {
  trackCustom('TransactionCreated', params);
}
