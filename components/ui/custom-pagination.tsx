"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { generatePagination } from "@/services/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface CustomPaginationProps {
  totalEntries: number;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function CustomPagination({
  totalEntries,
  pageSize = 20,
  currentPage: controlledPage,
  onPageChange,
  className,
}: CustomPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL Mode Helper
  const getPageFromUrl = () => {
    const p = searchParams.get("page");
    return p ? Number(p) : 1;
  };

  // Internal state for "Uncontrolled but not URL-based" mode
  const [internalPage, setInternalPage] = useState(1);

  let page: number;
  let handlePageChange: (p: number) => void;

  if (controlledPage !== undefined && onPageChange) {
    // Controlled Mode
    page = controlledPage;
    handlePageChange = (p) => {
      onPageChange(p);
    };
  } else if (onPageChange) {
    // Uncontrolled (Stateful) Mode with Callback
    page = internalPage;
    handlePageChange = (p) => {
      setInternalPage(p);
      onPageChange(p);
    };
  } else {
    // URL Mode (Default)
    page = controlledPage !== undefined ? controlledPage : getPageFromUrl();
    handlePageChange = (p) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", p.toString());
      router.replace(`${pathname}?${params.toString()}`);
    };
  }

  const totalPages = Math.ceil(totalEntries / pageSize);
  const paginationPages =
    totalPages > 1 ? generatePagination(page, totalPages) : [];

  return (
    <div
      className={`flex flex-row items-center justify-between p-2 w-full ${
        className || ""
      }`}
    >
      <div className="text-sm text-muted-foreground">
        {totalEntries > 0
          ? `Showing ${(page - 1) * pageSize + 1} to ${Math.min(
              page * pageSize,
              totalEntries
            )} of ${totalEntries} entries`
          : "No entries found"}
      </div>

      {totalPages > 1 && (
        <div className="justify-left">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(page - 1);
                  }}
                  className={
                    page === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              {paginationPages.map((pageNum, i) => (
                <PaginationItem key={i}>
                  {pageNum === "..." ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={page === pageNum}
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(Number(pageNum));
                      }}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(page + 1);
                  }}
                  className={
                    page === totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
