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

## Beheer / bewerkmodus beveiligen

De **editor** (`editor.html`) is de admin-omgeving waarin je edities schrijft en
noten toevoegt. Omdat de site statisch is, wordt die niet in de pagina zelf
afgeschermd maar **op de webserver**, met HTTP basic-auth. Alle edities blijven
openbaar; alleen de editor vraagt om een wachtwoord.

**Caddy** — de config (`deploy/Caddyfile`) schermt `/editor.html` en
`/editor-frame.html` al af. Maak een wachtwoordhash en plak die in het
`basicauth`-blok:

```bash
caddy hash-password            # typ je wachtwoord; kopieer de hash
# vervang de VERVANG…-hash in de Caddyfile door deze uitvoer
sudo systemctl reload caddy
```

**nginx** — de config (`deploy/edities.nginx.conf`) verwijst naar een
`htpasswd`-bestand. Maak dat eenmalig aan:

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/edities.htpasswd admin   # vraagt om een wachtwoord
sudo nginx -t && sudo systemctl reload nginx
```

Daarna vraagt de browser om gebruikersnaam + wachtwoord zodra je de editor
opent; de rest van de site blijft vrij toegankelijk. Wil je meer beheerders?
Voeg extra regels toe (`caddy hash-password` per persoon, of `htpasswd`
zonder `-c` voor een extra gebruiker).

## De editor gebruiken

De editor heeft twee manieren van werken, door elkaar te gebruiken:

- **Met knoppen** — de opmaakbalk boven het tekstvak zet de juiste markup neer:
  koppen, vet/cursief, kleinkapitaal, opgeloste afkortingen, doorhaling, marge,
  lacune, paginagrens, dagtekening en opsomming. Selecteer eerst tekst en klik
  dan een knop om die te omhullen. De knop **＋ Noot** maakt een noot bij de
  geselecteerde tekst (kies apparaat, typ de inhoud); dat kan ook door in het
  voorbeeld rechts tekst te selecteren.
- **In code** — je kunt alles ook rechtstreeks in de `editie.md`-markup typen;
  het voorbeeld en de noot-verankering werken meteen mee.

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
