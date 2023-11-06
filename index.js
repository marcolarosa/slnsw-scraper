import fetch from "cross-fetch";
import fs from "fs-extra";
import path from "path";
import range from "lodash-es/range.js";
import orderBy from "lodash-es/orderBy.js";
const baseUrl = "https://apiv2.sl.nsw.gov.au/collection/v2/items/";
const parentId = "9WZRO3aY";
const headers = { "x-api-key": "GUo8VzvXen66RorgBHbXZF9TqPA5QWH7" };
const mappingFile = "thomas-mapping.csv";
const imageDownloadUrl = "https://files02.sl.nsw.gov.au/fotoweb/public_archive";
import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

import { walk } from "@root/walk";
import { parse } from "csv-parse";

main();
// downloadFiles({ folder: "9WZRO3aY/1bGdpQwY/1l4dKy51" });
// extractMetadata({ folder: "9WZRO3aY" });
// renameItemsAndFiles({ folder: "9WZRO3aY" });

let folder;
async function main() {
    let response = await fetch(`${baseUrl}/${parentId}/children`, { headers });
    let data = await response.json();
    folder += parentId;
    await fs.ensureDir(parentId);
    await fs.writeJSON(`${parentId}/data.json`, data, { spaces: 2 });
    // console.log(parent);

    for (let item of data.items) {
        await getItem({ itemId: item.id, parent: parentId });
    }
}

async function getItem({ itemId, parent }) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let response = await fetch(path.join(baseUrl, itemId), { headers });
    let data = await response.json();
    console.log(`Downloading: ${path.join(parent, itemId)}: ${data.item.title}`);

    if (data.item.files.length) {
        const folder = path.join(parent, itemId);
        await fs.ensureDir(folder);
        await fs.writeJSON(path.join(folder, "data.json"), data, { spaces: 2 });
        await downloadFiles({ folder });
    }

    // fetch any children and iterate over those as well
    response = await fetch(path.join(baseUrl, itemId, "children"), { headers });
    data = await response.json();
    for (let item of data.items) {
        await getItem({ itemId: item.id, parent: path.join(parent, itemId) });
    }
}

async function downloadFiles({ folder }) {
    const data = await fs.readJSON(`${folder}/data.json`);
    let nFiles = data.item.filesTotal;
    const identifier = data.item.files[0].identifiers
        .filter((i) => i.type === "iePid")[0]
        .value.replace("IE", "");
    const itemPath = identifier.slice(0, 4);
    for (let i in range(0, nFiles)) {
        let url = `${imageDownloadUrl}/${itemPath}/${identifier}${i}.jpg`;
        let response = await fetch(url);
        let blob = await response.buffer();
        await fs.ensureDir(folder);
        console.log("Downloading image:", path.join(folder, `${identifier}${i}.jpg`));
        await fs.writeFile(path.join(folder, `${identifier}${i}.jpg`), blob, { flag: "w+" });
    }
}

async function extractMetadata({ folder }) {
    let items = [];
    await walk(folder, async (err, pathname, dirent) => {
        if (pathname.match(/data.json/)) {
            try {
                let data = await fs.readJSON(pathname);
                items.push([pathname, data.item.title]);
            } catch (error) {}
        }
    });
    await fs.writeFile(path.join(folder, "downloads.txt"), items.join("\n "));
    console.log(items);
}

async function renameItemsAndFiles({ folder }) {
    let records = [];
    const parser = fs.createReadStream(`${__dirname}/thomas-mapping.csv`).pipe(
        parse({
            // CSV options if any
        })
    );
    for await (const record of parser) {
        // Work with each record
        records.push(record);
    }
    for (let record of records) {
        const itemName = record[0].trim();
        const itemPath = record[1].split("/").slice(0, -1).join("/").trim();
        console.log(itemName, itemPath, await fs.pathExists(itemPath));

        let files = [];
        await fs.remove(path.join(itemPath, itemName));
        let dirContents = await fs.readdir(itemPath);

        dirContents = orderBy(dirContents, (f) => parseInt(f.split(".jpg")[0]));
        for (let file of dirContents) {
            if (file === "data.json") continue;
            if (file.match(itemName)) {
                await fs.remove(path.join(itemPath, file));
            }
            files.push(file);
        }
        let pad = 2;
        if (files.length > 10 && files.length < 100) {
            pad = 2;
        } else if (files.length >= 100) {
            pad = 3;
        }
        await fs.ensureDir(path.join(itemPath, itemName));
        for (let [i, file] of files.entries()) {
            await fs.copy(
                path.join(itemPath, file),
                path.join(itemPath, itemName, `${itemName}-${String(i + 1).padStart(pad, "0")}.jpg`)
            );
            // console.log(
            //     path.join(itemPath, file),
            //     path.join(itemPath, `${itemName}-${String(i + 1).padStart(pad, "0")}.jpg`)
            // );
        }
    }
}
