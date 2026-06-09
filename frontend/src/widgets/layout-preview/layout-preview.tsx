import type { TableLayout, VenueHall, VenueTable } from "@/entities/venue/model/types";

type LayoutPreviewProps = {
  hall: VenueHall;
  selectedTableId?: number | null;
  interactive?: boolean;
  onTableSelect?: (table: VenueTable) => void;
};

function buildLayout(hall: VenueHall): TableLayout | null {
  if (!hall.layout) {
    return null;
  }
  return hall.layout;
}

function getOccupancyClass(table?: VenueTable): string {
  const state = table?.occupancy?.state ?? "free";
  if (state === "occupied") return "layout-table-state-occupied";
  if (state === "held_by_you") return "layout-table-state-held";
  return "layout-table-state-free";
}

function getOccupancyLabel(table?: VenueTable): string {
  return table?.occupancy?.label ?? "Свободен";
}

export function LayoutPreview({ hall, selectedTableId = null, interactive = false, onTableSelect }: LayoutPreviewProps) {
  const layout = buildLayout(hall);

  if (!layout || layout.items.length === 0) {
    return <div className="muted-block">Схема зала ещё не настроена.</div>;
  }

  return (
    <div className="layout-preview-wrapper">
      <div className="layout-preview" style={{ width: layout.canvas_width, height: layout.canvas_height }}>
        <div className="layout-grid-overlay" />
        {(layout.decor_items ?? []).map((item) => (
          <div
            key={item.id}
            className={`layout-decor layout-decor-${item.item_type}`}
            style={{
              left: item.x,
              top: item.y,
              width: item.width,
              height: item.height,
              transform: `rotate(${item.rotation}deg)`,
            }}
          >
            {item.label || item.item_type}
          </div>
        ))}
        {layout.items.map((item) => {
          const table = hall.tables.find((candidate) => candidate.id === item.table);
          const isSelected = selectedTableId === item.table;
          const isOccupied = table?.occupancy?.state === "occupied" || table?.occupancy?.state === "held_by_you";
          return (
            <button
              key={item.table}
              type="button"
              className={`layout-table layout-table-preview ${getOccupancyClass(table)}${isSelected ? " layout-table-selected" : ""}${interactive ? " layout-table-clickable" : ""}`}
              disabled={!interactive || !table || isOccupied}
              onClick={() => table && onTableSelect?.(table)}
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                transform: `rotate(${item.rotation}deg)`,
              }}
            >
              <strong>{table?.name ?? `Стол #${item.table}`}</strong>
              <span>{table?.seats_count ?? 0} мест</span>
              <small>{getOccupancyLabel(table)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
