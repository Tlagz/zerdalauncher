import { BrowserWindow } from 'electron';
import fetch from 'node-fetch';
import type { Account } from '../../shared/types';

// Default Azure client ID. Replace with your own — see README.md.
// "00000000402b5328" is Mojang's public client ID; works for Minecraft login flows.
const CLIENT_ID = process.env.MS_CLIENT_ID || '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'XboxLive.signin offline_access';

interface XblResponse {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string }> };
}

interface MinecraftAuthResponse {
  access_token: string;
  expires_in: number;
  username: string;
}

interface MinecraftProfileResponse {
  id: string;
  name: string;
}

interface MsTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function microsoftLogin(parent?: BrowserWindow): Promise<Account> {
  const code = await openAuthWindow(parent);
  const msToken = await exchangeCodeForToken(code);
  return finishLogin(msToken);
}

export async function refreshMicrosoft(refreshToken: string): Promise<Account> {
  const res = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: REDIRECT_URI
    }).toString()
  });
  if (!res.ok) throw new Error('Nie udało się odświeżyć tokenu MS: ' + (await res.text()));
  const msToken = (await res.json()) as MsTokenResponse;
  return finishLogin(msToken);
}

async function finishLogin(msToken: MsTokenResponse): Promise<Account> {
  const xbl = await authXboxLive(msToken.access_token);
  const xsts = await authXsts(xbl.Token);
  const uhs = xsts.DisplayClaims.xui[0].uhs;
  const mc = await authMinecraft(uhs, xsts.Token);
  await verifyOwnership(mc.access_token);
  const profile = await getMinecraftProfile(mc.access_token);

  return {
    id: profile.id,
    type: 'microsoft',
    username: profile.name,
    uuid: formatUuid(profile.id),
    accessToken: mc.access_token,
    refreshToken: msToken.refresh_token,
    expiresAt: Date.now() + mc.expires_in * 1000,
    xuid: xsts.DisplayClaims.xui[0].uhs
  };
}

function openAuthWindow(parent?: BrowserWindow): Promise<string> {
  return new Promise((resolve, reject) => {
    const url =
      `https://login.live.com/oauth20_authorize.srf` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&prompt=select_account`;

    const win = new BrowserWindow({
      width: 520,
      height: 720,
      parent,
      modal: !!parent,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let resolved = false;
    const handler = (_e: Electron.Event, navUrl: string) => {
      if (navUrl.startsWith(REDIRECT_URI)) {
        const u = new URL(navUrl);
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        resolved = true;
        win.close();
        if (code) resolve(code);
        else reject(new Error(err ?? 'Logowanie anulowane'));
      }
    };
    win.webContents.on('will-redirect', handler);
    win.webContents.on('did-navigate', handler);
    win.on('closed', () => {
      if (!resolved) reject(new Error('Okno logowania zamknięte'));
    });
    win.loadURL(url);
  });
}

async function exchangeCodeForToken(code: string): Promise<MsTokenResponse> {
  const res = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE
    }).toString()
  });
  if (!res.ok) throw new Error('Token exchange failed: ' + (await res.text()));
  return (await res.json()) as MsTokenResponse;
}

async function authXboxLive(accessToken: string): Promise<XblResponse> {
  const res = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  });
  if (!res.ok) throw new Error('Xbox Live auth failed: ' + (await res.text()));
  return (await res.json()) as XblResponse;
}

async function authXsts(xblToken: string): Promise<XblResponse> {
  const res = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('2148916233'))
      throw new Error('Konto nie ma profilu Xbox. Załóż go na xbox.com i spróbuj ponownie.');
    if (text.includes('2148916238'))
      throw new Error('Konto jest dziecięce — wymaga dodania do rodziny dorosłego.');
    throw new Error('XSTS auth failed: ' + text);
  }
  return (await res.json()) as XblResponse;
}

async function authMinecraft(uhs: string, xstsToken: string): Promise<MinecraftAuthResponse> {
  const res = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  });
  if (!res.ok) throw new Error('Minecraft auth failed: ' + (await res.text()));
  return (await res.json()) as MinecraftAuthResponse;
}

async function verifyOwnership(accessToken: string): Promise<void> {
  const res = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Nie udało się zweryfikować zakupu Minecraft.');
  const data = (await res.json()) as { items?: Array<{ name: string }> };
  const owns =
    Array.isArray(data.items) &&
    data.items.some((i) => i.name === 'product_minecraft' || i.name === 'game_minecraft');
  if (!owns) throw new Error('To konto Microsoft nie posiada Minecraft Java Edition.');
}

async function getMinecraftProfile(accessToken: string): Promise<MinecraftProfileResponse> {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Nie udało się pobrać profilu Minecraft.');
  return (await res.json()) as MinecraftProfileResponse;
}

function formatUuid(raw: string): string {
  if (raw.includes('-')) return raw;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
