import { useEffect, useRef } from 'react';

/** Pixel-art face crop (head + hat overlay) drawn from a skin PNG data URL. */
export function SkinFace({
  src,
  size = 76,
  className = 'skin-face'
}: {
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !src) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size); // base face
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size); // hat layer
    };
    img.src = src;
  }, [src, size]);
  return <canvas ref={ref} width={size} height={size} className={className} />;
}
