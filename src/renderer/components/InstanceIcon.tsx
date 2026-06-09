import type { Instance, ModLoader } from '../../shared/types';

export function loaderEmoji(loader: ModLoader): string {
  return loader === 'fabric' ? '🧵' : loader === 'forge' ? '⚙️' : loader === 'neoforge' ? '🔥' : '🧱';
}

/** Renders an instance's icon (custom image, custom emoji, or the loader default). */
export function InstanceIcon({ instance, className = '' }: { instance: Instance; className?: string }) {
  const custom = instance.icon?.trim();
  const isImage = !!custom && /^(data:|https?:|file:)/.test(custom);
  return (
    <div className={`instance-icon ${instance.loader} ${className}`}>
      {custom ? (
        isImage ? (
          <img className="instance-icon-img" src={custom} alt="" />
        ) : (
          custom
        )
      ) : (
        loaderEmoji(instance.loader)
      )}
    </div>
  );
}
