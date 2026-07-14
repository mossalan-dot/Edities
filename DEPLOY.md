# De site online zetten (Hetzner-server)

De Edities-site is **volledig statisch**: HTML, CSS en JavaScript, geen backend,
geen database, geen build-stap. Alle paden zijn relatief, dus de site draait
onder elke docroot of subpad. Online zetten = de bestanden serveren met een
webserver. De editor blijft werken zoals lokaal (bestanden download je naar je
eigen schijf).

Hieronder een compacte handleiding voor een Hetzner-server (Ubuntu/Debian).

## 1. Webserver kiezen

Twee eenvoudige opties; beide meegeleverd in `deploy/`.

- **Caddy** (aanbevolen) — regelt automatisch HTTPS-certificaten. Config:
  [`deploy/Caddyfile`](deploy/Caddyfile).
- **nginx** — als je die al draait. Config:
  [`deploy/edities.nginx.conf`](deploy/edities.nginx.conf) (HTTPS via `certbot`).

Beide configbestanden bevatten bovenaan de installatie- en activeercommando's.
Vervang overal `edities.example.nl` door je eigen (sub)domein en laat dat domein
in je DNS naar het IP-adres van de Hetzner-server wijzen (een A-record, en een
AAAA-record als je IPv6 gebruikt).

## 2. Docroot klaarzetten

Op de server, eenmalig:

```bash
sudo mkdir -p /var/www/edities
sudo chown "$USER" /var/www/edities
```

## 3. Bestanden publiceren

Vanaf je eigen machine, met het meegeleverde script:

```bash
SERVER=gebruiker@JOUW_SERVER_IP DOEL=/var/www/edities ./deploy/publiceer.sh
```

Dit doet een `rsync` van de repo naar de docroot (zonder `.git` en `deploy`).
Elke volgende publicatie is hetzelfde commando; `--delete` houdt de server
gelijk aan je lokale map.

> Liever met git? Dan kun je in plaats van rsync de repo op de server clonen en
> bij een update `git pull` draaien, met de docroot op de repomap. rsync is het
> eenvoudigst omdat de server dan niets van git of Python hoeft te weten.

## 4. Controleren

Open `https://edities.example.nl/`. Loopt het via een subpad
(`.../edities/`)? Dan werkt dat ook, want alle verwijzingen zijn relatief.

## Nieuwe editie toevoegen

1. Maak lokaal een map `edities/<naam>/` met een `index.html` (kopieer die van
   `edities/voorbeeld/` en pas titel/teksten aan).
2. Schrijf de `editie.md` — met de hand, of via de **editor** in de browser.
3. Genereer `bron.txt`:
   - lokaal: `python3 importeer.py edities/<naam>/editie.md`, of
   - via de editor: knop **↓ bron.txt** en leg het bestand in de editiemap.
4. Voeg een kaartje toe op `index.html` en publiceer opnieuw (stap 3 hierboven).

## Waarom geen build/backend?

Bewust: een statische site is jarenlang houdbaar, triviaal te back-uppen (kopieer
de map), en veilig (er draait geen applicatielogica op de server). De omzetting
van `editie.md` naar `bron.txt` gebeurt vóór publicatie — met `importeer.py` of,
identiek, met de browser-editor (`assets/importeer.js`).
