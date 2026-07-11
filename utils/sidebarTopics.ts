import type { Page, PuppeteerLifeCycleEvent } from 'puppeteer';

import { cliLink, cliNeutralText } from './cliStylings';
import gotoWithRetry from './gotoWithRetry';
import { logger } from '../services/Logger';
import { SELECTORS } from '../lib/constants';

function toInternalUrls(hrefs: string[], base: URL): URL[] {
  const urls: URL[] = [];
  const seen = new Set<string>();

  for (const href of hrefs) {
    if (!href || !URL.canParse(href, base.origin)) continue;

    const url = new URL(href, base.origin);
    if (url.hostname !== base.hostname) continue; // prevents fetching from other domains

    url.hash = '';
    if (seen.has(url.href)) continue;

    seen.add(url.href);
    urls.push(url);
  }

  return urls;
}

/**
 * Detects the topics navigation rendered by the `starlight-sidebar-topics`
 * plugin (https://github.com/HiDeoo/starlight-sidebar-topics) on the current
 * page and returns the topic URLs in sidebar order.
 * Returns an empty array when the site does not use the plugin.
 */
export async function getTopicUrls(page: Page): Promise<URL[]> {
  const hrefs = await page.$$eval(SELECTORS.topicLink, links =>
    links.map(link => (link as HTMLAnchorElement).href)
  );

  return toInternalUrls(hrefs, new URL(page.url()));
}

interface GetTopicsPageUrlsParams {
  page: Page;
  topicUrls: URL[];
  waitUntil?: PuppeteerLifeCycleEvent;
}

/**
 * Visits every topic and collects its pages in reading order:
 * the topic link target first, followed by the links of the
 * topic-specific sidebar. The result is deduplicated across topics.
 */
export async function getTopicsPageUrls({
  page,
  topicUrls,
  waitUntil = 'domcontentloaded'
}: GetTopicsPageUrlsParams): Promise<URL[]> {
  const pageUrls: URL[] = [];
  const seen = new Set<string>();

  for (const topicUrl of topicUrls) {
    logger.info(
      cliNeutralText(`Collecting topic pages from ${cliLink(topicUrl.href)}...`)
    );
    await gotoWithRetry(page, topicUrl.href, { waitUntil });

    const hrefs = await page.$$eval(
      SELECTORS.sidebarLink,
      (links, topicsListSelector) =>
        links
          .filter(link => !link.closest(topicsListSelector))
          .map(link => (link as HTMLAnchorElement).href),
      SELECTORS.topicsList
    );

    for (const url of toInternalUrls([topicUrl.href, ...hrefs], topicUrl)) {
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      pageUrls.push(url);
    }
  }

  return pageUrls;
}
