import assert from "node:assert/strict";
import test from "node:test";
import { KWAI_SYNC_MAX_PAGES, syncKwaiPages } from "./kwai-sync";

test("syncs pages sequentially until the official list ends", async () => {
  const read: number[] = [];
  const progress: number[] = [];
  const result = await syncKwaiPages({
    startPage: 1,
    readPage: async (page) => { read.push(page); return { page, count: page === 1 ? 50 : 7, total: 57, hasMore: page === 1 }; },
    onPage: ({ currentPage }) => progress.push(currentPage),
  });
  assert.deepEqual(read, [1, 2]);
  assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(result, { pagesRead: 2, rowsRead: 57, total: 57, hasMore: false, nextPage: null });
});

test("caps one batch and returns the next page for safe continuation", async () => {
  const result = await syncKwaiPages({
    startPage: 4,
    maxPages: 2,
    readPage: async (page) => ({ page, count: 50, total: 9999, hasMore: true }),
  });
  assert.deepEqual(result, { pagesRead: 2, rowsRead: 100, total: 9999, hasMore: true, nextPage: 6 });
  assert.equal(KWAI_SYNC_MAX_PAGES, 20);
});

test("keeps successful earlier pages committed when a later read fails", async () => {
  const committed: number[] = [];
  await assert.rejects(syncKwaiPages({
    startPage: 1,
    readPage: async (page) => {
      if (page === 2) throw new Error("temporary API failure");
      committed.push(page);
      return { page, count: 50, total: 120, hasMore: true };
    },
  }), /temporary API failure/);
  assert.deepEqual(committed, [1]);
});

test("rejects malformed page metadata", async () => {
  await assert.rejects(syncKwaiPages({ startPage: 1, readPage: async () => ({ page: 2, count: 50, total: 50, hasMore: false }) }), /响应不完整/);
});
