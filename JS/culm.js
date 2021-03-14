/*jshint esversion: 8 */

const Promise = require('bluebird');
// Promise.longStackTraces(); DEBUG ONLY

const fs = require('fs');

const rimraf = require('rimraf');

// Invoke SQL
const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', database: 'mtg' });
// Invoke SQL

// Invoke Puppeteer
const puppeteer = require('puppeteer');
const { PuppeteerBlocker } = require('@cliqz/adblocker-puppeteer');
const fetch = require('cross-fetch');
// Invoke Puppeteer

const ProgressBar = require('progress');

const root = 'C:\\Users\\SentientScythe\\MtGScraper\\';
const download = root + 'downloads';
const tempFile = root + 'current.mwDeck';

let insert_true_stats = async () => {
	const selectDecks = "SELECT deck_url FROM mtg.tournament_decks WHERE cards IS NULL OR cards = '{}' ORDER BY deck_url";
	const client = await pool.connect();
	const deckUrls = await client.query(selectDecks);
	client.release();

	// Invoke Puppeteer
	const browser = await puppeteer.launch({
		headless: false
	});
	const page = await browser.newPage();
	await page._client.send('Page.setDownloadBehavior', {
		behavior: 'allow',
		downloadPath: download
	});
	await PuppeteerBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
		blocker.enableBlockingInPage(page);
	});
	// Invoke Puppeteer

	const bar = new ProgressBar('Progress [:bar] :current/:total :percent :etas', {
		total: deckUrls.rows.length
	});

	for (const deckUrl of deckUrls.rows) {
		var success = true;

		do {
			success = true;

			try {
				rimraf.sync(download);
			} catch (e) {}

			try {
				fs.mkdirSync(download);
			} catch (e) {}

			try {
				await download_mwdeck(page, deckUrl.deck_url);
				await parse_mwdeck(deckUrl.deck_url);
			} catch (e) {
				success = false;
			}
		} while (success == false);

		bar.tick();
	}

	await browser.close();
	process.exit();
};

const baseSelector = 'body > div.page > div > table > tbody > tr > td:nth-child(2)';
const secondChild = ' > table:nth-child(2) > tbody > tr > td:nth-child(2) > div > a:nth-child(';
const thirdChild = ' > table:nth-child(3) > tbody > tr > td:nth-child(2) > div > a:nth-child(';
const secondButton = baseSelector + secondChild + '3)';
const thirdButton = baseSelector + secondChild + '4)';
const secondButtonP = baseSelector + thirdChild + '3)';
const thirdButtonP = baseSelector + thirdChild + '4)';

let download_mwdeck = async (page, deck_url) => {
	var success = true;

	do {
		success = true;

		try {
			await page.goto(deck_url);
			await page.waitForSelector(baseSelector);
			const extraTable = await page.evaluate(() => {
				return Boolean(document.querySelector('div.R12'));
			});

			if (extraTable) {
				try {
					await page.click(thirdButtonP);
				} catch (e) {
					await page.click(secondButtonP);
				}
			} else {
				try {
					await page.click(thirdButton);
				} catch (e) {
					await page.click(secondButton);
				}
			}

			var fileList = [];
			var filename = '';
			var retry = 0;

			while ((fileList.length == 0 || filename.includes('.crdownload')) && retry < 64) {
				try {
					fileList = fs.readdirSync(download);
					filename = fileList[0];
				} catch (e) {
				} finally {
					retry++;
				}
			}

			if (!filename.includes('.mwDeck')) {
				throw new Error('File is in the wrong format!');
			}
		} catch (e) {
			success = false;
		}
	} while (success === false);
};

const copyIntoTemp =
	"DROP TABLE IF EXISTS mwdeck_import; CREATE TEMP TABLE IF NOT EXISTS mwdeck_import(line text); COPY mwdeck_import FROM 'C:\\Users\\SentientScythe\\MtGScraper\\current.mwDeck'";
const updateTDCards = 'UPDATE mtg.tournament_decks SET cards = ARRAY(TABLE mwdeck_import OFFSET 4) WHERE deck_url = $1';

let parse_mwdeck = async (deck_url) => {
	try {
		fs.unlinkSync(tempFile);
	} catch (e) {}

	const fileList = fs.readdirSync(download);
	const filename = fileList[0];
	const original_filepath = download + '\\' + filename.replace(/\s/g, '_');
	fs.writeFileSync(tempFile, fs.readFileSync(original_filepath, 'utf8'), { encoding: 'utf8', flag: 'w' });
	const client = await pool.connect();
	await client.query(copyIntoTemp);
	await client.query(updateTDCards, [deck_url]);
	client.release();
	fs.unlinkSync(tempFile);
};

insert_true_stats();
