/*
<MODULE_CONTRACT>
<purpose>Enhances HTML tables with sortable column functionality</purpose>
<non-goals>
  <item>Does not handle server-side sorting</item>
  <item>Does not support non-tabular data structures</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of sortable table enhancement</item>
</CHANGE_SUMMARY>
*/

import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type Table,
} from "@tanstack/table-core";

type SortType = "number" | "text" | "none";

interface RowData {
  _rowIndex: number;
  _element: HTMLTableRowElement;
  [key: string]: string | number | HTMLTableRowElement;
}

function getSortValue(td: HTMLTableCellElement): string {
  const explicit = td.dataset.sortValue;
  if (explicit != null) return explicit;
  return (td.textContent ?? "").trim();
}

function detectNumeric(value: string): number | string {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? value : parsed;
}

function createColumnDefs(headerCells: HTMLTableCellElement[]): ColumnDef<RowData>[] {
  return headerCells.map((th, index) => {
    const sortType = (th.dataset.sortType ?? "text") as SortType;
    const colId = th.dataset.colId ?? `col-${index}`;

    if (sortType === "none") {
      return {
        id: colId,
        enableSorting: false,
        header: () => th.textContent ?? "",
        cell: () => "",
      };
    }

    return {
      id: colId,
      accessorFn: (row) => {
        const value = row[colId] ?? "";
        if (sortType === "number") {
          const num = typeof value === "number" ? value : detectNumeric(String(value));
          return num;
        }
        return String(value);
      },
      sortingFn: (a, b) => {
        const va = a.getValue(colId);
        const vb = b.getValue(colId);
        if (typeof va === "number" && typeof vb === "number") {
          return va - vb;
        }
        return String(va).localeCompare(String(vb), "de");
      },
      header: () => th.textContent ?? "",
      cell: () => "",
    };
  });
}

function extractRowData(tr: HTMLTableRowElement, headerCells: HTMLTableCellElement[]): RowData {
  const cells = Array.from(tr.querySelectorAll("td"));
  const data: RowData = {
    _rowIndex: tr.dataset.rowIndex ? parseInt(tr.dataset.rowIndex, 10) : 0,
    _element: tr,
  };

  headerCells.forEach((th, index) => {
    const colId = th.dataset.colId ?? `col-${index}`;
    const td = cells[index];
    if (td) {
      data[colId] = getSortValue(td);
    }
  });

  return data;
}

function updateSortIndicators(
  table: HTMLTableElement,
  sorting: SortingState,
  columns: ColumnDef<RowData>[],
): void {
  const headerCells = Array.from(
    table.querySelectorAll("thead th[data-sort-type]"),
  ) as HTMLTableCellElement[];

  headerCells.forEach((th, index) => {
    const colId = columns[index]?.id ?? `col-${index}`;
    const sortDir = sorting.find((s) => s.id === colId);

    th.removeAttribute("aria-sort");
    th.classList.remove("sort-asc", "sort-desc");

    if (sortDir) {
      th.setAttribute("aria-sort", sortDir.desc ? "descending" : "ascending");
      th.classList.add(sortDir.desc ? "sort-desc" : "sort-asc");
    }
  });
}

function reorderRows(tbody: HTMLTableSectionElement, rows: HTMLTableRowElement[]): void {
  const fragment = document.createDocumentFragment();
  rows.forEach((tr) => fragment.appendChild(tr));
  tbody.appendChild(fragment);
}

function enhanceTable(table: HTMLTableElement): void {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  const headerCells = Array.from(
    thead.querySelectorAll("th[data-sort-type]"),
  ) as HTMLTableCellElement[];

  if (headerCells.length === 0) return;

  const hasSortable = headerCells.some((th) => th.dataset.sortType !== "none");
  if (!hasSortable) return;

  const rowElements = Array.from(tbody.querySelectorAll("tr")) as HTMLTableRowElement[];

  if (rowElements.length === 0) return;

  rowElements.forEach((tr, index) => {
    tr.dataset.rowIndex = String(index);
  });

  const rowData = rowElements.map((tr) => extractRowData(tr, headerCells));
  const columns = createColumnDefs(headerCells);

  let sorting: SortingState = [];

  const tableInstance: Table<RowData> = createTable({
    data: rowData,
    columns,
    state: { sorting },
    onStateChange: () => {},
    renderFallbackValue: null,
    onSortingChange: (updater) => {
      sorting = typeof updater === "function" ? updater(sorting) : (updater as SortingState);
      tableInstance.setOptions((prev) => ({
        ...prev,
        state: { ...prev.state, sorting },
      }));
      render();
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function render(): void {
    const sortedRows = tableInstance.getRowModel().rows;
    const sortedElements = sortedRows.map((row) => row.original._element);
    reorderRows(tbody!, sortedElements);
    updateSortIndicators(table, sorting, columns);
  }

  headerCells.forEach((th, index) => {
    const sortType = (th.dataset.sortType ?? "text") as SortType;
    if (sortType === "none") return;

    const colId = columns[index]?.id ?? `col-${index}`;
    const wrapper = th.querySelector(".th-sort-wrapper");
    const target = wrapper ?? th;

    target.classList.add("sortable-th");

    if (!wrapper) {
      const inner = document.createElement("button");
      inner.className = "th-sort-btn";
      inner.type = "button";
      inner.setAttribute("aria-label", `Sortieren nach ${th.textContent?.trim() ?? "Spalte"}`);

      const label = document.createElement("span");
      label.className = "th-sort-label";
      label.innerHTML = th.innerHTML;

      const icon = document.createElement("span");
      icon.className = "th-sort-icon";
      icon.setAttribute("aria-hidden", "true");

      th.innerHTML = "";
      th.appendChild(inner);
      inner.appendChild(label);
      inner.appendChild(icon);
    }

    const btn = target.querySelector(".th-sort-btn") ?? target;
    btn.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".term-info") ||
        target.closest("a") ||
        target.closest("button:not(.th-sort-btn)")
      ) {
        return;
      }
      e.preventDefault();
      tableInstance.setSorting((prev) => {
        const existing = prev.find((s) => s.id === colId);
        if (existing) {
          if (existing.desc) {
            return [];
          }
          return [{ id: colId, desc: true }];
        }
        return [{ id: colId, desc: false }];
      });
    });

    btn.addEventListener("keydown", ((e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" || ke.key === " ") {
        ke.preventDefault();
        (btn as HTMLElement).click();
      }
    }) as EventListener);
  });

  table.classList.add("sortable-ready");
}

export function initSortableTables(selector = "table[data-sortable]"): void {
  const tables = document.querySelectorAll(selector);
  tables.forEach((table) => {
    enhanceTable(table as HTMLTableElement);
  });
}
