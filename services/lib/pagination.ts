export interface PaginationMetadata {
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Build pagination metadata from a total count and page parameters.
 * `pageSize` is clamped to at least 1 to avoid Infinity/NaN page counts.
 */
export function getPaginationMetadata(
  total: number,
  page: number,
  pageSize: number,
): PaginationMetadata {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeTotal = Math.max(0, total);

  return {
    total: safeTotal,
    totalPages: Math.ceil(safeTotal / safePageSize) || 1,
    currentPage: safePage,
    pageSize: safePageSize,
  };
}
