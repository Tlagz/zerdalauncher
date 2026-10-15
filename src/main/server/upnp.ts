import { spawn } from 'child_process';
import https from 'https';

/**
 * Router port forwarding through Windows' own UPnP client (HNetCfg.NATUPnP).
 * Going through the system SSDP service sidesteps Windows Firewall dropping
 * discovery replies to the app, and needs no native dependency.
 */
function powershell(script: string, timeoutMs = 25_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Router nie odpowiedział (UPnP).'));
    }, timeoutMs);
    child.stdout.on('data', (b) => (out += b.toString()));
    child.stderr.on('data', (b) => (err += b.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `PowerShell exit ${code}`));
    });
  });
}

const PRIVATE_OR_CGNAT = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;

function publicIp(): Promise<string | null> {
  return new Promise((resolve) => {
    https
      .get('https://api.ipify.org', { timeout: 8000 }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(/^\d+\.\d+\.\d+\.\d+$/.test(d.trim()) ? d.trim() : null));
      })
      .on('error', () => resolve(null));
  });
}

/**
 * Forward TCP `port` on the router to this PC. Resolves to the public address
 * players can use, or rejects when UPnP is unavailable or the router sits
 * behind carrier-grade NAT (its "external" IP isn't the real public one).
 */
export async function openPort(port: number): Promise<string> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Nieprawidłowy port.');
  // ASCII error codes only: PowerShell's console code page mangles Polish text.
  let routerIp: string;
  try {
    routerIp = await powershell(`
      $ErrorActionPreference = 'Stop'
      # The LAN address behind the real default route (lowest metric) — not a VPN
      # adapter like Radmin/Hamachi that also has a gateway.
      $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 |
        Sort-Object { $_.RouteMetric + (Get-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4).InterfaceMetric } |
        Select-Object -First 1
      if (-not $route) { throw 'NO_NET' }
      $local = (Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 | Select-Object -First 1).IPAddress
      $maps = (New-Object -ComObject HNetCfg.NATUPnP).StaticPortMappingCollection
      if ($maps -eq $null) { throw 'NO_IGD' }
      try { $maps.Remove(${port}, 'TCP') | Out-Null } catch {}
      $m = $maps.Add(${port}, 'TCP', ${port}, $local, $true, 'ZerdaLauncher')
      Write-Output $m.ExternalIPAddress
    `);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('NO_IGD')) throw new Error('Router nie obsługuje UPnP albo ma je wyłączone.');
    if (msg.includes('NO_NET')) throw new Error('Brak aktywnego połączenia sieciowego.');
    throw new Error('Router odrzucił przekierowanie portu (UPnP).');
  }
  const real = await publicIp();
  if (!routerIp || PRIVATE_OR_CGNAT.test(routerIp) || (real && real !== routerIp)) {
    await closePort(port).catch(() => {});
    throw new Error('Dostawca internetu używa CGNAT — przekierowanie portu nic nie da.');
  }
  return port === 25565 ? routerIp : `${routerIp}:${port}`;
}

export async function closePort(port: number): Promise<void> {
  if (!Number.isInteger(port)) return;
  await powershell(`
    $maps = (New-Object -ComObject HNetCfg.NATUPnP).StaticPortMappingCollection
    if ($maps -ne $null) { try { $maps.Remove(${port}, 'TCP') | Out-Null } catch {} }
  `);
}
