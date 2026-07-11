import type { Page } from 'puppeteer';

import type CliArgs from '../../services/CliArgs';

export type CliColor =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'black';

export interface Contents {
  heading: string;
  url: string;
  children?: Omit<Contents, 'children'>[];
}

export interface GetAllContentParams {
  htmlContent: string;
  contentsData: Set<Contents>;
  page: Page;
  cliArgs: CliArgs;
  /**
   * Predefined list of pages to parse instead of following
   * `rel="next"` pagination links. Used for sites with the
   * `starlight-sidebar-topics` plugin, where pagination does not
   * cover all topics.
   */
  urlQueue?: URL[];
}

export type GetAllContentReturn = Pick<
  GetAllContentParams,
  'contentsData' | 'htmlContent'
>;
