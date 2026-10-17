/** What changed in each launcher version, newest first. Add an entry with every release. */
export const CHANGELOG: Array<{ version: string; date: string; changes: string[] }> = [
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
