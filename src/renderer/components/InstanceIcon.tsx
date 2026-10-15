import { Box, Spool, Anvil, Flame, type LucideIcon } from 'lucide-react';
import type { Instance, ModLoader } from '../../shared/types';

const LOADER_ICON: Record<ModLoader, LucideIcon> = {
  vanilla: Box,
  fabric: Spool,
  forge: Anvil,
  neoforge: Flame
};

/** Default glyph for instances without a custom icon. */
export function LoaderIcon({ loader }: { loader: ModLoader }) {
  const Icon = LOADER_ICON[loader] ?? Box;
  return <Icon className="loader-glyph" strokeWidth={2} />;
}

/** Shared-element name so the icon morphs between the card and the detail header. */
function instanceVtName(instance: Instance): string {
  return `inst-icon-${instance.id}`;
}

/** Renders an instance's icon (custom image, custom emoji, or the loader default). */
export function InstanceIcon({
  instance,
  className = '',
  morph = false
}: {
  instance: Instance;
  className?: string;
  /** Participate in the card ↔ detail view transition. */
  morph?: boolean;
}) {
  const custom = instance.icon?.trim();
  const isImage = !!custom && /^(data:|https?:|file:)/.test(custom);
  return (
    <div
      className={`instance-icon ${instance.loader} ${className}`}
      style={morph ? { viewTransitionName: instanceVtName(instance) } : undefined}
    >
      {custom ? (
        isImage ? (
          <img className="instance-icon-img" src={custom} alt="" />
        ) : (
          custom
        )
      ) : (
        <LoaderIcon loader={instance.loader} />
      )}
    </div>
  );
}
