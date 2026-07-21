#!/usr/bin/env bash
#
# publiceer.sh — zet de statische site op de Hetzner-server via rsync.
#
# De site is volledig statisch (alleen relatieve paden), dus publiceren is
# niets meer dan de bestanden naar de docroot van de webserver kopiëren.
#
# Gebruik:
#   SERVER=gebruiker@jouw-server DOEL=/var/www/edities ./deploy/publiceer.sh
# of pas de standaardwaarden hieronder aan.
#
# Eerste keer op de server:
#   sudo mkdir -p /var/www/edities && sudo chown "$USER" /var/www/edities
#
set -euo pipefail

SERVER="${SERVER:-gebruiker@jouw-server}"
DOEL="${DOEL:-/var/www/edities}"
BRON="$(cd "$(dirname "$0")/.." && pwd)/"

if [ "$SERVER" = "gebruiker@jouw-server" ]; then
	echo "Stel eerst SERVER in, bijv.:" >&2
	echo "  SERVER=root@203.0.113.10 DOEL=/var/www/edities ./deploy/publiceer.sh" >&2
	exit 1
fi

echo "Publiceren van $BRON -> $SERVER:$DOEL"
# --delete ruimt op de server op wat hier niet (meer) staat. Mappen die van
# een ánder project komen en dus niet in deze repo zitten, moeten daarvan
# uitgezonderd worden:
#   compendium/  — de statische site van mossalan-dot/Reisverslagen,
#                  gepubliceerd met deploy/compendium.sh
rsync -avz --delete \
	--exclude '.git' \
	--exclude 'deploy' \
	--exclude '__pycache__' \
	--exclude '*.pyc' \
	--exclude '.DS_Store' \
	--exclude 'compendium' \
	"$BRON" "$SERVER:$DOEL/"

echo "Klaar. De site staat op $SERVER:$DOEL"
