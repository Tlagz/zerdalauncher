import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, House, User, MapPinned, Crosshair } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { Segmented } from '../ui/Segmented';
import type { MapDimension, MapInfo, MapTarget } from '../../shared/types';

const REGION = 512;
const MIN_ZOOM = 1 / 8;
const MAX_ZOOM = 8;
const DIM_LABEL: Record<MapDimension, string> = { overworld: 'Overworld', nether: 'Nether', end: 'End' };

/** Top-down map of a world, rendered from its region files (pan with drag, zoom with the wheel). */
export function WorldMapModal({ target, title, onClose }: { target: MapTarget; title: string; onClose: () => void }) {
  const [info, setInfo] = useState<MapInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dim, setDim] = useState<MapDimension>('overworld');
  const [view, setView] = useState({ x: 0, z: 0, zoom: 1 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vz: number } | null>(null);
  const version = useMemo(() => Date.now(), []);
  const backdrop = useBackdropClose(onClose);

  const regions = info?.dims[dim] ?? [];

  const centerOn = (x: number, z: number, zoom = view.zoom) => setView({ x, z, zoom });
  const fit = (m: MapInfo, d: MapDimension) => {
    if (m.player?.dim === d) return centerOn(m.player.x, m.player.z, 1);
    if (d === 'overworld' && m.spawn) return centerOn(m.spawn.x, m.spawn.z, 1);
    const rs = m.dims[d] ?? [];
    if (!rs.length) return;
    const avg = (i: 0 | 1) => (rs.reduce((s, r) => s + r[i], 0) / rs.length + 0.5) * REGION;
    centerOn(avg(0), avg(1), 0.5);
  };

  useEffect(() => {
    window.api.map.open(target).then(
      (m) => {
        setInfo(m);
        const first = (['overworld', 'nether', 'end'] as const).find((d) => m.dims[d]?.length) ?? 'overworld';
        const start = m.player?.dim && m.dims[m.player.dim]?.length ? m.player.dim : first;
        setDim(start);
        fit(m, start);
      },
      (e) => setError((e as Error).message)
    );
  }, []);

  // Track the stage size for culling and centering.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [info]);

  const toScreen = (bx: number, bz: number) => ({
    left: (bx - view.x) * view.zoom + size.w / 2,
    top: (bz - view.z) * view.zoom + size.h / 2
  });
  const toBlock = (sx: number, sy: number) => ({
    x: Math.floor((sx - size.w / 2) / view.zoom + view.x),
    z: Math.floor((sy - size.h / 2) / view.zoom + view.z)
  });

  // Regions intersecting the viewport.
  const visible = regions.filter(([rx, rz]) => {
    const { left, top } = toScreen(rx * REGION, rz * REGION);
    const s = REGION * view.zoom;
    return left + s > 0 && top + s > 0 && left < size.w && top < size.h;
  });

  const zoomAt = (factor: number, sx = size.w / 2, sy = size.h / 2) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      // Keep the block under the cursor in place.
      const bx = (sx - size.w / 2) / v.zoom + v.x;
      const bz = (sy - size.h / 2) / v.zoom + v.z;
      return { zoom, x: bx - (sx - size.w / 2) / zoom, z: bz - (sy - size.h / 2) / zoom };
    });
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const marker = (x: number, z: number, cls: string, label: string, Icon: typeof House) => {
    const p = toScreen(x + 0.5, z + 0.5);
    if (p.left < -40 || p.top < -40 || p.left > size.w + 40 || p.top > size.h + 40) return null;
    return (
      <div className={`map-marker ${cls}`} style={{ left: p.left, top: p.top }} title={`${label} · X ${x}, Z ${z}`}>
        <Icon size={14} />
        <span>{label}</span>
      </div>
    );
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal map-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={
            <span className="crash-title">
              <MapPinned size={20} /> Mapa — {title}
            </span>
          }
          subtitle={info ? `${info.name} · ${regions.length} ${regions.length === 1 ? 'region' : 'regionów'}` : 'Wczytuję świat…'}
          onClose={onClose}
        />
        {error && <div className="error">{error}</div>}
        {info && !Object.keys(info.dims).length && (
          <div className="mod-empty">Ten świat nie ma jeszcze wygenerowanego terenu.</div>
        )}
        {info && Object.keys(info.dims).length > 0 && (
          <>
            <div className="map-toolbar">
              {Object.keys(info.dims).length > 1 && (
                <Segmented
                  value={dim}
                  onChange={(d) => {
                    setDim(d);
                    fit(info, d);
                  }}
                  options={(['overworld', 'nether', 'end'] as const)
                    .filter((d) => info.dims[d]?.length)
                    .map((d) => ({ value: d, label: DIM_LABEL[d] }))}
                />
              )}
              <span className="crash-footer-gap" />
              {info.spawn && dim === 'overworld' && (
                <button className="ghost btn-sm" onClick={() => centerOn(info.spawn!.x, info.spawn!.z)}>
                  <House size={14} /> Spawn
                </button>
              )}
              {info.player?.dim === dim && (
                <button className="ghost btn-sm" onClick={() => centerOn(info.player!.x, info.player!.z)}>
                  <User size={14} /> Gracz
                </button>
              )}
              <button className="ghost icon-btn" onClick={() => zoomAt(1 / 1.5)} title="Oddal" disabled={view.zoom <= MIN_ZOOM}>
                <Minus size={16} />
              </button>
              <span className="map-zoom">{view.zoom >= 1 ? `${view.zoom.toFixed(view.zoom % 1 ? 1 : 0)}×` : `1:${Math.round(1 / view.zoom)}`}</span>
              <button className="ghost icon-btn" onClick={() => zoomAt(1.5)} title="Przybliż" disabled={view.zoom >= MAX_ZOOM}>
                <Plus size={16} />
              </button>
            </div>

            <div
              ref={stage}
              className={`map-stage ${dragging ? 'dragging' : ''} ${view.zoom >= 2 ? 'pixelated' : ''}`}
              onWheel={(e) => {
                const { sx, sy } = local(e);
                zoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, sx, sy);
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z };
                setDragging(true);
              }}
              onPointerMove={(e) => {
                const { sx, sy } = local(e);
                setCursor(toBlock(sx, sy));
                const d = drag.current;
                if (d) setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) / v.zoom, z: d.vz - (e.clientY - d.y) / v.zoom }));
              }}
              onPointerUp={() => {
                drag.current = null;
                setDragging(false);
              }}
              onPointerLeave={() => setCursor(null)}
              onDoubleClick={(e) => {
                const { sx, sy } = local(e);
                zoomAt(2, sx, sy);
              }}
            >
              {visible.map(([rx, rz]) => {
                const p = toScreen(rx * REGION, rz * REGION);
                return (
                  <img
                    key={`${dim}:${rx}:${rz}`}
                    className="map-tile"
                    src={window.api.map.tileUrl(info.token, dim, rx, rz, version)}
                    alt=""
                    draggable={false}
                    style={{ left: p.left, top: p.top, width: REGION * view.zoom, height: REGION * view.zoom }}
                    onLoad={(e) => e.currentTarget.classList.add('loaded')}
                    onError={(e) => e.currentTarget.classList.add('loaded')}
                  />
                );
              })}
              {dim === 'overworld' && info.spawn && marker(info.spawn.x, info.spawn.z, 'spawn', 'Spawn', House)}
              {info.player?.dim === dim && marker(info.player.x, info.player.z, 'player', 'Gracz', User)}
              <div className="map-hud">
                {cursor ? (
                  <>
                    <Crosshair size={13} /> X {cursor.x} · Z {cursor.z}
                  </>
                ) : (
                  'Przeciągnij, aby przesunąć · kółko myszy przybliża'
                )}
              </div>
            </div>
            <div className="field-hint">
              Mapa rysuje się z plików świata; pierwszy podgląd dużego świata trwa chwilę, potem kafelki są zapamiętane.
              Zmienione regiony odświeżają się same przy następnym otwarciu.
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
