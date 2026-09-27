/**
 * Список трекерных доменов.
 *
 * Формат: если hostname запроса равен элементу списка или заканчивается на
 * "." + элемент — запрос блокируется.
 *
 * Например, запись "google-analytics.com" блокирует:
 *   google-analytics.com
 *   www.google-analytics.com
 *   ssl.google-analytics.com
 *   analytics.google-analytics.com
 * но НЕ блокирует:
 *   mygoogle-analytics.com
 *   notgoogle-analytics.com
 */

export const TRACKER_DOMAINS = [
  // ============ Google ============
  'google-analytics.com',
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  'googletagmanager.com',
  'www.googletagmanager.com',
  'googletagservices.com',
  'googleadservices.com',
  'pagead2.googlesyndication.com',
  'googlesyndication.com',
  'doubleclick.net',
  'google.com/pagead',
  'adservice.google.com',
  'googleads.g.doubleclick.net',
  'stats.g.doubleclick.net',
  'cm.g.doubleclick.net',
  'ad.doubleclick.net',

  // ============ Facebook / Meta ============
  'connect.facebook.net',
  'graph.facebook.com',
  'pixel.facebook.com',
  'facebook.com/tr',
  'atlassolutions.com',

  // ============ Yandex ============
  'mc.yandex.ru',
  'metrika.yandex.ru',
  'yandexmetrica.com',
  'an.yandex.ru',
  'ads.yandex.ru',

  // ============ VK ============
  'vk.com/rtrg',
  'top-fwz1.mail.ru',
  'r.mail.ru',
  'ads.vk.com',

  // ============ Amazon ============
  'amazon-adsystem.com',
  'assoc-amazon.com',
  'amazon-adsystem.com/widgets',

  // ============ Microsoft ============
  'clarity.ms',
  'www.clarity.ms',
  'bat.bing.com',
  'c.bing.com',
  'ads.microsoft.com',

  // ============ Adobe ============
  'omtrdc.net',
  '2o7.net',
  'demdex.net',
  'adobedtm.com',
  'everesttech.net',

  // ============ Аналитика и поведение ============
  'hotjar.com',
  'static.hotjar.com',
  'script.hotjar.com',
  'mixpanel.com',
  'cdn.mxpnl.com',
  'api.mixpanel.com',
  'segment.com',
  'cdn.segment.com',
  'api.segment.io',
  'segment.io',
  'amplitude.com',
  'api.amplitude.com',
  'cdn.amplitude.com',
  'kissmetrics.com',
  'heap.io',
  'heapanalytics.com',
  'fullstory.com',
  'fs.fullstory.com',
  'logrocket.com',
  'lr-ingest.io',
  'smartlook.com',
  'mouseflow.com',
  'crazyegg.com',
  'luckyorange.com',
  'inspectlet.com',
  'clicktale.net',
  'quantcast.com',
  'quantserve.com',
  'scorecardresearch.com',
  'sb.scorecardresearch.com',
  'comscore.com',
  'chartbeat.com',
  'static.chartbeat.com',
  'parsely.com',
  'p.po.st',
  'newrelic.com',
  'nr-data.net',
  'js-agent.newrelic.com',
  'bugsnag.com',
  'sentry.io',
  'browser.sentry-cdn.com',
  'datadoghq.com',
  'rum.datadoghq.com',

  // ============ Реклама ============
  'criteo.com',
  'criteo.net',
  'static.criteo.net',
  'dis.criteo.com',
  'taboola.com',
  'cdn.taboola.com',
  'trc.taboola.com',
  'outbrain.com',
  'widgets.outbrain.com',
  'ampproject.org',
  'adsafeprotected.com',
  'adnxs.com',
  'ib.adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'appnexus.com',
  'casalemedia.com',
  'contextweb.com',
  'indexexchange.com',
  'sharethrough.com',
  'smartadserver.com',
  'smaato.net',
  'yieldmo.com',
  'media.net',
  'mediavoice.com',
  'serving-sys.com',
  'adform.net',
  'adsrvr.org',
  'crwdcntrl.net',
  'exelator.com',
  'mathtag.com',
  'bluekai.com',
  'addthis.com',
  'sharethis.com',
  'revsci.net',
  'turn.com',
  'tapad.com',
  'adsymptotic.com',
  'agkn.com',

  // ============ Retargeting / DMP ============
  'rlcdn.com',
  'liadm.com',
  'crwdcntrl.net',
  'simpli.fi',
  'ml314.com',
  'everesttech.net',
  'atdmt.com',
  'zeotap.com',
  'liveramp.com',
  'rlcdn.com',

  // ============ Соцсети (встроенные трекеры) ============
  'platform.twitter.com',
  'syndication.twitter.com',
  'cdn.syndication.twimg.com',
  'platform.linkedin.com',
  'px.ads.linkedin.com',
  'snap.licdn.com',
  'platform.instagram.com',
  'pinterest.com/ct',

  // ============ Affiliate / Marketing ============
  'impact.com',
  'clickbank.net',
  'commission-junction.com',
  'cj.com',
  'anrdoezrs.net',
  'dpbolvw.net',
  'jdoqocy.com',
  'kqzyfj.com',
  'tkqlhce.com',
  'shareasale.com',
  'linksynergy.com',
  'awin1.com',
  'zenaps.com',

  // ============ Anti-fraud / Fingerprint ============
  'fpjs.io',
  'fpnpmcdn.net',
  'iovation.com',
  'threatmetrix.com',
  'maxmind.com',
  'deviceatlas.com',

  // ============ Video / CDN ads ============
  'imasdk.googleapis.com',
  'doubleclick.net/instream',
  '2mdn.net',
  'serving-sys.com',
  'mssl.fwmrm.net',
  'cdn.vindicosuite.com',
  'spotxchange.com',
  'spotx.tv',
  'freewheel.tv',
  'innovid.com',
  'teads.tv',
  'vungle.com',
  'chartboost.com',
  'unityads.unity3d.com',
  'applovin.com',
  'adjust.com',
  'appsflyer.com',
  'branch.io',

  // ============ Прочее ============
  'imrworldwide.com',
  'nielsen.com',
  'adition.com',
  'adtechus.com',
  'advertising.com',
  '247realmedia.com',
  'adcolony.com',
  'adition.com',
  'bluecava.com',
  'boomtrain.com',
  'bounceexchange.com',
  'buysellads.com',
  'carbonads.com',
  'cdn.carbonads.com',
  'servedby-buysellads.com',
  'disqus.com/embed',
  'tracking.customer.io',
  'user.com',
  'olark.com',
  'livechatinc.com',
  'zopim.com',
  'intercom.io',
  'widget.intercom.io',
  'drift.com',
  'js.driftt.com',
]

/**
 * Быстрый поиск по множеству доменов.
 */
export const TRACKER_SET = new Set(TRACKER_DOMAINS)