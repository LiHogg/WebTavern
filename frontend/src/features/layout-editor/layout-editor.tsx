"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TableLayout, VenueHall } from "@/entities/venue/model/types";

type LayoutEditorProps = {
  hall: VenueHall;
  saving?: boolean;
  onSave: (payload: LayoutSavePayload) => Promise<void>;
};

export type LayoutSaveItem = {
  table: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type LayoutSavePayload = {
  hall: number;
  canvas_width: number;
  canvas_height: number;
  is_active: boolean;
  items: LayoutSaveItem[];
};

type LocalLayoutItem = LayoutSaveItem & {
  tableName: string;
  seatsCount: number;
};

type DragState = {
  tableId: number;
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
};

const DEFAULT_TABLE_WIDTH = 124;
const DEFAULT_TABLE_HEIGHT = 88;
const CANVAS_MIN_WIDTH = 640;
const CANVAS_MIN_HEIGHT = 420;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildFallbackPosition(index: number) {
  const perRow = 4;
  const gapX = 150;
  const gapY = 120;
  return {
    x: 32 + (index % perRow) * gapX,
    y: 32 + Math.floor(index / perRow) * gapY,
  };
}

function buildLayoutState(hall: VenueHall): TableLayout {
  const existingLayout = hall.layout;
  const existingMap = new Map((existingLayout?.items ?? []).map((item) => [item.table, item]));
  return {
    id: existingLayout?.id ?? 0,
    hall: hall.id,
    canvas_width: Math.max(existingLayout?.canvas_width ?? 980, CANVAS_MIN_WIDTH),
    canvas_height: Math.max(existingLayout?.canvas_height ?? 620, CANVAS_MIN_HEIGHT),
    is_active: existingLayout?.is_active ?? true,
    items: hall.tables.map((table, index) => {
      const existingItem = existingMap.get(table.id);
      const fallback = buildFallbackPosition(index);
      return {
        table: table.id,
        x: existingItem?.x ?? fallback.x,
        y: existingItem?.y ?? fallback.y,
        width: existingItem?.width ?? DEFAULT_TABLE_WIDTH,
        height: existingItem?.height ?? DEFAULT_TABLE_HEIGHT,
        rotation: existingItem?.rotation ?? 0,
      };
    }),
  };
}

export function LayoutEditor({ hall, saving = false, onSave }: LayoutEditorProps) {
  const [layout, setLayout] = useState<TableLayout>(() => buildLayoutState(hall));
  const [selectedTableId, setSelectedTableId] = useState<number | null>(hall.tables[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    setLayout(buildLayoutState(hall));
    setSelectedTableId(hall.tables[0]?.id ?? null);
    setDirty(false);
    setLocalMessage(null);
  }, [hall]);

  const localItems: LocalLayoutItem[] = useMemo(
    () =>
      layout.items.map((item) => {
        const table = hall.tables.find((candidate) => candidate.id === item.table);
        return {
          ...item,
          tableName: table?.name ?? `Стол #${item.table}`,
          seatsCount: table?.seats_count ?? 0,
        };
      }),
    [hall.tables, layout.items],
  );

  const selectedItem = localItems.find((item) => item.table === selectedTableId) ?? null;

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }

      const deltaX = event.clientX - state.startClientX;
      const deltaY = event.clientY - state.startClientY;

      setLayout((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (item.table !== state.tableId) {
            return item;
          }
          const nextX = clamp(state.initialX + deltaX, 0, Math.max(current.canvas_width - item.width, 0));
          const nextY = clamp(state.initialY + deltaY, 0, Math.max(current.canvas_height - item.height, 0));
          return { ...item, x: nextX, y: nextY };
        }),
      }));
      setDirty(true);
      setLocalMessage(null);
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function patchItem(tableId: number, updater: (item: LayoutSaveItem) => LayoutSaveItem) {
    setLayout((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.table !== tableId) {
          return item;
        }
        const patched = updater(item);
        return {
          ...patched,
          width: clamp(patched.width, 40, current.canvas_width),
          height: clamp(patched.height, 40, current.canvas_height),
          x: clamp(patched.x, 0, Math.max(current.canvas_width - patched.width, 0)),
          y: clamp(patched.y, 0, Math.max(current.canvas_height - patched.height, 0)),
        };
      }),
    }));
    setDirty(true);
    setLocalMessage(null);
  }

  function updateCanvas<K extends "canvas_width" | "canvas_height">(key: K, value: number) {
    setLayout((current) => {
      const next = {
        ...current,
        [key]: key === "canvas_width" ? Math.max(value, CANVAS_MIN_WIDTH) : Math.max(value, CANVAS_MIN_HEIGHT),
      };
      return {
        ...next,
        items: next.items.map((item) => ({
          ...item,
          x: clamp(item.x, 0, Math.max(next.canvas_width - item.width, 0)),
          y: clamp(item.y, 0, Math.max(next.canvas_height - item.height, 0)),
        })),
      };
    });
    setDirty(true);
    setLocalMessage(null);
  }

  function autoArrange() {
    setLayout((current) => ({
      ...current,
      items: current.items.map((item, index) => {
        const fallback = buildFallbackPosition(index);
        return {
          ...item,
          x: clamp(fallback.x, 0, Math.max(current.canvas_width - item.width, 0)),
          y: clamp(fallback.y, 0, Math.max(current.canvas_height - item.height, 0)),
          rotation: 0,
        };
      }),
    }));
    setDirty(true);
    setLocalMessage("Столы автоматически выровнены по сетке.");
  }

  function resetLayout() {
    setLayout(buildLayoutState(hall));
    setSelectedTableId(hall.tables[0]?.id ?? null);
    setDirty(false);
    setLocalMessage("Схема возвращена к последнему сохранённому состоянию.");
  }

  async function handleSave() {
    await onSave({
      hall: hall.id,
      canvas_width: layout.canvas_width,
      canvas_height: layout.canvas_height,
      is_active: layout.is_active,
      items: layout.items,
    });
    setDirty(false);
    setLocalMessage("Схема зала сохранена.");
  }

  return (
    <div className="layout-editor-card stack-lg">
      <div className="toolbar-row">
        <div>
          <h3>Схема зала</h3>
          <p>Перетаскивай столы мышкой, меняй размеры и поворот, затем сохраняй расположение.</p>
        </div>
        <div className="layout-actions">
          <button className="button button-secondary" type="button" onClick={autoArrange} disabled={saving}>
            Авторасстановка
          </button>
          <button className="button button-secondary" type="button" onClick={resetLayout} disabled={saving}>
            Сбросить
          </button>
          <button className="button button-primary" type="button" onClick={handleSave} disabled={saving || !dirty}>
            Сохранить схему
          </button>
        </div>
      </div>

      <div className="grid grid-2 owner-grid-top">
        <div className="stack-sm">
          <div className="grid grid-3">
            <label className="field">
              <span>Ширина холста</span>
              <input
                type="number"
                min={CANVAS_MIN_WIDTH}
                step="20"
                value={layout.canvas_width}
                onChange={(event) => updateCanvas("canvas_width", Number(event.target.value || CANVAS_MIN_WIDTH))}
              />
            </label>
            <label className="field">
              <span>Высота холста</span>
              <input
                type="number"
                min={CANVAS_MIN_HEIGHT}
                step="20"
                value={layout.canvas_height}
                onChange={(event) => updateCanvas("canvas_height", Number(event.target.value || CANVAS_MIN_HEIGHT))}
              />
            </label>
            <label className="checkbox-field layout-active-toggle">
              <input
                type="checkbox"
                checked={layout.is_active}
                onChange={(event) => {
                  setLayout((current) => ({ ...current, is_active: event.target.checked }));
                  setDirty(true);
                }}
              />
              <span>Схема активна</span>
            </label>
          </div>

          <div className="layout-stage-wrapper">
            <div
              className="layout-stage"
              style={{ width: layout.canvas_width, height: layout.canvas_height }}
              role="application"
              aria-label={`Редактор схемы зала ${hall.name}`}
            >
              <div className="layout-grid-overlay" />
              {localItems.map((item) => (
                <button
                  key={item.table}
                  type="button"
                  className={`layout-table ${item.table === selectedTableId ? "layout-table-selected" : ""}`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    height: item.height,
                    transform: `rotate(${item.rotation}deg)`,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    dragStateRef.current = {
                      tableId: item.table,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      initialX: item.x,
                      initialY: item.y,
                    };
                    setSelectedTableId(item.table);
                  }}
                  onClick={() => setSelectedTableId(item.table)}
                >
                  <strong>{item.tableName}</strong>
                  <span>{item.seatsCount} мест</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="subcard stack-sm layout-sidebar">
          <div>
            <h4>Настройка выбранного стола</h4>
            <p>Выбери стол на схеме или в списке ниже, затем уточни его размеры и положение.</p>
          </div>

          {!selectedItem && <div className="muted-block">В этом зале пока нет столов для размещения.</div>}

          {selectedItem && (
            <>
              <div className="status-line">
                <span className="status-chip">{selectedItem.tableName}</span>
                <span className="status-chip muted-chip">{selectedItem.seatsCount} мест</span>
              </div>
              <div className="grid grid-2">
                <label className="field">
                  <span>X</span>
                  <input
                    type="number"
                    value={selectedItem.x}
                    onChange={(event) =>
                      patchItem(selectedItem.table, (current) => ({
                        ...current,
                        x: Number(event.target.value || 0),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Y</span>
                  <input
                    type="number"
                    value={selectedItem.y}
                    onChange={(event) =>
                      patchItem(selectedItem.table, (current) => ({
                        ...current,
                        y: Number(event.target.value || 0),
                      }))
                    }
                  />
                </label>
              </div>
              <div className="grid grid-2">
                <label className="field">
                  <span>Ширина</span>
                  <input
                    type="number"
                    min="40"
                    value={selectedItem.width}
                    onChange={(event) =>
                      patchItem(selectedItem.table, (current) => ({
                        ...current,
                        width: Number(event.target.value || DEFAULT_TABLE_WIDTH),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Высота</span>
                  <input
                    type="number"
                    min="40"
                    value={selectedItem.height}
                    onChange={(event) =>
                      patchItem(selectedItem.table, (current) => ({
                        ...current,
                        height: Number(event.target.value || DEFAULT_TABLE_HEIGHT),
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>Поворот</span>
                <input
                  type="number"
                  min="0"
                  max="359"
                  value={selectedItem.rotation}
                  onChange={(event) =>
                    patchItem(selectedItem.table, (current) => ({
                      ...current,
                      rotation: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
            </>
          )}

          <div className="layout-list stack-sm">
            {localItems.map((item) => (
              <button
                key={item.table}
                type="button"
                className={`layout-list-item ${item.table === selectedTableId ? "layout-list-item-selected" : ""}`}
                onClick={() => setSelectedTableId(item.table)}
              >
                <strong>{item.tableName}</strong>
                <span>
                  {item.x}×{item.y} · {item.width}×{item.height}
                </span>
              </button>
            ))}
          </div>

          {dirty && <span className="error-text">Есть несохранённые изменения.</span>}
          {localMessage && <span className="success-text">{localMessage}</span>}
        </aside>
      </div>
    </div>
  );
}
