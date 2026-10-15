import { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WaveAnimation } from 'skinview3d';
import type { Account } from '../../shared/types';

/**
 * Interactive 3D skin viewer (drag to rotate) for the given account; the
 * character waves while hovered. The skin texture is fetched in the main
 * process and handed over as a data URL to dodge CORS/WebGL cross-origin issues.
 */
export function SkinView({ account, width = 220, height = 320 }: { account: Account; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setLoaded(false);

    window.api.accounts.skin(account.id).then((skinUrl) => {
      if (disposed || !canvas || !skinUrl) return;
      const viewer = new SkinViewer({ canvas, width, height, skin: skinUrl });
      viewer.animation = new IdleAnimation();
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.zoom = 0.85;
      viewer.fov = 38;
      viewer.autoRotate = false;
      viewerRef.current = viewer;
      setLoaded(true);
    });

    return () => {
      disposed = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [account.id, account.skinId, width, height]);

  const wave = () => {
    const v = viewerRef.current;
    if (v && !(v.animation instanceof WaveAnimation)) v.animation = new WaveAnimation();
  };
  const rest = () => {
    const v = viewerRef.current;
    if (v) v.animation = new IdleAnimation();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`skin-canvas ${loaded ? 'loaded' : ''}`}
      onPointerEnter={wave}
      onPointerLeave={rest}
    />
  );
}
