import { useRef, useState } from 'react';
import {
  Palette,
  ImageIcon,
  Sparkles,
  LayoutTemplate,
  RotateCcw,
  Upload,
  Trash2,
  Waves,
  Square,
  Pipette,
  Check,
  Bookmark,
  BookmarkPlus,
  Download,
  Share2
} from 'lucide-react';
import { useStore } from '../store';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { alertDialog, confirmDialog, showToast } from '../ui/feedback';
import {
  DEFAULT_APPEARANCE,
  BUILTIN_PRESETS,
  PRESET_KEYS,
  pickLook,
  resolveAppearance,
  type Appearance,
  type ThemePreset
} from '../../shared/appearance';

const THEMES = [
  { id: 'default', label: 'Domyślny', desc: 'Fiolet + cyan' },
  { id: 'dark', label: 'Ciemny', desc: 'Czarny + stal' },
  { id: 'crimson', label: 'Crimson', desc: 'Czerwień + czerń' },
  { id: 'light', label: 'Jasny', desc: 'Dzienny' }
];

/** Preset previews: each theme's own accent and base color. */
const THEME_ACCENT: Record<string, string> = { default: '#8b5cf6', dark: '#5b7bb0', crimson: '#ef4444', light: '#6366f1' };
const THEME_BASE: Record<string, string> = { default: '#1e1b4b', dark: '#08090d', crimson: '#0c0708', light: '#eef0f7' };

const ACCENTS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899'];

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  onCommit
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  /** Fired when the drag ends (for settings that shouldn't apply mid-drag). */
  onCommit?: () => void;
}) {
  return (
    <div className="custom-field">
      <label>
        {label}: <span className="custom-value">{value}{unit}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  );
}

export function CustomizePage() {
  const settings = useStore((s) => s.settings);
  const backgroundImage = useStore((s) => s.backgroundImage);
  const ap = resolveAppearance(settings?.appearance);
  const saveTimer = useRef<number>();
  // The zoom is applied on release: changing it mid-drag moves the slider under the cursor.
  const [scaleDraft, setScaleDraft] = useState<number | null>(null);

  /** Update the store right away (App re-applies the look) and persist shortly after. */
  const update = (patch: Partial<Appearance>, theme?: string) => {
    const s = useStore.getState().settings;
    if (!s) return;
    const next = {
      ...s,
      theme: theme ?? s.theme,
      appearance: { ...resolveAppearance(s.appearance), ...patch }
    };
    useStore.setState({ settings: next });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () => window.api.settings.set({ theme: next.theme, appearance: next.appearance }),
      350
    );
  };

  const pickImage = async () => {
    try {
      const img = await window.api.appearance.pickBackground();
      if (!img) return;
      useStore.setState({ backgroundImage: img });
      update({ background: 'image' });
    } catch (e) {
      alertDialog({ title: 'Nie udało się ustawić tła', message: (e as Error).message, tone: 'error' });
    }
  };

  const removeImage = async () => {
    await window.api.appearance.clearBackground();
    useStore.setState({ backgroundImage: null });
    if (ap.background === 'image') update({ background: 'aurora' });
  };

  const resetAll = async () => {
    const ok = await confirmDialog({
      title: 'Przywrócić domyślny wygląd?',
      message: 'Motyw, kolor akcentu, tło, animacje i układ wrócą do ustawień domyślnych.',
      confirmLabel: 'Przywróć'
    });
    if (ok) update({ ...DEFAULT_APPEARANCE }, 'default');
  };

  // ---------- theme presets ----------
  const [naming, setNaming] = useState<string | null>(null);
  const userPresets = settings?.themePresets ?? [];
  const savePresets = (themePresets: ThemePreset[]) => {
    const s = useStore.getState().settings;
    if (!s) return;
    useStore.setState({ settings: { ...s, themePresets } });
    void window.api.settings.set({ themePresets });
  };
  const applyPreset = (p: Pick<ThemePreset, 'theme' | 'look'>, image = backgroundImage) =>
    update({ ...p.look, background: p.look.background === 'image' && !image ? 'aurora' : p.look.background }, p.theme);
  const isActive = (p: ThemePreset) =>
    p.theme === (settings?.theme || 'default') && PRESET_KEYS.every((k) => p.look[k] === ap[k]);
  const saveCurrent = () => {
    const name = naming?.trim();
    if (!name) return;
    savePresets([...userPresets, { id: `p-${Date.now()}`, name, theme: settings?.theme || 'default', look: pickLook(ap) }]);
    setNaming(null);
    showToast(`Zapisano motyw „${name}”.`, 'success');
  };
  const removePreset = async (p: ThemePreset) => {
    const ok = await confirmDialog({ title: 'Usunąć motyw?', message: `„${p.name}" zniknie z listy.`, danger: true, confirmLabel: 'Usuń' });
    if (ok) savePresets(userPresets.filter((x) => x.id !== p.id));
  };
  const exportPreset = async (p: ThemePreset) => {
    try {
      const withImage = p.look.background === 'image' && !!backgroundImage;
      const dest = await window.api.appearance.exportPreset({ name: p.name, theme: p.theme, look: p.look }, withImage);
      if (dest) showToast(`Wyeksportowano motyw:\n${dest}`, 'success');
    } catch (e) {
      alertDialog({ title: 'Eksport nie powiódł się', message: (e as Error).message, tone: 'error' });
    }
  };
  const importPreset = async () => {
    try {
      const res = await window.api.appearance.importPreset();
      if (!res) return;
      if (res.backgroundImage) useStore.setState({ backgroundImage: res.backgroundImage });
      const preset: ThemePreset = {
        id: `p-${Date.now()}`,
        name: res.name || 'Zaimportowany',
        theme: THEMES.some((t) => t.id === res.theme) ? res.theme : 'default',
        // Fill gaps from the defaults and drop unknown keys.
        look: pickLook(resolveAppearance(res.look))
      };
      savePresets([...userPresets, preset]);
      applyPreset(preset, res.backgroundImage ?? backgroundImage);
      showToast(`Zaimportowano motyw „${preset.name}”.`, 'success');
    } catch (e) {
      alertDialog({ title: 'Import nie powiódł się', message: (e as Error).message, tone: 'error' });
    }
  };

  if (!settings) return null;
  const theme = settings.theme || 'default';

  const presetCard = (p: ThemePreset, own: boolean) => (
    <div className={`preset-card ${isActive(p) ? 'active' : ''}`} key={p.id}>
      <button type="button" className="preset-apply" onClick={() => applyPreset(p)} title={`Zastosuj „${p.name}”`}>
        <span
          className="preset-swatch"
          style={{
            background: `linear-gradient(135deg, ${p.look.accent ?? THEME_ACCENT[p.theme] ?? '#8b5cf6'}, ${THEME_BASE[p.theme] ?? '#0b0d17'} 72%)`
          }}
        >
          {isActive(p) && <Check size={16} />}
        </span>
        <span className="preset-name truncate">{p.name}</span>
      </button>
      <div className="preset-actions">
        <button type="button" className="ghost icon-btn" title="Eksportuj do pliku" onClick={() => exportPreset(p)}>
          <Share2 size={14} />
        </button>
        {own && (
          <button type="button" className="ghost icon-btn" title="Usuń" onClick={() => removePreset(p)}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Personalizacja</div>
          <div className="page-subtitle">Zmiany widać od razu i zapisują się automatycznie</div>
        </div>
        <button className="ghost" onClick={resetAll}>
          <RotateCcw size={16} /> Przywróć domyślne
        </button>
      </div>

      <div className="section">
        <h3>
          <Bookmark size={16} /> Moje motywy
        </h3>
        <div className="preset-grid">
          {BUILTIN_PRESETS.map((p) => presetCard(p, false))}
          {userPresets.map((p) => presetCard(p, true))}
        </div>
        {naming === null ? (
          <div className="preset-toolbar">
            <button type="button" onClick={() => setNaming('')}>
              <BookmarkPlus size={15} /> Zapisz obecny wygląd
            </button>
            <button type="button" className="ghost" onClick={importPreset}>
              <Download size={15} /> Importuj z pliku
            </button>
          </div>
        ) : (
          <form
            className="preset-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrent();
            }}
          >
            <input
              autoFocus
              value={naming}
              maxLength={40}
              placeholder="Nazwa motywu"
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
            />
            <button type="submit" className="primary" disabled={!naming.trim()}>
              <Check size={15} /> Zapisz
            </button>
            <button type="button" className="ghost" onClick={() => setNaming(null)}>
              Anuluj
            </button>
          </form>
        )}
        <div className="field-hint">
          Motyw zapamiętuje kolory, tło i efekt szkła. Skala, pasek boczny i animacje zostają bez zmian. Wyeksportowany
          plik .zerdatheme możesz wysłać znajomym.
        </div>
      </div>

      <div className="section">
        <h3>
          <Palette size={16} /> Kolory i motyw
        </h3>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`theme-card theme-${t.id} ${theme === t.id ? 'active' : ''}`}
              onClick={() => update({}, t.id)}
            >
              <span className="theme-swatch" />
              <span className="theme-name">{t.label}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>

        <label className="custom-subtitle">Kolor akcentu</label>
        <div className="accent-row">
          <button
            type="button"
            className={`accent-default ${ap.accent === null ? 'active' : ''}`}
            onClick={() => update({ accent: null })}
          >
            {ap.accent === null && <Check size={14} />} Z motywu
          </button>
          {ACCENTS.map((c) => (
            <button
              type="button"
              key={c}
              title={c}
              className={`accent-swatch ${ap.accent === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => update({ accent: c })}
            >
              {ap.accent === c && <Check size={14} />}
            </button>
          ))}
          <label className="accent-custom" title="Własny kolor">
            <Pipette size={15} />
            <input
              type="color"
              value={ap.accent ?? '#8b5cf6'}
              onChange={(e) => update({ accent: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="section">
        <h3>
          <ImageIcon size={16} /> Tło
        </h3>
        <Segmented
          value={ap.background}
          onChange={(background) => (background === 'image' && !backgroundImage ? pickImage() : update({ background }))}
          options={[
            { value: 'aurora', label: 'Aurora', icon: Waves },
            { value: 'image', label: 'Własny obraz', icon: ImageIcon },
            { value: 'solid', label: 'Jednolite', icon: Square }
          ]}
        />
        {ap.background === 'aurora' && (
          <Slider
            label="Intensywność aurory"
            value={ap.auroraIntensity}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(auroraIntensity) => update({ auroraIntensity })}
          />
        )}
        {ap.background === 'image' && (
          <div className="bg-settings">
            {backgroundImage && (
              <div className="bg-preview" style={{ backgroundImage: `url("${backgroundImage}")` }} />
            )}
            <div className="bg-controls">
              <div className="data-actions">
                <button onClick={pickImage}>
                  <Upload size={15} /> Zmień obraz…
                </button>
                <button className="ghost" onClick={removeImage}>
                  <Trash2 size={15} /> Usuń
                </button>
              </div>
              <Slider
                label="Rozmycie"
                value={ap.imageBlur}
                min={0}
                max={20}
                unit=" px"
                onChange={(imageBlur) => update({ imageBlur })}
              />
              <Slider
                label="Przyciemnienie"
                value={ap.imageDim}
                min={0}
                max={85}
                step={5}
                unit="%"
                onChange={(imageDim) => update({ imageDim })}
              />
            </div>
          </div>
        )}
        {ap.background === 'solid' && <div className="field-hint">Jednolity kolor tła z wybranego motywu.</div>}
      </div>

      <div className="section">
        <h3>
          <Sparkles size={16} /> Animacje i efekty
        </h3>
        <Segmented
          value={ap.motion}
          onChange={(motion) => update({ motion })}
          options={[
            { value: 'full', label: 'Pełne' },
            { value: 'reduced', label: 'Ograniczone' },
            { value: 'off', label: 'Wyłączone' }
          ]}
        />
        <div className="field-hint">
          {ap.motion === 'full'
            ? 'Wszystkie animacje: przejścia stron, ruchome tło, kaskady kart.'
            : ap.motion === 'reduced'
              ? 'Bez ciągłych animacji tła i kaskad — zostają tylko szybkie przejścia.'
              : 'Bez animacji — wszystko zmienia się od razu.'}
        </div>
        <Toggle
          checked={ap.cursorFx}
          onChange={(cursorFx) => update({ cursorFx })}
          label="Efekty kursora na kartach"
          description="Przechylanie kart i świetlna plama podążająca za myszką"
        />
        <Slider
          label="Efekt szkła (rozmycie paneli)"
          value={ap.glass}
          min={0}
          max={150}
          step={10}
          unit="%"
          onChange={(glass) => update({ glass })}
        />
      </div>

      <div className="section">
        <h3>
          <LayoutTemplate size={16} /> Układ i rozmiar
        </h3>
        <Slider
          label="Skala interfejsu"
          value={scaleDraft ?? ap.scale}
          min={80}
          max={125}
          step={5}
          unit="%"
          onChange={setScaleDraft}
          onCommit={() => {
            if (scaleDraft !== null) update({ scale: scaleDraft });
            setScaleDraft(null);
          }}
        />
        <label className="custom-subtitle">Zaokrąglenie rogów</label>
        <Segmented
          value={ap.radius}
          onChange={(radius) => update({ radius })}
          options={[
            { value: 'sharp', label: 'Ostre' },
            { value: 'normal', label: 'Średnie' },
            { value: 'round', label: 'Mocne' }
          ]}
        />
        <Toggle
          checked={ap.compactSidebar}
          onChange={(compactSidebar) => update({ compactSidebar })}
          label="Kompaktowy pasek boczny"
          description="Same ikony zamiast nazw — więcej miejsca na treść"
        />
      </div>
    </>
  );
}
