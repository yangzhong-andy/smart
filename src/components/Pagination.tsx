"use client";

import { useEffect } from "react";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** 自定义每页条数选项，默认 [20, 30, 50, 100] */
  pageSizeOptions?: number[];
}

/**
 * 通用分页组件
 * 用法：
 *   <Pagination total={filtered.length} page={page} pageSize={pageSize}
 *     onPageChange={setPage} onPageSizeChange={setPageSize} />
 */
export function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange, pageSizeOptions }: PaginationProps) {
  const options = pageSizeOptions || PAGE_SIZE_OPTIONS;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // 页码超出范围时自动修正
  useEffect(() => {
    if (page > totalPages) onPageChange(totalPages);
  }, [page, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const btnClass = "rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition";

  return (
    <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2 text-xs text-slate-400 flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <span>共 {total} 条</span>
        {totalPages > 1 && <span>，第 {safePage}/{totalPages} 页</span>}
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-primary-400"
        >
          {options.map((s) => (
            <option key={s} value={s}>{s}条/页</option>
          ))}
          <option value={999999}>全部</option>
        </select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button disabled={safePage <= 1} onClick={() => onPageChange(1)} className={btnClass}>首页</button>
          <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} className={btnClass}>上一页</button>
          <button disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} className={btnClass}>下一页</button>
          <button disabled={safePage >= totalPages} onClick={() => onPageChange(totalPages)} className={btnClass}>末页</button>
        </div>
      )}
    </div>
  );
}

/**
 * 分页 Hook：管理 page/pageSize state，并提供 slice 后的数据
 * 用法：
 *   const { page, pageSize, setPage, setPageSize, pagedData } = usePagination(filteredData);
 *   // 渲染: pagedData.map(...)
 *   // 底部: <Pagination total={filteredData.length} page={page} pageSize={pageSize} ... />
 */
export function usePagination<T>(data: T[], initialPageSize: number = 20) {
  // 动态 import useState/useEffect 不行，直接在顶部 import
  // 这里用闭包方式，实际 state 在调用方管理
  return null; // placeholder, 实际用下面的 hook
}

import { useState, useCallback } from "react";

export function usePaginationState(initialPageSize: number = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1); // 切换条数时回到第一页
  }, []);

  const resetPage = useCallback(() => setPage(1), []);

  return { page, pageSize, setPage, setPageSize, resetPage };
}

/**
 * 计算分页后的数据切片
 */
export function paginate<T>(data: T[], page: number, pageSize: number): T[] {
  if (pageSize >= 999999) return data; // 全部
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}
