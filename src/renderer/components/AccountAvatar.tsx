import { useEffect, useState } from 'react';
import { SkinFace } from './SkinFace';
import type { Account } from '../../shared/types';

/** Skin face of the account, falling back to its initial while loading / offline. */
export function AccountAvatar({ account, size = 38 }: { account: Account; size?: number }) {
  const [skin, setSkin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.accounts.skin(account.id).then((s) => !cancelled && setSkin(s));
    return () => {
      cancelled = true;
    };
  }, [account.id, account.skinId]);

  return skin ? (
    <SkinFace src={skin} size={size} className="avatar avatar-skin" />
  ) : (
    <div className="avatar">{account.username.charAt(0).toUpperCase()}</div>
  );
}
