export const KWAI_SYNC_PAGE_SIZE = 50;
export const KWAI_SYNC_MAX_PAGES = 20;

export type KwaiSyncPage = {
  page: number;
  count: number;
  total: number;
  hasMore: boolean;
};

export async function syncKwaiPages(input: {
  startPage: number;
  maxPages?: number;
  readPage: (page: number) => Promise<KwaiSyncPage>;
  onPage?: (result: { currentPage: number; pagesRead: number; rowsRead: number; total: number }) => void;
}) {
  const maxPages = input.maxPages ?? KWAI_SYNC_MAX_PAGES;
  if (!Number.isSafeInteger(input.startPage) || input.startPage < 1) throw new Error("Kwai 同步页码无效");
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > KWAI_SYNC_MAX_PAGES) throw new Error("Kwai 单次同步页数超出限制");

  let currentPage = input.startPage;
  let pagesRead = 0;
  let rowsRead = 0;
  let total = 0;
  let hasMore = true;

  while (hasMore && pagesRead < maxPages) {
    const result = await input.readPage(currentPage);
    if (result.page !== currentPage || !Number.isSafeInteger(result.count) || result.count < 0 ||
      !Number.isSafeInteger(result.total) || result.total < 0 || typeof result.hasMore !== "boolean") {
      throw new Error(`Kwai 第 ${currentPage} 页响应不完整`);
    }
    pagesRead++;
    rowsRead += result.count;
    total = result.total;
    hasMore = result.hasMore;
    input.onPage?.({ currentPage, pagesRead, rowsRead, total });
    currentPage++;
  }

  return { pagesRead, rowsRead, total, hasMore, nextPage: hasMore ? currentPage : null };
}
