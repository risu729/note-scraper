import { convert } from "html-to-text";
import { decodeUnicodeEscapes } from "unicode-escapes";
import { format } from "@fast-csv/format";
import { createWriteStream } from "node:fs";
import { parseArgs } from "node:util";
import { argv, write } from "bun";
import { DateTime } from "luxon";

const fetchNoteApi = async (path: string) => {
	const response = await fetch(`https://note.com/api/${path}`).then(
		(response) => response.json(),
	);
	await write(`./logs/${path}.json`, JSON.stringify(response, undefined, "\t"));
	return response;
};

const formatDateTime = (dateTime: string) => {
	const defaultTimezone = "Asia/Tokyo";
	// set timezone to default timezone and remove offset
	return DateTime.fromISO(dateTime).setZone(defaultTimezone).toISO({
		includeOffset: false,
	});
};

const splitTextByCharCount = (text: string, count: number) => {
	const result: string[] = [];
	for (let i = 0; i < text.length; i += count) {
		result.push(text.slice(i, i + count));
	}
	return result;
};

const {
	values: { hashtag },
} = parseArgs({
	args: argv,
	options: {
		hashtag: {
			type: "string",
		},
	},
	strict: true,
	allowPositionals: true,
});

console.log(`Hashtag: ${hashtag}`);

const csvStream = format({ headers: true });
csvStream.pipe(createWriteStream("result.csv"));

let notesCount = 0;
for (let page = 1; ; ) {
	const { data } = await fetchNoteApi(
		`v3/hashtags/${hashtag}/notes?order=popular&page=${page}&paid_only=false`,
	);
	notesCount += data.notes.length;
	console.log(`Page: ${page} (${notesCount} / ${data.count} notes)`);

	for (const note of data.notes) {
		const { data } = await fetchNoteApi(`v3/notes/${note.key}`);
		const remarks: string[] = [];

		if (
			!["TextNote", "ImageNote", "TalkNote", "SoundNote", "MovieNote"].includes(
				data.type,
			)
		) {
			const message = `Unsupported note type: ${data.type}`;
			remarks.push(message);
			console.error(`${message} (${data.key})`);
		}

		if (data.is_r18_confirmation_needed) {
			const message = "R-18 note";
			remarks.push(message);
			console.error(`${message}. body cannot be fetched: ${data.key}`);
		}

		const body =
			// body may be null if the note is a paid note
			(
				data.body
					? convert(decodeUnicodeEscapes(data.body))
					: // fallback to description for movie or sound notes
						data.description ??
						// fallback to picture captions for image notes
						data.pictures
							.map(
								// @ts-expect-error type not defined
								(picture) => picture.caption,
							)
							.join("\n")
			)
				// remove multiple empty lines
				.replace(/(?:\n){3,}/g, "\n\n")
				// remove leading and trailing line breaks
				.replace(/^(?:\n)+/, "")
				.replace(/(?:\n)+$/, "");
		if (!body) {
			const message = `Empty body: ${data.type}`;
			remarks.push(message);
			console.error(`${message} (${data.key})`);
		}

		const result = {
			title: data.name,
			createdAt: formatDateTime(data.created_at),
			publishAt: formatDateTime(data.publish_at),
			price: data.price,
			canReadAll: note.can_read_note_all,
			likeCount: data.like_count,
			shareCount: data.note_share_total_count,
			url: `https://note.com/notes/${data.key}`,
			type: data.type,
			user: data.user.nickname,
			userUrl: `https://note.com/${data.user.urlname}`,
			userNoteCount: data.user.note_count,
			userCreatedAt: formatDateTime(data.user.created_at),
			hashtags: data.hashtag_notes
				.map(
					// @ts-expect-error type not defined
					// remove leading #
					(hashtag) => hashtag.hashtag.name.replace(/^#/, ""),
				)
				.join(", "),
			remarks: remarks.join(", "),
			...Object.fromEntries(
				splitTextByCharCount(
					body,
					// max char count for a cell in Excel
					32767,
				).map((text, index) => [`body${index + 1}`, text]),
			),
		};

		csvStream.write(result);
	}

	if (data.is_last_page) {
		break;
	}
	page = data.next_page;
}

csvStream.end();

console.log("Done!");
