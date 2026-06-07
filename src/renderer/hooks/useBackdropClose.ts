import { useRef } from 'react';
import type { MouseEvent } from 'react';

/**
 * Returns props for a modal backdrop that only triggers `onClose` when the
 * pointer is BOTH pressed and released on the backdrop itself. This prevents the
 * modal from closing when a click starts inside the dialog (e.g. on a search
 * field) and ends on the backdrop because the content reflowed underneath the
 * cursor — which previously made inputs feel "unclickable".
 */
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      downOnBackdrop.current = false;
    }
  };
}
