import { filter, map, get, initial, last, reduce } from "lodash";
import React, { useMemo, useState, useEffect } from "react";
import Table from "antd/lib/table";
import Input from "antd/lib/input";
import InfoCircleFilledIcon from "@ant-design/icons/InfoCircleFilled";
import Popover from "antd/lib/popover";
import { RendererPropTypes } from "@/visualizations/prop-types";

import { prepareColumns, initRows, filterRows, sortRows } from "./utils";

import "./renderer.less";

function joinColumns(array: any, separator = ", ") {
  return reduce(
    array,
    (result, item, index) => {
      // @ts-expect-error ts-migrate(2365) FIXME: Operator '>' cannot be applied to types 'string' a... Remove this comment to see the full error message
      if (index > 0) {
        // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        result.push(separator);
      }
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
      result.push(item);
      return result;
    },
    []
  );
}

function getSearchColumns(columns: any, { limit = Infinity, renderColumn = (col: any) => col.title } = {}) {
  const firstColumns = map(columns.slice(0, limit), (col) => renderColumn(col));
  const restColumns = map(columns.slice(limit), (col) => col.title);
  if (restColumns.length > 0) {
    return [...joinColumns(firstColumns), ` and ${restColumns.length} others`];
  }
  if (firstColumns.length > 1) {
    return [...joinColumns(initial(firstColumns)), ` and `, last(firstColumns)];
  }
  return firstColumns;
}

function SearchInputInfoIcon({ searchColumns }: any) {
  return (
    <Popover
      arrowPointAtCenter
      placement="topRight"
      content={
        <div className="table-visualization-search-info-content">
          Search {getSearchColumns(searchColumns, { renderColumn: (col) => <code key={col.name}>{col.title}</code> })}
        </div>
      }>
      <InfoCircleFilledIcon className="table-visualization-search-info-icon" />
    </Popover>
  );
}

function SearchInput({ searchColumns, ...props }: any) {
  if (!searchColumns || searchColumns.length <= 0) return null;

  const searchColumnsLimit = 3;
  return (
    <Input.Search
      {...props}
      placeholder={`Search ${getSearchColumns(searchColumns, { limit: searchColumnsLimit }).join("")}...`}
      suffix={searchColumns.length > searchColumnsLimit ? <SearchInputInfoIcon searchColumns={searchColumns} /> : null}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* ColumnFilterInput: keeps its own focus and updates filters live */
/* -------------------------------------------------------------------------- */
const ColumnFilterInput = React.memo(function ColumnFilterInput({
  colKey,
  value,
  onChange,
}: {
  colKey: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{ padding: 8, minWidth: 200 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}>
      <Input
        placeholder={`Filter`}
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e.target.value);
        }}
        allowClear
        autoFocus
        onFocus={(e) => (e.target as HTMLInputElement).select()}
      />
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Main Renderer */
/* -------------------------------------------------------------------------- */

export default function Renderer({ options, data }: any) {
  const [searchTerm, setSearchTerm] = useState("");
  const [orderBy, setOrderBy] = useState([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const searchColumns = useMemo(() => filter(options.columns, "allowSearch"), [options.columns]);

  const tableColumns = useMemo(() => {
    const searchInput =
      searchColumns?.length > 0 ? (
        <SearchInput searchColumns={searchColumns} onChange={(event: any) => setSearchTerm(event.target.value)} />
      ) : null;

    return prepareColumns(options.columns, searchInput, orderBy, (newOrderBy: any) => {
      setOrderBy(newOrderBy);
      document.getSelection()?.removeAllRanges();
    });
  }, [options.columns, searchColumns, orderBy]);

  /* -------------------------------------------------------------------------- */
  /* Enhanced columns with popover filter per column */
  /* -------------------------------------------------------------------------- */

  const enhancedColumns = useMemo(() => {
    if (!Array.isArray(tableColumns) || tableColumns.length === 0) {
      return [];
    }
    const lastIndex = tableColumns.length - 1;

    return tableColumns.map((col: any, index: number) => {
      // don't enhance the last (dummy) column — keep it as-is
      if (index === lastIndex) {
        return col;
      }

      const colKey = String(col.dataIndex ?? col.key ?? col.name ?? col.title);

      const handleFilterChange = (value: string) => {
        setColumnFilters((prev) => {
          const next = { ...prev, [colKey]: value };
          if (!next[colKey]) delete next[colKey];
          return next;
        });
      };

      const isActive = !!columnFilters[colKey];

      return {
        ...col,
        title: (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}>
            <span>{col.title}</span>
            <Popover
              arrowPointAtCenter
              placement="bottomRight"
              trigger="click"
              content={
                <ColumnFilterInput colKey={colKey} value={columnFilters[colKey] || ""} onChange={handleFilterChange} />
              }>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                }}
                onClick={(e) => e.stopPropagation()}>
                <i
                  className="fa fa-filter"
                  style={{
                    color: isActive ? "#1890ff" : "rgba(0,0,0,0.45)",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                  aria-hidden="true"
                />
              </div>
            </Popover>
          </div>
        ),
      };
    });
  }, [tableColumns, columnFilters]);

  /* -------------------------------------------------------------------------- */
  /* Filter + Sort Rows */
  /* -------------------------------------------------------------------------- */

  const preparedRows = useMemo(() => {
    let rows = initRows(data.rows);
    if (searchTerm) rows = filterRows(rows, searchTerm, searchColumns);

    const activeFilterKeys = Object.keys(columnFilters).filter((k) => columnFilters[k]);
    if (activeFilterKeys.length > 0) {
      rows = rows.filter((row: any) =>
        activeFilterKeys.every((key) => {
          const cell = get(row, key, "");
          return String(cell).toLowerCase().includes(String(columnFilters[key]).toLowerCase());
        })
      );
    }

    return sortRows(rows, orderBy);
  }, [data.rows, searchTerm, searchColumns, orderBy, columnFilters]);

  useEffect(() => {
    setOrderBy([]);
    setColumnFilters({});
  }, [options.columns, data.columns]);

  if (!data?.rows?.length) return null;

  return (
    <div className="table-visualization-container">
      <Table
        className="table-fixed-header"
        data-percy="show-scrollbars"
        data-test="TableVisualization"
        columns={enhancedColumns}
        dataSource={preparedRows}
        pagination={{
          size: get(options, "paginationSize", ""),
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'TablePagi... Remove this comment to see the full error message
          position: "bottom",
          pageSize: options.itemsPerPage,
          hideOnSinglePage: true,
          showSizeChanger: false,
        }}
        showSorterTooltip={false}
      />
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
