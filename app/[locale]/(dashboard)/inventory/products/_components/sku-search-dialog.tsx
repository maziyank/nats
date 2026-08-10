"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  AlertCircle,
  ImageIcon,
  ExternalLink,
  Check,
} from "lucide-react";
import Image from "next/image";
import type { SkuSearchMetadata, SkuSearchResult } from "@/services/modules/inventory/services/sku-search.service";

interface SkuSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyMetadata: (metadata: SelectedMetadata) => void;
}

export interface SelectedMetadata {
  sku: string;
  name: string;
  description: string;
  category: string;
  price: string;
  image: string;
}

type SearchState = "idle" | "loading" | "results" | "error";

export function SkuSearchDialog({
  open,
  onOpenChange,
  onApplyMetadata,
}: SkuSearchDialogProps) {
  const [skuInput, setSkuInput] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [results, setResults] = useState<SkuSearchMetadata[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Field selections per result
  const [selectedFields, setSelectedFields] = useState<
    Record<
      string,
      {
        name: boolean;
        description: boolean;
        category: boolean;
        price: boolean;
        image: boolean;
      }
    >
  >({});

  const handleSearch = useCallback(async () => {
    const sku = skuInput.trim();
    if (!sku) return;

    setSearchState("loading");
    setErrorMessage("");
    setResults([]);
    setSelectedResultIndex(null);
    setSelectedFields({});
    setStatusMessage("Connecting...");

    try {
      const response = await fetch(
        `/api/inventory/sku-search?sku=${encodeURIComponent(sku)}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let searchResult: SkuSearchResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") {
              setStatusMessage(event.message);
            } else if (event.type === "result") {
              searchResult = event.data;
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      if (
        searchResult?.success &&
        searchResult.data &&
        searchResult.data.length > 0
      ) {
        setResults(searchResult.data);
        setSearchState("results");

        // Auto-select all fields for first result
        const initialSelections: typeof selectedFields = {};
        searchResult.data.forEach((_: SkuSearchMetadata, index: number) => {
          initialSelections[index] = {
            name: true,
            description: true,
            category: true,
            price: true,
            image: index === 0,
          };
        });
        setSelectedFields(initialSelections);
        setSelectedResultIndex(0);
      } else {
        setErrorMessage(searchResult?.error || "No results found");
        setSearchState("error");
      }
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setSearchState("error");
    }
  }, [skuInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && searchState !== "loading") {
        handleSearch();
      }
    },
    [handleSearch, searchState],
  );

  const toggleField = useCallback(
    (resultIndex: number, field: keyof (typeof selectedFields)[string]) => {
      setSelectedFields((prev) => ({
        ...prev,
        [resultIndex]: {
          ...prev[resultIndex],
          [field]: !prev[resultIndex]?.[field],
        },
      }));
    },
    [],
  );

  const handleApply = useCallback(() => {
    if (selectedResultIndex === null) return;

    const result = results[selectedResultIndex];
    const fields = selectedFields[selectedResultIndex];
    if (!result || !fields) return;

    const metadata: SelectedMetadata = {
      sku: skuInput.trim(),
      name: fields.name ? result.name : "",
      description: fields.description ? (result.description ?? "") : "",
      category: fields.category ? (result.category ?? "") : "",
      price: fields.price ? (result.price ?? "") : "",
      image:
        fields.image && result.images.length > 0 ? result.images[0] : "",
    };

    onApplyMetadata(metadata);
    onOpenChange(false);

    // Reset state
    setSkuInput("");
    setSearchState("idle");
    setResults([]);
    setSelectedResultIndex(null);
  }, [
    selectedResultIndex,
    results,
    selectedFields,
    onApplyMetadata,
    onOpenChange,
  ]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset after dialog closes
    setTimeout(() => {
      setSkuInput("");
      setSearchState("idle");
      setResults([]);
      setErrorMessage("");
      setSelectedResultIndex(null);
      setSelectedFields({});
      setStatusMessage("");
    }, 200);
  }, [onOpenChange]);

  const getSelectedCount = (resultIndex: number): number => {
    const fields = selectedFields[resultIndex];
    if (!fields) return 0;
    return Object.values(fields).filter(Boolean).length;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        title=""
      >
        <DialogHeader>
          <DialogTitle>Search Product by SKU</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Enter a SKU/UPC to find product information from Internet.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter SKU (e.g., ABC-12345)"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={searchState === "loading"}
                className="h-9 text-sm"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!skuInput.trim() || searchState === "loading"}
              size="sm"
              className="h-9 px-4"
            >
              {searchState === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Search</span>
            </Button>
          </div>

          {/* Loading State */}
          {searchState === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {statusMessage || "Searching for product information..."}
              </p>
            </div>
          )}

          {/* Error State */}
          {searchState === "error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive text-center max-w-sm">
                {errorMessage}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Results */}
          {searchState === "results" && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Found {results.length} result(s). Select the data you want to
                use.
              </p>

              {results.map((result, index) => (
                <ResultCard
                  key={index}
                  result={result}
                  index={index}
                  isSelected={selectedResultIndex === index}
                  selectedFields={selectedFields[index]}
                  selectedCount={getSelectedCount(index)}
                  onSelect={() => setSelectedResultIndex(index)}
                  onToggleField={(field) => toggleField(index, field)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              selectedResultIndex === null ||
              getSelectedCount(selectedResultIndex) === 0
            }
            size="sm"
          >
            <Check className="h-4 w-4 mr-1" />
            Apply Selected
            {selectedResultIndex !== null &&
            getSelectedCount(selectedResultIndex) > 0
              ? ` (${getSelectedCount(selectedResultIndex)} fields)`
              : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Result Card Sub-component
// ============================================================================

interface ResultCardProps {
  result: SkuSearchMetadata;
  index: number;
  isSelected: boolean;
  selectedFields?: {
    name: boolean;
    description: boolean;
    category: boolean;
    price: boolean;
    image: boolean;
  };
  selectedCount: number;
  onSelect: () => void;
  onToggleField: (
    field: "name" | "description" | "category" | "price" | "image",
  ) => void;
}

function ResultCard({
  result,
  index,
  isSelected,
  selectedFields,
  selectedCount,
  onSelect,
  onToggleField,
}: ResultCardProps) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors cursor-pointer ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              #{index + 1}
            </span>
            {selectedFields && selectedCount > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {selectedCount} selected
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium truncate mt-0.5">
            {result.name || "Untitled Product"}
          </h4>
          {result.sourceUrl && (
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{result.sourceUrl}</span>
            </a>
          )}
        </div>
      </div>

      {/* Field Checkboxes */}
      {isSelected && selectedFields && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2 border-t">
          <FieldCheckbox
            label="Name"
            checked={selectedFields.name}
            value={result.name}
            onChange={() => onToggleField("name")}
          />
          <FieldCheckbox
            label="Description"
            checked={selectedFields.description}
            value={result.description ?? ""}
            onChange={() => onToggleField("description")}
          />
          <FieldCheckbox
            label="Category"
            checked={selectedFields.category}
            value={result.category ?? ""}
            onChange={() => onToggleField("category")}
          />
          <FieldCheckbox
            label="Price"
            checked={selectedFields.price}
            value={result.price ?? ""}
            onChange={() => onToggleField("price")}
          />
          <div className="col-span-2 sm:col-span-3">
            <FieldCheckbox
              label="Image"
              checked={selectedFields.image}
              value={
                result.images.length > 0
                  ? `${result.images.length} image(s)`
                  : "No images"
              }
              onChange={() => onToggleField("image")}
            />
          </div>
        </div>
      )}

      {/* Image Preview */}
      {isSelected && result.images.length > 0 && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <ImageIcon className="h-2.5 w-2.5" />
            Product Images
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {result.images.slice(0, 5).map((imgUrl, imgIndex) => (
              <div
                key={imgIndex}
                className="relative h-16 w-16 flex-shrink-0 rounded-md border overflow-hidden bg-muted"
              >
                <Image
                  src={imgUrl}
                  alt={`Product image ${imgIndex + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Field Checkbox Sub-component
// ============================================================================

interface FieldCheckboxProps {
  label: string;
  checked: boolean;
  value: string;
  onChange: () => void;
}

function FieldCheckbox({
  label,
  checked,
  value,
  onChange,
}: FieldCheckboxProps) {
  return (
    <label
      className="flex items-start gap-1.5 cursor-pointer group"
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 h-3.5 w-3.5"
      />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium">{label}</span>
        {value && (
          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {value.length > 40 ? value.substring(0, 40) + "..." : value}
          </p>
        )}
      </div>
    </label>
  );
}
