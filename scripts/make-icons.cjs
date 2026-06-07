// Generates build/icon.png (1024² square) and build/icon.ico from the source
// logo. Run locally or in CI before electron-builder. No-op if the source is
// missing (so packaging still works when icons are already present).
const fs = require('fs');
const Jimp = require('jimp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const SRC = 'ZerdaLauncherLogo.png';

(async () => {
  if (!fs.existsSync(SRC)) {
    console.log(`[icons] Brak ${SRC} — pomijam (używam istniejących build/icon.*).`);
    return;
  }
  fs.mkdirSync('build', { recursive: true });
  const img = await Jimp.read(SRC);
  await img.contain(1024, 1024).writeAsync('build/icon.png');
  fs.writeFileSync('build/icon.ico', await pngToIco('build/icon.png'));
  console.log('[icons] Wygenerowano build/icon.png i build/icon.ico');
})().catch((e) => {
  console.error('[icons] Błąd:', e.message);
  process.exit(1);
});
