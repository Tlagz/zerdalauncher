/** What changed in each launcher version, newest first. Add an entry with every release. */
export const CHANGELOG: Array<{ version: string; date: string; changes: string[] }> = [
  {
    version: '0.1.32',
    date: '2026-10-24',
    changes: [
      'Dostosuj Start: ukrywaj sekcje, zmieniaj ich kolejność i przenoś między kolumnami',
      'Wybór, ile instancji pokazuje „Ostatnio grane”'
    ]
  },
  {
    version: '0.1.31',
    date: '2026-10-22',
    changes: [
      'Serwer Sztulagz na stronie Start: status, gracze online i „Graj” jednym kliknięciem',
      'Przed grą launcher sprawdza nową wersję paczki; wersje wymagane przez serwer trzeba pobrać',
      'Kopiowanie ustawień gry (sterowanie, grafika, lista serwerów) między instancjami'
    ]
  },
  {
    version: '0.1.30',
    date: '2026-10-22',
    changes: [
      'Paczki na serwer Sztulagz: baner, kolor, tagi, adres serwera, zalecany RAM, linki, wyróżnienie i wersje robocze',
      'Opcja uruchamiania launchera zmaksymalizowanego (Ustawienia → Zachowanie)',
      'Launcher zapamiętuje rozmiar i położenie okna'
    ]
  },
  {
    version: '0.1.29',
    date: '2026-10-22',
    changes: [
      'Zakładka Paczki Sztulagz: modpacki do zainstalowania i aktualizowania jednym kliknięciem',
      'Poprawka: po zamknięciu okienka nie zostaje już rozmyta plama zasłaniająca treść'
    ]
  },
  {
    version: '0.1.28',
    date: '2026-10-21',
    changes: ['Poprawka: zaproszenie ze schowka pokazuje się tylko raz, a nie przy każdym uruchomieniu']
  },
  {
    version: '0.1.27',
    date: '2026-10-21',
    changes: [
      'Zakładka Zrzuty: screeny ze wszystkich instancji w jednym miejscu',
      'Mapa świata 2D z lotu ptaka — też dla światów hostowanych serwerów',
      'Monitor gry: RAM i CPU na pasku stanu',
      'Ikona w zasobniku i chowanie launchera na czas gry'
    ]
  },
  {
    version: '0.1.26',
    date: '2026-10-17',
    changes: [
      'Zaproszenia na serwer: znajomy dostaje Twoje mody i od razu wchodzi do gry',
      'Szczegóły modów w launcherze: opis, galeria i lista zmian',
      'Dźwięki interfejsu w stylu Minecrafta (Personalizacja → Dźwięki)',
      'Discord pokazuje serwer lub świat, na którym grasz, i liczbę graczy',
      'Angielska wersja interfejsu (Ustawienia → Język)'
    ]
  },
  {
    version: '0.1.25',
    date: '2026-10-17',
    changes: [
      'Statystyki gry na stronie Start z wykresem ostatnich 7 dni',
      'Status zapisanych serwerów (gracze, ping, MOTD) i dołączanie jednym kliknięciem',
      'Powiadomienie o nowej wersji Minecrafta',
      'Status aktualizacji launchera, lista zmian i nowości Minecrafta z patch notes'
    ]
  },
  {
    version: '0.1.24',
    date: '2026-10-16',
    changes: [
      'Analiza crashy z naprawą jednym kliknięciem (brakujące mody, Java, RAM…)',
      'Aktualizacje modów także dla plików dodanych ręcznie',
      'Eksport do .mrpack i wybór zawartości paczki',
      'Galeria zrzutów ekranu w instancji',
      'Grupy i ulubione instancje',
      'Szybkie wyszukiwanie pod Ctrl+K',
      'Gotowe i własne motywy (.zerdatheme)'
    ]
  },
  {
    version: '0.1.23',
    date: '2026-10-16',
    changes: ['Zakładka Personalizacja: akcent, tło, animacje, skala i układ']
  },
  {
    version: '0.1.22',
    date: '2026-10-16',
    changes: [
      'Czytelne nazwy folderów instancji',
      'Wybór lokalizacji danych launchera',
      'Zatrzymywanie uruchomionej gry',
      'Udostępnianie serwera przez UPnP i playit.gg'
    ]
  },
  {
    version: '0.1.21',
    date: '2026-10-15',
    changes: ['Odświeżony wygląd i płynniejsze animacje w całym launcherze']
  },
  {
    version: '0.1.20',
    date: '2026-10-07',
    changes: [
      'Naprawiona instalacja starszych wersji Forge',
      'Wyszukiwanie zainstalowanych modów, linki do stron modów, dodawanie modów z dysku'
    ]
  }
];
