# ZerdaLauncher

Twój własny launcher Minecraft Java Edition. Electron + React + TypeScript.

## Funkcje

- ✅ Logowanie Microsoft (OAuth) z weryfikacją zakupu MC
- ✅ Tryb offline (do serwerów cracked)
- ✅ Pobieranie i uruchamianie dowolnej wersji vanilla (release + snapshoty)
- ✅ Wsparcie **Fabric** (przez Fabric Meta API)
- ✅ Wsparcie **Forge** (uruchamia oficjalny installer)
- ✅ Wsparcie **NeoForge** (Maven NeoForged, MC 1.20.2+)
- ✅ Zarządzanie wieloma instancjami z oddzielnymi folderami gry
- ✅ Suwak RAM, własne JVM args, własna ścieżka do Javy
- ✅ Auto-detekcja Javy (Adoptium, Microsoft, Zulu, Corretto)
- ✅ **Przeglądarka modów z Modrinth** — wyszukiwanie, instalacja jednym
  kliknięciem z auto-pobraniem wymaganych zależności, włączanie/wyłączanie
  i usuwanie modów per instancja
- ✅ **Modpacki** — pobieranie paczek z Modrinth (`.mrpack`) jako gotowe
  instancje, import plików `.mrpack`/`.zerda` z dysku oraz eksport własnej
  instancji do formatu `.zerda`

## Mody

Na karcie instancji kliknij ikonę 🧩, aby otworzyć menedżer modów:

- **Przeglądaj** — szukaj modów na **Modrinth** lub **CurseForge** (przełącznik
  źródła u góry; wyniki filtrowane po wersji MC i loaderze instancji). „Instaluj"
  pobiera najnowszą zgodną wersję wraz z wymaganymi zależnościami do
  `…/instances/<id>/minecraft/mods/`.
- **Zainstalowane** — włączaj/wyłączaj (zmiana na `*.jar.disabled`) lub usuwaj.

Mody działają tylko na instancjach z **Fabric**, **Forge** lub **NeoForge**
(vanilla ich nie wczyta). **CurseForge** wymaga własnego klucza API — wklej go w
**Ustawienia → CurseForge** (darmowy klucz z `console.curseforge.com → API
Keys`). Modrinth działa bez klucza.

## Modpacki

Na ekranie **Instancje** w prawym górnym rogu:

- **🧰 Modpacki** — przeglądaj i pobieraj paczki z **Modrinth** lub
  **CurseForge** (przełącznik źródła). „Instaluj" pobiera najnowszą wersję paczki,
  tworzy nową instancję z właściwą wersją MC i loaderem, pobiera wszystkie mody i
  wypakowuje configi (overrides).
- **📥 Importuj** — wczytaj plik `.mrpack` (Modrinth), `.zip` (CurseForge) lub
  `.zerda` (własny format ZerdaLaunchera) z dysku jako nową instancję.

Na karcie instancji ikona **📦** eksportuje ją do pliku `.zerda`.

### Format `.zerda`

To zwykły ZIP z manifestem `zerda.manifest.json` + folderem `overrides/`:

- mody pobrane z Modrinth są **referencjonowane** (projectId + fileId), więc plik
  paczki jest mały i pobiera mody na nowo przy imporcie,
- mody spoza Modrinth oraz `config/`, `defaultconfigs/`, `scripts/`, `kubejs/`
  i `options.txt` są **dołączane** do paczki w `overrides/`.

## Wymagania

- **Node.js 20+** (do zbudowania launchera)
- **Java** — **nie musisz nic instalować**. Launcher czyta z manifestu wersji,
  jakiej Javy wymaga dany Minecraft, i:
  1. używa Twojej Javy z ustawień, jeśli jest wystarczająco nowa, albo
  2. znajduje pasującą Javę w systemie (Adoptium/MS/Zulu/Corretto), albo
  3. **pobiera dokładnie to środowisko Java, które Mojang dostarcza dla tej
     wersji** (np. Java 8 dla 1.7.x, Java 21+ dla najnowszych snapshotów).
- Windows 10/11 (wstępnie testowane na Windows)

> Dzięki temu zarówno bardzo stare wersje (wymagające Javy 8), jak i najnowsze
> snapshoty (wymagające Javy 21/24) działają bez ręcznego żonglowania JDK-ami.

## Pierwsze uruchomienie

```powershell
cd C:\Users\Tlagz\Desktop\JavaLauncher
npm install
npm run dev
```

Pierwsza instalacja może chwilę potrwać — Electron pobiera binarki.

## Budowanie do .exe

```powershell
npm run package
```

Gotowy instalator NSIS znajdziesz w `dist/`.

## Microsoft OAuth — własne Azure App ID (opcjonalne)

Domyślnie launcher używa publicznego client ID Mojanga (`00000000402b5328`),
który działa od ręki dla logowania do MC. Jeśli chcesz mieć własną aplikację
w Azure AD:

1. Wejdź na [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Stwórz nową rejestrację (Personal Microsoft accounts only)
3. Dodaj redirect URI typu **Web**: `https://login.live.com/oauth20_desktop.srf`
4. W "API permissions" dodaj `XboxLive.signin` i `offline_access`
5. Skopiuj Application (client) ID
6. Ustaw przed uruchomieniem:

```powershell
$env:MS_CLIENT_ID = "twój-client-id"
npm run dev
```

## Lokalizacja danych

Wszystkie pliki launchera lądują w:

```
%APPDATA%\ZerdaLauncher\
├── instances\<id>\minecraft\   # game dir per instancja (saves, mods, options.txt)
├── instances\<id>\mods.json    # metadane modów (provider/projectId/fileId)
├── versions\                   # JSONy wersji + client.jar
├── libraries\                  # cache bibliotek (Maven-style)
├── assets\                     # tekstury, dźwięki (współdzielone)
├── natives\<id>\               # natywne biblioteki LWJGL na instancję
├── runtimes\                   # auto-pobrane środowiska Java (Mojang JRE)
├── cache\                      # pobrane pliki .mrpack itp.
├── accounts.json
├── settings.json
└── instances.json
```

> Jeśli używałeś wcześniejszej wersji pod nazwą `JavaLauncher`, dane zostaną
> automatycznie przeniesione do `ZerdaLauncher` przy pierwszym uruchomieniu.

## Struktura kodu

```
src/
├── main/                 # Electron main process (Node)
│   ├── index.ts          # Entry, BrowserWindow setup
│   ├── ipc.ts            # IPC handlers (most/wszystkie API)
│   ├── auth/
│   │   ├── microsoft.ts  # MS OAuth → XBL → XSTS → Minecraft profile
│   │   └── accounts.ts   # CRUD kont, refresh tokenów
│   ├── minecraft/
│   │   ├── manifest.ts   # Mojang version manifest + parsowanie
│   │   ├── downloader.ts # Pobieranie client.jar, libs, assets, natives
│   │   ├── launcher.ts   # Budowanie JVM args i spawn procesu
│   │   └── instances.ts  # CRUD instancji
│   ├── modloaders/
│   │   ├── fabric.ts     # Fabric Meta API
│   │   ├── forge.ts      # Uruchamia forge-installer.jar
│   │   └── neoforge.ts   # Maven NeoForged + headless installer
│   ├── mods/
│   │   ├── index.ts      # Façada mod-management (provider-agnostyczna)
│   │   ├── modrinth.ts   # Modrinth API v2 (mody + modpacki)
│   │   └── modpacks.ts   # Import/eksport .mrpack i .zerda
│   └── utils/            # paths, http, java detection, JSON store
├── preload/              # context bridge → window.api
├── renderer/             # React UI
│   ├── App.tsx
│   ├── store.ts          # Zustand state
│   ├── components/       # Sidebar, InstancesPage, ...
│   └── styles/
└── shared/               # Typy + nazwy kanałów IPC
```

## Roadmap

Pomysły na rozszerzenia:

- [x] Modrinth API — przeglądanie i pobieranie modów z poziomu launchera
- [x] CurseForge API — mody i modpacki (wymaga własnego klucza w Ustawieniach)
- [x] Import/eksport modpacków (.mrpack, CurseForge .zip, .zerda)
- [x] Automatyczna instalacja JRE dla wymaganej wersji MC (Mojang)
- [x] Live console gry w UI launchera
- [ ] Skin viewer (3D Steve podgląd profilu)
- [ ] Wgrywanie modów drag-and-drop do `mods/`
- [ ] Tłumaczenie EN/PL (i18n)

## Licencja

MIT — rób co chcesz, na własną odpowiedzialność.
Nie jest to oficjalny produkt Mojang / Microsoft.
