#!/usr/bin/env bash
#
# compendium.sh — publiceert het Reisverslagen-compendium onder /compendium/.
#
# Het compendium (github.com/mossalan-dot/Reisverslagen) is een eigen project
# met een eigen repository; alleen de gebouwde statische site (`docs/`) komt
# hier terecht. Daarom staat die map NIET in deze repository en zondert
# publiceer.sh hem uit van --delete.
#
# Gebruik:
#   COMPENDIUM=/pad/naar/Reisverslagen SERVER=root@… DOEL=/var/www/edities \
#     ./deploy/compendium.sh
#
# Bouw eerst de site in het compendium zelf (vereist PyYAML):
#   python3 scripts/bouw.py
#
set -euo pipefail

SERVER="${SERVER:-gebruiker@jouw-server}"
DOEL="${DOEL:-/var/www/edities}"
COMPENDIUM="${COMPENDIUM:-}"

if [ "$SERVER" = "gebruiker@jouw-server" ] || [ -z "$COMPENDIUM" ]; then
	echo "Stel SERVER en COMPENDIUM in, bijv.:" >&2
	echo "  COMPENDIUM=~/Reisverslagen SERVER=root@203.0.113.10 \\" >&2
	echo "    DOEL=/var/www/edities ./deploy/compendium.sh" >&2
	exit 1
fi

BRON="$COMPENDIUM/docs/"
if [ ! -f "$BRON/index.html" ] || [ ! -f "$BRON/data.json" ]; then
	echo "Geen gebouwde site in $BRON — draai eerst scripts/bouw.py." >&2
	exit 1
fi

echo "Publiceren van $BRON -> $SERVER:$DOEL/compendium/"
rsync -avz --delete --exclude '.DS_Store' "$BRON" "$SERVER:$DOEL/compendium/"

echo "Klaar. Het compendium staat op $SERVER:$DOEL/compendium"
