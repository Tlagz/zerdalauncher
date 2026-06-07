import { useEffect, useRef } from 'react';
import { SkinViewer, IdleAnimation } from 'skinview3d';
import type { Account } from '../../shared/types';

/**
 * Interactive 3D skin viewer (drag to rotate) for the given account.
 * The skin texture is fetched in the main process and handed over as a data URL
 * to dodge any CORS/WebGL cross-origin issues.
 */
export function SkinView({ account, width = 220, height = 320 }: { account: Account; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewer: SkinViewer | null = null;
    let disposed = false;

    const id = account.type === 'microsoft' ? account.uuid : account.username;
    window.api.accounts.skin(id).then((skinUrl) => {
      if (disposed || !canvas || !skinUrl) return;
      viewer = new SkinViewer({ canvas, width, height, skin: skinUrl });
      viewer.animation = new IdleAnimation();
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.zoom = 0.85;
      viewer.fov = 38;
      viewer.autoRotate = false;
    });

    return () => {
      disposed = true;
      viewer?.dispose();
    };
  }, [account.uuid, account.username, account.type, width, height]);

  return <canvas ref={canvasRef} className="skin-canvas" />;
}
