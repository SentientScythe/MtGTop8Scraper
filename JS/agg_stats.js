/*jshint esversion: 8 */

const Promise = require('bluebird');
// Promise.longStackTraces(); DEBUG ONLY

// Invoke SQL
const { Client } = require('pg');
const client = new Client({
	user: 'postgres',
	database: 'mtg'
});
// Invoke SQL

const ProgressBar = require('progress');

// for each category: find all possibilities and make them columns, then fill each table
let aggregateStats = async () => {
	await client.connect();

	for (const stat of [
		{ delimit: '', lowercase: false, name: 'cmcs', null: '' },
		{ delimit: ',', lowercase: false, name: 'colors', null: 'colorless' },
		{ delimit: ',', lowercase: true, name: 'keywords', null: 'none' },
		{ delimit: '', lowercase: false, name: 'layouts', null: '' },
		{ delimit: '}{', lowercase: false, name: 'mana_costs', null: 'costless' },
		{ delimit: '', lowercase: false, name: 'powers', null: 'powerless' },
		{ delimit: ',', lowercase: true, name: 'subtypes', null: 'typeless' },
		{ delimit: ',', lowercase: true, name: 'supertypes', null: 'typeless' },
		{ delimit: '', lowercase: false, name: 'toughnesses', null: 'defenseless' },
		{ delimit: ',', lowercase: true, name: 'types', null: '' }
	]) {
		const delimit = stat.delimit;
		const curlyDelimit = '}{' === delimit;
		const lowercase = stat.lowercase;
		const name = stat.name;
		const nullColumn = stat.null;
		const response = await client.query(
			'SELECT tournament_decks.deck_url, ' +
				name +
				' deck_stats FROM mtg.tournament_decks LEFT JOIN mtg.deck_stats ON tournament_decks.deck_url = deck_stats.deck_url WHERE unknown_cards_main = FALSE AND NOT EXISTS (SELECT 1 FROM mtg.' +
				name +
				' WHERE ' +
				name +
				'.deck_url = tournament_decks.deck_url);'
		);
		const rows = response.rows;
		const bar = new ProgressBar(name + ' progress [:bar] :current/:total :percent :etas', {
			total: rows.length
		});

		// Gather keys for headers
		const keys = new Set();

		for (const row of rows) {
			const deckStats = row.deck_stats;

			if (deckStats && typeof deckStats[Symbol.iterator] === 'function') {
				for (const deckStat of deckStats) {
					const deckStatKey = deckStat[0];

					if (deckStatKey !== undefined) {
						if (deckStatKey === null) {
							keys.add(nullColumn);
						} else if (delimit) {
							const deckStatKeys = curlyDelimit ? deckStatKey.substring(1, deckStatKey.length - 1) : deckStatKey;

							for (const key of deckStatKeys.split(delimit)) {
								if (lowercase) {
									keys.add(key.toLowerCase().replace(/ /g, '_'));
								} else {
									keys.add(key);
								}
							}
						} else {
							keys.add(deckStatKey);
						}
					}
				}
			}
		}

		// Dynamically create the SQL query from the keys
		const columns = [...keys];
		columns.unshift('deck_url');
		var insertStats = 'INSERT INTO mtg.' + name + ' ("' + columns.join('", "') + '") VALUES (';

		for (var i = 1; i <= columns.length; i++) {
			insertStats += (1 === i ? '' : ', ') + '$' + i;
		}

		insertStats += ') ON CONFLICT (deck_url) DO UPDATE SET ';

		for (var j = 1; j < columns.length; j++) {
			insertStats += (1 === j ? '' : ', ') + '"' + columns[j] + '" = $' + (j + 1);
		}

		insertStats += ';';

		// Insert stats
		for (const row of rows) {
			var data = [row.deck_url];

			for (const key of keys.keys()) {
				var statValue = null;
				const deckStats = row.deck_stats;

				if (deckStats && typeof deckStats[Symbol.iterator] === 'function') {
					for (const deckStat of deckStats) {
						const deckStatKeyRaw = deckStat[0];

						if (deckStatKeyRaw !== undefined) {
							if (deckStatKeyRaw === null) {
								if (key === nullColumn) {
									statValue = deckStat[1];
									break;
								}
							} else if (delimit) {
								const deckStatKeys =
									'}{' === delimit ? deckStatKeyRaw.substring(1, deckStatKeyRaw.length - 1) : deckStatKeyRaw;

								for (const deckStatKey of deckStatKeys.split(delimit)) {
									if (lowercase) {
										if (key === deckStatKey.toLowerCase().replace(/ /g, '_')) {
											statValue = deckStat[1];
											break;
										}
									} else {
										if (key === deckStatKey) {
											statValue = deckStat[1];
											break;
										}
									}
								}
							} else {
								if (key === deckStatKeyRaw) {
									statValue = deckStat[1];
									break;
								}
							}
						}
					}
				}

				data.push(statValue ? statValue : 0);
			}

			await client.query(insertStats, data);
			bar.tick();
		}
	}

	await client.query(
		'UPDATE mtg.deck_stats SET mana_average = CASE WHEN main - land = 0 THEN 0 ELSE (("0.5" * 0.5 + "1" + "2" * 2 + "3" * 3 + "4" * 4 + "5" * 5 + "6" * 6 + "7" * 7 + "8" * 8 + "9" * 9 + "10" * 10 + "11" * 11 + "12" * 12 + "13" * 13 + "14" * 14 + "15" * 15 + "16" * 16 + "1000000" * 1000000)::DOUBLE PRECISION / (main - land)::DOUBLE PRECISION) END FROM mtg.cmcs JOIN mtg."types" ON cmcs.deck_url = "types".deck_url WHERE deck_stats.deck_url = cmcs.deck_url;'
	);
	await client.end();
	process.exit();
};

aggregateStats();
