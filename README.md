# MtG Scraper

My "private" repository for messing with Magic the Gathering card and deck data.

GENERAL STEPS
1. Run scraper.js to gather deck data from mtgtop8
2. Run the populate_format.sql script
3. Run culm.js to download any missing cards for decks
4. Run the set_unknown_card_flags.sql script
5. Run calc_deck_stats.js
6. Run agg_cards.js
7. Run agg_stats.js
