// TODO: data management: 1/ import css 2/ import functions 3/ remove from popup
// TODO: fix biorxiv bibtex \t

// -------------------------
// -----  Local Utils  -----
// -------------------------

function getRandomInt(max) {
    // https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    return Math.floor(Math.random() * max);
}

const isValidHttpUrl = (string) => {
    let url;

    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
};

// ----------------------
// -----  Keyboard  -----
// ----------------------

const setUpKeyboardListeners = () => {
    addListener(document, "keypress", (e) => {
        const enterToClickIds = [
            "auto-tags-new-save",
            "auto-tags-item-save",
            "auto-tags-item-delete",
        ];
        if (e.key === "Enter") {
            if (enterToClickIds.some((id) => e.target.id.includes(id))) {
                dispatch(e.target.id, "click");
            }
        }
    });
};

// -------------------------------
// -----  Table of contents  -----
// -------------------------------

const makeTOC = async () => {
    const h1s = queryAll("h2");
    let toc = [];
    for (const h of h1s) {
        const title = h.innerText;
        const short = title.trim().toLowerCase().replace(/\s/g, "-");
        toc.push(`<a class="toc-item" href="#${short}">${title}</a>`);
        toc.push("&nbsp; &#149; &nbsp;");
    }
    setHTML("toc", toc.slice(0, -1).join(""));
};

// ----------------------------------------
// -----  Code Blocks & Highlighting  -----
// ----------------------------------------

const setupCodeBlocks = async () => {
    let codes = queryAll("code.trim-code");

    for (const code of codes) {
        let lines = code.innerHTML.split("\n").filter((l) => l.trim() !== "");
        const indent = Math.min(...lines.map((t) => t.match(/^\s*/)[0].length));
        lines = lines.map((t) => t.slice(indent));
        code.innerHTML = lines.join("\n");
        hljs.highlightElement(code);
    }
};

// --------------------------------
// -----  Import Papers List  -----
// --------------------------------
const handleSelectImportJson = () => {
    var file = document.getElementById("import-json-papers-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    setHTML("import-json-label-filename", file.name);
    if (!file.name.endsWith(".json")) return;
    findEl({ element: "import-json-papers-button" }).disabled = false;
};

const validateImportPaper = (p) => {
    if (typeof p === "string") {
        if (!isValidHttpUrl(p)) {
            alert(`${p} (entry ${i}) is not a valid URL`);
            return;
        }
    } else {
        if (!p.url || typeof p.url !== "string") {
            alert(
                `Entry ${i} should have a "url" string field: \n\n`,
                JSON.stringify(p)
            );
            return;
        }
        if (!isValidHttpUrl(p.url)) {
            alert(`${p.url} (entry ${i}) is not a valid URL`);
            return;
        }
        if (p.codeLink && !isValidHttpUrl(p.codeLink)) {
            alert(`${p.codeLink} (entry ${i}) is not a valid URL`);
            return;
        }
    }
    return true;
};

const storeImportedPaper = (paper) =>
    new Promise(async (resolve) => {
        const papers = (await getStorage("papers")) ?? {};
        const exists = Boolean(papers[paper.id]);
        if (!exists) {
            logOk("New imported paper!", paper);
            papers[paper.id] = paper;
            await setStorage("papers", papers);
        }
        resolve(exists);
    });

const parsePaper = async (url, is) => {
    let match;
    let paper = await makePaper(is, url);
    if (paper) {
        match = await tryPreprintMatch(paper, true);
    }
    if (match) {
        for (const k in match) {
            if (match[k] && !paper[k]) {
                paper[k] = match[k];
            }
            if (k === "bibtex" && match[k]) {
                paper[k] = match[k];
            }
        }
    }
    return paper;
};

const handleParseImportJson = async (e) => {
    var file = document.getElementById("import-json-papers-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    var reader = new FileReader();
    reader.onload = async function (e) {
        let papersToParse;
        try {
            papersToParse = JSON.parse(e.target.result);
            info("Entries loaded from user file: ", papersToParse);
            if (!Array.isArray(papersToParse)) {
                throw new Error("The JSON file must contain a *list* of papers");
            }
            for (const [i, p] of papersToParse.entries()) {
                if (!validateImportPaper(p)) {
                    return;
                }
            }
        } catch (error) {
            logError(error);
            alert("Error while parsing the file\n" + error);
            return;
        }

        const progressbar = querySelector("#import-json-progress-bar");

        const changeProgress = (progress) => {
            progressbar.style.width = `${progress}%`;
        };

        const feedback = findEl({ element: "json-import-feedback" });
        feedback.innerHTML = "";

        showId("import-json-status-container", "flex");

        for (const [i, p] of papersToParse.entries()) {
            const url = p.url ?? p;
            info(`[${i + 1}] Processing ${url}`);
            changeProgress(((i + 1) / papersToParse.length) * 100);
            setHTML(
                "import-json-status",
                `Parsing paper ${i + 1} / ${papersToParse.length} ${url}`
            );

            try {
                const is = await isPaper(url);
                if (!Object.values(is).some((i) => i)) {
                    feedback.innerHTML += `<li>[${
                        i + 1
                    }]&nbsp; &times;&nbsp; Error: ${url} does not come from a known source</li>`;
                    warn("Aborting.");
                } else {
                    let paper;

                    paper = await parsePaper(url, is);
                    if (p.codeLink) {
                        paper.codeLink = p.codeLink;
                    }
                    if (p.tags && Array.isArray(p.tags) && p.tags.length > 0) {
                        paper.tags = p.tags.filter(
                            (t) => typeof t === "string" && t.length > 0
                        );
                    }
                    const exists = await storeImportedPaper(paper);
                    if (exists) {
                        feedback.innerHTML += `<li>[${
                            i + 1
                        }]&nbsp; &times;&nbsp; Warning: ${url} already exists and has been ignored</li>`;
                        warn("Aborting.");
                    } else {
                        feedback.innerHTML += `<li>[${
                            i + 1
                        }]&nbsp; &#10004; ${url} has been successfully added to your Memory!</li>`;
                    }
                }
            } catch (error) {
                logError(`Entry ${i} (${url})`, error);
                warn("Aborting.");
                feedback.innerHTML += `<li>[${
                    i + 1
                }]&nbsp; &times;&nbsp; Error: ${url} (open the JavaScript Console for more info)</li>`;
            }
        }
        await pushToRemote();
        changeProgress(0);
        setHTML("import-json-status", `<strong>Done!</strong>`);
    };
    reader.readAsText(file);
};

const setupImportPapers = async () => {
    addListener("import-json-papers-input", "change", handleSelectImportJson);
    addListener("import-json-papers-button", "click", handleParseImportJson);
};

// ------------------------------
// -----  PWC Preferences  -----
// ------------------------------

const setupPWCPrefs = async () => {
    const pwcPrefs = (await getStorage("pwcPrefs")) ?? {};

    const official = pwcPrefs.hasOwnProperty("official") ? pwcPrefs.official : false;
    const framework = pwcPrefs.hasOwnProperty("framework")
        ? pwcPrefs.framework
        : "none";

    findEl({ element: "official-repo" }).checked = official;
    findEl({ element: "framework-select" }).value = framework;

    addListener("official-repo", "change", async (e) => {
        const newValue = findEl({ element: "official-repo" }).checked;
        const prefs = (await getStorage("pwcPrefs")) ?? {};
        prefs.official = newValue;
        setStorage("pwcPrefs", prefs);
    });
    addListener("framework-select", "change", async (e) => {
        const newValue = findEl({ element: "framework-select" }).value;
        let prefs = (await getStorage("pwcPrefs")) ?? {};
        prefs.framework = newValue;
        setStorage("pwcPrefs", prefs);
    });
};

// --------------------------
// -----  Auto Tagging  -----
// --------------------------

const autoTagsFeedback = (text, ok = true) => {
    const html = /*html*/ `<span style="color: ${ok ? "green" : "red"}">${text}</span>`;
    setHTML("auto-tags-feedback", html);
    setTimeout(() => {
        setHTML("auto-tags-feedback", "");
    }, 2000);
};

const autoTagsMaxIndex = (autoTags) => {
    return Math.max(...autoTags.map((t) => t.id));
};

const getAutoTagHTML = (at) => {
    const title = at.title || "";
    const authors = at.authors || "";
    const tags = (at.tags ?? []).join(", ");
    const id = at.id;

    return /*html*/ `
    <div class="row auto-tags-item" id="auto-tags-item--${id}">
        <div class="col-3">
            <input type="text" id="auto-tags-item-title--${id}" value="${title}" />
        </div>
        <div class="col-3">
            <input type="text" id="auto-tags-item-authors--${id}" value="${authors}" />
        </div>
        <div class="col-3">
            <input type="text" id="auto-tags-item-tags--${id}" value="${tags}" />
        </div>
        <div class="col-3">
            <div class="row">
                <div class="col-6 d-flex justify-content-evenly" title="Update regexs & tags">
                    <svg style="stroke: #24f62a; width: 32px; height: 32px; cursor: pointer"
                        id="auto-tags-item-save--${id}" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M5 12l5 5l10 -10" />
                    </svg>
                </div>
                <div class="col-6 d-flex justify-content-evenly" title="Delete regexs & tags">
                    <svg tabindex="0" style="stroke:  var(--red); width: 32px; height: 32px; cursor: pointer; stroke-width: 1.5"
                        id="auto-tags-item-delete--${id}" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <line x1="4" y1="7" x2="20" y2="7" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                </div>
            </div>
        </div>
    </div>
    `;
};

const addAutoTagListeners = (autoTags) => {
    for (const atid of autoTags.map((t) => t.id)) {
        addListener(`auto-tags-item-save--${atid}`, "click", updateAutoTagHandler);
        addListener(`auto-tags-item-delete--${atid}`, "click", deleteAutoTagHandler);
    }
    addListener("auto-tags-new-save", "click", saveNewAutoTagItem);
};

const updateAutoTagHandler = async (e) => {
    const i = e.target.id.split("--").last();
    let at = {};
    at.title = val(`auto-tags-item-title--${i}`).trim();
    at.authors = val(`auto-tags-item-authors--${i}`).trim();
    at.tags = val(`auto-tags-item-tags--${i}`);
    at.tags = at.tags ? at.tags.split(",").map((t) => t.trim()) : [];
    at.id = parseInt(i);

    let autoTags = (await getStorage("autoTags")) ?? [];
    const idx = autoTags.findIndex((a) => a.id === at.id);
    if (!Number.isInteger(idx)) {
        autoTagsFeedback("Update error", false);
        return;
    }
    autoTags[idx] = at;
    setStorage("autoTags", autoTags, () => {
        autoTagsFeedback("Change has been saved");
    });
};

const deleteAutoTagHandler = async (e) => {
    const i = e.target.id.split("--").last();
    let newAT = (await getStorage("autoTags")) ?? [];
    if (confirm("Confirm AutoTag item deletion?")) {
        newAT = newAT.filter((t) => t.id !== parseInt(i));
        setStorage("autoTags", newAT);
        findEl({ element: `auto-tags-item--${i}` }).remove();
    }
};

const saveNewAutoTagItem = async () => {
    let autoTags = (await getStorage("autoTags")) ?? [];
    const id = Math.max(autoTagsMaxIndex(autoTags) + 1, 0);
    let at = {};
    at.title = val("auto-tags-new-title").trim();
    at.authors = val("auto-tags-new-authors").trim();
    at.tags = val("auto-tags-new-tags");
    at.id = id;
    at.tags = at.tags ? at.tags.split(",").map((t) => t.trim()) : [];
    at.tags = at.tags.filter((t) => t);

    if (!at.title && !at.authors) {
        autoTagsFeedback(
            "You have to set at least one of: Title RegEx or Authors RegEx",
            false
        );
        return;
    }
    if (!at.tags.length) {
        autoTagsFeedback(
            "You have to set at least one tag (tags are coma-separated)",
            false
        );
        return;
    }
    if (!Number.isFinite(at.id)) {
        autoTagsFeedback("Saving error, contact developer", false);
        return;
    }
    log("Saving new autoTag item: ", at);
    autoTags.push(at);
    setStorage("autoTags", autoTags, () => {
        const items = findEl({ element: "auto-tags-list" }).getElementsByClassName(
            "auto-tags-item"
        );
        const last = [...items].last();
        last.insertAdjacentHTML("afterend", getAutoTagHTML(at));
        addListener(`auto-tags-item-save--${at.id}`, "click", updateAutoTagHandler);
        addListener(`auto-tags-item-delete--${at.id}`, "click", deleteAutoTagHandler);
        val(`auto-tags-new-title`, "");
        val(`auto-tags-new-authors`, "");
        val(`auto-tags-new-tags`, "");
    });
};

const setupAutoTags = async () => {
    let autoTags = (await getStorage("autoTags")) ?? [];
    if (typeof autoTags === "undefined") {
        autoTags = [
            {
                authors: "",
                title: "gan",
                tags: ["generative", "gan"],
                id: 0,
            },
        ];
    }
    let htmls = [];
    for (const at of autoTags) {
        htmls.push(getAutoTagHTML(at));
    }
    setHTML("auto-tags-list", htmls.join(""));
    addAutoTagListeners(autoTags);
};

// -------------------------------
// -----  Preprint Matching  -----
// -------------------------------

const addPreprintUpdate = (update) => {
    const { paper } = update;
    let contents = [];
    for (const [k, v] of Object.entries(update)) {
        if (k !== "paper" && k !== "bibtex") {
            if (v) {
                contents.push(`<span>${k}:</span>&nbsp;<span>${v}</span>`);
            }
        }
    }
    contents = contents.join("<br>");
    const html = /*html*/ `
    <div class="paper-update-item" id="paper-update-item--${paper.id}">
        <h4>${paper.title}</h4>
        <div>
            <div class="preprint-update-contents">
                <div>Updates to approve:</div>
                ${contents}
            </div>
            <div>
                <button class="preprint-update-ok" id="puo--${paper.id}">Ok</button>
                <button class="preprint-update-cancel" id="puc--${paper.id}">Cancel</button>
            </div>
        </div>
    </div>
    `;

    findEl({ element: "updates-to-confirm" }).append(createElementFromHTML(html));

    addListener(`puo--${paper.id}`, "click", async () => {
        await registerUpdate(update);
        findEl({ element: `paper-update-item--${paper.id}` }).remove();
    });
    addListener(`puc--${paper.id}`, "click", () => {
        findEl({ element: `paper-update-item--${paper.id}` }).remove();
    });
};

const registerUpdate = async (update) => {
    const { paper } = update;
    for (const [k, v] of Object.entries(update)) {
        if (k !== "paper" && v) {
            paper[k] = v;
        }
    }
    let papers = (await getStorage("papers")) ?? {};
    console.log("papers[paper.id]: ", papers[paper.id]);
    console.log("paper: ", paper);
    papers[paper.id] = paper;
    await setStorage("papers", papers);
};

const startMatching = async (papersToMatch) => {
    showId("matching-progress-container", "flex");
    setHTML("matching-status-total", papersToMatch.length);

    const progressbar = querySelector("#manual-parsing-progress-bar");

    const changeProgress = (progress) => {
        progressbar.style.width = `${progress}%`;
    };

    for (const [idx, paper] of papersToMatch.entries()) {
        console.log("idx: ", idx);
        setHTML("matching-status-index", idx + 1);
        setHTML("matching-status-title", paper.title);
        changeProgress(parseInt((idx / papersToMatch.length) * 100));

        var bibtex, venue, note, code, match;

        setHTML("matching-status-provider", "paperswithcode.org ...");
        pwcMatch = await tryPWCMatch(paper);
        console.log("pwcMatch: ", pwcMatch);
        code = !paper.codeLink && pwcMatch?.url;
        note = !paper.note && pwcMatch?.note;
        venue = pwcMatch?.venue;
        bibtex = pwcMatch?.bibtex;

        if (!venue) {
            setHTML("matching-status-provider", "dblp.org ...");
            match = await tryDBLP(paper);
            console.log("dblpMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            note = !paper.note && match?.note;
        }

        if (!venue) {
            setHTML("matching-status-provider", "crossref.org ...");
            match = await tryCrossRef(paper);
            console.log("crossRefMatch: ", match);
            venue = match?.venue;
            note = !paper.note && match?.note;
        }

        if (!venue) {
            setHTML("matching-status-provider", "semanticscholar.org ...");
            match = await trySemanticScholar(paper);
            console.log("semanticScholarMatch: ", match);
            venue = match?.venue;
            note = !paper.note && match?.note;
        }

        if (!venue) {
            setHTML("matching-status-provider", "unpaywall.org ...");
            match = await tryUnpaywall(paper);
            console.log("unpaywallMatch: ", match);
            venue = match?.venue;
            note = !paper.note && match?.note;
        }

        if (!venue) {
            setHTML("matching-status-provider", "scholar.google.com ...");
            match = await tryCrossRef(paper);
            console.log("googleScholarMatch: ", match);
            venue = match?.venue;
            note = !paper.note && match?.note;
        }
        if (venue || code) {
            addPreprintUpdate({ bibtex, venue, note, codeLink: code, paper });
        }
    }
    changeProgress(100);
    setHTML("matching-status", "All done!");
};

const setupPreprintMatching = async () => {
    const papers = (await getStorage("papers")) ?? {};
    const papersToMatch = Object.values(cleanPapers(papers))
        .filter((paper) => !paper.venue && paper.source !== "website")
        .map((value) => ({ value, sort: Math.random() })) // randomize
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
    setHTML("preprints-number", papersToMatch.length);
    addListener("start-matching", "click", () => {
        startMatching(papersToMatch);
    });
};

// -----------------------------
// -----  Data Management  -----
// -----------------------------

const handleDownloadMemoryClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        downloadTextFile(
            JSON.stringify(papers),
            `PaperMemory-data-${date}-${time}.json`,
            "text/json"
        );
    });
};

const handleDownloadBibtexJsonClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.keys(papers).reduce((obj, k) => {
            obj[k] = bibtexToString(papers[k].bibtex);
            return obj;
        }, {});
        downloadTextFile(
            JSON.stringify(bibtex),
            `PaperMemory-bibtex-${date}-${time}.json`,
            "text/json"
        );
    });
};

const handleDownloadBibtexPlainClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.values(papers)
            .map((v, k) => {
                let b = v.bibtex;
                if (!b) {
                    b = "";
                    log(v);
                }
                return bibtexToString(b);
            })
            .join("\n");
        downloadTextFile(
            bibtex,
            `PaperMemory-bibtex-${date}-${time}.bib`,
            "text/plain"
        );
    });
};

const handleDownloadMigrationPackageClick = async () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    const payload = await buildMigrationPackage();
    downloadTextFile(
        JSON.stringify(payload, null, 2),
        `PaperMemory-migration-${date}-${time}.json`,
        "text/json"
    );
};

const handleConfirmOverwrite = (papersToWrite, warning) => (e) => {
    setHTML(
        "overwriteFeedback",
        `<div class="pm-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
    );
    setTimeout(async () => {
        if (warning) {
            for (const id in papersToWrite) {
                if (papersToWrite.hasOwnProperty(id) && !id.startsWith("__")) {
                    const { paper, warnings } = validatePaper(papersToWrite[id], false);
                    papersToWrite[id] = paper;
                    log(warnings);
                }
            }
        }
        await setStorage("papers", papersToWrite);
        const pushed = (await shouldSync())
            ? " and pushed to your online Gist storage"
            : "";
        await pushToRemote();
        setHTML(
            "overwriteFeedback",
            `<h4 style="margin: 1.5rem">Memory overwritten${pushed}.</h4>`
        );
        val("overwrite-arxivmemory-input", "");
    }, 700);
};

const handleCancelOverwrite = (e) => {
    hideId("overwriteFeedback");
    setHTML("overwriteFeedback", ``);
    val("overwrite-arxivmemory-input", "");
};

const handleOverwriteMemory = () => {
    var file = document.getElementById("overwrite-arxivmemory-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            const overwritingPapers = JSON.parse(e.target.result);
            showId("overwriteFeedback");
            setHTML(
                "overwriteFeedback",
                `<div class="pm-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
            );
            const confirm = `<button id="confirm-overwrite">Confirm</button>`;
            const cancel = `<button id="cancel-overwrite">Cancel</button>`;
            const title = `<h4 class="w-100 code-font" style="font-size: 0.9rem;">Be careful, you will not be able to revert this operation. Make sure you have downloaded a backup of your memory before overwriting it.</h4>`;
            const overwriteDiv = `<div id="overwrite-buttons" class="flex-center-evenly pt-3 px-4"> ${title} <div class="flex-center-evenly w-100">${cancel} ${confirm}</div></div>`;
            setTimeout(async () => {
                const { success, message, warning, papersToWrite } =
                    await prepareOverwriteData(overwritingPapers);
                if (success) {
                    if (warning) {
                        const nWarnings = (warning.match(/<br\/>/g) ?? []).length;
                        setHTML(
                            "overwriteFeedback",
                            `<h5 class="errorTitle">Done with ${nWarnings} warnings. Confirm overwrite?</h5>${warning}${overwriteDiv}`
                        );
                    } else {
                        style("overwriteFeedback", "text-align", "center");
                        setHTML(
                            "overwriteFeedback",
                            `<h5 class="mb-0 mt-2">Data seems valid. Confirm overwrite?</h5>${overwriteDiv}`
                        );
                    }
                    addListener(
                        "confirm-overwrite",
                        "click",
                        handleConfirmOverwrite(papersToWrite, warning)
                    );
                    addListener("cancel-overwrite", "click", handleCancelOverwrite);
                } else {
                    setHTML("overwriteFeedback", message);
                }
            }, 1500);
        } catch (error) {
            setHTML(
                "overwriteFeedback",
                `<br/><strong>Error:</strong><br/>${stringifyError(error)}`
            );
        }
    };
    reader.readAsText(file);
};

const handleSelectOverwriteFile = () => {
    var file = document.getElementById("overwrite-arxivmemory-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    setHTML("overwrite-file-name", file.name);
    if (!file.name.endsWith(".json")) return;
    findEl({ element: "overwrite-arxivmemory-button" }).disabled = false;
};

const handleSelectMigrationPackageFile = () => {
    let file = document.getElementById("import-migration-package-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    setHTML("import-migration-file-name", file.name);
    if (!file.name.endsWith(".json")) return;
    findEl({ element: "import-migration-package-button" }).disabled = false;
};

const handleImportMigrationPackage = () => {
    let file = document.getElementById("import-migration-package-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        showId("importMigrationFeedback");
        setHTML(
            "importMigrationFeedback",
            `<div class="pm-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
        );

        try {
            const payload = JSON.parse(e.target.result);
            const prepared = await prepareMigrationImportData(payload);
            if (!prepared.success) {
                setHTML(
                    "importMigrationFeedback",
                    `<strong>Error:</strong><br/>${prepared.message}`
                );
                return;
            }

            const warning = prepared.warning
                ? "\n\nValidation warnings were found in imported papers."
                : "";
            const confirmMessage =
                "This will overwrite your local Memory and configuration (including sensitive credentials). Continue?" +
                warning;
            if (!confirm(confirmMessage)) {
                setHTML("importMigrationFeedback", "Import cancelled.");
                return;
            }

            setHTML(
                "importMigrationFeedback",
                `<div class="pm-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
            );

            await setStorage("papers", prepared.papersToWrite);
            await new Promise((resolve) => {
                chrome.storage.local.remove(global.migrationConfigKeys ?? [], () =>
                    resolve(true)
                );
            });
            await new Promise((resolve) => {
                chrome.storage.local.set(prepared.configToWrite, () => resolve(true));
            });

            setHTML(
                "importMigrationFeedback",
                "<h4 style='margin: 1.5rem'>Migration package imported successfully. Reload this page to refresh the current state.</h4>"
            );
            val("import-migration-package-input", "");
            findEl({ element: "import-migration-package-button" }).disabled = true;
            setHTML("import-migration-file-name", "");
        } catch (error) {
            setHTML(
                "importMigrationFeedback",
                `<strong>Error:</strong><br/>${stringifyError(error)}`
            );
        }
    };
    reader.readAsText(file);
};

const handleExportTagsConfirm = () => {
    const tags = parseTags(findEl({ element: "export-tags-select" }));
    const operator = findEl({ element: "export-tags-operator" }).value;
    const format = findEl({ element: "export-tags-format" }).value;

    let papers = global.state.sortedPapers.filter((p) =>
        operator === "AND"
            ? p.tags && tags.every((t) => p.tags.includes(t))
            : p.tags && tags.some((t) => p.tags.includes(t))
    );
    if (format === "bib") {
        papers = papers.map((p) => bibtexToString(p.bibtex)).join("\n");
    } else if (format.includes("json")) {
        papers = JSON.stringify(
            papers.map((p) => {
                if (format.includes("url")) return p.pdfLink;

                let e = { url: p.pdfLink, title: p.title };
                if (p.tags && p.tags.length > 0) {
                    e.tags = p.tags;
                }
                if (p.codeLink) {
                    e.codeLink = p.codeLink;
                }
                return e;
            }),
            null,
            2
        );
    }
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    const fname = `PMExport-${date}-${time}-${tags.join("-")}${
        format.includes("url") ? "-urls" : ""
    }`;
    if (format.includes("json")) {
        downloadTextFile(papers, fname + ".json", "text/json");
    } else {
        downloadTextFile(papers, fname + ".bib", "text/plain");
    }
};

const setupDataManagement = () => {
    addListener("download-arxivmemory", "click", handleDownloadMemoryClick);
    addListener("download-bibtex-json", "click", handleDownloadBibtexJsonClick);
    addListener("download-bibtex-plain", "click", handleDownloadBibtexPlainClick);
    addListener(
        "download-migration-package",
        "click",
        handleDownloadMigrationPackageClick
    );
    addListener("overwrite-arxivmemory-button", "click", handleOverwriteMemory);
    addListener("overwrite-arxivmemory-input", "change", handleSelectOverwriteFile);
    addListener(
        "import-migration-package-input",
        "change",
        handleSelectMigrationPackageFile
    );
    addListener(
        "import-migration-package-button",
        "click",
        handleImportMigrationPackage
    );

    const tagOptions = [...global.state.paperTags]
        .sort()
        .map((t, i) => {
            const h = '<option value="' + t + '"'; // not string literal here for minification
            return h + `>${t}</option>`;
        })
        .join("");
    setHTML("export-tags-select", tagOptions);
    $(`#export-tags-select`).select2({
        ...global.select2Options,
        placeholder: "Tags to export",
        width: "100%",
        tags: false,
    });
    addListener("export-tags-confirm", "click", handleExportTagsConfirm);
};

// ----------------------------
// -----  Select Sources  -----
// ----------------------------

const makeSource = ([key, sourceDict], idx) => {
    if (key === "website") return "";
    const display = sourceDict.name.split("(")[0].trim();
    return /*html*/ `
    <div class="source-container">
        <div class="source-wrapper">
            <input class="switch source-switch" type="checkbox" id="source-${key}" name="${key}" value="${key}">
            <label for="${key}">${display}</label><br><br>
        </div>
    </div>`;
};

const setupSourcesSelection = async () => {
    const sources = global.knownPaperPages;
    const table = Object.entries(sources).map(makeSource).join("");
    setHTML("select-sources-container", table);

    let ignoreSources = (await getStorage("ignoreSources")) ?? {};

    for (const key of Object.keys(sources)) {
        ignoreSources[key] = ignoreSources.hasOwnProperty(key)
            ? ignoreSources[key]
            : false;
        const el = findEl({ element: `source-${key}` });
        if (el) {
            el.checked = !ignoreSources[key];
        }
    }
    setStorage("ignoreSources", ignoreSources);

    for (const key of Object.keys(sources)) {
        addListener(`source-${key}`, "change", async (e) => {
            const key = e.target.id.replace("source-", "");
            let ignoreSources = (await getStorage("ignoreSources")) ?? {};
            const el = findEl({ element: e.target.id });
            ignoreSources[key] = !el.checked;
            console.log("Updating source", key, "to", ignoreSources[key]);
            setStorage("ignoreSources", ignoreSources);
        });
    }
};

// ---------------------
// -----  SYNCING  -----
// ---------------------

const setupSync = async () => {
    showId("pat-loader");
    const { ok, payload, error } = (await shouldSync())
        ? await getGist({ patError: false })
        : { ok: true, payload: { pat: (await getStorage("syncPAT")) ?? "" } };
    hideId("pat-loader");

    if (!ok) {
        if (error) {
            setHTML("pat-feedback", "Invalid PAT" + "<br/><br/>" + error);
        }
        hideId("pat-loader");
        await toggleSync({ hideAll: true });
    } else {
        const { pat } = payload;
        val("pat-input", pat);
        await toggleSync();
    }

    addListener("save-pat", "click", async () => {
        console.log("Attempting to store Github PAT");
        showId("pat-loader");
        const pat = val("pat-input");
        if (!pat) {
            setHTML("pat-feedback", "Invalid PAT");
            await setStorage("syncPAT", pat);
            await setStorage("syncState", false);
            hideId("pat-loader");
            await toggleSync({ hideAll: true });
            return;
        }
        const { ok, payload, error } = await getGist({ pat });
        if (!ok) {
            logError(error);
            setHTML("pat-feedback", error.response.data.message);
        } else {
            const { file, pat, gistId } = payload;
            log("Gist ID", gistId);
            log("Data URL", file.raw_url);
            log("Personal Access Token", pat);
            setHTML("pat-feedback", "Ok! Token is valid.");
            toggleSync();
        }
        hideId("pat-loader");
    });

    addListener("stop-gh-sync", "click", async () => {
        const c = confirm("Are you sure you want to stop syncing to Github?");
        if (!c) return;
        const pat = "";
        setStorage("syncPAT", pat);
        setStorage("syncState", false);
        val("pat-input", pat);
        toggleSync();
    });

    addListener("start-gh-sync", "click", async () => {
        showId("sync-loader");
        if (!(await showSyncWarning())) {
            hideId("sync-loader");
            return;
        }
        const { ok, payload, error } = await getGist();
        if (!ok) {
            alert("Your Personal Access Token is invalid.\n\n" + (error ?? ""));
            return;
        }
        const { file, pat, gistId } = payload;
        const data = await getDataForGistFile({ file, gistId });
        let userChoice = "no-remote";
        if (data) {
            console.log("Existing data file content:", data);
            userChoice = await getSyncStrategy();
            if (!userChoice) {
                hideId("sync-loader");
                return;
            }
        }
        try {
            if (userChoice === "remote-local" || userChoice === "no-remote") {
                // writing to remote, keeping local untouched
                if (userChoice === "remote-local") {
                    // save pre-existing remote data
                    const now = new Date();
                    const date = now.toLocaleDateString().replaceAll("/", ".");
                    const time = now.toLocaleTimeString().replaceAll(":", ".");
                    downloadTextFile(
                        JSON.stringify(data),
                        `PaperMemory-remote-data-backup-${date}-${time}.json`,
                        "text/json"
                    );
                }
                await updateGistFile({ file, content: global.state.papers, gistId });
                await setSyncOk();
            } else if (userChoice === "local-remote") {
                // overwrite local data with remote data
                dispatch("download-arxivmemory", "click");
                const remotePapers = data;
                const { success, message, warning, papersToWrite } =
                    await prepareOverwriteData(remotePapers);
                if (success) {
                    if (warning) {
                        const nWarnings = (warning.match(/<br\/>/g) ?? []).length;
                        setHTML(
                            "overwriteRemoteFeedback",
                            `<h5 class="errorTitle">Done with ${nWarnings} non-breaking warnings.</h5>${warning}<br/><br/>`
                        );
                    } else {
                        style("overwriteRemoteFeedback", "text-align", "center");
                        setHTML(
                            "overwriteRemoteFeedback",
                            `<h5 class="mb-0 mt-2">Data is valid. Overwriting</h5>`
                        );
                    }
                    await setStorage("papers", papersToWrite);
                    await setSyncOk();
                } else {
                    setHTML("overwriteRemoteFeedback", message);
                }
            } else if (userChoice === "merge") {
                const now = new Date();
                const date = now.toLocaleDateString().replaceAll("/", ".");
                const time = now.toLocaleTimeString().replaceAll(":", ".");
                downloadTextFile(
                    JSON.stringify(data),
                    `PaperMemory-merge--remote-data-backup-${date}-${time}.json`,
                    "text/json"
                );
                downloadTextFile(
                    JSON.stringify(await getStorage("papers")),
                    `PaperMemory-merge--local-data-backup-${date}-${time}.json`,
                    "text/json"
                );
                let mergedPapers = {};
                const remotePapers = data;
                const localPapers = await getStorage("papers");
                const remoteVersion = remotePapers["__dataVersion"];
                const localVersion = localPapers["__dataVersion"];
                mergedPapers["__dataVersion"] = Math.min(remoteVersion, localVersion);
                for (const key of Object.keys(localPapers)) {
                    if (key === "__dataVersion") continue;
                    if (remotePapers[key]) {
                        mergedPapers[key] = mergePapers({
                            newPaper: remotePapers[key],
                            oldPaper: localPapers[key],
                            overwrites: [],
                            syncMerge: true,
                        });
                    } else {
                        mergedPapers[key] = localPapers[key];
                    }
                }
                for (const key of Object.keys(remotePapers)) {
                    if (key === "__dataVersion") continue;
                    if (!mergedPapers[key]) {
                        mergedPapers[key] = remotePapers[key];
                    }
                }

                const { success, message, warning, papersToWrite } =
                    await prepareOverwriteData(mergedPapers);
                if (success) {
                    if (warning) {
                        const nWarnings = (warning.match(/<br\/>/g) ?? []).length;
                        setHTML(
                            "overwriteRemoteFeedback",
                            `<h5 class="errorTitle">Done with ${nWarnings} non-breaking warnings.</h5>${warning}<br/><br/>`
                        );
                    } else {
                        style("overwriteRemoteFeedback", "text-align", "center");
                        setHTML(
                            "overwriteRemoteFeedback",
                            `<h5 class="mb-0 mt-2">Data is valid. Overwriting</h5>`
                        );
                    }
                    await setStorage("papers", papersToWrite);
                    await updateGistFile({ file, content: papersToWrite, gistId });
                    await setSyncOk();
                } else {
                    setHTML("overwriteRemoteFeedback", message);
                }
            }
        } catch (e) {
            setHTML("overwriteRemoteFeedback", e);
        }
        await sendMessageToBackground({ type: "restartGist" });
        hideId("sync-loader");
    });
};

const getSyncStrategy = async () => {
    showOptionsModal("sync-strategy");
    return new Promise((resolve) => {
        const done = (val) => {
            closeModal();
            resolve(val);
        };
        addEventToClass("modal-sync-strategy-choice", "click", (event) => {
            const id = event.target.id ?? "";
            const strategy = id.split("modal-sync-").last() ?? "";
            done(strategy === "cancel" ? "" : strategy);
        });
        addListener("close-modal", "click", () => done(""));
        addListener(window, "click", (event) => {
            event.target === findEl({ element: "modal-wrapper" }) && done("");
        });
    });
};

const showSyncWarning = async () => {
    showOptionsModal("sync-warning");
    return new Promise((resolve) => {
        const done = (val) => {
            closeModal();
            resolve(val);
        };

        addListener("modal-sync-warning-continue", "click", () => done(true));

        addListener("modal-sync-warning-description", "click", () => done(false));
        addListener("modal-sync-warning-cancel", "click", () => done(false));
        addListener("close-modal", "click", () => done(false));
        addListener(window, "click", (event) => {
            event.target === findEl({ element: "modal-wrapper" }) && done(false);
        });
    });
};

const setSyncOk = async ({ push = false } = {}) => {
    await setStorage("syncState", true);
    push && (await pushToRemote());
    await toggleSync();
    alert("Synced!");
};

const toggleSync = async ({ hideAll = false } = {}) => {
    const syncState = await getStorage("syncState");
    if (hideAll) {
        hideId("stop-sync");
        hideId("start-sync");
        return;
    }
    if (!syncState) {
        showId("start-sync");
        hideId("stop-sync");
    } else {
        showId("stop-sync");
        hideId("start-sync");
    }
};

// ---------------------
// -----  Sidebar  -----
// ---------------------

const makeSideBar = () => {
    const sections = queryAll(".section").filter(
        (section) => !!section.querySelector("h2")
    );
    const lis = sections.map((section) => {
        const h2 = section.querySelector("h2");
        const id = h2.id;
        const title = h2.innerText;
        let ul = "";
        const titles = ["h3", "h4", "h5", "h6"];
        let hs = [];
        for (const t of titles) {
            hs = section.querySelectorAll(t);
            if (hs.length) break;
        }
        if (hs.length > 1) {
            ul = `<ul>${[...hs]
                .map((h) => `<li><a href="#${h.id}">${h.innerText}</a></li>`)
                .join("")}</ul>`;
        }

        return `<li class="nav-item"><a class="nav-link" href="#${id}">${title}</a>${ul}</li>`;
    });
    setHTML(querySelector("nav ul"), lis.join(""));
};

const setupSidebar = async () => {
    makeSideBar();
    var toc = querySelector(".toc");
    var tocPath = querySelector(".toc-marker path");
    var tocItems;

    // Factor of screen size that the element must cross
    // before it's considered visible
    var TOP_MARGIN = 0.05,
        BOTTOM_MARGIN = 0.1;

    var pathLength;

    var lastPathStart, lastPathEnd;

    window.addEventListener("resize", drawPath, false);
    window.addEventListener("scroll", sync, false);

    drawPath();

    function drawPath() {
        tocItems = [].slice.call(toc.querySelectorAll("li"));

        // Cache element references and measurements
        tocItems = tocItems.map(function (item) {
            var anchor = item.querySelector("a");
            var target = document.getElementById(anchor.getAttribute("href").slice(1));

            return {
                listItem: item,
                anchor: anchor,
                target: target,
            };
        });

        // Remove missing targets
        tocItems = tocItems.filter(function (item) {
            return !!item.target;
        });

        var path = [];
        var pathIndent;

        tocItems.forEach(function (item, i) {
            var x = item.anchor.offsetLeft - 5,
                y = item.anchor.offsetTop,
                height = item.anchor.offsetHeight;

            if (i === 0) {
                path.push("M", x, y, "L", x, y + height);
                item.pathStart = 0;
            } else {
                // Draw an additional line when there's a change in
                // indent levels
                if (pathIndent !== x) path.push("L", pathIndent, y);

                path.push("L", x, y);

                // Set the current path so that we can measure it
                tocPath.setAttribute("d", path.join(" "));
                item.pathStart = tocPath.getTotalLength() || 0;

                path.push("L", x, y + height);
            }

            pathIndent = x;

            tocPath.setAttribute("d", path.join(" "));
            item.pathEnd = tocPath.getTotalLength();
        });

        pathLength = tocPath.getTotalLength();

        sync();
    }

    function sync() {
        var windowHeight = window.innerHeight;

        var pathStart = pathLength,
            pathEnd = 0;

        var visibleItems = 0;

        tocItems.forEach(function (item) {
            var targetBounds = item.target.getBoundingClientRect();

            if (
                targetBounds.bottom > windowHeight * TOP_MARGIN &&
                targetBounds.top < windowHeight * (1 - BOTTOM_MARGIN)
            ) {
                pathStart = Math.min(item.pathStart, pathStart);
                pathEnd = Math.max(item.pathEnd, pathEnd);

                visibleItems += 1;

                item.listItem.classList.add("visible");
            } else {
                item.listItem.classList.remove("visible");
            }
        });

        // Specify the visible path or hide the path altogether
        // if there are no visible items
        if (visibleItems > 0 && pathStart < pathEnd) {
            if (pathStart !== lastPathStart || pathEnd !== lastPathEnd) {
                tocPath.setAttribute("stroke-dashoffset", "1");
                tocPath.setAttribute(
                    "stroke-dasharray",
                    "1, " + pathStart + ", " + (pathEnd - pathStart) + ", " + pathLength
                );
                tocPath.setAttribute("opacity", 1);
            }
        } else {
            tocPath.setAttribute("opacity", 0);
        }

        lastPathStart = pathStart;
        lastPathEnd = pathEnd;
    }
};

// -------------------
// -----  Modal  -----
// -------------------

const showOptionsModal = (name) => {
    queryAll(".modal-content-div").forEach(hideId);
    showId(`modal-${name}-content`, "contents");
    style("modal-wrapper", "display", "flex");
    document.body.style.overflow = "hidden";
};

const closeModal = () => {
    style("modal-wrapper", "display", "none");
    document.body.style.overflow = "auto";
};

const setupModals = () => {
    addListener("close-modal", "click", closeModal);
    addListener(window, "click", (event) => {
        event.target === findEl({ element: "modal-wrapper" }) && closeModal();
    });
};

// ----------------------------
// -----  AI Tagging Setup  ---
// ----------------------------

const setupAITagging = async () => {
    // Load AI configuration
    const aiBaseUrl = await getStorage("aiApiBaseUrl") || global.aiTaggingDefaults.baseUrl;
    const aiApiKey = await getStorage("aiApiKey") || "";
    const aiModel = await getStorage("aiModel") || global.aiTaggingDefaults.model;
    const aiAutoTag = await getStorage("aiAutoTagOnSave") || false;
    const aiPrompt = await getStorage("aiTaggingPrompt") || global.aiTaggingDefaults.prompt;
    const aiAreaTags = await getStorage("aiAreaTags") || global.aiTaggingDefaults.areaTags;
    const aiTaskTags = await getStorage("aiTaskTags") || global.aiTaggingDefaults.taskTags;
    const aiMethodTags = await getStorage("aiMethodTags") || global.aiTaggingDefaults.methodTags;

    // Populate form fields
    if (aiBaseUrl) {
        findEl({ element: "ai-api-base-url" }).value = aiBaseUrl;
    }
    if (aiApiKey) {
        findEl({ element: "ai-api-key" }).value = aiApiKey;
    }
    if (aiModel) {
        findEl({ element: "ai-model" }).value = aiModel;
    }
    if (aiPrompt) {
        findEl({ element: "ai-custom-prompt" }).value = aiPrompt;
    }
    if (aiAreaTags) {
        findEl({ element: "ai-area-tags" }).value = aiAreaTags.join("\n");
    }
    if (aiTaskTags) {
        findEl({ element: "ai-task-tags" }).value = aiTaskTags.join("\n");
    }
    if (aiMethodTags) {
        findEl({ element: "ai-method-tags" }).value = aiMethodTags.join("\n");
    }

    // Show tagging controls if configured
    if (aiApiKey && aiBaseUrl) {
        showId("ai-tagging-section");
    }

    if (aiAutoTag) {
        findEl({ element: "check-ai-auto-tag" }).checked = true;
    }

    // Save AI configuration
    addListener("save-ai-config", "click", async () => {
        const baseUrl = findEl({ element: "ai-api-base-url" }).value.trim();
        const apiKey = findEl({ element: "ai-api-key" }).value.trim();
        const model = findEl({ element: "ai-model" }).value.trim();

        if (!baseUrl || !apiKey || !model) {
            setHTML("ai-feedback", "Please fill in all required fields");
            return;
        }

        await setStorage("aiApiBaseUrl", baseUrl);
        await setStorage("aiApiKey", apiKey);
        await setStorage("aiModel", model);
        await setStorage("aiTaggingEnabled", true);

        setHTML("ai-feedback", "Configuration saved successfully!");
        showId("ai-tagging-section");

        setTimeout(() => {
            setHTML("ai-feedback", "");
        }, 3000);
    });

    // Test AI connection
    addListener("test-ai-connection", "click", async () => {
        showId("ai-loader");
        setHTML("ai-feedback", "Testing connection...");

        const baseUrl = findEl({ element: "ai-api-base-url" }).value.trim();
        const apiKey = findEl({ element: "ai-api-key" }).value.trim();
        const model = findEl({ element: "ai-model" }).value.trim();

        if (!baseUrl || !apiKey || !model) {
            hideId("ai-loader");
            setHTML("ai-feedback", "Please save configuration first");
            return;
        }

        const result = await sendMessageToBackground({
            type: "testAIConnection",
            baseUrl,
            apiKey,
            model,
        });

        hideId("ai-loader");

        if (result.ok) {
            setHTML("ai-feedback", "Connection successful! AI tagging is ready.");
            showId("ai-tagging-section");
        } else {
            setHTML("ai-feedback", `Connection failed: ${result.error}`);
        }
    });

    // Tag all untagged papers
    addListener("tag-untagged-papers", "click", async () => {
        const papers = await getStorage("papers") || {};
        const untaggedCount = Object.values(papers).filter(p => !p.tags || p.tags.length === 0).length;

        if (untaggedCount === 0) {
            setHTML("ai-tagging-feedback", "All papers already have tags!");
            return;
        }

        if (!confirm(`This will generate AI tags for ${untaggedCount} untagged papers. This may take a while. Continue?`)) {
            return;
        }

        showId("ai-tagging-loader");
        setHTML("ai-tagging-feedback", "Generating tags...");
        setHTML("ai-tagging-progress", "");

        const result = await sendMessageToBackground({
            type: "tagAllUntaggedPapers",
        });

        hideId("ai-tagging-loader");

        if (result.ok) {
            const msg = `Successfully tagged ${result.success} papers. Failed: ${result.failed}`;
            setHTML("ai-tagging-feedback", msg);

            if (result.failed > 0 && result.errors) {
                const errorDetails = result.errors.slice(0, 3).join("<br>");
                setHTML("ai-tagging-progress", `<small>First errors:<br>${errorDetails}</small>`);
            }
        } else {
            setHTML("ai-tagging-feedback", `Tagging failed: ${result.error}`);
        }
    });

    // Enable/disable auto-tagging
    addListener("check-ai-auto-tag", "change", async (e) => {
        await setStorage("aiAutoTagOnSave", e.target.checked);
    });

    // Save custom prompt
    addListener("save-ai-prompt", "click", async () => {
        const prompt = findEl({ element: "ai-custom-prompt" }).value.trim();

        if (!prompt) {
            setHTML("ai-prompt-feedback", "Prompt cannot be empty");
            return;
        }

        await setStorage("aiTaggingPrompt", prompt);
        setHTML("ai-prompt-feedback", "Custom prompt saved!");

        setTimeout(() => {
            setHTML("ai-prompt-feedback", "");
        }, 3000);
    });

    // Reset to default prompt
    addListener("reset-ai-prompt", "click", async () => {
        const defaultPrompt = global.aiTaggingDefaults.prompt;
        findEl({ element: "ai-custom-prompt" }).value = defaultPrompt;
        await setStorage("aiTaggingPrompt", defaultPrompt);
        setHTML("ai-prompt-feedback", "Prompt reset to default!");

        setTimeout(() => {
            setHTML("ai-prompt-feedback", "");
        }, 3000);
    });

    // Save tag taxonomy
    addListener("save-ai-tags", "click", async () => {
        const areaTagsText = findEl({ element: "ai-area-tags" }).value.trim();
        const taskTagsText = findEl({ element: "ai-task-tags" }).value.trim();
        const methodTagsText = findEl({ element: "ai-method-tags" }).value.trim();

        const areaTags = areaTagsText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
        const taskTags = taskTagsText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
        const methodTags = methodTagsText.split("\n").map(t => t.trim()).filter(t => t.length > 0);

        await setStorage("aiAreaTags", areaTags);
        await setStorage("aiTaskTags", taskTags);
        await setStorage("aiMethodTags", methodTags);

        setHTML("ai-tags-feedback", "Tag taxonomy saved!");

        setTimeout(() => {
            setHTML("ai-tags-feedback", "");
        }, 3000);
    });

    // Reset tag taxonomy to default
    addListener("reset-ai-tags", "click", async () => {
        const defaultAreaTags = global.aiTaggingDefaults.areaTags;
        const defaultTaskTags = global.aiTaggingDefaults.taskTags;
        const defaultMethodTags = global.aiTaggingDefaults.methodTags;

        findEl({ element: "ai-area-tags" }).value = defaultAreaTags.join("\n");
        findEl({ element: "ai-task-tags" }).value = defaultTaskTags.join("\n");
        findEl({ element: "ai-method-tags" }).value = defaultMethodTags.join("\n");

        await setStorage("aiAreaTags", defaultAreaTags);
        await setStorage("aiTaskTags", defaultTaskTags);
        await setStorage("aiMethodTags", defaultMethodTags);

        setHTML("ai-tags-feedback", "Tag taxonomy reset to default!");

        setTimeout(() => {
            setHTML("ai-tags-feedback", "");
        }, 3000);
    });
};

// ----------------------------
// -----  Notion Setup  -------
// ----------------------------

const setupNotionSync = async () => {
    // Load Notion credentials and state
    const notionToken = await getStorage("notionToken");
    const notionDatabaseId = await getStorage("notionDatabaseId");
    const notionSyncState = await getStorage("notionSyncState");
    const autoSyncEnabled = await getStorage("notionAutoSyncEnabled");
    const syncInterval = await getStorage("notionSyncInterval") || 60;

    if (notionToken) {
        findEl({ element: "notion-token-input" }).value = notionToken;
    }
    if (notionDatabaseId) {
        findEl({ element: "notion-database-input" }).value = notionDatabaseId;
    }
    if (notionToken && notionDatabaseId) {
        showId("notion-sync-section");
    }
    if (notionSyncState) {
        findEl({ element: "check-notion-sync" }).checked = true;
    }
    if (autoSyncEnabled) {
        findEl({ element: "check-notion-auto-sync" }).checked = true;
    }
    findEl({ element: "notion-sync-interval" }).value = syncInterval;

    // Save Notion credentials
    addListener("save-notion-credentials", "click", async () => {
        const token = findEl({ element: "notion-token-input" }).value.trim();
        const databaseId = findEl({ element: "notion-database-input" }).value.trim();

        if (!token || !databaseId) {
            setHTML("notion-feedback", "Please enter both token and database ID");
            return;
        }

        await setStorage("notionToken", token);
        await setStorage("notionDatabaseId", databaseId);

        setHTML("notion-feedback", "Credentials saved successfully!");
        showId("notion-sync-section");

        setTimeout(() => {
            setHTML("notion-feedback", "");
        }, 3000);
    });

    // Test Notion connection
    addListener("test-notion-connection", "click", async () => {
        showId("notion-loader");
        setHTML("notion-feedback", "Testing connection...");

        const token = await getStorage("notionToken");
        const databaseId = await getStorage("notionDatabaseId");

        if (!token || !databaseId) {
            hideId("notion-loader");
            setHTML("notion-feedback", "Please save credentials first");
            return;
        }

        const result = await sendMessageToBackground({
            type: "testNotionConnection",
            token: token,
            databaseId: databaseId
        });

        hideId("notion-loader");

        if (result.ok) {
            setHTML("notion-feedback", "Connection successful! Database is accessible.");
            showId("notion-sync-section");
        } else {
            setHTML("notion-feedback", `Connection failed: ${result.error}`);
        }
    });

    // Manual sync all papers
    addListener("manual-notion-sync", "click", async () => {
        const papers = await getStorage("papers");
        const paperCount = Object.keys(papers).filter(id => id !== "__dataVersion").length;

        // Estimate sync time (based on rate limit: 3 requests/second)
        const estimatedSeconds = Math.ceil(paperCount / 3);
        const estimatedMinutes = Math.floor(estimatedSeconds / 60);
        const remainingSeconds = estimatedSeconds % 60;
        const timeEstimate = estimatedMinutes > 0
            ? `~${estimatedMinutes}m ${remainingSeconds}s`
            : `~${estimatedSeconds}s`;

        const confirmMsg = `This will sync ${paperCount} papers to Notion.\n` +
                          `Papers already in Notion will be skipped.\n` +
                          `Estimated time: ${timeEstimate}\n\n` +
                          `Continue?`;

        if (!confirm(confirmMsg)) {
            return;
        }

        showId("notion-sync-loader");
        setHTML("notion-sync-feedback", `Syncing ${paperCount} papers...`);
        setHTML("notion-sync-progress", `Estimated time: ${timeEstimate}`);

        const startTime = Date.now();

        const result = await sendMessageToBackground({
            type: "syncAllNotionPapers",
            papers: papers
        });

        hideId("notion-sync-loader");

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const durationMinutes = Math.floor(duration / 60);
        const durationSeconds = (duration % 60).toFixed(1);
        const actualTime = durationMinutes > 0
            ? `${durationMinutes}m ${durationSeconds}s`
            : `${durationSeconds}s`;

        if (result.ok) {
            const msg = `Sync complete! (Time: ${actualTime})<br>` +
                       `Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`;
            setHTML("notion-sync-feedback", msg);

            if (result.errors.length > 0) {
                const errorDetails = result.errors.slice(0, 5).map(e =>
                    `${e.paperId}: ${e.error}`
                ).join("<br>");
                setHTML("notion-sync-progress", `<small>First ${Math.min(5, result.errors.length)} errors:<br>${errorDetails}</small>`);
            } else {
                setHTML("notion-sync-progress", "");
            }
        } else {
            setHTML("notion-sync-feedback", `Sync failed: ${result.error}`);
        }
    });

    // Enable/disable automatic sync
    addListener("check-notion-sync", "change", async (e) => {
        await setStorage("notionSyncState", e.target.checked);

        if (e.target.checked) {
            const result = await sendMessageToBackground({ type: "initNotionSync" });
            if (!result.ok) {
                e.target.checked = false;
                await setStorage("notionSyncState", false);
                alert(`Failed to enable Notion sync: ${result.reason}`);
            }
        }
    });

    // Pull from Notion to local
    addListener("pull-from-notion", "click", async () => {
        const papers = await getStorage("papers");
        const localCount = Object.keys(papers).filter(id => id !== "__dataVersion").length;

        const confirmMsg = `This will sync all papers from Notion to local storage.\n\n` +
                          `You currently have ${localCount} papers locally.\n` +
                          `Notion data will overwrite local data (Notion takes priority).\n\n` +
                          `It's recommended to backup your local data first. Continue?`;

        if (!confirm(confirmMsg)) {
            return;
        }

        showId("notion-pull-loader");
        setHTML("notion-pull-feedback", "Syncing from Notion...");
        setHTML("notion-pull-progress", "");

        const result = await sendMessageToBackground({
            type: "syncAllPapersFromNotion"
        });

        hideId("notion-pull-loader");

        if (result.ok) {
            const msg = `Sync complete! Added: ${result.added}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`;
            setHTML("notion-pull-feedback", msg);

            if (result.errors.length > 0) {
                const errorDetails = result.errors.slice(0, 5).map(e =>
                    `${e.paperId}: ${e.error}`
                ).join("<br>");
                setHTML("notion-pull-progress", `<small>First errors:<br>${errorDetails}</small>`);
            }

            // 刷新页面以显示新数据
            setTimeout(() => {
                if (confirm("Sync successful! Reload page to see updates?")) {
                    location.reload();
                }
            }, 2000);
        } else {
            setHTML("notion-pull-feedback", `Sync failed: ${result.error}`);
        }
    });

    // Auto-sync toggle
    addListener("check-notion-auto-sync", "change", async (e) => {
        await setStorage("notionAutoSyncEnabled", e.target.checked);
        await sendMessageToBackground({ type: "setupNotionAutoSync" });
    });

    // Sync interval change
    addListener("notion-sync-interval", "change", async (e) => {
        await setStorage("notionSyncInterval", parseInt(e.target.value));
        const enabled = await getStorage("notionAutoSyncEnabled");
        if (enabled) {
            await sendMessageToBackground({ type: "setupNotionAutoSync" });
        }
    });
};

// ----------------------------
// -----  Supabase Setup  -----
// ----------------------------

const setupSupabaseSync = async () => {
    const supabaseUrl = await getStorage("supabaseUrl");
    const supabaseAnonKey = await getStorage("supabaseAnonKey");
    const supabaseSyncKey = await getStorage("supabaseSyncKey");
    const supabaseSyncState = await getStorage("supabaseSyncState");
    const autoPullEnabled = await getStorage("supabaseAutoPullEnabled");
    const autoPushEnabled = await getStorage("supabaseAutoPushEnabled");
    const syncInterval = await getStorage("supabaseSyncInterval") || 60;
    const blockedError = await getStorage("supabaseAutoPullBlockedError");

    if (supabaseUrl) {
        findEl({ element: "supabase-url-input" }).value = supabaseUrl;
    }
    if (supabaseAnonKey) {
        findEl({ element: "supabase-anon-key-input" }).value = supabaseAnonKey;
    }
    if (supabaseSyncKey) {
        findEl({ element: "supabase-sync-key-input" }).value = supabaseSyncKey;
    }
    if (supabaseUrl && supabaseAnonKey && supabaseSyncKey) {
        showId("supabase-sync-section");
    }
    if (supabaseSyncState) {
        findEl({ element: "check-supabase-sync" }).checked = true;
    }
    if (autoPullEnabled) {
        findEl({ element: "check-supabase-auto-pull" }).checked = true;
    }
    if (autoPushEnabled) {
        findEl({ element: "check-supabase-auto-push" }).checked = true;
    }
    findEl({ element: "supabase-sync-interval" }).value = syncInterval;

    if (blockedError) {
        setHTML(
            "supabase-feedback",
            `Auto-pull was disabled after a failure: ${blockedError}`
        );
        alert(
            "Supabase scheduled pull failed and has been disabled.\n\n" +
                blockedError +
                "\n\nPlease fix credentials/access settings and re-enable auto pull."
        );
        await setStorage("supabaseAutoPullBlockedError", null);
    }

    addListener("save-supabase-credentials", "click", async () => {
        const url = findEl({ element: "supabase-url-input" }).value.trim();
        const anonKey = findEl({ element: "supabase-anon-key-input" }).value.trim();
        const syncKey = findEl({ element: "supabase-sync-key-input" }).value.trim();

        if (!url || !anonKey || !syncKey) {
            setHTML("supabase-feedback", "Please fill in URL, anon key and sync key");
            return;
        }
        if (syncKey.length < 8) {
            setHTML("supabase-feedback", "syncKey must be at least 8 characters");
            return;
        }

        await setStorage("supabaseUrl", url);
        await setStorage("supabaseAnonKey", anonKey);
        await setStorage("supabaseSyncKey", syncKey);
        setHTML("supabase-feedback", "Credentials saved successfully!");
        showId("supabase-sync-section");
    });

    addListener("test-supabase-connection", "click", async () => {
        const url = findEl({ element: "supabase-url-input" }).value.trim();
        const anonKey = findEl({ element: "supabase-anon-key-input" }).value.trim();
        const syncKey = findEl({ element: "supabase-sync-key-input" }).value.trim();

        showId("supabase-loader");
        setHTML("supabase-feedback", "Testing connection...");

        const result = await sendMessageToBackground({
            type: "testSupabaseConnection",
            url,
            anonKey,
            syncKey,
        });
        hideId("supabase-loader");

        if (result.ok) {
            setHTML("supabase-feedback", "Connection successful! Supabase is accessible.");
            showId("supabase-sync-section");
        } else {
            setHTML(
                "supabase-feedback",
                `Connection failed: ${result.reason || result.error || "Unknown error"}`
            );
        }
    });

    addListener("check-supabase-sync", "change", async (e) => {
        await setStorage("supabaseSyncState", e.target.checked);
        if (!e.target.checked) return;

        const result = await initSupabaseSync();
        if (!result.ok) {
            e.target.checked = false;
            await setStorage("supabaseSyncState", false);
            alert(`Failed to enable Supabase sync: ${result.reason || result.error}`);
        }
    });

    addListener("manual-supabase-push", "click", async () => {
        const papers = (await getStorage("papers")) || {};
        const count = Object.keys(papers).filter((id) => !id.startsWith("__")).length;
        if (
            !confirm(
                `This will upsert ${count} local papers to Supabase.\n` +
                    "Existing rows with the same paper id will be updated.\n\nContinue?"
            )
        ) {
            return;
        }

        showId("supabase-push-loader");
        setHTML("supabase-push-feedback", "Pushing to Supabase...");
        setHTML("supabase-push-progress", "");

        const result = await sendMessageToBackground({
            type: "syncAllSupabasePapers",
            papers,
        });
        hideId("supabase-push-loader");

        if (result.ok) {
            setHTML(
                "supabase-push-feedback",
                `Push complete! Synced ${result.synced}/${result.total}.`
            );
        } else {
            setHTML("supabase-push-feedback", `Push failed: ${result.error}`);
            alert(`Supabase push failed: ${result.error}`);
        }
    });

    addListener("pull-from-supabase", "click", async () => {
        const localPapers = (await getStorage("papers")) || {};
        const localCount = Object.keys(localPapers).filter(
            (id) => !id.startsWith("__")
        ).length;

        if (
            !confirm(
                `This will pull all papers from Supabase and OVERWRITE local memory.\n\n` +
                    `You currently have ${localCount} papers locally.\n` +
                    "Supabase data takes priority.\n\nContinue?"
            )
        ) {
            return;
        }

        showId("supabase-pull-loader");
        setHTML("supabase-pull-feedback", "Pulling from Supabase...");
        setHTML("supabase-pull-progress", "");

        const result = await sendMessageToBackground({
            type: "syncAllPapersFromSupabase",
        });
        hideId("supabase-pull-loader");

        if (result.ok) {
            setHTML(
                "supabase-pull-feedback",
                `Pull complete! Local papers: ${result.before} -> ${result.after}`
            );
            if (result.warning) {
                setHTML(
                    "supabase-pull-progress",
                    `<small>Non-breaking warnings:<br>${result.warning}</small>`
                );
            }
            setTimeout(() => {
                if (confirm("Pull successful! Reload page to see updates?")) {
                    location.reload();
                }
            }, 1000);
        } else {
            setHTML("supabase-pull-feedback", `Pull failed: ${result.error}`);
            alert("Supabase pull failed.\n\n" + result.error);
        }
    });

    addListener("check-supabase-auto-pull", "change", async (e) => {
        await setStorage("supabaseAutoPullEnabled", e.target.checked);
        const result = await sendMessageToBackground({ type: "setupSupabaseAutoPull" });
        if (!result.ok) {
            e.target.checked = false;
            await setStorage("supabaseAutoPullEnabled", false);
            alert(`Failed to update Supabase auto pull: ${result.error}`);
        }
    });

    addListener("supabase-sync-interval", "change", async (e) => {
        await setStorage("supabaseSyncInterval", parseInt(e.target.value));
        if (await getStorage("supabaseAutoPullEnabled")) {
            const result = await sendMessageToBackground({
                type: "setupSupabaseAutoPull",
            });
            if (!result.ok) {
                alert(`Failed to update Supabase interval: ${result.error}`);
            }
        }
    });

    addListener("check-supabase-auto-push", "change", async (e) => {
        await setStorage("supabaseAutoPushEnabled", e.target.checked);
    });
};

// ----------------------------
// -----  Document Ready  -----
// ----------------------------

(async () => {
    setupSidebar();
    await initSyncAndState();
    makeTOC();
    setupCodeBlocks();
    setupPWCPrefs();
    setupAutoTags();
    setupPreprintMatching();
    setupImportPapers();
    setUpKeyboardListeners();
    setupSourcesSelection();
    setupDataManagement();
    setupSync();
    await setupAITagging();
    await setupNotionSync();
    await setupSupabaseSync();
    setupModals();
})();
