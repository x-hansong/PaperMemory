/**
 * Prototypes
 */

Object.defineProperty(Array.prototype, "last", {
    value: function (i = 0) {
        return this.reverse()[i];
    },
});

Object.defineProperty(String.prototype, "capitalize", {
    value: function (all = false) {
        if (all)
            return this.split(" ")
                .map((s) => s.capitalize())
                .join(" ");
        return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
    },
});

/**
 * Global variable & constants are stored in this file to be used by
 * other files such as functions.js, parsers.js, memory.js, popup.js
 */

var global = {};
if (typeof window !== "undefined") {
    global = window;
}

/**
 * Set uninstall URL
 */
typeof chrome !== "undefined" &&
    chrome?.runtime?.setUninstallURL &&
    chrome?.runtime?.setUninstallURL("https://forms.gle/1JSV8PcxQugRmsd46");

/**
 * The popup's global state to store data across functions
 */
global.state = {
    currentMemoryPagination: 0,
    dataVersion: 0,
    deleted: {}, // (id => bool)
    files: {},
    ignoreSources: {}, // (source => bool)
    lastRefresh: new Date(),
    memoryIsOpen: false,
    memoryItemsPerPage: 10,
    menuIsOpen: false,
    modalIsOpen: false,
    tooltipIsOpen: false,
    papers: {}, // (id => object)
    papersList: [], // [papers]
    papersReady: false,
    paperTags: new Set(), // (Set(string))
    pdfTitleFn: null, // function(paper) => string
    prefs: {}, // (prefsCheckKey => bool)
    showFavorites: false,
    sortedPapers: [], // [papers]
    sortKey: "",
    timerIdMap: new WeakMap(), // memory title tooltips
    titleHashToIds: {}, // (miniHash(title) -> [ids])
    titleFunction: null, // function(paper) => string
    urlHashToId: {}, // (miniHash(url) => id)
};

global.state.titleFunction = (paper) => {
    const title = paper.title.replaceAll("\n", "");
    const id = paper.id;
    let name = `${title} - ${id}`;
    name = name.replaceAll(":", " ").replace(/\\s\\s+/g, " ");
    return name;
};

global.descendingSortKeys = [
    "addDate",
    "count",
    "lastOpenDate",
    "favoriteDate",
    "year",
];

global.svgActionsHoverTitles = {
    edit: "Edit paper details",
    copyMd: "Copy Markdown-formatted link",
    copyBibtext: "Copy Bibtex citation",
    visits: "Number of times you have opened this paper",
    openLocal: "Open downloaded pdf",
    copyLink: "Copy paper url",
    copyHypeLink: "Copy url as hyperlink",
};

/**
 * Shared configuration for the Tags' select2 inputs
 */
global.select2Options = {
    placeholder: "Tag paper",
    maximumSelectionLength: 5,
    allowClear: true,
    tags: true,
    tokenSeparators: [",", " "],
};

/**
 * The array of keys in the menu, i.e. options the user can dis/enable in the menu
 */
global.prefsCheckNames = [
    "checkBib",
    "checkMd",
    "checkDownload",
    "checkPdfTitle",
    "checkFeedback",
    "checkDarkMode",
    "checkDirectOpen",
    "checkStore",
    "checkScirate",
    "checkAlphaxiv",
    "checkAr5iv",
    "checkHuggingface",
    "checkOfficialRepos",
    "checkPdfOnly",
    "checkNoAuto",
    "checkMdYearVenue",
    "checkEnterLocalPdf",
    "checkWebsiteParsing",
    "checkNotionSync",
];
/**
 * Menu check names which should not default to true but to false
 */
global.prefsCheckDefaultFalse = [
    "checkDarkMode",
    "checkStore",
    "checkScirate",
    "checkAlphaxiv",
    "checkAr5iv",
    "checkHuggingface",
    "checkOfficialRepos",
    "checkPdfOnly",
    "checkNoAuto",
    "checkMdYearVenue",
    "checkPreferPdf",
    "checkNotionSync",
];
/**
 * All keys to retrieve from the menu, the checkboxes + the custom pdf function
 */
global.prefsStorageKeys = [
    ...global.prefsCheckNames,
    "pdfTitleFn",
    "notionToken",
    "notionDatabaseId",
    // AI Auto-Tagging 配置
    "aiTaggingEnabled",
    "aiApiBaseUrl",
    "aiApiKey",
    "aiModel",
    "aiTaggingPrompt",
    "aiAutoTagOnSave",
    "aiAreaTags",
    "aiTaskTags",
    "aiMethodTags",
];

/**
 * Extra data per source
 */
global.sourceExtras = {
    springer: {
        types: ["chapter", "article", "book", "referenceworkentry"],
    },
};

/**
 * Sources which are preprints (important for de-duplication)
 */
global.preprintSources = ["arxiv", "biorxiv"];

/**
 * Map of known data sources to the associated paper urls: pdf urls and web-pages urls.
 * IMPORTANT: paper page before pdf (see background script)
 * Notes:
 *  ijcai -> papers < 2015 will not be parsed due to website changes
 *           (open an issue if that's problematic)
 */
global.knownPaperPages = {
    acl: {
        patterns: ["aclanthology.org/"],
        name: "ACL Anthology (Association for Computational Linguistics)",
    },
    acm: {
        patterns: ["dl.acm.org/doi/"],
        name: "ACM (Association for Computing Machinery)",
    },
    aps: {
        patterns: [
            (url) => Boolean(url.match(/journals\.aps\.org\/\w+\/(abstract|pdf)\//g)),
        ],
        name: "APS (American Physical Society)",
    },
    acs: {
        patterns: ["pubs.acs.org/doi/"],
        name: "ACS (American Chemical Society)",
    },
    arxiv: {
        patterns: [
            "arxiv.org/abs/",
            "arxiv.org/pdf/",
            "scirate.com/arxiv/",
            "ar5iv.labs.arxiv.org/html/",
            "alphaxiv.org/abs/",
            "alphaxiv.org/pdf/",
            (url) =>
                url.includes("huggingface.co/papers/") &&
                url.split("huggingface.co/papers/")[1].match(/\d+\.\d+/),
        ],
        name: "ArXiv",
    },
    biorxiv: {
        patterns: ["biorxiv.org/content"],
        name: "BioRxiv",
    },
    cell: {
        patterns: [
            (url) =>
                url.includes("cell.com/") &&
                url.split("cell.com/")[1].match(/\d{4}-\d{3}[0-9X]/),
        ],
        name: "Cell",
    },
    chemrxiv: {
        patterns: [
            "chemrxiv.org/engage/chemrxiv/article-details/",
            (url) =>
                url.includes(
                    "https://chemrxiv.org/engage/api-gateway/chemrxiv/assets"
                ) && url.endsWith(".pdf"),
        ],
        name: "ChemRxiv",
    },
    cvf: {
        patterns: ["openaccess.thecvf.com/content"],
        name: "CVF (Computer Vision Foundation)",
    },
    frontiers: {
        patterns: ["frontiersin.org/articles"],
        name: "Frontiers",
    },
    hal: {
        patterns: [
            (url) => /hal\.science\/\w+-\d+(v\d+)?(\/document)?$/gi.test(url),
            (url) => /hal\.science\/\w+-\d+(v\d+)?\/file\/.+\.pdf$/gi.test(url),
        ],
        name: "HAL",
    },
    ihep: {
        patterns: ["inspirehep.net/literature/", "inspirehep.net/files/"],
        name: "IHEP (INSPIRE - High Energy Physics)",
    },
    ijcai: {
        patterns: [(url) => /ijcai\.org\/proceedings\/\d{4}\/\d+/gi.test(url)],
        name: "IJCAI (International Joint Conferences on Artificial Intelligence)",
    },
    ieee: {
        patterns: [
            "ieeexplore.ieee.org/document/",
            "ieeexplore.ieee.org/abstract/document/",
            "ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=",
        ],
        name: "IEEE (Institute of Electrical and Electronics Engineers)",
    },
    iop: {
        patterns: ["iopscience.iop.org/article/"],
        name: "IOP (Institute Of Physics)",
    },
    jmlr: {
        patterns: [(url) => url.includes("jmlr.org/papers/v") && !url.endsWith("/")],
        name: "JMLR (Journal of Machine Learning Research)",
    },
    mdpi: {
        patterns: [(url) => /mdpi\.com\/\d+-.+/gi.test(url)],
        name: "MDPI (Multidisciplinary Digital Publishing Institute)",
    },
    nature: {
        patterns: ["nature.com/articles/"],
        name: "Nature",
    },
    neurips: {
        patterns: [
            "neurips.cc/paper/",
            "neurips.cc/paper_files/paper/",
            "nips.cc/paper/",
            "nips.cc/paper_files/paper/",
        ],
        name: "NeurIPS (Neural Information Processing Systems)",
    },
    openreview: {
        patterns: [
            "openreview.net/forum",
            "openreview.net/pdf",
            "openreview.net/attachment",
        ],
        name: "OpenReview",
    },
    oup: {
        patterns: [
            (url) =>
                (url
                    .split("https://academic.oup.com/")[1]
                    ?.split("/")[1]
                    ?.indexOf("article") ?? -1) >= 0,
        ],
        name: "OUP (Oxford University Press)",
    },
    plos: {
        patterns: [(url) => /journals\.plos\.org\/.+\/article.+id=/gi.test(url)],
        name: "PLOS (Public Library of Science)",
    },
    pmc: {
        patterns: ["ncbi.nlm.nih.gov/pmc/articles/PMC"],
        name: "PMC (PubMed Central)",
    },
    pmlr: {
        patterns: ["proceedings.mlr.press/"],
        name: "PMLR (Proceedings of Machine Learning Research)",
    },
    pnas: {
        patterns: ["pnas.org/content/", "pnas.org/doi/"],
        name: "PNAS (Proceedings of the National Academy of Sciences)",
    },
    rsc: {
        patterns: ["pubs.rsc.org/en/content/article"],
        name: "RSC (Royal Society of Chemistry)",
    },
    science: {
        patterns: [
            (url) => Boolean(url.match(/science\.org\/doi\/?(abs|full|pdf|epdf)?\//g)),
        ],
        name: "Science",
    },
    sciencedirect: {
        patterns: [
            "sciencedirect.com/science/article/pii/",
            "sciencedirect.com/science/article/abs/pii/",
            "reader.elsevier.com/reader/sd/pii/",
        ],
        name: "ScienceDirect",
    },
    springer: {
        patterns: [
            ...global.sourceExtras.springer.types.map(
                (type) => `link.springer.com/${type}/`
            ),
            "link.springer.com/content/pdf/",
        ],
        name: "Springer",
    },
    website: {
        // special case, manual parsing of arbitrary websites
        patterns: [],
        name: "Manually parsed website",
    },
    wiley: {
        patterns: [
            (url) =>
                Boolean(
                    url.match(
                        /onlinelibrary\.wiley\.com\/doi\/(abs\/|full\/|pdf\/|epdf\/|10\.)/g
                    )
                ),
        ],
        name: "Wiley",
    },
    aip: {
        patterns: [
            (url) =>
                url.match(
                    /pubs.aip.org\/aip\/.+\/(article|article-abstract|article-split)\//g
                ) || url.match(/watermark.silverchair.com\/.+\.pdf/g),
        ],
        name: "AIP (American Institute of Physics)",
    },
};

global.overrideORConfs = {
    "robot-learning": "CoRL",
    ijcai: "IJCAI",
};
global.overridePMLRConfs = {
    "Conference on Learning Theory": "CoLT",
    "International Conference on Machine Learning": "ICML",
    "Conference on Uncertainty in Artificial Intelligence": "UAI",
    "Conference on Robot Learning": "CoRL",
    "International Conference on Artificial Intelligence and Statistics": "AISTATS",
    "International Conference on Algorithmic Learning Theory": "ALT",
};
global.overrideDBLPVenues = {
    "J. Mach. Learn. Res.": "JMLR",
};

global.consolHeaderStyle =
    "@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300');font-family:'Fira Code' monospace;font-size:1rem;font-weight:300;display:inline-block;border:2px solid #A41716;border-radius: 4px;padding: 12px; margin: 12px;";

global.storeReadme = `
/!\\ Warning: This folder has been created automatically by your PaperMemory browser extension.\n
/!\\ It has to stay in your downloads for PaperMemory to be able to access your papers.\n
/!\\ To be able to open files from this folder instead of re-downloading them, PaperMemory will match their titles and downloaded urls.\n
/!\\ If you change the default title function in the Advanced Options and do not include a paper's title in the file name, PaperMemory may not be able to open the file and will instead open the pdf url.\n
/!\\ Unfortunately, PaperMemory cannot detect papers that have not been *downloaded there* so putting papers in this folder will not make them discoverable by the \`browser.downloads\` API PaperMemory uses.
`;
/**
 * English words to ignore when creating an arxiv paper's BibTex key.
 */
global.englishStopWords = new Set([
    "i",
    "me",
    "my",
    "myself",
    "we",
    "our",
    "ours",
    "ourselves",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",
    "he",
    "him",
    "his",
    "himself",
    "she",
    "her",
    "hers",
    "herself",
    "it",
    "its",
    "itself",
    "they",
    "them",
    "their",
    "theirs",
    "themselves",
    "what",
    "which",
    "who",
    "whom",
    "this",
    "that",
    "these",
    "those",
    "am",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "having",
    "do",
    "does",
    "did",
    "doing",
    "a",
    "an",
    "the",
    "and",
    "but",
    "if",
    "or",
    "because",
    "as",
    "until",
    "while",
    "of",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "s",
    "t",
    "can",
    "will",
    "just",
    "don",
    "should",
    "now",
]);

global.journalAbbreviations = null;

global.notif = {
    timeout: null,
    prevent: false,
    showSpeed: 400,
    displayDuration: 3000,
    hideSpeed: 400,
    element: null,
    isLoading: false,
};

/**
 * AI Auto-Tagging 默认配置
 */
global.aiTaggingDefaults = {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    autoTagOnSave: false,
    prompt: `You are a research paper classification expert. Based on the paper's title and abstract, suggest relevant tags from the following taxonomy:

## Area Tags (select 1-3 most relevant):
{AREA_TAGS}

## Task Tags (select 1-3 most relevant):
{TASK_TAGS}

## Method Tags (select 1-3 most relevant):
{METHOD_TAGS}

Paper Title: {TITLE}
Paper Abstract: {ABSTRACT}

Please respond with ONLY a JSON array of tag strings, like: ["area/nlp", "task/text-generation", "method/transformer"]
Do not include any explanation, just the JSON array.`,
    // 默认标签体系 - Area Tags
    areaTags: [
        "area/foundations-theory",
        "area/optimization",
        "area/representation-learning",
        "area/probabilistic-modeling",
        "area/causality",
        "area/robustness-generalization",
        "area/evaluation",
        "area/mlsys-training",
        "area/mlsys-inference-serving",
        "area/efficient-ml",
        "area/privacy-security",
        "area/fairness-ethics-policy",
        "area/nlp",
        "area/nlp/llm",
        "area/nlp/reasoning",
        "area/nlp/information-retrieval",
        "area/nlp/ie-knowledge",
        "area/nlp/dialogue",
        "area/nlp/summarization",
        "area/nlp/machine-translation",
        "area/cv",
        "area/cv/generation",
        "area/cv/recognition",
        "area/cv/detection-segmentation",
        "area/cv/video",
        "area/speech-audio",
        "area/multimodal",
        "area/recsys-search",
        "area/graph-learning",
        "area/time-series",
        "area/rl",
        "area/rl/online-rl",
        "area/rl/offline-rl",
        "area/rl/model-based",
        "area/rl/multi-agent",
        "area/agents-tool-use",
        "area/agents-tool-use/web-agents",
        "area/agents-tool-use/computer-use",
        "area/agents-tool-use/os-agents",
        "area/agents-tool-use/coding-agents",
        "area/agents-tool-use/research-agents",
        "area/agents-tool-use/workflow-automation",
        "area/agents-tool-use/multi-agent",
        "area/agents-tool-use/memory",
        "area/agents-tool-use/agent-evaluation",
        "area/agents-tool-use/agent-security",
        "area/agents-tool-use/agent-protocols",
        "area/planning",
        "area/human-feedback-alignment",
        "area/healthcare",
        "area/biology",
        "area/finance",
        "area/education",
        "area/industrial",
    ],
    // 默认标签体系 - Task Tags
    taskTags: [
        "task/classification",
        "task/regression",
        "task/clustering",
        "task/ranking",
        "task/retrieval",
        "task/reranking",
        "task/embedding",
        "task/question-answering",
        "task/open-domain-qa",
        "task/summarization",
        "task/translation",
        "task/information-extraction",
        "task/ner",
        "task/relation-extraction",
        "task/text-generation",
        "task/dialogue-chat",
        "task/tool-use",
        "task/planning",
        "task/code-generation",
        "task/math-reasoning",
        "task/knowledge-grounding",
        "task/fact-checking",
        "task/image-classification",
        "task/object-detection",
        "task/segmentation",
        "task/image-generation",
        "task/video-understanding",
        "task/video-generation",
        "task/ocr",
        "task/speech-recognition",
        "task/text-to-speech",
        "task/audio-understanding",
        "task/recommendation",
        "task/search",
        "task/anomaly-detection",
        "task/forecasting",
        "task/policy-learning",
        "task/control",
        "task/offline-rl",
        "task/simulation",
        "task/web-navigation",
        "task/open-web-browsing",
        "task/computer-use",
        "task/desktop-automation",
        "task/multi-step-tool-use",
        "task/long-horizon-tasks",
        "task/asynchronous-tasks",
        "task/software-engineering",
        "task/issue-resolution",
        "task/repo-understanding",
        "task/test-generation",
        "task/refactoring",
        "task/research-assistant",
        "task/report-generation",
        "task/data-extraction",
        "task/form-filling",
        "task/account-workflows",
    ],
    // 默认标签体系 - Method Tags (第一部分)
    methodTags: [
        "method/transformer",
        "method/attention-variants",
        "method/moe",
        "method/gnn",
        "method/diffusion",
        "method/gan",
        "method/vae",
        "method/contrastive-learning",
        "method/self-supervised",
        "method/knowledge-distillation",
        "method/pretraining",
        "method/instruction-tuning",
        "method/prompting-icl",
        "method/synthetic-data",
        "method/data-curation",
        "method/tokenization",
        "method/rag",
        "method/retriever-encoder",
        "method/bm25-sparse",
        "method/dense-retrieval",
        "method/reranker-cross-encoder",
        "method/long-context",
        "method/memory",
        "method/peft",
        "method/lora",
        "method/adapters",
        "method/prefix-tuning",
        "method/rlhf",
        "method/dpo",
        "method/ppo",
        "method/grpo",
        "method/rlaif",
        "method/reward-modeling",
        "method/quantization",
        "method/pruning",
        "method/sparsity",
        "method/speculative-decoding",
        "method/kvcache-optimization",
        "method/parallelism-scheduling",
        "method/uncertainty-calibration",
        "method/robust-training",
        "method/adversarial",
        "method/privacy-dp",
        "method/federated",
        "method/benchmarking",
        "method/human-eval",
        "method/ablations",
        "method/react",
        "method/plan-and-execute",
        "method/planner-controller",
        "method/tool-routing",
        "method/tool-retrieval",
        "method/state-machine",
        "method/graph-orchestration",
        "method/retry-recovery",
        "method/observation-compression",
        "method/gui-grounding",
        "method/ui-action-model",
        "method/screenshot-vision",
        "method/browser-automation",
        "method/grounded-click-type",
        "method/working-memory",
        "method/long-term-memory",
        "method/memory-retrieval",
        "method/summarize-and-store",
        "method/trajectory-replay",
        "method/llm-as-judge",
        "method/step-level-eval",
        "method/action-verification",
        "method/reward-modeling-agents",
        "method/preference-optimization",
        "method/mcp",
        "method/tool-registry",
        "method/secure-tool-bridge",
        "method/oauth-delegation",
        "method/skill-modules",
        "method/prompt-injection-defense",
        "method/sandboxing",
        "method/permissioning",
        "method/secrets-hygiene",
    ],
};

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        state: global.state,
        descendingSortKeys: global.descendingSortKeys,
        svgActionsHoverTitles: global.svgActionsHoverTitles,
        select2Options: global.select2Options,
        prefsCheckNames: global.prefsCheckNames,
        prefsCheckDefaultFalse: global.prefsCheckDefaultFalse,
        prefsStorageKeys: global.prefsStorageKeys,
        sourceExtras: global.sourceExtras,
        preprintSources: global.preprintSources,
        knownPaperPages: global.knownPaperPages,
        overrideORConfs: global.overrideORConfs,
        overridePMLRConfs: global.overridePMLRConfs,
        overrideDBLPVenues: global.overrideDBLPVenues,
        consolHeaderStyle: global.consolHeaderStyle,
        storeReadme: global.storeReadme,
        englishStopWords: global.englishStopWords,
        journalAbbreviations: global.journalAbbreviations,
    };
}
