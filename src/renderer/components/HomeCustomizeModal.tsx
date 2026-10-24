import { useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  Crown,
  GripVertical,
  History,
  Newspaper,
  PartyPopper,
  RotateCcw,
  Server,
  Shirt,
  Sparkles,
  type LucideIcon
} from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { Segmented } from '../ui/Segmented';
import { closeWithTransition } from '../ui/viewTransition';
import { DEFAULT_HOME, HOME_SECTIONS, RECENT_COUNTS, resolveHome, saveHome } from '../homeLayout';
import type { HomeSectionId } from '../../shared/types';

const ICONS: Record<HomeSectionId, LucideIcon> = {
  banner: PartyPopper,
  sztulagz: Crown,
  recent: History,
  servers: Server,
  stats: ChartColumn,
  skin: Shirt,
  launcher: Sparkles,
  minecraft: Newspaper
};

type Column = 'main' | 'side';
const COLUMNS: Array<{ id: Column; label: string; hint: string }> = [
  { id: 'main', label: 'Główna kolumna', hint: 'Szeroka, po lewej' },
  { id: 'side', label: 'Boczna kolumna', hint: 'Wąska, po prawej' }
];

/** Show/hide Home sections, reorder them (drag or arrows) and move them between columns. */
export function HomeCustomizeModal({ onClose }: { onClose: () => void }) {
  const saved = useStore((s) => s.settings?.home);
  const home = resolveHome(saved);
  const backdrop = useBackdropClose(onClose);
  const [dragging, setDragging] = useState<HomeSectionId | null>(null);
  const [drop, setDrop] = useState<{ col: Column; index: number } | null>(null);

  /** Puts `id` at `index` of `col` (index counted before removal from its old place). */
  const move = (id: HomeSectionId, col: Column, index: number) => {
    const next = { ...home, main: [...home.main], side: [...home.side] };
    for (const c of ['main', 'side'] as const) {
      const at = next[c].indexOf(id);
      if (at < 0) continue;
      next[c].splice(at, 1);
      if (c === col && at < index) index--;
    }
    next[col].splice(Math.max(0, Math.min(index, next[col].length)), 0, id);
    saveHome(next);
  };

  const toggle = (id: HomeSectionId, visible: boolean) => {
    const hidden = home.hidden.filter((h) => h !== id);
    saveHome({ ...home, hidden: visible ? hidden : [...hidden, id] });
  };

  const overRow = (e: DragEvent, col: Column, i: number) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
    if (drop?.col !== col || drop.index !== index) setDrop({ col, index });
  };

  const finish = () => {
    if (dragging && drop) move(dragging, drop.col, drop.index);
    setDragging(null);
    setDrop(null);
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal home-customize-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Dostosuj Start"
          subtitle="Wybierz, co widać na stronie Start. Przeciągnij sekcję, żeby zmienić jej miejsce."
          onClose={onClose}
        />

        <div className="home-customize-cols">
          {COLUMNS.map(({ id: col, label, hint }) => {
            const list = home[col];
            const other: Column = col === 'main' ? 'side' : 'main';
            return (
              <div className="home-customize-col" key={col}>
                <div className="home-customize-col-head">
                  <span>{label}</span>
                  <span className="text-faint">{hint}</span>
                </div>
                <div
                  className={`home-customize-list ${drop?.col === col && drop.index === list.length ? 'drop-end' : ''}`}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    if (drop?.col !== col || drop.index !== list.length) setDrop({ col, index: list.length });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    finish();
                  }}
                >
                  {list.length === 0 && <div className="home-customize-empty">Przeciągnij tu sekcję</div>}
                  {list.map((id, i) => {
                    const Icon = ICONS[id];
                    const visible = !home.hidden.includes(id);
                    const { label: name, description } = HOME_SECTIONS[id];
                    return (
                      <div
                        key={id}
                        className={[
                          'home-customize-row',
                          visible ? '' : 'off',
                          dragging === id ? 'dragging' : '',
                          drop?.col === col && drop.index === i ? 'drop-before' : ''
                        ].join(' ')}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', id);
                          setDragging(id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDrop(null);
                        }}
                        onDragOver={(e) => overRow(e, col, i)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          finish();
                        }}
                      >
                        <GripVertical size={16} className="home-customize-grip" />
                        <span className="home-customize-icon">
                          <Icon size={16} />
                        </span>
                        <span className="home-customize-text">
                          <span className="home-customize-name">{name}</span>
                          <span className="home-customize-desc">{description}</span>
                        </span>
                        <span className="home-customize-actions">
                          <button
                            className="ghost icon-btn"
                            title="Wyżej"
                            aria-label="Wyżej"
                            disabled={i === 0}
                            onClick={() => move(id, col, i - 1)}
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            className="ghost icon-btn"
                            title="Niżej"
                            aria-label="Niżej"
                            disabled={i === list.length - 1}
                            onClick={() => move(id, col, i + 2)}
                          >
                            <ChevronDown size={15} />
                          </button>
                          <button
                            className="ghost icon-btn"
                            title={col === 'main' ? 'Przenieś do bocznej kolumny' : 'Przenieś do głównej kolumny'}
                            aria-label={col === 'main' ? 'Przenieś do bocznej kolumny' : 'Przenieś do głównej kolumny'}
                            onClick={() => move(id, other, home[other].length)}
                          >
                            <ArrowLeftRight size={15} />
                          </button>
                        </span>
                        <label className="home-customize-switch" title={visible ? 'Ukryj' : 'Pokaż'}>
                          <input
                            type="checkbox"
                            className="toggle-input"
                            checked={visible}
                            onChange={(e) => toggle(id, e.target.checked)}
                            aria-label={name}
                          />
                          <span className="toggle-switch" aria-hidden />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="custom-field home-customize-recent">
          <label>Ostatnio grane — ile instancji</label>
          <Segmented
            value={String(home.recentCount)}
            options={RECENT_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => saveHome({ ...home, recentCount: Number(v) })}
          />
        </div>

        <div className="crash-footer">
          <button className="ghost" onClick={() => saveHome({ ...DEFAULT_HOME, main: [...DEFAULT_HOME.main], side: [...DEFAULT_HOME.side], hidden: [] })}>
            <RotateCcw size={15} /> Przywróć domyślne
          </button>
          <span className="crash-footer-gap" />
          <button className="primary" onClick={(e) => closeWithTransition(e.currentTarget, onClose)}>
            Gotowe
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
