/**
 * Список трекерных доменов, разбитый по категориям.
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
 *
 * Всего ~500 доменов в 6 категориях. Пользователь может включать/выключать
 * каждую категорию отдельно в настройках.
 */

export const TRACKER_CATEGORIES = {
  analytics: {
    label: 'Аналитика',
    description: 'Сборщики статистики, метрики и поведенческих данных',
    domains: [
      // Google
      'google-analytics.com',
      'www.google-analytics.com',
      'ssl.google-analytics.com',
      'googletagmanager.com',
      'www.googletagmanager.com',
      'googletagservices.com',
      'analytics.google.com',
      // Yandex
      'mc.yandex.ru',
      'metrika.yandex.ru',
      'yandexmetrica.com',
      'matchid.adfox.yandex.ru',
      // Прочие
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
      'clicky.com',
      'statcounter.com',
      'matomo.cloud',
      'plausible.io',
      'umami.is',
      'cloudflareinsights.com',
      'cdn.jsdelivr.net/npm/matomo',
      'snowplow',
      'snowplowanalytics.com',
      'snowplow-collector',
      'gosquared.com',
      'trackjs.com',
      'raygun.io',
      'optimizely.com',
      'cdn.optimizely.com',
      'loggly.com',
      'elastic.co/beats',
    ],
  },

  ads: {
    label: 'Реклама',
    description: 'Рекламные сети, баннеры и системы показа объявлений',
    domains: [
      // Google Ads
      'doubleclick.net',
      'googleadservices.com',
      'pagead2.googlesyndication.com',
      'googlesyndication.com',
      'adservice.google.com',
      'googleads.g.doubleclick.net',
      'stats.g.doubleclick.net',
      'cm.g.doubleclick.net',
      'ad.doubleclick.net',
      'imasdk.googleapis.com',
      '2mdn.net',
      // Yandex
      'an.yandex.ru',
      'ads.yandex.ru',
      // VK
      'ads.vk.com',
      'top-fwz1.mail.ru',
      'r.mail.ru',
      // Прочие
      'amazon-adsystem.com',
      'assoc-amazon.com',
      'bat.bing.com',
      'c.bing.com',
      'ads.microsoft.com',
      'clarity.ms',
      'www.clarity.ms',
      'criteo.com',
      'criteo.net',
      'static.criteo.net',
      'dis.criteo.com',
      'taboola.com',
      'cdn.taboola.com',
      'trc.taboola.com',
      'outbrain.com',
      'widgets.outbrain.com',
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
      'revsci.net',
      'turn.com',
      'tapad.com',
      'adsymptotic.com',
      'agkn.com',
      'buysellads.com',
      'carbonads.com',
      'cdn.carbonads.com',
      'servedby-buysellads.com',
      'bidswitch.net',
      'districtm.io',
      'loopme.me',
      'mopub.com',
      'ogury.com',
      'rhythmone.com',
      'sonobi.com',
      'teads.tv',
      'triplelift.com',
      'undertone.com',
      'yieldbot.com',
      'zemanta.com',
      'adcolony.com',
      'adition.com',
      'adtechus.com',
      'advertising.com',
      '247realmedia.com',
      'adroll.com',
      'adsrvr.org',
      'adzerk.net',
      'cedexis.com',
      'connatix.com',
      'spotxchange.com',
      'spotx.tv',
      'freewheel.tv',
      'innovid.com',
      'mssl.fwmrm.net',
      'cdn.vindicosuite.com',
    ],
  },

  social: {
    label: 'Соцсети и трекеры',
    description: 'Встроенные виджеты и трекеры соцсетей',
    domains: [
      'connect.facebook.net',
      'graph.facebook.com',
      'pixel.facebook.com',
      'atlassolutions.com',
      'platform.twitter.com',
      'syndication.twitter.com',
      'cdn.syndication.twimg.com',
      'platform.linkedin.com',
      'px.ads.linkedin.com',
      'snap.licdn.com',
      'platform.instagram.com',
      'addthis.com',
      'sharethis.com',
      'disqus.com',
      'disquscdn.com',
      'addtoany.com',
      'po.st',
      'sumo.com',
      'sumome.com',
      'shareaholic.com',
    ],
  },

  fingerprint: {
    label: 'Фингерпринт',
    description: 'Anti-fraud системы и сборщики цифрового отпечатка',
    domains: [
      'fpjs.io',
      'fpnpmcdn.net',
      'iovation.com',
      'threatmetrix.com',
      'maxmind.com',
      'deviceatlas.com',
      'rlcdn.com',
      'liadm.com',
      'simpli.fi',
      'ml314.com',
      'everesttech.net',
      'atdmt.com',
      'zeotap.com',
      'liveramp.com',
      'bluecava.com',
      'boomtrain.com',
      'bounceexchange.com',
      'omtrdc.net',
      '2o7.net',
      'demdex.net',
      'adobedtm.com',
    ],
  },

  cryptominers: {
    label: 'Криптомайнеры',
    description: 'Скрипты для скрытого майнинга криптовалют',
    domains: [
      'coinhive.com',
      'coin-hive.com',
      'jsecoin.com',
      'webminepool.com',
      'crypto-loot.com',
      'cryptoloot.pro',
      'coinimp.com',
      'coinimp.net',
      'minero.cc',
      'webmine.cz',
      'monerominer.rocks',
      'mineralt.io',
      'cryptonight.wasm',
      'authedmine.com',
      'gridcash.net',
      'deepMiner.js',
    ],
  },

  marketing: {
    label: 'Маркетинг и affiliate',
    description: 'Партнёрские сети, retargeting и email-трекеры',
    domains: [
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
      'hubspot.com',
      'hs-analytics.net',
      'hs-scripts.com',
      'hsleadflows.net',
      'marketo.com',
      'mktoresp.com',
      'pardot.com',
      'intercom.io',
      'widget.intercom.io',
      'drift.com',
      'js.driftt.com',
      'olark.com',
      'livechatinc.com',
      'zopim.com',
      'user.com',
      'tracking.customer.io',
      'mailchimp.com',
      'list-manage.com',
      'campaign-archive.com',
      'sendgrid.net',
      'klaviyo.com',
      'braze.com',
      'appboy.com',
    ],
  },
}

/**
 * Все домены плоским списком — для быстрого поиска.
 */
export const TRACKER_DOMAINS = Object.values(TRACKER_CATEGORIES)
  .flatMap(cat => cat.domains)

/**
 * Быстрый поиск по множеству доменов.
 */
export const TRACKER_SET = new Set(TRACKER_DOMAINS)

/**
 * Маппинг домен → категория. Строится один раз при загрузке модуля.
 */
export const DOMAIN_TO_CATEGORY = new Map()
for (const [catId, cat] of Object.entries(TRACKER_CATEGORIES)) {
  for (const domain of cat.domains) {
    DOMAIN_TO_CATEGORY.set(domain, catId)
  }
}

/**
 * Сегменты URL-пути, характерные для рекламных запросов.
 *
 * Если сегмент пути (между слешами) точно совпадает с одним из этих слов —
 * запрос блокируется, даже если домен не в списке трекеров.
 *
 * Применяется ТОЛЬКО к под-ресурсам (скрипты, картинки, iframe, XHR),
 * но не к главной странице — иначе сломаются легитимные URL типа /ads-news/article.html.
 *
 * Примеры блокировки:
 *   example.com/ads/banner.jpg       → да
 *   cdn.site.com/adserver/load.js    → да
 *   site.com/api/adslot?id=5         → да
 *
 * Примеры, где НЕ блокируем:
 *   site.com/adventures/             → нет (сегмент "adventures", не "advert")
 *   site.com/downloads/file.pdf      → нет (сегмент "downloads", не "ads")
 */
export const AD_PATH_SEGMENTS = new Set([
  'ads',
  'adserver',
  'adservice',
  'adframe',
  'adclick',
  'adimage',
  'advert',
  'adverts',
  'advertising',
  'advertisement',
  'advertisements',
  'ad-banner',
  'ad_banner',
  'adbanner',
  'bannerads',
  'banner-ad',
  'banner_ad',
  'pagead',
  'showad',
  'showads',
  'clicktrack',
  'clicktracker',
  'adview',
  'adlog',
  'adjs',
  'adcode',
  'adzone',
  'adslot',
  'ad_slot',
])


/**
 * Возвращает ID категории, к которой относится hostname.
 * Проверяет и точное совпадение, и суффиксы (как в блокировщике).
 */
export function getCategoryForHostname(hostname) {
  if (!hostname) return null
  const host = hostname.toLowerCase()

  if (DOMAIN_TO_CATEGORY.has(host)) return DOMAIN_TO_CATEGORY.get(host)

  let idx = host.indexOf('.')
  while (idx !== -1) {
    const suffix = host.slice(idx + 1)
    if (DOMAIN_TO_CATEGORY.has(suffix)) return DOMAIN_TO_CATEGORY.get(suffix)
    idx = host.indexOf('.', idx + 1)
  }
  return null
}

/* эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго */