// ==UserScript==
// @name         Graphical Reader
// @version      0.1.0
// @match        https://pubs.acs.org/search-results*
// @match        https://www.cell.com/*/newarticles*
// @match        https://www.nature.com/search*
// @match        https://pubs.rsc.org/*/latest-articles*
// @match        https://onlinelibrary.wiley.com/toc/*
// @match        https://advanced.onlinelibrary.wiley.com/toc/*
// @match        https://www.science.org/toc/science/current*
// @match        https://www.science.org/toc/sciadv/current*
// @grant        GM_openInTab
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @run-at       document-idle
// ==/UserScript==

(() => {
    let initialized = false;
    let initializing = false;
    let viewerDismissed = false;
    let loadingOverlay = null;
    let loadingMessage = null;
    let clearPreviousSessionData = null;
    let resumePositionEnabled = true;

    // Journal sequence
    // Add, remove, or reorder entries to change where Next page takes you.
    // Give each entry a label and an href pointing to a supported listing.
    // To browse the full sequence, start at the first URL.
    const journalPages = [
        {
            label: 'ACS journals', // J. Am. Chem. Soc., J. Chem. Educ., ACS Catal., Chem. Rev., Acc. Chem. Res., ACS Cent. Sci., JACS Au, and Acc. Mater. Res.
            href: 'https://pubs.acs.org/search-results?q=&hd=advancedAny&restypeid=3&fl_JournalHistID=128+OR+16+OR+40+OR+426+OR+124+OR+264+OR+136+OR+454&searchType=advanced&sort=Date+-+Newest+First'
        },
        { label: 'Angew. Chem. Int. Ed.', href: 'https://onlinelibrary.wiley.com/toc/15213773/0/0' },
        { label: 'Chem. Sci.', href: 'https://pubs.rsc.org/sc/latest-articles' },
        {
            label: 'Nat. Commun.', // Chemistry and materials science research.
            href: 'https://www.nature.com/search?order=date_desc&date_range=last_year&subject=chemistry%2C+materials-science&journal=ncomms&article_type=research'
        },
        { label: 'Sci. Adv.', href: 'https://www.science.org/toc/sciadv/current' },
        {
            label: 'Nature subjects', // Nat. Chem., Nat. Catal., Nat. Synth., and Nat. Mater.
            href: 'https://www.nature.com/search?journal=nchem%2C+natcatal%2C+natsynth%2C+nmat&article_type=research%2C+comments-and-opinion%2C+reviews%2C+special-features&subject=chemistry%2C+materials-science%2C+scientific-community&date_range=last_30_days&order=date_desc'
        },
        { label: 'Chem Catal.', href: 'https://www.cell.com/chem-catalysis/newarticles' },
        { label: 'Chem', href: 'https://www.cell.com/chempr/newarticles' },
        { label: 'Adv. Mater.', href: 'https://advanced.onlinelibrary.wiley.com/toc/15214095/0/0' },
        { label: 'Matter', href: 'https://www.cell.com/matter/newarticles' },
        {
            label: 'Nature',
            href: 'https://www.nature.com/search?journal=nature&article_type=research%2C+comments-and-opinion%2C+reviews&subject=chemistry%2C+materials-science%2C+scientific-community&date_range=last_30_days&order=date_desc'
        },
        { label: 'Science', href: 'https://www.science.org/toc/science/current' },
        { label: 'Chem. Soc. Rev.', href: 'https://pubs.rsc.org/cs/latest-articles' },
        {
            label: 'Nature reviews', // Nat. Rev. Chem. and Nat. Rev. Mater.
            href: 'https://www.nature.com/search?journal=natrevchem%2C+natrevmats&article_type=comments-and-opinion%2C+reviews&subject=chemistry%2C+materials-science%2C+scientific-community&date_range=last_30_days&order=date_desc'
        }
    ];

    // Keyword filters
    // Edit this list to add, remove, or rename filters. `label` appears
    // in the reader and its settings, `color` sets the highlight color, and `pattern` matches
    // article titles and abstracts. Write each pattern as a JavaScript regular
    // expression (regex), such as `/photocatalysis/i`. The slashes delimit the
    // pattern, and the final `i` makes matching case-insensitive.
    // After adding or renaming a label, reload the page and select it under Keywords in the reader's settings.
    const researchKeywordGroups = [
        { label: 'MOF', color: '#1B9E77', pattern: /\b(?!covalent[-–—\s]+organic framework)(mof|\w+[-–—\s]+organic framework)/i },
        { label: 'COF', color: '#D95F02', pattern: /(\bcof|covalent[-–—\s]+organic framework)/i },
        { label: 'Porphyrin', color: '#7570B3', pattern: /porph(yr)?in/i },
        { label: 'Catalysis', color: '#E7298A', pattern: /\b(?!(photo|electro|photo[-–—\s]*electro)[-–—\s]*cataly)\w*[-–—\s]*cataly/i },
        { label: 'Photocatalysis', color: '#66A61E', pattern: /photocataly|photosynth/i },
        { label: 'Electrocatalysis', color: '#E6AB02', pattern: /electrocataly/i },
        { label: 'Qubit', color: '#1F78B4', pattern: /\b(qudit|qubit)s?\b/i },
        { label: 'O₂ activation', color: '#A6761D', pattern: /(o2|o₂|oxygen|dioxygen)[-\s]*activat|activat\w*[-\s]+of[-\s]+(o2|o₂|oxygen|dioxygen)/i },
        { label: 'CO₂ hydrogenation', color: '#666666', pattern: /(co2|co₂|carbon dioxide)[-\s]*hydrogenat|hydrogenat\w*[-\s]+of[-\s]+(co2|co₂|carbon dioxide)/i },
        { label: 'bpy', color: '#A6CEE3', pattern: /(?<!4,4['’′ʼ]-)\b(bpy|phenanthroline|bipyrid)/i }
    ];

    function cancelPreparation() {
        viewerDismissed = true;
        hideLoadingOverlay();
    }

    function showLoadingOverlay() {
        if (loadingOverlay) return;
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'graphical-reader-loading';
        loadingOverlay.setAttribute('aria-live', 'polite');
        loadingOverlay.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;display:flex;' +
            'flex-direction:column;gap:18px;align-items:center;justify-content:center;background:rgba(0,0,0,.58);' +
            'color:#fff;font:600 24px/1.2 system-ui,-apple-system,sans-serif;' +
            'letter-spacing:.01em;';
        loadingMessage = document.createElement('div');
        loadingMessage.setAttribute('role', 'status');
        loadingMessage.textContent = 'Finding saved position…';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText =
            'padding:8px 18px;border:1px solid rgba(255,255,255,.8);border-radius:6px;' +
            'background:transparent;color:#fff;font:500 16px/1 system-ui,-apple-system,sans-serif;' +
            '-webkit-appearance:none;appearance:none;';
        cancelButton.addEventListener('click', cancelPreparation);
        loadingOverlay.append(loadingMessage, cancelButton);
        if (clearPreviousSessionData) {
            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.textContent = 'Clear saved position';
            clearButton.style.cssText =
                'padding:8px 18px;border:1px solid rgba(255,255,255,.8);border-radius:6px;' +
                'background:transparent;color:#fff;font:500 16px/1 system-ui,-apple-system,sans-serif;' +
                '-webkit-appearance:none;appearance:none;';
            clearButton.addEventListener('click', clearPreviousSessionData);
            loadingOverlay.append(clearButton);
        }
        document.body.appendChild(loadingOverlay);
    }

    function hideLoadingOverlay() {
        loadingOverlay?.remove();
        loadingOverlay = null;
        loadingMessage = null;
    }

    function setLoadingMessage(message) {
        if (loadingMessage) loadingMessage.textContent = message;
    }

    function sessionStorageKeys() {
        const sessionLocationKey = `${location.origin}${location.pathname}` +
            (location.pathname === '/search' || isAcsSearchPage() ? location.search : '');
        return {
            lastDoiKey: `graphical-reader-last-doi:${sessionLocationKey}`,
            lastArticleHrefKey: `graphical-reader-last-article-href:${sessionLocationKey}`,
            lastPublicationDateKey: `graphical-reader-last-publication-date:${sessionLocationKey}`
        };
    }

    function resumePositionPreferenceKey() {
        const { lastDoiKey } = sessionStorageKeys();
        return `${lastDoiKey}:resume-enabled`;
    }

    function isResumePositionEnabled() {
        try {
            return localStorage.getItem(resumePositionPreferenceKey()) !== 'false';
        } catch (error) {
            console.warn('Could not read the resume-position preference.', error);
            return true;
        }
    }

    function saveResumePositionPreference(enabled) {
        try {
            localStorage.setItem(resumePositionPreferenceKey(), String(enabled));
        } catch (error) {
            console.warn('Could not save the resume-position preference.', error);
        }
    }

    let readingPositionWrite = Promise.resolve();

    function storeReadingPosition(position) {
        const { lastArticleHrefKey } = sessionStorageKeys();
        readingPositionWrite = readingPositionWrite
            .then(() => GM.setValue(`${lastArticleHrefKey}:position`, position))
            .catch(error => console.warn('Could not save the persistent article position.', error));
        return readingPositionWrite;
    }

    async function readSavedReadingPosition() {
        const { lastDoiKey, lastArticleHrefKey, lastPublicationDateKey } = sessionStorageKeys();
        await readingPositionWrite;
        try {
            const saved = await GM.getValue(`${lastArticleHrefKey}:position`, null);
            if (saved && typeof saved === 'object') return saved;
        } catch (error) {
            console.warn('Could not read the persistent article position.', error);
        }
        const position = {
            doi: localStorage.getItem(lastDoiKey) || '',
            href: localStorage.getItem(lastArticleHrefKey) || '',
            publicationDate: localStorage.getItem(lastPublicationDateKey) || ''
        };
        if (position.doi || position.href) await storeReadingPosition(position);
        return position;
    }

    async function clearSavedReadingPosition() {
        const { lastDoiKey, lastArticleHrefKey, lastPublicationDateKey } = sessionStorageKeys();
        // Keep an empty record so stale website storage cannot restore a cleared position.
        const cleared = storeReadingPosition({});
        try {
            localStorage.removeItem(lastDoiKey);
            localStorage.removeItem(lastArticleHrefKey);
            localStorage.removeItem(lastPublicationDateKey);
        } catch (error) {
            console.warn('Could not clear the saved article position.', error);
        }
        await cleared;
    }

    function articleClickBehaviorPreferenceKey() {
        const { lastDoiKey } = sessionStorageKeys();
        return `${lastDoiKey}:article-click-behavior`;
    }

    function readArticleClickBehavior() {
        try {
            const behavior = localStorage.getItem(articleClickBehaviorPreferenceKey());
            if (['share', 'open'].includes(behavior)) return behavior;
            return typeof navigator.share === 'function' ? 'share' : 'open';
        } catch (error) {
            console.warn('Could not read the article-click preference.', error);
            return 'default';
        }
    }

    function saveArticleClickBehavior(behavior) {
        try {
            localStorage.setItem(articleClickBehaviorPreferenceKey(), behavior);
        } catch (error) {
            console.warn('Could not save the article-click preference.', error);
        }
    }

    function articleClickFormatPreferenceKey() {
        return `${articleClickBehaviorPreferenceKey()}:format`;
    }

    function readArticleClickFormat() {
        try {
            return localStorage.getItem(articleClickFormatPreferenceKey()) === 'pdf' ? 'pdf' : 'html';
        } catch (error) {
            console.warn('Could not read the article format preference.', error);
            return 'html';
        }
    }

    function saveArticleClickFormat(format) {
        try {
            localStorage.setItem(articleClickFormatPreferenceKey(), format);
        } catch (error) {
            console.warn('Could not save the article format preference.', error);
        }
    }

    function filterSettingsPreferenceKey() {
        return 'graphical-reader-filter-settings';
    }

    function slideshowSettingsPreferenceKey() {
        return 'graphical-reader-slideshow-settings';
    }

    async function readSlideshowSettings() {
        const defaults = { autoplayDelay: 1500, keepArticleInformation: false };
        try {
            const saved = await GM.getValue(slideshowSettingsPreferenceKey(), null);
            if (!saved || typeof saved !== 'object') return defaults;
            const delay = Number(saved.autoplayDelay);
            return {
                autoplayDelay: Number.isFinite(delay) && delay >= 500 && delay <= 60000
                    ? Math.round(delay)
                    : defaults.autoplayDelay,
                keepArticleInformation: saved.keepArticleInformation === true
            };
        } catch (error) {
            console.warn('Could not read slideshow settings.', error);
            return defaults;
        }
    }

    async function saveSlideshowSettings(autoplayDelay, keepArticleInformation) {
        try {
            await GM.setValue(slideshowSettingsPreferenceKey(), {
                autoplayDelay,
                keepArticleInformation
            });
        } catch (error) {
            console.warn('Could not save slideshow settings.', error);
        }
    }

    async function clearAllReaderSettings() {
        await clearSavedReadingPosition();
        try {
            localStorage.removeItem(resumePositionPreferenceKey());
            localStorage.removeItem(articleClickBehaviorPreferenceKey());
            localStorage.removeItem(articleClickFormatPreferenceKey());
            await GM.deleteValue(slideshowSettingsPreferenceKey());
            sessionStorage.removeItem(filterSettingsPreferenceKey());
            await GM.deleteValue(filterSettingsPreferenceKey());
        } catch (error) {
            console.warn('Could not reset reader settings.', error);
        }
    }

    async function fetchDocument(url, source) {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error(`${source} page request failed: ${response.status}`);
        return new DOMParser().parseFromString(await response.text(), 'text/html');
    }

    function fetchPaginatedDocument(pageNumber, source) {
        const pageUrl = new URL(location.href);
        pageUrl.searchParams.set('page', String(pageNumber));
        return fetchDocument(pageUrl, source);
    }

    function doiFromUrl(url) {
        if (!url) return '';
        const path = new URL(url, location.href).pathname;
        return decodeURIComponent(path.match(/\/doi\/(?:abs\/|full\/|pdf\/)?(.+)/)?.[1] || '');
    }

    function isAcsSearchPage(url = location) {
        return url.hostname === 'pubs.acs.org' && url.pathname === '/search-results';
    }

    function acsSearchPageNumber(url = location) {
        const page = new URL(url.href).searchParams.get('page');
        return page == null || page === '' ? 1 : Number(page);
    }

    function isNatureSearchPage(url = location) {
        return url.hostname === 'www.nature.com' && url.pathname === '/search';
    }

    function isRscLatestArticlesPage(url = location) {
        return url.hostname === 'pubs.rsc.org' && /\/[a-z]{2}\/latest-articles\/?$/i.test(url.pathname);
    }

    function isCellNewArticlesPage(url = location) {
        return url.hostname === 'www.cell.com' &&
            /\/[^/]+\/newarticles\/?$/i.test(url.pathname);
    }

    function isWileyTocPage(url = location) {
        return /(?:^|\.)onlinelibrary\.wiley\.com$/i.test(url.hostname) &&
            /^\/toc\/[^/]+\/[^/]+\/[^/]+\/?$/i.test(url.pathname);
    }

    function isLaterWileyTocPage(url = location) {
        if (!isWileyTocPage(url)) return false;
        // `location` is a Location object, while callers can also provide a
        // URL. Normalise it before reading query parameters.
        const pageUrl = new URL(url.href);
        const page = Number(pageUrl.searchParams.get('page') || 1);
        const startPage = Number(pageUrl.searchParams.get('startPage') || 0);
        return page > 1 || startPage > 0;
    }

    function isScienceCurrentTocPage(url = location) {
        return url.hostname === 'www.science.org' && url.pathname === '/toc/science/current';
    }

    function isScienceAdvancesCurrentTocPage(url = location) {
        return url.hostname === 'www.science.org' && url.pathname === '/toc/sciadv/current';
    }

    function isScienceTocPage(url = location) {
        return isScienceCurrentTocPage(url) || isScienceAdvancesCurrentTocPage(url);
    }

    function normalizedJournalPageUrl(value) {
        const url = new URL(value, location.href);
        url.hash = '';
        // Pagination is handled inside the reader, so any page-number query
        // still identifies the configured listing it belongs to.
        url.searchParams.delete('page');
        url.searchParams.delete('startPage');
        // Publisher referral metadata does not identify a different listing.
        url.searchParams.delete('referrer');
        url.searchParams.sort();
        return url.href.replace(/\/$/, '');
    }

    function nextJournalPageForCurrentUrl() {
        const currentUrl = normalizedJournalPageUrl(location.href);
        const currentIndex = journalPages.findIndex(page =>
            normalizedJournalPageUrl(page.href) === currentUrl
        );
        if (currentIndex < 0 || currentIndex >= journalPages.length - 1) return null;
        return journalPages[currentIndex + 1];
    }

    function normalArticleTypeLabel(type) {
        const label = type?.trim() || '';
        if (/^review article$/i.test(label)) return 'Review';
        if (/^q&a$/i.test(label)) return 'Q&A';
        if (!label || label !== label.toUpperCase()) return label;
        const normalized = label.toLowerCase();
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function articleTypeFromDocument(article, sourceUrl = '') {
        const datedType = article.body?.innerText.match(
            /(?:^|\n)\s*([A-Za-z][A-Za-z &-]*)\s*\|\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/
        )?.[1]?.trim() || '';
        // ACS places its canonical type in the dated line above the title
        // (for example, "Article | September 05, 2026"). A broad class-name
        // match can instead reach
        // the separate Pay-Per-View "Buy This Article" control.
        // DOMParser documents have an `about:blank` location, so use the
        // fetched article URL rather than the parsed document's location.
        const sourceHost = new URL(sourceUrl || location.href, location.href).hostname;
        if (sourceHost === 'pubs.acs.org' && datedType) {
            return datedType;
        }
        const visibleType = article.querySelector('[data-test="article-category"]')?.textContent ||
            article.querySelector(
                '[data-article-type], [class*="article-type" i], [class*="articleType" i], ' +
                '.articleHeader__type, .meta-panel__type'
            )?.textContent;
        if (visibleType && !/\b(?:buy|purchase|pay-per-view)\b/i.test(visibleType)) {
            return visibleType;
        }
        return datedType;
    }

    function abbreviateNatureJournalName(name) {
        const abbreviations = {
            'Nature': 'Nature',
            'Nature Chemistry': 'Nat. Chem.',
            'Nature Catalysis': 'Nat. Catal.',
            'Nature Materials': 'Nat. Mater.',
            'Nature Synthesis': 'Nat. Synth.',
            'Nature Communications': 'Nat. Commun.'
        };
        return abbreviations[name] || name;
    }

    function sortOldestToNewest(items) {
        return items.sort((first, second) => {
            const firstTime = first.publicationDate?.getTime();
            const secondTime = second.publicationDate?.getTime();
            if (firstTime == null && secondTime == null) return 0;
            if (firstTime == null) return 1;
            if (secondTime == null) return -1;
            return firstTime - secondTime;
        });
    }

    function shouldOmitArticle(item) {
        const type = item?.articleType?.trim() || '';
        const title = item?.title?.trim() || '';
        if (articleTypeFilters.excludeIssueInformation &&
            /^Issue (?:Editorial Masthead|Publication Information)$/i.test(title)) return true;
        // ACS search cards disclose the article type only after loading the
        // landing page. Exclude Editorials once that canonical type is known,
        // while leaving editorial content from other publishers unchanged.
        if (articleTypeFilters.excludeAcsEditorial && item?.isAcs && /^editorial$/i.test(type)) return true;
        return (articleTypeFilters.excludeObituary && /\bobituar(?:y|ies)\b/i.test(type)) ||
            (articleTypeFilters.excludeCorrection && /\bcorrections?\b/i.test(type)) ||
            (articleTypeFilters.excludePreview && /^preview$/i.test(type)) ||
            (articleTypeFilters.excludeNews && /^news$/i.test(type)) ||
            (articleTypeFilters.excludeNewsAndViews && /^news\s*&\s*views$/i.test(type)) ||
            (articleTypeFilters.excludeResearchBriefing && /^research\s+briefings?$/i.test(type)) ||
            (articleTypeFilters.excludeResearchHighlights && /^research\s+highlights?$/i.test(type));
    }

    function shouldAlwaysIncludeArticle(item) {
        // Science's Feature and Careers sections are editorial content, not
        // research records, and should remain available when the
        // research-keyword filter is enabled.
        const type = item?.articleType || '';
        return (articleTypeFilters.includeFeature && /^feature$/i.test(type)) ||
            (articleTypeFilters.includeCareers && /^careers?$/i.test(type)) ||
            (articleTypeFilters.includeCareerColumns && /^career\s+columns?$/i.test(type)) ||
            (articleTypeFilters.includeTechnologyFeatures && /^technology\s+features?$/i.test(type));
    }

    function isStandardArticleType(type) {
        return /^(article|communication|research|research article|letter|originalpaper|edge article|cover)$/i.test(type?.trim() || '');
    }

    function shouldShowArticleDetailsDuringSlideshow(type) {
        const label = type?.trim() || '';
        // Science's Feature and Careers entries should retain their title and
        // type badge while slides advance automatically.
        return /^(?:feature|careers?)$/i.test(label) ||
            // Commentary is intentionally called out here: Cell exposes its
            // type only after the article page has been loaded.
            /^commentary$/i.test(label) ||
            (Boolean(label) && !isStandardArticleType(label));
    }

    let selectedResearchKeywords = new Set();
    let keywordFilteringDisabled = true;
    const defaultArticleTypeFilters = {
        excludeIssueInformation: true,
        excludeAcsEditorial: true,
        excludeObituary: true,
        excludeCorrection: true,
        excludePreview: true,
        excludeNews: true,
        excludeNewsAndViews: true,
        excludeResearchBriefing: true,
        excludeResearchHighlights: true,
        includeFeature: true,
        includeCareers: true,
        includeCareerColumns: true,
        includeTechnologyFeatures: true
    };
    const articleTypeFilters = { ...defaultArticleTypeFilters };

    async function restoreFilterSettings() {
        selectedResearchKeywords = new Set();
        keywordFilteringDisabled = true;
        Object.assign(articleTypeFilters, defaultArticleTypeFilters);
        try {
            const saved = await GM.getValue(filterSettingsPreferenceKey(), null);
            if (!saved || typeof saved !== 'object') return;
            keywordFilteringDisabled = saved.keywordFilteringDisabled === true;
            if (Array.isArray(saved.selectedResearchKeywords)) {
                selectedResearchKeywords = new Set(saved.selectedResearchKeywords);
            }
            if (saved.articleTypeFilters && typeof saved.articleTypeFilters === 'object') {
                Object.keys(defaultArticleTypeFilters).forEach(key => {
                    if (typeof saved.articleTypeFilters[key] === 'boolean') {
                        articleTypeFilters[key] = saved.articleTypeFilters[key];
                    }
                });
            }
        } catch (error) {
            console.warn('Could not restore filter settings.', error);
        }
    }

    async function saveFilterSettings() {
        try {
            await GM.setValue(filterSettingsPreferenceKey(), {
                keywordFilteringDisabled,
                selectedResearchKeywords: [...selectedResearchKeywords],
                articleTypeFilters
            });
        } catch (error) {
            console.warn('Could not save filter settings.', error);
        }
    }
    function matchingResearchKeywordGroups(item) {
        // Do not expose title-only matches while the article abstract is still
        // being retrieved. Every journal should use the same complete text.
        if (typeof item?.abstract !== 'string') return [];
        const text = `${item?.title || ''} ${item?.abstract || ''}`;
        return researchKeywordGroups.filter(group => group.pattern.test(text));
    }

    function enabledMatchingResearchKeywordGroups(item) {
        if (keywordFilteringDisabled) return [];
        return matchingResearchKeywordGroups(item).filter(group =>
            selectedResearchKeywords.has(group.label)
        );
    }

    function loadArticleDocument(item) {
        if (!item?.href) return Promise.resolve(null);
        if (!item.articleDocumentPromise) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            const request = fetch(item.href, { credentials: 'include', signal: controller.signal })
                .then(response => {
                    if (!response.ok) throw new Error(`Article request failed: ${response.status}`);
                    return response.text();
                })
                .then(html => {
                    const article = new DOMParser().parseFromString(html, 'text/html');
                    // RSC access checks can return HTML with a successful status.
                    if (item.isRsc && !article.querySelector('meta[name="citation_doi"]')) {
                        throw new Error('RSC returned an access-check page or unreadable article HTML.');
                    }
                    return article;
                })
                .finally(() => clearTimeout(timeout));
            item.articleDocumentPromise = request;
            // Share the fetch with current consumers, then release the full
            // article DOM. Keeping one for every buffered result exhausts
            // Safari memory when moving across search pages.
            request.then(() => {
                if (item.articleDocumentPromise === request) item.articleDocumentPromise = null;
            }, () => {
                if (item.articleDocumentPromise === request) item.articleDocumentPromise = null;
            });
        }
        return item.articleDocumentPromise;
    }

    function natureVersionOfRecordDate(article) {
        // Nature research papers and Nature Communications expose the definitive date in a
        // dedicated "Version of record" line. Its search card instead carries
        // the earlier online-publication date.
        // The article is fetched and parsed with DOMParser, where innerText
        // is unavailable. Match the dated label in the parsed text instead.
        const dateParts = article.body?.textContent.match(
            /Version of record\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
        );
        if (!dateParts) return null;
        const month = ['january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december']
            .indexOf(dateParts[2].toLowerCase());
        if (month < 0) return null;
        const day = Number(dateParts[1]);
        const year = Number(dateParts[3]);
        const versionOfRecordDate = new Date(Date.UTC(year, month, day));
        return versionOfRecordDate.getUTCDate() === day &&
            versionOfRecordDate.getUTCMonth() === month
            ? versionOfRecordDate
            : null;
    }

    function acsPdfUrlFromDocument(article, articleUrl) {
        const base = new URL(articleUrl, location.href);
        const values = [
            article.querySelector('meta[name="citation_pdf_url"]')?.content,
            ...Array.from(article.querySelectorAll('a[href]'), link => link.getAttribute('href'))
        ];
        for (const value of values) {
            if (!value) continue;
            try {
                const url = new URL(value, base);
                if (url.protocol === 'https:' && url.hostname === base.hostname &&
                    /\/(?:article-pdf\/|doi\/pdf\/)/i.test(url.pathname)) return url.href;
            } catch (_) {}
        }
        return '';
    }

    function usesNatureVersionOfRecordDate(item) {
        return Boolean(item.isNature &&
            /^(?:research(?: article)?|article|letter)$/i.test(item.articleType?.trim() || ''));
    }

    function applyArticleMetadata(item, article) {
        const doi = article.querySelector('meta[name="citation_doi"]')?.content?.trim();
        if (doi) item.doi = doi;
        if (item.isScience) {
            const dateText = article.querySelector('meta[name="citation_publication_date"], meta[name="citation_date"], meta[property="article:published_time"]')?.content?.trim();
            const dateParts = dateText?.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\b|T)/);
            if (dateParts) {
                const date = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])));
                if (date.getUTCFullYear() === Number(dateParts[1]) &&
                    date.getUTCMonth() === Number(dateParts[2]) - 1 &&
                    date.getUTCDate() === Number(dateParts[3])) item.publicationDate = date;
            }
        }
        if (item.isRsc) {
            const values = [article.querySelector('meta[name="citation_pdf_url"]')?.content,
                ...Array.from(article.querySelectorAll('a[href]'), link => link.getAttribute('href'))];
            for (const value of values) {
                if (!value) continue;
                try {
                    const url = new URL(value, item.href);
                    if (url.protocol === 'https:' && url.hostname === 'pubs.rsc.org' &&
                        /\/(?:article-pdf\/|content\/articlepdf\/)/i.test(url.pathname)) {
                        item.pdfUrl = url.href;
                        break;
                    }
                } catch (_) {}
            }
            const date = article.querySelector('meta[name="citation_publication_date"], meta[name="citation_date"]')?.content;
            item.rscPublicationYear = date?.match(/\b(?:19|20)\d{2}\b/)?.[0];
        }
        if (new URL(item.href, location.href).hostname === 'pubs.acs.org') {
            item.pdfUrl = acsPdfUrlFromDocument(article, item.href) || item.pdfUrl || '';
            const doiValues = [
                item.doi,
                article.querySelector('meta[name="dc.Identifier"], meta[name="DC.Identifier"], meta[name="prism.doi"], meta[property="prism:doi"]')?.content,
                ...Array.from(article.querySelectorAll('a[href]'), link => link.getAttribute('href'))
                    .filter(href => /^https?:\/\/(?:dx\.)?doi\.org\//i.test(href))
            ];
            for (const value of doiValues) {
                const match = value?.match(/(?:^|doi\.org\/)(10\.\d{4,9}\/[^\s?#]+)/i);
                if (match) { item.doi = match[1]; break; }
            }
        }
        const articleType = articleTypeFromDocument(article, item.href).trim();
        if (item.isAccountsJournal && /^article$/i.test(articleType)) item.articleType = 'Account';
        else if (articleType) item.articleType = normalArticleTypeLabel(articleType);
        if (item.isNature) {
            if (usesNatureVersionOfRecordDate(item)) {
                const versionOfRecordDate = natureVersionOfRecordDate(article);
                item.hasVersionOfRecordDate = Boolean(versionOfRecordDate);
                if (versionOfRecordDate) item.publicationDate = versionOfRecordDate;
            } else delete item.hasVersionOfRecordDate;
        }
        item.metadataLoaded = true;
    }

    async function loadItemMetadata(item) {
        if (!item?.href) return;
        if (item.metadataLoaded) return;
        if (item.metadataLoadPromise) return item.metadataLoadPromise;
        item.metadataLoadPromise = loadArticleDocument(item)
            .then(article => {
                if (article) applyArticleMetadata(item, article);
            })
            .catch(error => {
                console.warn('Could not retrieve article metadata.', error);
                return null;
            });
        return item.metadataLoadPromise;
    }

    async function loadItemAbstract(item) {
        if (!item?.href) return '';
        if (typeof item.abstract === 'string') return item.abstract;
        if (item.abstractLoadPromise) return item.abstractLoadPromise;
        item.abstractLoadPromise = (async () => {
            try {
            const article = await loadArticleDocument(item);
            applyArticleMetadata(item, article);
            const scienceAbstract = item.isScience
                ? article.querySelector(
                    'section#abstract[role="doc-abstract"], section#abstract[property="abstract"]'
                )?.textContent.trim() || ''
                : '';
            const abstractSections = [...article.querySelectorAll(
                '.abstractSection, .abstract, [class*="abstract"]'
            )].map(section => section.textContent.trim()).filter(Boolean).join(' ');
            const abstract = article.querySelector('meta[name="citation_abstract"]')?.content ||
                scienceAbstract || abstractSections ||
                article.querySelector('meta[name="description"]')?.content || '';
            item.abstract = abstract.trim();
            window.dispatchEvent(new CustomEvent('graphical-reader-abstract-loaded', {
                detail: { item }
            }));
            return item.abstract;
        } catch (error) {
            console.warn('Could not retrieve an article abstract for keyword filtering.', error);
            item.abstract = '';
            return '';
        }
        })();
        return item.abstractLoadPromise;
    }

    async function articleMatchesFilter(item) {
        if (!item?.href) return false;
        // Search cards can expose a broad category such as "Comments & Opinion"
        // while the article page supplies the canonical type, such as "Obituary".
        // Resolve that metadata before applying either omit or always-keep rules.
        if (keywordFilteringDisabled) {
            await loadItemMetadata(item);
        } else {
            await loadItemAbstract(item);
        }
        if (shouldOmitArticle(item)) return false;
        if (shouldAlwaysIncludeArticle(item)) return true;
        if (keywordFilteringDisabled) return true;
        return matchingResearchKeywordGroups(item).some(group =>
            selectedResearchKeywords.has(group.label)
        );
    }

    function collectNatureItems(root = document) {
        // Use search cards for metadata and retrieve figures from the article.
        const items = [...root.querySelectorAll(
            '#search-article-list article, .app-article-list-row__item article'
        )].map(card => {
            const articleLink = [...card.querySelectorAll('h2 a[href], h3 a[href], h4 a[href], a[href]')]
                .find(link => /^\/articles\/[^/]+$/i.test(
                    new URL(link.href, location.href).pathname
                ));
            if (!articleLink) return null;

            const time = card.querySelector('time[datetime], time');
            const dateText = time?.dateTime || time?.getAttribute('datetime') || time?.textContent.trim() || '';
            const publicationDate = dateText ? new Date(dateText) : null;
            const journalName = abbreviateNatureJournalName(
                card.querySelector('[data-test="journal-title-and-link"]')?.textContent.trim() || ''
            );

            return {
                src: '',
                href: articleLink.href,
                doi: '',
                // Article types are authoritative only on the article page.
                articleType: '',
                journalName,
                title: sentenceCaseTitle(articleLink.textContent.trim()),
                publicationDate: publicationDate && !Number.isNaN(publicationDate.getTime())
                    ? publicationDate
                    : null,
                isNature: true
            };
        }).filter(Boolean);
        // Nature already supplies the requested result order (including its
        // own handling of same-day articles and relevance). Reverse it for
        // oldest-to-newest reading without independently re-sorting by date.
        return collectUnseenArticles(items, new Set()).reverse();
    }

    function collectAcsSearchItems(root = document) {
        const seenArticles = new Set();
        const items = [...root.querySelectorAll('.sr-list')].map(card => {
            const articleLink = card.querySelector('.sri-title h2 a[href], .sri-title h3 a[href], .sri-title h4 a[href]');
            if (!articleLink) return null;
            const articlePath = new URL(articleLink.href, location.href).pathname;
            if (!/(?:\/article\/|\/doi\/)/.test(articlePath) ||
                /\/doi\/pdf\//.test(articleLink.href)) return null;

            const doiLink = card.querySelector('.ww-citation-wrap-doi a[href]')?.href || '';
            const doi = doiLink
                ? decodeURIComponent(new URL(doiLink, location.href).pathname.slice(1))
                : doiFromUrl(articleLink.href);
            const articleKey = doi ? `doi:${doi.toLowerCase()}` : `href:${articleLink.href}`;
            if (seenArticles.has(articleKey)) return null;
            seenArticles.add(articleKey);

            const dateText = card.querySelector('.sri-date')?.textContent
                .replace(/^\s*Publication Date:\s*/i, '').trim() || '';
            const publicationDate = dateText ? new Date(dateText) : null;
            const journalText = card.querySelector('.al-citation-list em')?.textContent.trim() || '';
            const image = card.querySelector('.sri-figure img');
            const imageSrc = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
            return {
                src: imageSrc ? new URL(imageSrc, location.href).href : '',
                href: articleLink.href,
                // New ACS article URLs omit the DOI; retain the citation DOI
                // and any direct PDF link supplied by this result card.
                doi,
                pdfUrl: acsPdfUrlFromDocument(card, articleLink.href),
                // ACS exposes this only on the individual article page.
                articleType: '',
                journalName: abbreviateJournalName(journalText),
                title: sentenceCaseTitle(articleLink.textContent.trim()),
                publicationDate: publicationDate && !Number.isNaN(publicationDate.getTime())
                    ? publicationDate
                    : null,
                isAcs: true,
                isAccountsJournal: /\b(?:accounts|acc\.)/i.test(journalText)
            };
        }).filter(Boolean);
        return items.reverse();
    }

    function articleIdentityKey(item) {
        return !item.isNature && item.doi
            ? `doi:${item.doi.trim().toLowerCase()}`
            : `href:${item.href}`;
    }

    function collectUnseenArticles(items, seenKeys) {
        return items.filter(item => {
            const key = articleIdentityKey(item);
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });
    }

    function matchesSavedPosition(savedDoi, savedHref) {
        const doi = savedDoi?.trim().toLowerCase();
        return item => Boolean(
            (doi && item.doi?.trim().toLowerCase() === doi) ||
            (savedHref && item.href === savedHref)
        );
    }

    function collectRscLatestItems(root = document) {
        const seenHrefs = new Set();
        // RSC cards contain several links with the same `/article/` prefix,
        // including supplementary data.  Collect only the heading link: it is
        // the article landing page and its text is the unadorned title.
        // The RSC page renders each list in its own `online-early-section`.
        // Select the Advance Articles section itself rather than trying to
        // infer boundaries from document order; the second section contains
        // accepted manuscripts and uses the same card class.
        const advanceSection = [...root.querySelectorAll('section.online-early-section')]
            .find(section => /^advance articles$/i.test(
                section.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')
                    ?.textContent.trim() || ''
            ));
        const cards = advanceSection
            ? [...advanceSection.querySelectorAll('.al-article-items, [class*="article-item" i]')]
            : [];
        return cards.map(card => {
                const articleLink = card.querySelector(
                    'h1 a[href], h2 a[href], h3 a[href], h4 a[href], h5 a[href], h6 a[href]'
                );
                if (!articleLink?.textContent.trim() || seenHrefs.has(articleLink.href)) return null;
                seenHrefs.add(articleLink.href);
                const cardText = card?.textContent || '';
                const dateText = card?.querySelector('time[datetime], time')?.getAttribute('datetime') ||
                    card?.querySelector('time')?.textContent.trim() ||
                    cardText.match(/(?:First published|Published)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)?.[1] ||
                    cardText.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/)?.[1] || '';
                const publicationDate = dateText ? new Date(dateText) : null;
                const articleType = card.querySelector('.sri-type, .al-type, [class*="article-type" i]')
                    ?.textContent.trim() ||
                    cardText.match(/^\s*([^|\n]+?)\s*\|\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}/)?.[1]?.trim() || '';
                return {
                    href: articleLink.href,
                    doi: doiFromUrl(articleLink.href),
                    articleType: normalArticleTypeLabel(articleType),
                    title: sentenceCaseTitle(articleLink.textContent.trim()),
                    publicationDate: publicationDate && !Number.isNaN(publicationDate.getTime())
                        ? publicationDate
                        : null,
                    isRsc: true
                };
            }).filter(Boolean).reverse();
    }

    function collectWileyTocItems(root = document) {
        const items = [];
        const seenHrefs = new Set();
        // Wiley puts an article-type heading ahead of a run of `.issue-item`
        // entries. Qualifiers such as "Hot Paper" are lower-level headings
        // within that run, so deliberately only use the section heading.
        for (const section of root.querySelectorAll('.issue-items-container')) {
            let articleType = '';
            for (const child of section.children) {
                if (child.matches('h3.toc__heading.section__header')) {
                    articleType = normalArticleTypeLabel(child.textContent.trim());
                    continue;
                }
                if (!child.matches('.issue-item')) continue;

                const articleLink = child.querySelector('a.issue-item__title[href]');
                if (!articleLink || seenHrefs.has(articleLink.href)) continue;
                seenHrefs.add(articleLink.href);

                const image = child.querySelector('.toc-item__abstract img, img');
                const src = image?.currentSrc || image?.getAttribute('src') ||
                    image?.getAttribute('data-src') || image?.getAttribute('data-original') || '';
                // Settings are restored after the initial collection and can
                // resume an article from a later page. Retain Wiley's TOC
                // preview now so a subsequently enabled keyword filter has
                // the text available on both the current and fetched pages.
                const abstract = child.querySelector('.toc-item__abstract p')?.textContent.trim() || '';
                const dateText = child.querySelector('.ePubDate')?.textContent
                    .replace(/^.*?(?:online|published)\s*:\s*/i, '').trim() ||
                    child.textContent.match(
                        /(?:version of record\s+)?(?:online|published)\s*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i
                    )?.[1] || '';
                const publicationDate = dateText ? new Date(dateText) : null;

                items.push({
                    src: src ? new URL(src, location.href).href : '',
                    href: articleLink.href,
                    doi: doiFromUrl(articleLink.href),
                    articleType,
                    title: sentenceCaseTitle(articleLink.textContent.trim()),
                    // The TOC preview is retained for keyword filtering.
                    abstract,
                    publicationDate: publicationDate && !Number.isNaN(publicationDate.getTime())
                        ? publicationDate
                        : null,
                    isWiley: true
                });
            }
        }
        // Wiley lists the newest work first; the reader moves oldest to newest.
        return items.reverse();
    }

    function collectScienceTocItems(root = document) {
        const allowedSections = isScienceAdvancesCurrentTocPage()
            ? new Set(['PHYSICAL AND MATERIALS SCIENCES'])
            : new Set(['EDITORIAL', 'FEATURE', 'RESEARCH ARTICLES', 'CAREERS']);
        const seenHrefs = new Set();
        // Each genuine issue entry is a direct card in a TOC section. Related
        // articles and perspectives are nested inside those cards, so selecting
        // only the primary card-header title prevents them becoming entries.
        return [...root.querySelectorAll('section.toc__section > .card')].map(card => {
            const articleLink = card.querySelector('.card-header .article-title > a[href]');
            if (!articleLink?.textContent.trim() || seenHrefs.has(articleLink.href)) return null;
            const path = new URL(articleLink.href, location.href).pathname;
            if (!/(?:\/doi\/|\/content\/article\/)/i.test(path)) return null;

            const precedingHeadings = [...card.parentElement.children]
                .slice(0, [...card.parentElement.children].indexOf(card))
                .filter(element => element.matches('h4.to-section, h5.to-section'));
            const majorSection = precedingHeadings
                .filter(element => element.matches('h4.to-section'))
                .at(-1)?.textContent.trim().toUpperCase() || '';
            const subsection = precedingHeadings
                .filter(element => element.matches('h5.to-section'))
                .at(-1)?.textContent.trim().toUpperCase() || '';
            const articleType = allowedSections.has(subsection)
                ? subsection
                : allowedSections.has(majorSection) ? majorSection : '';
            if (!articleType) return null;
            seenHrefs.add(articleLink.href);
            const dateElement = card.querySelector('.card-header .card-meta time');
            const dateText = dateElement?.getAttribute('datetime') || dateElement?.textContent.trim();
            const parsedDate = dateText ? new Date(dateText) : null;
            // Keep the publisher's calendar day when the reader formats it in UTC.
            const publicationDate = parsedDate && !Number.isNaN(parsedDate.getTime())
                ? /^\d{4}-\d{2}-\d{2}/.test(dateText)
                    ? new Date(`${dateText.slice(0, 10)}T00:00:00Z`)
                    : new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()))
                : null;
            return {
                src: '',
                href: articleLink.href,
                doi: doiFromUrl(articleLink.href),
                articleType: normalArticleTypeLabel(articleType),
                title: sentenceCaseTitle(articleLink.textContent.trim()),
                publicationDate,
                isScience: true
            };
        }).filter(Boolean);
    }

    function collectCellNewArticlesItems(root = document) {
        // The Graphene layout groups cards by month, with daily subheadings
        // before each list. Keep the older TOC layout supported as well.
        const seenHrefs = new Set();
        const items = [...root.querySelectorAll('.toc__item, .graphene-publication-item')].map(card => {
            const titleLink = card.querySelector('.graphene-publication-item__title[href], .toc__item__title a[href], h3 a[href], h2 a[href]');
            if (!titleLink || seenHrefs.has(titleLink.href)) return null;
            seenHrefs.add(titleLink.href);

            const image = card.querySelector('.toc__item__cover img, img');
            const src = image?.currentSrc || image?.getAttribute('data-src') ||
                image?.getAttribute('data-original') || image?.getAttribute('src');
            // Chem emits a separate section for each card, with the date
            // heading only on the first section in a group.
            let section = card.closest('.toc__section');
            while (section && !section.querySelector(':scope > .toc__heading')) {
                section = section.previousElementSibling?.matches('.toc__section')
                    ? section.previousElementSibling
                    : null;
            }
            let dateHeading = card.closest('.graphene-toc__section-body')?.previousElementSibling;
            while (dateHeading && !dateHeading.matches('.graphene-toc__section__sub-header')) {
                dateHeading = dateHeading.previousElementSibling;
            }
            const sectionDate = dateHeading?.textContent.trim() || section?.querySelector(':scope > .toc__heading')
                ?.textContent.trim() || '';
            const dateText = card.textContent.match(
                /(?:First\s+published|Published\s+online)\s*:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
            )?.[1]?.trim() || sectionDate;
            const parsedDate = dateText ? new Date(dateText) : null;
            // The reader displays the UTC calendar day. Date-only text is
            // parsed as local midnight, which is the prior UTC day in Europe.
            const publicationDate = parsedDate && !Number.isNaN(parsedDate.getTime())
                ? new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()))
                : null;

            return {
                src: src ? new URL(src, location.href).href : '',
                href: titleLink.href,
                doi: '',
                articleType: '',
                title: sentenceCaseTitle(titleLink.textContent.trim()),
                publicationDate,
                isCell: true
            };
        }).filter(Boolean);
        // Cell Press presents each newest date first; retain an oldest-first
        // reader sequence while preserving the order of articles on a date.
        return sortOldestToNewest(items);
    }

    function collectItems(root = document) {
        if (isNatureSearchPage()) return collectNatureItems(root);
        if (isAcsSearchPage()) {
            return collectAcsSearchItems(root);
        }
        if (isRscLatestArticlesPage()) return collectRscLatestItems(root);
        if (isWileyTocPage()) return collectWileyTocItems(root);
        if (isScienceTocPage()) return collectScienceTocItems(root);
        if (isCellNewArticlesPage()) return collectCellNewArticlesItems(root);

        const graphics = [...root.querySelectorAll(
            '.issue-graphical-abstract, .articleCitation .toc__item__cover'
        )];
        const items = graphics.map(graphic => {
            const image = graphic.querySelector('img');
            if (!image) return null;
            const src = image.currentSrc || image.getAttribute('src') ||
                image.getAttribute('data-src') || image.getAttribute('data-original');
            if (!src) return null;
            const article = graphic.closest('.al-article-item-wrap, .articleCitation');
            const articleLink = article && [...article.querySelectorAll('a[href]')].find(link =>
                (link.href.includes('/doi/') || link.href.includes('/fulltext/')) && !link.href.includes('/pdf/')
            );
            return {
                src: new URL(src, location.href).href,
                href: articleLink?.href || null,
                doi: doiFromUrl(articleLink?.href),
                // Article types are authoritative only on the article page.
                articleType: '',
                title: sentenceCaseTitle(articleLink?.getAttribute('title')?.trim() || articleLink?.textContent.trim() || ''),
                publicationDate: null,
                isCell: location.hostname === 'www.cell.com'
            };
        }).filter(Boolean);
        return sortOldestToNewest(items);
    }

    async function findSavedNatureSearchArticle(initialItems, savedHref, resumePage = 0) {
        if (!savedHref || !isNatureSearchPage()) {
            return null;
        }
        const currentPage = Number(new URL(location.href).searchParams.get('page') || 1);
        const restarting = resumePage > currentPage + 1;
        let combinedItems = restarting ? [] : initialItems.slice();
        const seenArticles = new Set(combinedItems.map(articleIdentityKey));
        const matchesSavedArticle = matchesSavedPosition('', savedHref);
        const newestPage = restarting ? resumePage : currentPage;
        let oldestPage = newestPage;

        // Search only following results pages, toward older articles in the
        // recommended newest-first search. Saved dates are not a cutoff.
        let pageNumber = Math.max(currentPage + 1, resumePage);
        while (true) {
            try {
                setLoadingMessage(`Finding saved position — page ${pageNumber}…`);
                const page = await fetchPaginatedDocument(pageNumber, 'Nature search');
                const fetchedItems = collectNatureItems(page);
                if (!fetchedItems.length) {
                    throw new Error(`No articles recognized. Returned page title: ${page.title || '(none)'}`);
                }
                const pageItems = collectUnseenArticles(fetchedItems, seenArticles);
                // Some sites repeat the final page for out-of-range requests.
                if (!pageItems.length) break;
                oldestPage = pageNumber;
                combinedItems = pageItems.concat(combinedItems);
                const savedIndex = combinedItems.findIndex(matchesSavedArticle);
                if (savedIndex >= 0) {
                    return {
                        items: combinedItems,
                        index: savedIndex,
                        pageNumber,
                        newestPage,
                        oldestPage
                    };
                }

                pageNumber += 1;
            } catch (error) {
                console.warn('Could not locate the saved Nature search article.', error);
                const failure = new Error(`Could not find the saved position on Nature search page ${pageNumber}.\n${error.message || error}`);
                failure.naturePageNumber = pageNumber;
                throw failure;
            }
        }
        return null;
    }

    function acsSearchTotalPages() {
        return Number(
            document.querySelector('.al-page-info')?.textContent.match(/of\s+(\d+)/i)?.[1] ||
            Number.POSITIVE_INFINITY
        );
    }

    async function findSavedAcsArticle(initialItems, savedDoi, savedHref) {
        if ((!savedDoi && !savedHref) || !isAcsSearchPage()) return null;

        const currentPage = acsSearchPageNumber();
        const totalPages = acsSearchTotalPages();
        const matchesSavedArticle = matchesSavedPosition(savedDoi, savedHref);
        let combinedItems = initialItems.slice();
        const seenArticles = new Set(initialItems.map(articleIdentityKey));
        let pageNumber = currentPage + 1;
        const seenPageSignatures = new Set([
            initialItems.map(articleIdentityKey).join('|')
        ]);

        while (!totalPages || pageNumber <= totalPages) {
            try {
                const totalLabel = Number.isFinite(totalPages) ? ` of ${totalPages}` : '';
                setLoadingMessage(`Finding saved position — page ${pageNumber}${totalLabel}…`);
                const page = await fetchPaginatedDocument(pageNumber, 'ACS');
                const fetchedItems = collectAcsSearchItems(page);
                if (!fetchedItems.length) return null;
                const signature = fetchedItems.map(articleIdentityKey).join('|');
                if (seenPageSignatures.has(signature)) return null;
                seenPageSignatures.add(signature);
                const pageItems = collectUnseenArticles(fetchedItems, seenArticles);
                // Overlapping results can contain only previously seen
                // articles without marking the end of the search.
                combinedItems = pageItems.concat(combinedItems);
                const savedIndex = combinedItems.findIndex(matchesSavedArticle);
                if (savedIndex >= 0) {
                    return { items: combinedItems, index: savedIndex, pageNumber };
                }
                pageNumber += 1;
            } catch (error) {
                console.warn('Could not locate the saved ACS article.', error);
                return null;
            }
        }
        return null;
    }

    function nextWileyTocPageUrl(root, baseUrl = location.href) {
        // Early View pagination is distinct from Wiley's Previous/Next Issue
        // links. Only accept a pagination link, never an issue navigation link.
        const paginationLinks = [...root.querySelectorAll(
            '[class*="pagination" i] a[href], [role="navigation"] a[href], a[rel="next"][href], ' +
            'a[aria-label*="next page" i][href], a[title*="next page" i][href]'
        )].filter(link => {
            const label = [link.textContent, link.getAttribute('aria-label'), link.getAttribute('title')]
                .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            return !/\bnext\s+issue\b|\bprevious\s+issue\b/i.test(label);
        });
        const nextLink = paginationLinks.find(link =>
            link.matches('a[rel="next"]') ||
            /\bnext\b/i.test([
                link.textContent, link.getAttribute('aria-label'), link.getAttribute('title')
            ].filter(Boolean).join(' '))
        );
        if (nextLink && !/^javascript:/i.test(nextLink.getAttribute('href') || '')) {
            return new URL(nextLink.getAttribute('href'), baseUrl).href;
        }
        const pageUrl = new URL(baseUrl);
        // Wiley's /0/0 Early View route exposes numbered links without a
        // dedicated Next control. Page 1 has no query parameter; later pages
        // use `?page=2`, `?page=3`, and so on.
        if (/\/0\/0\/?$/i.test(pageUrl.pathname)) {
            const pageNumber = Number(pageUrl.searchParams.get('page') || 1);
            if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;
            pageUrl.searchParams.set('page', String(pageNumber + 1));
            return pageUrl.href;
        }
        // Retain compatibility with Wiley journals that use the alternative
        // Early View route and its startPage/pageSize parameters.
        if (!/\/earlyview\/?$/i.test(pageUrl.pathname)) return null;
        const pageSize = Number(pageUrl.searchParams.get('pageSize') || 20);
        const startPage = Number(pageUrl.searchParams.get('startPage') || 0);
        if (!Number.isFinite(pageSize) || pageSize < 1 || !Number.isFinite(startPage)) return null;
        pageUrl.searchParams.set('pageSize', String(pageSize));
        // `startPage` is Wiley's zero-based page number, rather than an
        // article offset. Keep pageSize unchanged and advance it by one.
        pageUrl.searchParams.set('startPage', String(startPage + 1));
        return pageUrl.href;
    }

    function nextListingPageUrl(root, baseUrl = location.href) {
        const nextLink = root.querySelector(
            'a[rel="next"][href], a[aria-label*="next" i][href], ' +
            '[class*="pagination" i] a[href][title*="next" i], ' +
            '[class*="pagination" i] a[class*="next" i][href]'
        );
        if (!nextLink || /^javascript:/i.test(nextLink.getAttribute('href') || '')) return null;
        return new URL(nextLink.getAttribute('href'), baseUrl).href;
    }

    async function findSavedWileyTocArticle(initialItems, savedHref) {
        if (!savedHref || !isWileyTocPage()) return null;

        let combinedItems = initialItems.slice();
        let pageUrl = nextWileyTocPageUrl(document);
        const seenPageUrls = new Set([location.href]);
        while (pageUrl && !seenPageUrls.has(pageUrl)) {
            seenPageUrls.add(pageUrl);
            try {
                setLoadingMessage(`Finding saved position — page ${seenPageUrls.size}…`);
                const page = await fetchDocument(pageUrl, 'Wiley TOC');
                const pageItems = collectWileyTocItems(page);
                if (!pageItems.length) return null;
                // Wiley pages are newest to oldest, while the reader uses the
                // reverse sequence. Older results therefore precede the
                // articles already collected from the current page.
                combinedItems = pageItems.concat(combinedItems);
                const savedIndex = combinedItems.findIndex(item => item.href === savedHref);
                if (savedIndex >= 0) {
                    return {
                        items: combinedItems,
                        index: savedIndex,
                        nextPageUrl: nextWileyTocPageUrl(page, pageUrl)
                    };
                }
                pageUrl = nextWileyTocPageUrl(page, pageUrl);
            } catch (error) {
                console.warn('Could not locate the saved Wiley TOC article.', error);
                return null;
            }
        }
        return null;
    }

    function rscGraphicalAbstractSource(article, sourceFromSrcset, baseUrl) {
        // RSC's current article pages lazy-load the visual abstract.  `src`
        // initially points to a preloader GIF, while the real, signed PNG URL
        // is held in `data-src` inside the dedicated graphical-abstract block.
        // Keep the lookup scoped to that block so a normal article figure is
        // never mistaken for the visual abstract.
        const graphicalAbstract = article.querySelector(
            '.graphical-abstract, [data-id="ga"], [class*="graphicalabstract" i]'
        );
        const image = graphicalAbstract?.querySelector('img');
        const imageSource = image?.getAttribute('data-src') ||
            image?.getAttribute('data-original') ||
            image?.getAttribute('data-lazy-src') ||
            sourceFromSrcset(image?.getAttribute('data-srcset')) ||
            sourceFromSrcset(image?.getAttribute('srcset')) ||
            image?.getAttribute('src');
        if (imageSource && !/\/preloader\.(?:gif|svg)(?:[?#]|$)/i.test(imageSource)) {
            return imageSource;
        }

        // Some RSC articles expose only the "Download slide" link.  Its
        // `image` parameter is the same browser-displayable PNG, whereas the
        // adjacent "View large" link often targets a TIFF file.
        const downloadHref = graphicalAbstract?.querySelector('a.download-slide[href]')?.getAttribute('href');
        if (downloadHref) {
            const directImage = new URL(downloadHref, baseUrl).searchParams.get('image');
            if (directImage) return directImage;
        }
        return '';
    }

    async function loadRscGraphicalAbstract(item) {
        // Share the article HTML load with metadata and keyword extraction.
        const article = await loadArticleDocument(item);
        applyArticleMetadata(item, article);
        const sourceFromSrcset = srcset => {
            const candidates = srcset?.split(',') || [];
            return candidates[candidates.length - 1]?.trim().replace(/\s+\S+$/, '');
        };
        return rscGraphicalAbstractSource(article, sourceFromSrcset, item.href);
    }

    function natureDisplayImageSource(source, baseUrl) {
        const imageUrl = new URL(source, baseUrl);
        // Nature's rendered article pages select Springer Nature's WebP
        // rendition (`?as=webp`).  The landing-page HTML still exposes the
        // original PNG in `src`; on iOS that original can intermittently be
        // rejected by the media CDN while the rendition loads normally.
        if (imageUrl.hostname === 'media.springernature.com' &&
            /\.(?:png|jpe?g)(?:$|\/)/i.test(imageUrl.pathname)) {
            imageUrl.searchParams.set('as', 'webp');
        }
        return imageUrl.href;
    }

    function resolveHighResolutionImage(item) {
        // RSC images are retrieved from each article landing page.
        const isCellArticle = item.isCell &&
            /^https:\/\/www\.cell\.com\/[^/]+\/fulltext\//i.test(item.href || '');
        const isNatureArticle = item.isNature &&
            /^https:\/\/www\.nature\.com\/articles\/[^/?#]+/i.test(item.href || '');
        const isScienceArticle = item.isScience &&
            /^https:\/\/www\.science\.org\/(?:doi|content\/article)\/[^/?#]+/i.test(item.href || '');
        const isScienceFeature = isScienceArticle && /^feature$/i.test(item.articleType || '');
        const isScienceCareers = isScienceArticle && /^careers$/i.test(item.articleType || '');
        // Article URLs have changed more than once during RSC's platform
        // migration.  The card itself is the reliable indication that this is
        // an RSC landing page; do not gate the fetch on a particular URL form.
        const isRscArticle = item.isRsc && /^https:\/\/pubs\.rsc\.org\//i.test(item.href || '');
        const isWileyArticle = item.isWiley && !item.src &&
            /^https:\/\/(?:[\w-]+\.)*onlinelibrary\.wiley\.com\/doi\//i.test(item.href || '');
        if (!item.href || (!isCellArticle && !isAcsSearchPage() && !isNatureArticle && !isRscArticle && !isScienceArticle && !isWileyArticle)) {
            return Promise.resolve(null);
        }
        // ACS now includes the graphical abstract in its search card. Use
        // that exact image instead of guessing from figures on the article page.
        if (item.isAcs && item.src) return Promise.resolve(item.src);
        if (item.highResolutionImage) return Promise.resolve(item.highResolutionImage);
        if (item.highResolutionImagePromise) return item.highResolutionImagePromise;

        item.highResolutionImagePromise = (isRscArticle
            ? loadRscGraphicalAbstract(item)
            : loadArticleDocument(item))
            .then(async article => {
                if (isRscArticle) {
                    if (!article) {
                        item.highResolutionUnavailable = true;
                        item.imageLoadError = 'No visual abstract was found on the RSC article landing page.';
                        return null;
                    }
                    // Save the landing-page image on the card as well.  This
                    // means the viewer can render it immediately during its
                    // first paint, rather than depending on a later resolver
                    // callback.
                    item.src = new URL(article, item.href).href;
                    item.highResolutionImage = item.src;
                    return item.highResolutionImage;
                }
                applyArticleMetadata(item, article);
                const graphicalAbstract = isCellArticle
                    ? article.querySelector('img[id^="ga"], img[alt*="graphical abstract" i]') ||
                        article.querySelector('img[id^="gr"]')
                    : isWileyArticle
                        // Entries without TOC artwork use the first article figure.
                        ? article.querySelector('.article-section__content figure img, article figure img, figure img')
                    : isNatureArticle
                        ? article.querySelector('img[alt*="graphical abstract" i]') ||
                            article.querySelector('figure#Fig1 img, #Fig1 figure img')
                    : isScienceFeature
                        // Features use a lead image in the article header;
                        // prefer it over the first in-body figure.
                        ? article.querySelector(
                            '.news-article__hero img, main [class*="article-header" i] img, ' +
                            'article [class*="article-header" i] img, ' +
                            'main header img, article header img'
                        )
                    : isScienceCareers
                        // Careers stories use their cover as the lead image in
                        // the landing-page article content.
                        ? article.querySelector(
                            '.news-article-content > figure img, ' +
                            '.news-article-content .figure__wrapper > img'
                        )
                    : isScienceArticle
                        // Science does not publish graphical abstracts. Use
                        // the lead figure from the article landing page. A
                        // CMS-image fallback covers the compact markup that
                        // Science serves to some mobile browsers.
                        ? article.querySelector('main figure img, article figure img, figure img') ||
                            article.querySelector('img[src*="/cms/"][src*="/assets/images/"]')
                    : article.querySelector('img[alt^="Graphic."], img[alt*="graphical abstract" i]') ||
                            (isAcsSearchPage() ? article.querySelector('main figure img, article figure img, figure img') : null);
                const visualAbstractHeading = [...article.querySelectorAll('h1, h2, h3, h4, h5, h6')]
                    .find(heading => /^visual abstract$/i.test(heading.textContent.trim()));
                const visualAbstractLink = visualAbstractHeading?.parentElement?.querySelector('a[href]') ||
                    article.querySelector('[id*="visual" i] a[href], [class*="visual" i] a[href]');
                const sourceFromSrcset = srcset => {
                    const candidates = srcset?.split(',') || [];
                    return candidates[candidates.length - 1]?.trim().replace(/\s+\S+$/, '');
                };
                let source = isCellArticle
                    ? graphicalAbstract?.getAttribute('data-viewer-src') ||
                        graphicalAbstract?.closest('a[href]')?.getAttribute('href')
                    : (isWileyArticle ? graphicalAbstract?.getAttribute('data-lg-src') : null) ||
                        graphicalAbstract?.getAttribute('data-src') ||
                        graphicalAbstract?.getAttribute('data-original') ||
                        sourceFromSrcset(graphicalAbstract?.getAttribute('srcset')) ||
                        graphicalAbstract?.getAttribute('src');
                // Science's responsive markup can omit the lead <img>; its
                // Open Graph image is the corresponding fallback artwork.
                if (!source && isScienceArticle) {
                    source = article.querySelector(
                        'meta[property="og:image"], meta[name="twitter:image"]'
                    )?.getAttribute('content');
                }
                if (!source && visualAbstractLink && !isNatureArticle) {
                    const visualUrl = new URL(visualAbstractLink.getAttribute('href'), item.href).href;
                    try {
                        const response = await fetch(visualUrl, { credentials: 'include' });
                        if (response.ok) {
                            const visual = new DOMParser().parseFromString(await response.text(), 'text/html');
                            const visualImage = visual.querySelector('img');
                            source = visualImage?.getAttribute('data-viewer-src') ||
                                visualImage?.getAttribute('data-src') ||
                                sourceFromSrcset(visualImage?.getAttribute('srcset')) ||
                                visualImage?.getAttribute('src') ||
                                visual.querySelector('meta[property="og:image"]')?.getAttribute('content');
                        }
                    } catch (error) {
                        console.warn('Could not retrieve the ACS visual abstract.', error);
                    }
                }
                if (!source || (isCellArticle && !/_lrg\.(?:jpe?g|png|gif)(?:[?#]|$)/i.test(source))) {
                    if (isCellArticle || isNatureArticle || isRscArticle || isScienceArticle || isWileyArticle) item.highResolutionUnavailable = true;
                    return null;
                }

                item.highResolutionImage = isNatureArticle
                    ? natureDisplayImageSource(source, item.href)
                    : new URL(source, item.href).href;
                return item.highResolutionImage;
            })
            .catch(error => {
                console.warn('Could not retrieve the high-resolution graphical abstract.', error);
                item.imageLoadError = /403|cloudflare/i.test(error.message)
                    ? 'Image loading was blocked by Cloudflare. Reload the page.'
                    : 'This article image could not be loaded.';
                return null;
            });
        return item.highResolutionImagePromise;
    }

    function collectJournalLogo() {
        const logoSelector =
            '.journal-logo img, .journal-logo svg, ' +
            '[class*="journal-logo"] img, [class*="journal-logo"] svg, ' +
            '[class*="journalLogo"] img, [class*="journalLogo"] svg, ' +
            'header a[href*="/journal/"] img, header img[alt*="Journal of"]';
        const logo = document.querySelector(logoSelector);

        if (logo?.tagName === 'IMG') {
            const src = logo.currentSrc || logo.src || logo.getAttribute('data-src');
            if (src) return { src: new URL(src, location.href).href, alt: logo.alt || 'Journal logo' };
        }
        if (logo?.tagName === 'svg') return { svg: logo.cloneNode(true), alt: 'Journal logo' };

        const logoContainer = document.querySelector(
            '.journal-logo, [class*="journal-logo"], [class*="journalLogo"]'
        );
        if (logoContainer) {
            const backgroundImage = getComputedStyle(logoContainer).backgroundImage;
            const backgroundUrl = backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
            if (backgroundUrl) {
                return {
                    src: new URL(backgroundUrl, location.href).href,
                    alt: logoContainer.textContent.trim() || 'Journal logo'
                };
            }
        }

        const metadataTitle = document.querySelector('meta[name="citation_journal_title"]')?.content;
        const headerTitle = document.querySelector(
            '.journal-title, [class*="journal-title"], header a[href*="/journal/"]'
        )?.textContent.trim();
        const pageTitlePart = document.title.split('|').map(part => part.trim())
            .find(part => part && !/^(Volume|Issue|ACS Publications)/i.test(part));
        const title = metadataTitle || headerTitle || pageTitlePart;
        return title ? { title, alt: title } : null;
    }

    function abbreviateJournalName(title) {
        const knownAbbreviations = {
            'journal of the american chemical society': 'J. Am. Chem. Soc.',
            'journal american chemical society': 'J. Am. Chem. Soc.',
            'journal of organic chemistry': 'J. Org. Chem.',
            'journal of physical chemistry': 'J. Phys. Chem.',
            'chemical reviews': 'Chem. Rev.',
            'accounts of chemical research': 'Acc. Chem. Res.',
            'organic letters': 'Org. Lett.',
            'inorganic chemistry': 'Inorg. Chem.',
            'analytical chemistry': 'Anal. Chem.',
            'chemistry of materials': 'Chem. Mater.',
            'journal of medicinal chemistry': 'J. Med. Chem.',
            'environmental science & technology': 'Environ. Sci. Technol.',
            'environmental science and technology': 'Environ. Sci. Technol.',
            'acs catalysis': 'ACS Catal.',
            'acs central science': 'ACS Cent. Sci.',
            'acs energy letters': 'ACS Energy Lett.',
            'nano letters': 'Nano Lett.',
            'nature catalysis': 'Nat. Catal.',
            'nature chemistry': 'Nat. Chem.',
            'nature communications': 'Nat. Commun.',
            'nature energy': 'Nat. Energy',
            'nature materials': 'Nat. Mater.',
            'nature nanotechnology': 'Nat. Nanotechnol.',
            'nature synthesis': 'Nat. Synth.',
            'nature reviews chemistry': 'Nat. Rev. Chem.',
            'chemical society reviews': 'Chem. Soc. Rev.',
            'angewandte chemie international edition: early view': 'Angew. Chem. Int. Ed.',
            'angew chem int. edition: early view': 'Angew. Chem. Int. Ed.'
        };
        const normalized = title.trim().toLowerCase().replace(/^the\s+/, '');
        if (knownAbbreviations[normalized]) return knownAbbreviations[normalized];

        const wordAbbreviations = {
            journal: 'J.', american: 'Am.', chemical: 'Chem.', chemistry: 'Chem.',
            physical: 'Phys.', organic: 'Org.', inorganic: 'Inorg.', analytical: 'Anal.',
            environmental: 'Environ.', science: 'Sci.', technology: 'Technol.', materials: 'Mater.',
            medicinal: 'Med.', letters: 'Lett.', reviews: 'Rev.', accounts: 'Acc.',
            research: 'Res.', central: 'Cent.', catalysis: 'Catal.', communications: 'Commun.', society: 'Soc.',
            engineering: 'Eng.', international: 'Int.', applied: 'Appl.', molecular: 'Mol.'
        };
        return title.trim().replace(/^The\s+/i, '').split(/\s+/).filter(word =>
            !/^(of|the|and)$/i.test(word)
        ).map(word => {
            const bareWord = word.replace(/[^a-z]/gi, '').toLowerCase();
            return wordAbbreviations[bareWord] || word;
        }).join(' ');
    }

    function collectJournalName() {
        const metadataTitle = document.querySelector('meta[name="citation_journal_title"]')?.content;
        const metadataAbbreviation = document.querySelector(
            'meta[name="citation_journal_abbrev"], meta[name="citation_journal_abbreviation"]'
        )?.content?.trim();
        const titleParts = document.title.split('|').map(part => part.trim());
        if (location.hostname === 'www.nature.com') {
            if (location.pathname === '/search') {
                const journals = (new URLSearchParams(location.search).get('journal') || '')
                    .split(',').map(value => value.trim()).filter(Boolean);
                const journalNames = {
                    nature: 'Nature',
                    nchem: 'Nat. Chem.',
                    natcatal: 'Nat. Catal.',
                    ncomms: 'Nat. Commun.',
                    nmat: 'Nat. Mater.',
                    natsynth: 'Nat. Synth.'
                };
                const journal = journals[0]?.toLowerCase();
                return journals.length === 1 && journalNames[journal]
                    ? journalNames[journal]
                    : 'Nature Portfolio';
            }
            // Nature listing pages are titled, for example, "Browse Articles |
            // Nature Catalysis". The final title segment is the journal.
            const natureJournalTitle = titleParts.slice().reverse().find(part =>
                part && !/^(?:browse )?articles?(?: in \d{4})?$/i.test(part)
            );
            return metadataAbbreviation || metadataTitle || natureJournalTitle || 'Nature Portfolio';
        }
        if (isAcsSearchPage()) return 'ACS Publications';
        if (isScienceCurrentTocPage()) return 'Science';
        if (isScienceAdvancesCurrentTocPage()) return 'Sci. Adv.';
        if (isRscLatestArticlesPage()) {
            const rscJournalNames = {
                cs: 'Chem. Soc. Rev.',
                sc: 'Chem. Sci.'
            };
            const journalCode = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
            return metadataAbbreviation || rscJournalNames[journalCode] || 'RSC';
        }
        const pageTitle = titleParts.find(part =>
            part && !/^(Volume|Issue|Issue Table of Contents|ACS Publications)/i.test(part)
        );
        const headerTitle = document.querySelector(
            '.journal-title, [class*="journal-title"], [data-journal-title]'
        )?.textContent.trim();
        if (isCellNewArticlesPage()) {
            const cellJournalNames = {
                '/chem-catalysis/': 'Chem Catalysis',
                '/matter/': 'Matter'
            };
            return cellJournalNames[Object.keys(cellJournalNames).find(path =>
                location.pathname.startsWith(path)
            )] || 'Chem';
        }
        if (location.hostname === 'pubs.acs.org' && location.pathname.startsWith('/jacsat/')) {
            return 'J. Am. Chem. Soc.';
        }
        return abbreviateJournalName(
            metadataAbbreviation || metadataTitle || pageTitle || headerTitle || 'ACS Publications'
        );
    }

    function sentenceCaseTitle(title) {
        if (!title) return '';

        const properNouns = new Set([
            'acs', 'jacs', 'friedel', 'crafts', 'grignard', 'heck', 'mitsunobu',
            'negishi', 'sonogashira', 'stille', 'suzuki', 'ullmann', 'wacker',
            'buchwald', 'hartwig', 'diels', 'alder', 'claisen', 'cope', 'mannich',
            'michael'
        ]);
        const elementSymbols = new Set((
            'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
            'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce ' +
            'Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn ' +
            'Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl ' +
            'Mc Lv Ts Og'
        ).split(' '));
        let isFirstWord = true;

        function formatWord(word) {
            const match = word.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’]*)([^A-Za-z]*)$/);
            if (!match) return word;

            const [, prefix, core, suffix] = match;
            const lower = core.toLowerCase();
            const isAcronym = core.length > 1 && core === core.toUpperCase();
            const isInitial = core.length === 1 && core === core.toUpperCase() && suffix.includes('.');
            const uppercaseLetterCount = (core.match(/[A-Z]/g) || []).length;
            const preserve = isAcronym || isInitial || uppercaseLetterCount >= 2 ||
                elementSymbols.has(core) || properNouns.has(lower);
            let formatted = preserve ? core : lower;

            if (isFirstWord) {
                formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
                isFirstWord = false;
            }
            return prefix + formatted + suffix;
        }

        return title.split(/(\s+)/).map(token => {
            if (/\d|[α-ωΑ-Ω]/.test(token)) {
                if (/[A-Za-zα-ωΑ-Ω]/.test(token)) isFirstWord = false;
                return token;
            }
            return token.split(/([-–—])/).map(part =>
                /^[-–—]$/.test(part) ? part : formatWord(part)
            ).join('');
        }).join('');
    }

    function hideFeedbackButtons(root = document) {
        root.querySelectorAll('button, a, [role="button"], iframe').forEach(element => {
            const description = [
                element.id,
                element.className,
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
                element.getAttribute('src'),
                element.textContent
            ].filter(value => typeof value === 'string').join(' ');

            if (/feedback/i.test(description)) {
                element.style.setProperty('display', 'none', 'important');
            }
            if (element.shadowRoot) hideFeedbackButtons(element.shadowRoot);
        });
    }

    async function initViewer(
        items, journalName, loadNewerItems = null, timelineItems = items, loadOlderItems = null
    ) {
        if (initialized || !items.length) return;
        initialized = true;
        showLoadingOverlay();
        setLoadingMessage('Preparing first article…');
        await restoreFilterSettings();
        if (viewerDismissed) return;
        resumePositionEnabled = isResumePositionEnabled();

        // Keep the complete sequence, including articles before a restored
        // position. Filtering happens as articles are reached, while the
        // timeline keeps every original result.
        const allItems = timelineItems.slice();
        const { lastDoiKey, lastArticleHrefKey, lastPublicationDateKey } = sessionStorageKeys();
        let index = 0;
        let imageLoadSequence = 0;
        let currentImageWork = Promise.resolve();
        let bufferingArticles = null;
        const bufferingProgressWaiters = new Set();
        let bufferingGeneration = 0;
        let bufferingHasStarted = false;
        let bufferingFailed = false;
        let advancingNext = false;
        // Invalidates navigation UI immediately when an automatic advance is
        // paused, without waiting for its background buffering to finish.
        let navigationSequence = 0;
        // Preserve the initiating control while navigation waits for an
        // article, so backward navigation highlights Previous.
        let navigationButton = null;
        let navigationFilterProgress = null;
        let canLoadNewerItems = Boolean(loadNewerItems);
        let canLoadOlderItems = Boolean(loadOlderItems);
        let autoplayTimer = null;
        let autoplaySequence = 0;
        let slideshowActive = false;
        let previousSlideshowItem = null;
        let unpublishedSlideshowEndItem = null;
        // Retain the source while an automatic advance's image is loading so
        // Pause can return to it and cancel that load.
        let autoplayLoadingSourceItem = null;
        let autoplayLoadingItem = null;
        let timelineSeeking = false;
        const savedSlideshowSettings = await readSlideshowSettings();
        if (viewerDismissed) return;
        let autoplayDelay = savedSlideshowSettings.autoplayDelay;
        let keepArticleInformationOnSlideshow = savedSlideshowSettings.keepArticleInformation;
        let articleClickBehavior = readArticleClickBehavior();
        let articleClickFormat = readArticleClickFormat();
        if (resumePositionEnabled) {
            try {
                const { doi: savedDoi, href: savedHref } = await readSavedReadingPosition();
                const savedIndex = items.findIndex(matchesSavedPosition(
                    isNatureSearchPage() ? '' : savedDoi, savedHref
                ));
                if (savedIndex >= 0) index = savedIndex;
            } catch (error) {
                console.warn('Could not restore the saved article position.', error);
            }
        }
        // Always retain the starting article, including the oldest article
        // when no saved position is available.
        items[index].alwaysShowInReader = true;
        let swipeStart = null;
        let suppressNextClick = false;
        const natureConsentDialog = 'dialog:is([data-cc-banner], [data-cc-preferences])';
        const feedbackStyle = document.createElement('style');
        feedbackStyle.textContent = `
            :root {
                color-scheme: light dark;
                --toc-viewer-background: #fff;
                --toc-viewer-text: #111;
                --toc-title-text: #000;
                --toc-image-background: #fff;
                --toc-progress-track: rgba(0,0,0,.20);
                --toc-progress-fill: #1769aa;
            }
            @media (prefers-color-scheme: dark) {
                :root {
                    --toc-viewer-background: #121212;
                    --toc-viewer-text: #f5f5f5;
                    --toc-title-text: #fff;
                    --toc-image-background: #fff;
                    --toc-progress-track: rgba(255,255,255,.22);
                    --toc-progress-fill: #64b5f6;
                }
            }
            [id*="feedback" i], [class*="feedback" i],
            [aria-label*="feedback" i], [title*="feedback" i],
            iframe[src*="feedback" i], iframe[title*="feedback" i] {
                display: none !important;
            }
            #acs-toc-viewer button {
                transition: background .15s ease, box-shadow .15s ease, transform .15s ease;
            }
            #acs-toc-viewer [hidden] {
                display: none !important;
            }
            /* A native modal blocks interaction behind it even when hidden.
             * Keep Nature's consent dialogs visible so users can close them. */
            body:has(#acs-toc-viewer) dialog[open]:not(${natureConsentDialog}),
            #onetrust-consent-sdk,
            [id^="sp_message_container_"] {
                display: none !important;
            }
            dialog[data-cc-banner][open] .cc-banner__header::after {
                content: "Choose your cookie preferences to continue to Graphical Reader.";
                display: block;
                margin: 0.5em 0;
                font-weight: 600;
            }
            #acs-toc-viewer button:focus-visible {
                outline: 2px solid #64b5f6;
                outline-offset: 3px;
            }
            #graphical-reader-controls > * {
                box-sizing: border-box;
                width: 50px !important;
                height: 50px !important;
                flex: 0 0 50px;
                margin: 0;
            }
            #graphical-reader-controls {
                gap: 8px !important;
                padding: 6px 8px !important;
            }
            #acs-toc-viewer button.graphical-reader-clicked {
                animation: graphical-reader-button-blink .32s ease-in-out;
            }
            @keyframes graphical-reader-button-blink {
                0%, 100% { filter: brightness(1); transform: scale(1); }
                45% { filter: brightness(2.4); transform: scale(.9); }
            }
            body > :not(#acs-toc-viewer, #graphical-reader-loading, ${natureConsentDialog}[open]) {
                display: none !important;
            }
        `;
        document.head.appendChild(feedbackStyle);
        hideFeedbackButtons();

        const originalBodyStyle = document.body.getAttribute('style');
        const originalDocumentStyle = document.documentElement.getAttribute('style');
        document.documentElement.style.cssText =
            'height:100%;background:var(--toc-viewer-background);overflow:hidden;overscroll-behavior:none;';
        document.body.style.cssText =
            'margin:0;height:100%;background:var(--toc-viewer-background);overflow:hidden;overscroll-behavior:none;';

        const viewer = document.createElement('div');
        viewer.id = 'acs-toc-viewer';
        viewer.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;isolation:isolate;display:flex;align-items:center;justify-content:center;' +
            'overflow:hidden;overscroll-behavior:none;background:var(--toc-viewer-background);user-select:none;touch-action:pan-y;';
        viewer.style.visibility = 'hidden';

        const image = document.createElement('img');
        image.style.cssText =
            'position:relative;z-index:2;display:block;background:var(--toc-image-background);' +
            'pointer-events:none;';

        const keywordHits = document.createElement('div');
        keywordHits.hidden = true;
        keywordHits.style.cssText =
            'position:fixed;left:50%;top:0;z-index:4;visibility:hidden;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;' +
            'width:calc(100vw - 24px);max-width:720px;transform:translateX(-50%);pointer-events:none;';

        function updateKeywordHits() {
            const item = items[index];
            const matches = slideshowActive && !keepArticleInformationOnSlideshow
                ? []
                : enabledMatchingResearchKeywordGroups(item);
            const publicationDate = item.publicationDate;
            keywordHits.style.visibility = 'hidden';
            keywordHits.replaceChildren();
            keywordHits.hidden = paperTitle.hidden ||
                (!matches.length && articleType.hidden && !publicationDate);
            for (const match of matches) {
                const badge = document.createElement('span');
                badge.textContent = match.label;
                badge.style.cssText =
                    `max-width:100%;padding:5px 10px;border-radius:999px;background:${match.color};color:#fff;` +
                    'font:600 16px/1 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere;';
                keywordHits.appendChild(badge);
            }
            if (!articleType.hidden) keywordHits.appendChild(articleType);
            if (publicationDate) {
                const elapsedDays = Math.max(0, Math.floor(
                    (Date.now() - publicationDate.getTime()) / 86_400_000
                ));
                const dateLabel = document.createElement('div');
                dateLabel.textContent = `${publicationDate.toISOString().slice(0, 10)} (${elapsedDays} days ago)`;
                dateLabel.style.cssText =
                    'flex-basis:100%;color:var(--toc-viewer-text);opacity:.72;text-align:center;' +
                    'font:500 14px/1.2 system-ui,-apple-system,sans-serif;';
                keywordHits.appendChild(dateLabel);
            }
            requestAnimationFrame(fitImage);
        }

        const imageError = document.createElement('div');
        imageError.hidden = true;
        imageError.style.cssText =
            'position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:3;' +
            'width:min(80vw,420px);padding:12px 16px;border-radius:8px;' +
            'background:rgba(0,0,0,.78);color:#fff;text-align:center;' +
            'font:16px/1.35 system-ui,-apple-system,sans-serif;pointer-events:none;';

        function showImageError(message, { bufferFailure = true } = {}) {
            imageError.textContent = message;
            imageError.hidden = false;
            if (bufferFailure) {
                bufferingFailed = true;
                bufferingHasStarted = true;
            }
            updatePlayerControls();
            imageError.dispatchEvent(new Event('graphical-reader-image-failed'));
            requestAnimationFrame(positionImageError);
        }

        let titleFallbackActive = false;

        function showTitleFallback() {
            titleFallbackActive = true;
            image.style.visibility = 'hidden';
            paperTitle.hidden = false;
            paperTitle.style.top = '50%';
            paperTitle.style.transform = 'translate(-50%,-50%)';
            requestAnimationFrame(positionKeywordHits);
        }

        function restorePaperTitleLayout() {
            titleFallbackActive = false;
            paperTitle.style.top = '';
            paperTitle.style.bottom = '';
            paperTitle.style.transform = 'translateX(-50%)';
        }

        const journalNameLabel = document.createElement('div');
        journalNameLabel.textContent = journalName;
        journalNameLabel.style.cssText =
            'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:3;' +
            'width:calc(100vw - 28px);color:var(--toc-viewer-text);text-align:center;white-space:normal;' +
            'overflow:visible;font:600 18px/1.25 system-ui,-apple-system,sans-serif;' +
            'pointer-events:none;';

        const articleType = document.createElement('div');
        articleType.style.cssText =
            'max-width:100%;padding:5px 10px;border-radius:999px;background:#6b7280;color:#fff;' +
            'font:600 16px/1 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere;pointer-events:none;';

        function updateArticleTypeBadge() {
            const type = items[index]?.articleType?.trim() || '';
            articleType.textContent = type;
            articleType.hidden = !type || isStandardArticleType(type);
            articleType.style.background = '#6b7280';
        }

        const downloadStatus = document.createElement('div');
        downloadStatus.hidden = true;
        downloadStatus.style.cssText =
            'position:fixed;transform:translate(-50%,-100%);padding:5px 8px;' +
            'border-radius:4px;background:rgba(0,0,0,.65);color:#fff;' +
            'font:14px system-ui,-apple-system,sans-serif;pointer-events:none;z-index:3;';

        const paperTitle = document.createElement('div');
        paperTitle.hidden = true;
        paperTitle.style.cssText =
            'position:fixed;left:50%;transform:translateX(-50%);z-index:4;' +
            'width:min(88vw,900px);max-height:24vh;overflow:auto;padding:8px 12px;' +
            'color:var(--toc-title-text);text-align:center;' +
            'font:20px/1.35 system-ui,-apple-system,sans-serif;pointer-events:none;';

        const paperTitleText = document.createElement('div');
        const articleJournalLabel = document.createElement('div');
        articleJournalLabel.style.cssText =
            'margin-top:4px;color:var(--toc-viewer-text);font:600 15px/1.25 system-ui,-apple-system,sans-serif;';
        paperTitle.append(paperTitleText, articleJournalLabel);

        const progressTrack = document.createElement('div');
        progressTrack.setAttribute('role', 'slider');
        progressTrack.setAttribute('aria-label', 'Article timeline');
        progressTrack.setAttribute('aria-valuemin', '1');
        progressTrack.tabIndex = 0;
        progressTrack.style.cssText =
            // Keep a generous, invisible touch target around the 6px rail.
            'position:fixed;left:14px;right:14px;bottom:-6px;' +
            'height:40px;z-index:5;background:transparent;cursor:pointer;touch-action:none;' +
            'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';

        const bottomColorGuard = document.createElement('div');
        bottomColorGuard.style.cssText =
            'position:fixed;left:0;right:0;bottom:0;height:8px;' +
            'z-index:3;background:var(--toc-viewer-background);pointer-events:none;';

        const trackBase = document.createElement('div');
        trackBase.style.cssText =
            'position:absolute;left:0;right:0;top:17px;height:6px;background:#353535;pointer-events:none;';
        const loadedFill = document.createElement('div');
        loadedFill.style.cssText =
            'position:absolute;top:17px;height:6px;background:#777;transition:left .15s ease,width .15s ease;';
        const progressFill = document.createElement('div');
        progressFill.style.cssText =
            'position:absolute;left:0;top:17px;height:6px;background:#bdbdbd;transition:width .15s ease;';
        const playhead = document.createElement('div');
        playhead.setAttribute('aria-hidden', 'true');
        playhead.style.cssText =
            'position:absolute;top:50%;width:14px;height:14px;border:2px solid #fff;border-radius:50%;' +
            'background:#111;box-sizing:border-box;pointer-events:none;transform:translate(-50%,-50%);' +
            'transition:left .15s ease;';
        progressTrack.append(trackBase, loadedFill, progressFill, playhead);

        const bufferingStatus = document.createElement('div');
        bufferingStatus.hidden = true;
        bufferingStatus.textContent = 'Buffering failed';
        bufferingStatus.setAttribute('aria-live', 'polite');
        bufferingStatus.style.cssText = downloadStatus.style.cssText;

        const playerControls = document.createElement('div');
        playerControls.id = 'graphical-reader-controls';
        playerControls.style.cssText =
            'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:4;' +
            'display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 10px;border-radius:999px;' +
            'background:rgba(0,0,0,.72);backdrop-filter:blur(8px);';

        const settingsMenu = document.createElement('div');
        settingsMenu.hidden = true;
        settingsMenu.setAttribute('role', 'menu');
        settingsMenu.setAttribute('aria-label', 'Reader settings');
        settingsMenu.style.cssText =
            'position:fixed;top:68px;right:16px;z-index:7;width:min(360px,calc(100vw - 32px));' +
            'max-width:calc(100vw - 32px);box-sizing:border-box;max-height:calc(100vh - 84px);max-height:calc(100dvh - 84px);' +
            'overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:8px;' +
            'border:1px solid rgba(255,255,255,.22);border-radius:12px;' +
            'background:rgba(25,25,25,.94);box-shadow:0 10px 28px rgba(0,0,0,.35);' +
            'backdrop-filter:blur(10px);font:500 14px/1.25 system-ui,-apple-system,sans-serif;';

        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.textContent = '⚙';
        settingsButton.setAttribute('aria-label', 'Open reader settings');
        settingsButton.setAttribute('aria-expanded', 'false');
        settingsButton.style.cssText =
            'position:fixed;top:16px;right:16px;z-index:7;width:44px;height:44px;padding:0;' +
            'border:1px solid rgba(255,255,255,.24);border-radius:50%;background:rgba(0,0,0,.72);' +
            'color:#fff;font:25px/1 system-ui,-apple-system,sans-serif;backdrop-filter:blur(8px);' +
            '-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;';

        function makeSettingsCheckbox(label, checked, onChange, tooltip = '', color = '') {
            const row = document.createElement('label');
            row.title = tooltip;
            row.style.cssText =
                'display:flex;align-items:center;gap:9px;max-width:100%;box-sizing:border-box;padding:7px 8px;border-radius:8px;color:#fff;cursor:pointer;';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = checked;
            input.title = tooltip;
            input.style.cssText = 'width:16px;height:16px;margin:0;accent-color:#64b5f6;';
            input.addEventListener('change', () => onChange(input.checked));
            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
            row.append(input, text);
            if (color) {
                const swatch = document.createElement('span');
                swatch.setAttribute('aria-hidden', 'true');
                swatch.style.cssText =
                    `width:10px;height:10px;flex:0 0 10px;border-radius:50%;background:${color};` +
                    'box-shadow:0 0 0 1px rgba(255,255,255,.35);';
                row.appendChild(swatch);
            }
            return row;
        }

        function makeSettingsHeading(label) {
            const heading = document.createElement('div');
            heading.textContent = label;
            heading.style.cssText =
                'margin:10px 8px 3px;color:#b9c9d8;font:600 12px/1.2 system-ui,-apple-system,sans-serif;' +
                'letter-spacing:.04em;text-transform:uppercase;';
            return heading;
        }

        const keepInformationRow = makeSettingsCheckbox(
            'Show information',
            keepArticleInformationOnSlideshow,
            checked => {
                keepArticleInformationOnSlideshow = checked;
                saveSlideshowSettings(autoplayDelay, keepArticleInformationOnSlideshow);
                setPaperTitleVisible(!slideshowActive || checked);
            }
        );
        keepInformationRow.style.flex = '1 1 auto';
        const intervalLabel = document.createElement('div');
        intervalLabel.style.cssText =
            'display:flex;align-items:center;gap:6px;color:#fff;font:500 13px/1 system-ui,-apple-system,sans-serif;';
        const intervalTitle = document.createElement('span');
        intervalTitle.textContent = 'Interval';
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.min = '0.5';
        intervalInput.max = '60';
        intervalInput.step = '0.5';
        intervalInput.value = String(autoplayDelay / 1000);
        intervalInput.setAttribute('aria-label', 'Slide interval in seconds');
        intervalInput.style.cssText =
            'width:52px;padding:5px;border:1px solid rgba(255,255,255,.35);border-radius:6px;background:#333;color:#fff;' +
            'font:500 13px/1 system-ui,-apple-system,sans-serif;';
        intervalInput.addEventListener('change', () => {
            const seconds = Math.min(60, Math.max(.5, Number(intervalInput.value) || 1.5));
            autoplayDelay = Math.round(seconds * 1000);
            intervalInput.value = String(seconds);
            saveSlideshowSettings(autoplayDelay, keepArticleInformationOnSlideshow);
            resetAutoplayCountdown();
        });
        const intervalUnit = document.createElement('span');
        intervalUnit.textContent = 's';
        intervalLabel.append(intervalTitle, intervalInput, intervalUnit);
        const slideshowControls = document.createElement('div');
        slideshowControls.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 8px;';
        slideshowControls.append(intervalLabel, keepInformationRow);

        const resumePositionRow = makeSettingsCheckbox(
            'Resume saved position',
            resumePositionEnabled,
            checked => {
                resumePositionEnabled = checked;
                saveResumePositionPreference(checked);
                if (!checked) clearSavedReadingPosition();
            }
        );
        resumePositionRow.style.flex = '0 0 auto';
        resumePositionRow.style.padding = '7px 0';
        const clearPositionButton = document.createElement('button');
        clearPositionButton.type = 'button';
        clearPositionButton.textContent = 'Clear saved position';
        clearPositionButton.style.cssText =
            'display:block;flex:0 0 auto;margin:2px 0;padding:7px 8px;border:1px solid rgba(255,255,255,.28);' +
            'border-radius:7px;background:transparent;color:#fff;text-align:left;font:500 12px/1 system-ui,-apple-system,sans-serif;' +
            '-webkit-appearance:none;appearance:none;';
        clearPositionButton.addEventListener('click', async () => {
            stopAutoplay();
            // Prevent pending navigation from saving another position before reload.
            viewerDismissed = true;
            await clearSavedReadingPosition();
            location.reload();
        });
        const readingPositionControls = document.createElement('div');
        readingPositionControls.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 8px;';
        readingPositionControls.append(resumePositionRow, clearPositionButton);

        const articleClickControls = document.createElement('div');
        articleClickControls.setAttribute('role', 'group');
        articleClickControls.setAttribute('aria-label', 'Article click behavior');
        articleClickControls.style.cssText = 'display:flex;gap:4px;padding:2px 8px;';
        const articleClickButtons = [
            ['share', 'Share sheet'],
            ['open', 'Open page']
        ].map(([value, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText =
                'display:block!important;flex:0 0 auto;padding:6px 6px;border:1px solid rgba(255,255,255,.35);' +
                'border-radius:6px;color:#fff;font:500 11px/1.1 system-ui,-apple-system,sans-serif;' +
                '-webkit-appearance:none;appearance:none;';
            button.addEventListener('click', () => {
                articleClickBehavior = value;
                saveArticleClickBehavior(value);
                updateArticleClickButtons();
            });
            articleClickControls.appendChild(button);
            return { button, value };
        });
        function updateArticleClickButtons() {
            articleClickButtons.forEach(({ button, value }) => {
                const selected = value === articleClickBehavior;
                button.style.background = selected ? '#1769aa' : '#333';
                button.setAttribute('aria-pressed', String(selected));
            });
        }
        updateArticleClickButtons();

        const articleFormatControls = document.createElement('div');
        articleFormatControls.setAttribute('role', 'group');
        articleFormatControls.setAttribute('aria-label', 'Article link format');
        articleFormatControls.style.cssText = articleClickControls.style.cssText;
        const articleFormatButtons = [
            ['html', 'HTML'],
            ['pdf', 'PDF']
        ].map(([value, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText = articleClickButtons[0].button.style.cssText;
            button.addEventListener('click', () => {
                articleClickFormat = value;
                saveArticleClickFormat(value);
                updateArticleFormatButtons();
            });
            articleFormatControls.appendChild(button);
            return { button, value };
        });
        function updateArticleFormatButtons() {
            articleFormatButtons.forEach(({ button, value }) => {
                const selected = value === articleClickFormat;
                button.style.background = selected ? '#1769aa' : '#333';
                button.setAttribute('aria-pressed', String(selected));
            });
        }
        updateArticleFormatButtons();

        const excludeArticleTypeFilters = document.createElement('div');
        const alwaysIncludeArticleTypeFilters = document.createElement('div');
        const noKeywordFilteringRow = document.createElement('div');
        const keywordFilters = document.createElement('div');
        [excludeArticleTypeFilters, alwaysIncludeArticleTypeFilters, keywordFilters].forEach(filters => {
            filters.style.cssText =
                'display:flex;flex-wrap:wrap;gap:4px;padding-bottom:2px;';
        });
        const excludeTypeOptions = [
            ['excludeIssueInformation', 'Issue Editorial Masthead / Publication Information'],
            ['excludeAcsEditorial', 'ACS Editorial'],
            ['excludeObituary', 'Obituary'],
            ['excludeCorrection', 'Correction'],
            ['excludePreview', 'Preview'],
            ['excludeNews', 'News'],
            ['excludeNewsAndViews', 'News & Views'],
            ['excludeResearchBriefing', 'Research Briefing'],
            ['excludeResearchHighlights', 'Research Highlights']
        ];
        const alwaysIncludeTypeOptions = [
            ['includeFeature', 'Feature'],
            ['includeCareers', 'Careers'],
            ['includeCareerColumns', 'Career Columns'],
            ['includeTechnologyFeatures', 'Technology Features']
        ];
        function addArticleTypeOptions(container, options) {
            options.forEach(([key, label]) => {
                container.appendChild(makeSettingsCheckbox(label, articleTypeFilters[key], checked => {
                    articleTypeFilters[key] = checked;
                    saveFilterSettings();
                    restartArticleList();
                }));
            });
        }
        addArticleTypeOptions(excludeArticleTypeFilters, excludeTypeOptions);
        addArticleTypeOptions(alwaysIncludeArticleTypeFilters, alwaysIncludeTypeOptions);
        noKeywordFilteringRow.appendChild(makeSettingsCheckbox(
            'Filter by keywords',
            !keywordFilteringDisabled,
            checked => {
                keywordFilteringDisabled = !checked;
                saveFilterSettings();
                restartArticleList();
            }
        ));
        researchKeywordGroups.forEach(group => {
            keywordFilters.appendChild(makeSettingsCheckbox(
                group.label,
                selectedResearchKeywords.has(group.label),
                checked => {
                    if (checked) selectedResearchKeywords.add(group.label);
                    else selectedResearchKeywords.delete(group.label);
                    saveFilterSettings();
                    restartArticleList();
                },
                group.pattern.toString(),
                group.color
            ));
        });
        const resetSettingsButton = document.createElement('button');
        resetSettingsButton.type = 'button';
        resetSettingsButton.textContent = 'Reset all settings';
        resetSettingsButton.style.cssText =
            'display:block;width:calc(100% - 16px);margin:2px 8px 8px;padding:8px;border:1px solid rgba(255,160,160,.6);' +
            'border-radius:7px;background:transparent;color:#ffd0d0;text-align:left;font:500 12px/1 system-ui,-apple-system,sans-serif;' +
            '-webkit-appearance:none;appearance:none;';
        resetSettingsButton.addEventListener('click', async () => {
            if (!window.confirm('Reset all Graphical Reader settings?')) return;
            await clearAllReaderSettings();
            location.reload();
        });
        settingsMenu.append(
            makeSettingsHeading('Slideshow'),
            slideshowControls,
            makeSettingsHeading('Tap action'),
            articleClickControls,
            articleFormatControls,
            makeSettingsHeading('Keywords'),
            noKeywordFilteringRow,
            keywordFilters,
            makeSettingsHeading('Exclude article types'),
            excludeArticleTypeFilters,
            makeSettingsHeading('Always include article types'),
            alwaysIncludeArticleTypeFilters,
            makeSettingsHeading('Saved position'),
            readingPositionControls,
            makeSettingsHeading('Reset'),
            resetSettingsButton
        );

        function setSettingsMenuOpen(open) {
            settingsMenu.hidden = !open;
            settingsButton.setAttribute('aria-expanded', String(open));
            settingsButton.setAttribute('aria-label', open ? 'Close reader settings' : 'Open reader settings');
        }

        settingsButton.addEventListener('click', event => {
            event.stopPropagation();
            setSettingsMenuOpen(settingsMenu.hidden);
        });
        const closeSettingsOnOutsideClick = event => {
            if (event.target.closest?.(natureConsentDialog)) return;
            if (!settingsMenu.hidden && !settingsMenu.contains(event.target) && event.target !== settingsButton) {
                setSettingsMenuOpen(false);
            }
        };
        const closeSettingsOnEscape = event => {
            if (event.key === 'Escape' && !settingsMenu.hidden &&
                !document.querySelector(`${natureConsentDialog}:modal`)) {
                event.preventDefault();
                setSettingsMenuOpen(false);
                settingsButton.focus();
            }
        };
        document.addEventListener('click', closeSettingsOnOutsideClick);
        document.addEventListener('keydown', closeSettingsOnEscape);

        function makeControl(label, accessibleName) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.setAttribute('aria-label', accessibleName);
            button.style.cssText =
                'width:58px;height:58px;padding:0;border:0;border-radius:50%;' +
                'display:flex;align-items:center;justify-content:center;' +
                'background:rgba(255,255,255,.16);color:#fff;' +
                'font:30px/1 "Helvetica Neue",Arial,sans-serif;' +
                'text-decoration:none !important;-webkit-appearance:none;appearance:none;' +
                '-webkit-tap-highlight-color:transparent;';
            return button;
        }

        function makeTriangle(direction, width) {
            const triangle = document.createElement('span');
            triangle.style.cssText =
                'display:block;width:0;height:0;border-top:10px solid transparent;' +
                'border-bottom:10px solid transparent;' +
                (direction === 'right'
                    ? `border-left:${width}px solid #fff;`
                    : `border-right:${width}px solid #fff;`);
            return triangle;
        }

        function setTriangleSymbol(button, direction, count, width) {
            const symbol = document.createElement('span');
            symbol.style.cssText =
                'display:flex;align-items:center;justify-content:center;gap:0;';
            for (let i = 0; i < count; i += 1) {
                symbol.appendChild(makeTriangle(direction, width));
            }
            button.replaceChildren(symbol);
        }

        function setSkipSymbol(button, direction) {
            const symbol = document.createElement('span');
            symbol.style.cssText =
                'display:flex;align-items:center;justify-content:center;gap:2px;';
            const bar = document.createElement('span');
            bar.style.cssText = 'display:block;width:2px;height:16px;background:#fff;';
            const triangles = document.createElement('span');
            triangles.style.cssText = 'display:flex;align-items:center;gap:0;';
            for (let i = 0; i < 2; i += 1) {
                triangles.appendChild(makeTriangle(direction, 7));
            }
            if (direction === 'left') symbol.append(bar, triangles);
            else symbol.append(triangles, bar);
            button.replaceChildren(symbol);
        }

        function addClickBlink(button) {
            button.addEventListener('click', () => {
                button.classList.remove('graphical-reader-clicked');
                void button.offsetWidth;
                button.classList.add('graphical-reader-clicked');
            });
            button.addEventListener('animationend', () => {
                button.classList.remove('graphical-reader-clicked');
            });
        }

        const firstButton = makeControl('', 'First article');
        const previousButton = makeControl('', 'Previous TOC');
        const playButton = makeControl('', 'Start slideshow');
        const nextButton = makeControl('', 'Next TOC');
        const lastButton = makeControl('', 'Last article');
        [firstButton, lastButton].forEach(button => {
            button.style.width = '44px';
            button.style.height = '44px';
            button.style.fontSize = '24px';
        });
        const nextPageLink = document.createElement('a');
        const nextJournalPage = nextJournalPageForCurrentUrl();
        nextPageLink.hidden = true;
        nextPageLink.style.cssText =
            'position:fixed;left:50%;bottom:108px;transform:translateX(-50%);z-index:4;' +
            'max-width:calc(100vw - 32px);box-sizing:border-box;padding:9px 16px;border-radius:999px;' +
            'background:#c62828;color:#fff;font:600 14px/1.2 system-ui,-apple-system,sans-serif;' +
            'text-align:center;text-decoration:none;white-space:nowrap;';
        if (nextJournalPage) {
            nextPageLink.textContent = `Next page: ${nextJournalPage.label}`;
            nextPageLink.href = nextJournalPage.href;
            nextPageLink.setAttribute('aria-label', `Open next page: ${nextJournalPage.label}`);
        } else {
            nextPageLink.textContent = 'All pages checked!';
            nextPageLink.setAttribute('role', 'status');
        }
        const nextPageNotice = document.createElement('div');
        nextPageNotice.hidden = true;
        nextPageNotice.textContent = 'Two consecutive articles have no version of record yet';
        nextPageNotice.style.cssText =
            'position:fixed;left:50%;bottom:154px;transform:translateX(-50%);z-index:4;' +
            'width:max-content;max-width:calc(100vw - 32px);text-align:center;' +
            'color:var(--toc-viewer-text);font:14px/1.4 system-ui,-apple-system,sans-serif;';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close Graphical Reader and show the original page');
        closeButton.style.cssText =
            'position:fixed;top:0;left:12px;z-index:6;width:42px;height:42px;padding:0;' +
            'border:0;background:transparent;color:var(--toc-viewer-text);font:38px/38px system-ui,' +
            '-apple-system,sans-serif;-webkit-appearance:none;appearance:none;';
        function closeViewer() {
            viewerDismissed = true;
            hideLoadingOverlay();
            document.removeEventListener('click', closeSettingsOnOutsideClick);
            document.removeEventListener('keydown', closeSettingsOnEscape);
            document.removeEventListener('keydown', handleReaderShortcut);
            window.removeEventListener('graphical-reader-image-preloaded', updateTimeline);
            window.removeEventListener('resize', fitImage);
            window.removeEventListener('resize', positionImageError);
            viewer.remove();
            feedbackStyle.remove();
            if (originalBodyStyle === null) document.body.removeAttribute('style');
            else document.body.setAttribute('style', originalBodyStyle);
            if (originalDocumentStyle === null) document.documentElement.removeAttribute('style');
            else document.documentElement.setAttribute('style', originalDocumentStyle);
        }

        function restartArticleList() {
            const currentItem = items[index];
            const restartItems = allItems.map(item => {
                const copy = { ...item };
                delete copy.filterProcessed;
                delete copy.filterPromise;
                delete copy.keywordFilterPromise;
                delete copy.bufferReady;
                delete copy.bufferPromise;
                delete copy.imagePreloaded;
                delete copy.imagePreloadPromise;
                delete copy.imageBufferFailed;
                return copy;
            });
            bufferingGeneration += 1;
            bufferingArticles = null;
            bufferingFailed = false;
            previousSlideshowItem = null;
            unpublishedSlideshowEndItem = null;
            advancingNext = false;
            navigationButton = null;
            navigationFilterProgress = null;
            imageLoadSequence += 1;
            allItems.splice(0, allItems.length, ...restartItems);
            items.splice(0, items.length, ...restartItems);
            const currentIndex = restartItems.findIndex(item =>
                (currentItem?.href && item.href === currentItem.href) ||
                (currentItem?.doi && item.doi === currentItem.doi)
            );
            index = currentIndex >= 0 ? currentIndex : 0;
            show(index);
        }
        closeButton.addEventListener('click', closeViewer);
        setSkipSymbol(firstButton, 'left');
        setTriangleSymbol(previousButton, 'left', 2, 9);
        setTriangleSymbol(playButton, 'right', 1, 18);
        setTriangleSymbol(nextButton, 'right', 2, 9);
        setSkipSymbol(lastButton, 'right');
        playerControls.append(firstButton, previousButton, playButton, nextButton, lastButton);
        nextPageLink.addEventListener('touchstart', event => event.stopPropagation());
        nextPageLink.addEventListener('touchend', event => event.stopPropagation());
        [firstButton, previousButton, playButton, nextButton, lastButton, closeButton, settingsButton].forEach(addClickBlink);
        playerControls.addEventListener('touchstart', event => event.stopPropagation());
        playerControls.addEventListener('touchend', event => event.stopPropagation());

        const articleActionArea = document.createElement('div');
        articleActionArea.setAttribute('aria-label', 'Open or share article');
        articleActionArea.style.cssText =
            'position:fixed;left:0;right:0;top:0;bottom:100px;z-index:2;' +
            'background:transparent;';
        articleActionArea.addEventListener('click', event => {
            event.stopPropagation();
            if (suppressNextClick) return;
            handleCurrentArticleClick();
        });

        function preloadImage(item) {
            if (!item) return Promise.resolve();
            if (item.imagePreloadPromise) return item.imagePreloadPromise;
            const generation = bufferingGeneration;

            const preloadSource = source => new Promise(resolve => {
                if (!source) {
                    resolve(false);
                    return;
                }
                const preload = new Image();
                preload.addEventListener('load', () => resolve(true), { once: true });
                preload.addEventListener('error', () => resolve(false), { once: true });
                preload.src = source;
            });
            item.imagePreloadPromise = (async () => {
                if (await hasUnpublishedNatureArticle(item)) return;
                let source = item.highResolutionImage;
                // RSC images are resolved from the article landing page.
                if (!source && item.isRsc && item.src) source = item.src;
                if (!source) {
                    const highResolutionImage = await resolveHighResolutionImage(item);
                    if (item.isNature && item.highResolutionUnavailable) return;
                    source = highResolutionImage || item.src;
                    if (!highResolutionImage && !item.isNature) item.highResolutionUnavailable = true;
                }
                if (!await preloadSource(source)) {
                    item.imageBufferFailed = true;
                    if (generation === bufferingGeneration) {
                        bufferingFailed = true;
                        updatePlayerControls();
                    }
                }
            })().finally(() => {
                item.imagePreloaded = !item.imageBufferFailed;
                window.dispatchEvent(new Event('graphical-reader-image-preloaded'));
            });
            return item.imagePreloadPromise;
        }

        function matchesKeywordFilter(item) {
            if (!item.keywordFilterPromise) {
                item.keywordFilterPromise = articleMatchesFilter(item);
            }
            return item.keywordFilterPromise;
        }

        async function hasUnpublishedNatureArticle(item) {
            if (!item.isNature) return false;
            if (keywordFilteringDisabled) await loadItemMetadata(item);
            else await loadItemAbstract(item);
            return item.hasVersionOfRecordDate === false;
        }

        async function appendNewerItems(generation = bufferingGeneration) {
            if (!canLoadNewerItems) return false;
            const additionalItems = await loadNewerItems();
            if (generation !== bufferingGeneration) return false;
            if (!additionalItems.length) {
                canLoadNewerItems = false;
                return false;
            }
            // Retain the final article returned by each results page. This
            // makes the page boundary reachable even when it does not match
            // the research-keyword filter.
            additionalItems.at(-1).alwaysShowInReader = true;
            allItems.push(...additionalItems);
            items.push(...additionalItems);
            updatePlayerControls();
            updateTimeline();
            return true;
        }

        async function prependOlderItems() {
            if (!canLoadOlderItems) return false;
            const additionalItems = await loadOlderItems();
            if (!additionalItems.length) {
                canLoadOlderItems = false;
                updatePlayerControls();
                return false;
            }
            // The last item is encountered first when moving backwards.
            additionalItems.at(-1).alwaysShowInReader = true;
            const currentItem = items[index];
            allItems.unshift(...additionalItems);
            items.unshift(...additionalItems);
            index = items.indexOf(currentItem);
            updatePlayerControls();
            updateTimeline();
            return true;
        }

        function removeFilteredItem(item) {
            const itemIndex = items.indexOf(item);
            if (itemIndex < 0) return false;
            // Removing an earlier item shifts the current item's array index.
            // Retain its identity before redrawing the timeline; otherwise a
            // backward filter pass briefly makes the playhead point at the
            // following article until navigation completes.
            const currentItem = items[index];
            items.splice(itemIndex, 1);
            const currentIndex = items.indexOf(currentItem);
            index = currentIndex >= 0
                ? currentIndex
                : Math.max(0, Math.min(index, items.length - 1));
            updatePlayerControls();
            updateTimeline();
            return true;
        }

        function filterArticle(candidate) {
            if (candidate.filterPromise) return candidate.filterPromise;
            const generation = bufferingGeneration;
            candidate.filterPromise = (async () => {
                // Resolve abstracts only when keyword filtering is active, so
                // badges are ready as soon as this article becomes current.
                if (!keywordFilteringDisabled) await loadItemAbstract(candidate);
                if (generation !== bufferingGeneration) return false;
                const matchesFilter = candidate.alwaysShowInReader || await matchesKeywordFilter(candidate);
                if (generation !== bufferingGeneration) return false;
                // This is intentionally recorded before removing a mismatch:
                // the timeline measures work completed across all articles,
                // including those that do not remain in the reader.
                candidate.filterProcessed = true;
                if (navigationButton === nextButton && candidate === items[index + 1]) {
                    updateNavigationFilterProgress(candidate);
                }
                updateTimeline();
                if (!matchesFilter) {
                    removeFilteredItem(candidate);
                    return false;
                }
                return true;
            })();
            return candidate.filterPromise;
        }

        function bufferArticle(candidate) {
            if (candidate.bufferReady) return Promise.resolve(true);
            if (candidate.bufferPromise) return candidate.bufferPromise;
            const generation = bufferingGeneration;
            candidate.bufferPromise = (async () => {
                if (!await filterArticle(candidate)) return false;
                await preloadImage(candidate);
                if (candidate.imageBufferFailed) return false;
                if (generation !== bufferingGeneration || bufferingFailed) return false;
                candidate.bufferReady = true;
                return true;
            })();
            return candidate.bufferPromise;
        }

        function notifyBufferingProgress() {
            for (const resolve of bufferingProgressWaiters) resolve();
            bufferingProgressWaiters.clear();
        }

        function bufferArticles() {
            if (viewerDismissed || bufferingFailed) return Promise.resolve();
            if (bufferingArticles) return bufferingArticles;
            bufferingHasStarted = true;
            const generation = bufferingGeneration;
            bufferingArticles = (async () => {
                let candidateIndex = index + 1;
                while (generation === bufferingGeneration && !bufferingFailed) {
                    // If the user moves forward while buffering, never work on
                    // an item that is now behind the current article.
                    candidateIndex = Math.max(candidateIndex, index + 1);
                    if (candidateIndex >= items.length) {
                        if (!await appendNewerItems(generation)) break;
                        notifyBufferingProgress();
                        continue;
                    }
                    const candidate = items[candidateIndex];
                    const included = await bufferArticle(candidate);
                    if (generation !== bufferingGeneration || bufferingFailed) break;
                    notifyBufferingProgress();
                    if (included && items[candidateIndex] === candidate) {
                        candidateIndex += 1;
                    } else if (items[candidateIndex] === candidate) {
                        break;
                    }
                }
            })().finally(() => {
                notifyBufferingProgress();
                if (generation !== bufferingGeneration) return;
                bufferingArticles = null;
                updatePlayerControls();
            });
            updatePlayerControls();
            return bufferingArticles;
        }

        async function bufferNextArticle() {
            // Playback and manual navigation consume the same worker's results.
            const generation = bufferingGeneration;
            while (!viewerDismissed && generation === bufferingGeneration && !bufferingFailed) {
                const nextItem = items[index + 1];
                if (!nextItem && !canLoadNewerItems) return;
                updateNavigationFilterProgress(nextItem);
                if (nextItem?.bufferReady) return;
                let resolveProgress;
                const progress = new Promise(resolve => { resolveProgress = resolve; });
                bufferingProgressWaiters.add(resolveProgress);
                const worker = bufferArticles();
                try {
                    await Promise.race([progress, worker]);
                } finally {
                    bufferingProgressWaiters.delete(resolveProgress);
                }
                if (items[index + 1]?.bufferReady) return;
                if (!bufferingArticles) return;
            }
        }

        async function loadNextArticleAfterBufferFailure() {
            // Keep navigation available without restarting background buffering.
            const sourceItem = items[index];
            while (!viewerDismissed && items.includes(sourceItem)) {
                const nextItem = items[items.indexOf(sourceItem) + 1];
                if (!nextItem) {
                    if (!await appendNewerItems()) return false;
                    continue;
                }
                updateNavigationFilterProgress(nextItem);
                if (await filterArticle(nextItem)) return true;
                if (items.includes(nextItem)) return false;
            }
            return false;
        }

        const skippedPreviousItems = new Set();

        async function bufferPreviousArticle() {
            // Walk the original list and apply the same filters as forward
            // navigation, retaining the first article as a reachable boundary.
            const sourceItem = items[index];
            const generation = bufferingGeneration;
            while (true) {
                const sourceIndex = items.indexOf(sourceItem);
                // A concurrent filter or settings restart can replace the
                // source while an older results page is being fetched.
                if (viewerDismissed || sourceIndex < 0 || generation !== bufferingGeneration) return false;
                const sourceTimelineIndex = allItems.indexOf(sourceItem);
                const previousItem = allItems.slice(0, sourceTimelineIndex)
                    .findLast(item => !skippedPreviousItems.has(item));
                if (!previousItem) {
                    if (!await prependOlderItems()) return false;
                    continue;
                }
                if (previousItem === allItems[0]) {
                    previousItem.alwaysShowInReader = true;
                    delete previousItem.filterPromise;
                }
                if (!items.includes(previousItem)) {
                    const insertAt = items.findIndex(item =>
                        allItems.indexOf(item) > allItems.indexOf(previousItem));
                    if (insertAt < 0) items.push(previousItem);
                    else items.splice(insertAt, 0, previousItem);
                    index = items.indexOf(sourceItem);
                    updatePlayerControls();
                    updateTimeline();
                }
                updateNavigationFilterProgress(previousItem);
                const included = await filterArticle(previousItem);
                if (viewerDismissed || generation !== bufferingGeneration ||
                    !items.includes(sourceItem)) return false;
                if (!included) {
                    skippedPreviousItems.add(previousItem);
                    removeFilteredItem(previousItem);
                    continue;
                }
                if (!items.includes(previousItem)) return false;
                if (previousItem.isNature) {
                    await prepareArticleForDisplay(previousItem);
                    return !viewerDismissed && generation === bufferingGeneration &&
                        items.includes(sourceItem) && items.includes(previousItem);
                }
                await preloadImage(previousItem);
                return true;
            }
            return false;
        }

        async function prepareArticleForDisplay(item) {
            if (item.displayReadyPromise) return item.displayReadyPromise;
            item.displayReadyPromise = (async () => {
                if (keywordFilteringDisabled) await loadItemMetadata(item);
                else await loadItemAbstract(item);
                if (item.hasVersionOfRecordDate === false) return;
                const highResolutionImage = await resolveHighResolutionImage(item);
                if (item.isNature && item.highResolutionUnavailable) return;
                const source = highResolutionImage || item.src;
                if (!source) {
                    item.displayImageFailed = true;
                    return;
                }
                const loadSource = url => new Promise(resolve => {
                    const preload = new Image();
                    preload.addEventListener('load', async () => {
                        try {
                            if (preload.decode) await preload.decode();
                            resolve(true);
                        } catch (error) {
                            resolve(false);
                        }
                    }, { once: true });
                    preload.addEventListener('error', () => resolve(false), { once: true });
                    preload.src = url;
                });
                if (await loadSource(source)) {
                    item.displayImageSource = source;
                    return;
                }
                const retryUrl = new URL(source, item.href);
                retryUrl.searchParams.set('graphical-reader-retry', '1');
                if (await loadSource(retryUrl.href)) {
                    item.displayImageSource = retryUrl.href;
                    return;
                }
                item.displayImageFailed = true;
                item.imageLoadError ||= 'This article image could not be loaded.';
            })();
            return item.displayReadyPromise;
        }

        async function showArticleImageError(item, imageLoadId, message, options) {
            if (imageLoadId !== imageLoadSequence || items[index] !== item || viewerDismissed) return;
            imageError.dataset.figurePlaceholder = String(message === 'No figures');
            if (message === 'No figures') {
                image.style.visibility = 'hidden';
                image.removeAttribute('src');
                restorePaperTitleLayout();
                paperTitle.style.top = `${journalNameLabel.getBoundingClientRect().bottom + 4}px`;
                paperTitle.style.bottom = 'auto';
            } else showTitleFallback();
            showImageError(message, options);
        }

        async function show(nextIndex, { startBuffering = true, ignoreFilter = false } = {}) {
            const showRequestId = ++imageLoadSequence;
            index = Math.max(0, Math.min(nextIndex, items.length - 1));
            let item;
            while ((item = items[index])) {
                const matchesFilter = ignoreFilter || await filterArticle(item);
                if (showRequestId !== imageLoadSequence || viewerDismissed) return;
                if (matchesFilter && items.includes(item)) {
                    index = items.indexOf(item);
                    break;
                }
                // A stale or cancelled filter leaves its item in place.
                if (items.includes(item)) return;
            }
            if (!item || !items.includes(item)) return;
            const unpublished = await hasUnpublishedNatureArticle(item);
            if (showRequestId !== imageLoadSequence || items[index] !== item || viewerDismissed) return;
            if (resumePositionEnabled && !unpublished) {
                storeReadingPosition({
                    doi: item.doi || '',
                    href: item.href || '',
                    publicationDate: item.publicationDate?.toISOString() || ''
                });
                try {
                    if (item.doi) localStorage.setItem(lastDoiKey, item.doi);
                    else localStorage.removeItem(lastDoiKey);
                    if (item.href) localStorage.setItem(lastArticleHrefKey, item.href);
                    else localStorage.removeItem(lastArticleHrefKey);
                    if (item.publicationDate) {
                        localStorage.setItem(lastPublicationDateKey, item.publicationDate.toISOString());
                    } else localStorage.removeItem(lastPublicationDateKey);
                } catch (error) {
                    console.warn('Could not save the article position.', error);
                }
            }
            const imageLoadId = ++imageLoadSequence;
            imageError.hidden = true;
            restorePaperTitleLayout();
            const imageSource = unpublished || item.displayImageFailed ? null :
                items[index].displayImageSource || items[index].highResolutionImage ||
                ((items[index].isCell || items[index].isNature) &&
                !items[index].highResolutionUnavailable
                    ? null
                    : items[index].src);
            let activeImageSource = imageSource;
            if (activeImageSource) {
                image.style.visibility = 'visible';
                image.src = activeImageSource;
            } else {
                image.style.visibility = 'hidden';
                image.removeAttribute('src');
            }
            image.alt = item.isNature ? '' : `TOC ${index + 1} of ${items.length}`;
            const loadMetadata = keywordFilteringDisabled
                ? loadItemMetadata(item)
                : loadItemAbstract(item);
            void loadMetadata.then(() => {
                if (items[index] === item) {
                    // Article types are learned from the article page. Refresh
                    // both the title rule and its badge when that fetch ends.
                    updateArticleTypeBadge();
                    setPaperTitleVisible(!slideshowActive || keepArticleInformationOnSlideshow);
                    // If a current item gains an image while its metadata is
                    // loading, make it visible immediately.
                    if (!unpublished && !imageSource && !item.displayImageFailed && item.src) {
                        activeImageSource = item.src;
                        image.src = item.src;
                        image.style.visibility = 'visible';
                        imageError.hidden = true;
                        requestAnimationFrame(fitImage);
                    }
                }
            });
            window.dispatchEvent(new Event('graphical-reader-current-article-changed'));
            const loadGraphic = (unpublished ? Promise.resolve(null) : resolveHighResolutionImage(item))
                .then(async highResolutionImage => {
                if (imageLoadId !== imageLoadSequence || viewerDismissed) return;
                if (unpublished) {
                    if (autoplayLoadingItem === item) {
                        autoplayLoadingSourceItem = null;
                        autoplayLoadingItem = null;
                    }
                    await showArticleImageError(item, imageLoadId, 'Graphical abstract is not yet available.',
                        { bufferFailure: false });
                    return;
                }
                if (item.displayImageFailed && items[index] === item) {
                    await showArticleImageError(item, imageLoadId,
                        item.imageLoadError || 'This article image could not be loaded.');
                } else if (highResolutionImage && items[index] === item) {
                    activeImageSource = item.displayImageSource || highResolutionImage;
                    image.src = activeImageSource;
                    // ACS search results begin with no card image. Make the
                    // resolved graphic visible immediately; relying only on a
                    // later load event leaves it hidden during playback.
                    image.style.visibility = 'visible';
                    requestAnimationFrame(fitImage);
                } else if (!highResolutionImage && item.isNature && item.highResolutionUnavailable &&
                    items[index] === item) {
                    await showArticleImageError(item, imageLoadId, 'No figures');
                } else if (!highResolutionImage && item.highResolutionUnavailable && item.src &&
                    items[index] === item) {
                    activeImageSource = item.src;
                    image.src = item.src;
                    image.style.visibility = 'visible';
                    imageError.hidden = true;
                } else if (!highResolutionImage && !imageSource && item.imageLoadError && items[index] === item) {
                    await showArticleImageError(item, imageLoadId, item.imageLoadError);
                } else if (!highResolutionImage && !imageSource && items[index] === item) {
                    if (item.isNature) {
                        await showArticleImageError(item, imageLoadId,
                            'This article image could not be loaded.');
                    } else showTitleFallback();
                }
            });
            const updateProgress = () => {
                if (imageLoadId !== imageLoadSequence) return;
                if (autoplayLoadingItem === item) {
                    autoplayLoadingSourceItem = null;
                    autoplayLoadingItem = null;
                }
                item.imagePreloaded = true;
                image.style.visibility = 'visible';
                imageError.hidden = true;
                restorePaperTitleLayout();
                if (!paperTitle.hidden) requestAnimationFrame(fitImage);
                updateTimeline();
            };
            const retryImageLoad = () => {
                const retryUrl = new URL(activeImageSource, item.href);
                retryUrl.searchParams.set('graphical-reader-retry', '1');
                const retry = new Image();
                retry.addEventListener('load', () => {
                    if (imageLoadId !== imageLoadSequence) return;
                    image.addEventListener('error', () => {
                        if (imageLoadId !== imageLoadSequence) return;
                        void showArticleImageError(item, imageLoadId, 'This article image could not be loaded.');
                    }, { once: true });
                    image.src = retryUrl.href;
                }, { once: true });
                retry.addEventListener('error', () => {
                    if (imageLoadId !== imageLoadSequence) return;
                    void showArticleImageError(item, imageLoadId, 'This article image could not be loaded.');
                }, { once: true });
                retry.src = retryUrl.href;
            };
            const handleImageError = () => {
                if (!activeImageSource || imageLoadId !== imageLoadSequence) return;
                if (!item.imageRetryAttempted) {
                    item.imageRetryAttempted = true;
                    retryImageLoad();
                    return;
                }
                void showArticleImageError(item, imageLoadId, 'This article image could not be loaded.');
            };
            if (image.complete && image.naturalWidth) {
                requestAnimationFrame(updateProgress);
            } else if (activeImageSource && image.complete) {
                handleImageError();
            } else {
                image.addEventListener('load', updateProgress, { once: true });
                image.addEventListener('error', handleImageError, { once: true });
            }
            updateArticleTypeBadge();
            updatePaperTitle();
            setPaperTitleVisible(!slideshowActive || keepArticleInformationOnSlideshow);
            updatePlayerControls();
            updateTimeline();
            if (startBuffering) {
                preloadImage(items[index - 1]);
                void bufferArticles();
            }
            // Next and previous navigation usually waits for this work while
            // buffering. Expose it for timeline jumps too, so their loading
            // status remains visible while article details and the graphical
            // abstract are retrieved.
            currentImageWork = Promise.all([loadMetadata, loadGraphic]);
            return currentImageWork;
        }

        function updatePaperTitle() {
            paperTitleText.textContent = items[index].title || 'Title unavailable';
            articleJournalLabel.textContent = items[index].journalName || '';
            articleJournalLabel.hidden = !items[index].journalName;
        }

        function fitImage() {
            if (!imageError.hidden && imageError.dataset.figurePlaceholder === 'true') {
                positionImageError();
                return;
            }
            if (!image.naturalWidth || !image.naturalHeight) return;
            // The type badge belongs to the row below the graphic. Using its
            // bottom as a header boundary makes the graphic shrink each time
            // playback hides that row and the layout is recalculated.
            // The paper title is always positioned below the journal label.
            // Reserve that label on every layout, including the touch/slideshow
            // view, so a title that remains visible for an article type cannot
            // overlap the graphic.
            const headerBottom = journalNameLabel.getBoundingClientRect().bottom + 8;
            const titleSpace = measurePaperTitleHeight() + 10;
            const reservedTop = headerBottom + titleSpace;
            const reservedBottom = keywordHits.hidden ? 100 : 188;
            const availableHeight = window.innerHeight - reservedTop - reservedBottom;
            const heightLimit = Math.max(1, availableHeight);
            const imageAreaWidth = Math.max(1, window.innerWidth);
            const scale = Math.min(
                2,
                imageAreaWidth / image.naturalWidth,
                heightLimit / image.naturalHeight
            );
            image.style.width = `${Math.round(image.naturalWidth * scale)}px`;
            image.style.height = `${Math.round(image.naturalHeight * scale)}px`;
            image.style.position = 'fixed';
            image.style.left = `${Math.round(imageAreaWidth / 2)}px`;
            image.style.top = `${reservedTop + availableHeight / 2}px`;
            image.style.bottom = 'auto';
            image.style.transform = 'translate(-50%,-50%)';
            positionPaperTitle();
            positionKeywordHits();
            positionDownloadStatus();
        }

        function positionKeywordHits() {
            if (keywordHits.hidden) {
                keywordHits.style.visibility = 'hidden';
                return;
            }
            const controlsTop = playerControls.getBoundingClientRect().top;
            const badgeHeight = keywordHits.offsetHeight || 26;
            let preferredTop;
            if (!imageError.hidden && imageError.dataset.figurePlaceholder === 'true') {
                preferredTop = imageError.getBoundingClientRect().bottom + 8;
            } else if (titleFallbackActive && !paperTitle.hidden) {
                preferredTop = paperTitle.getBoundingClientRect().bottom + 8;
            } else if (image.naturalWidth && image.style.visibility !== 'hidden') {
                preferredTop = image.getBoundingClientRect().bottom + 6;
            } else {
                keywordHits.style.visibility = 'hidden';
                return;
            }
            keywordHits.style.top = `${Math.min(preferredTop, controlsTop - badgeHeight - 4)}px`;
            keywordHits.style.visibility = 'visible';
        }

        function measurePaperTitleHeight() {
            if (!paperTitle.hidden) return paperTitle.offsetHeight || 54;

            const original = {
                visibility: paperTitle.style.visibility,
                left: paperTitle.style.left,
                top: paperTitle.style.top,
                transform: paperTitle.style.transform
            };
            paperTitle.hidden = false;
            paperTitle.style.visibility = 'hidden';
            paperTitle.style.left = '-9999px';
            paperTitle.style.top = '0';
            paperTitle.style.transform = 'none';
            const height = paperTitle.offsetHeight || 54;
            paperTitle.hidden = true;
            paperTitle.style.visibility = original.visibility;
            paperTitle.style.left = original.left;
            paperTitle.style.top = original.top;
            paperTitle.style.transform = original.transform;
            return height;
        }

        function positionPaperTitle() {
            if (paperTitle.hidden) return;
            const imageBounds = image.getBoundingClientRect();
            const titleGap = 4;
            const minimumTop = journalNameLabel.getBoundingClientRect().bottom + titleGap;
            const titleHeight = paperTitle.offsetHeight || 54;
            if (imageBounds.top - titleHeight - titleGap >= minimumTop) {
                paperTitle.style.top = 'auto';
                paperTitle.style.bottom = `${window.innerHeight - imageBounds.top + titleGap}px`;
            } else {
                paperTitle.style.bottom = 'auto';
                paperTitle.style.top = `${minimumTop}px`;
            }
        }

        function positionImageError() {
            if (imageError.hidden) return;
            const errorHeight = imageError.offsetHeight || 44;
            const controlsTop = playerControls.getBoundingClientRect().top;
            if (imageError.dataset.figurePlaceholder === 'true') {
                const headerBottom = journalNameLabel.getBoundingClientRect().bottom + 4;
                const titleHeight = paperTitle.hidden ? 0 : paperTitle.offsetHeight;
                const badgeHeight = keywordHits.hidden ? 0 : (keywordHits.offsetHeight || 26) + 8;
                const groupHeight = titleHeight + errorHeight + badgeHeight;
                const groupTop = Math.max(headerBottom,
                    Math.min((window.innerHeight - groupHeight) / 2, controlsTop - groupHeight - 12));
                paperTitle.style.top = `${groupTop}px`;
                paperTitle.style.bottom = 'auto';
                imageError.style.top = `${groupTop + titleHeight}px`;
                positionKeywordHits();
                return;
            }
            if (paperTitle.hidden) return;
            const preferredTop = paperTitle.getBoundingClientRect().bottom + 12;
            imageError.style.top = `${Math.min(preferredTop, Math.max(8, controlsTop - errorHeight - 12))}px`;
        }

        function positionDownloadStatus() {
            const controlsBounds = playerControls.getBoundingClientRect();
            for (const status of [downloadStatus, bufferingStatus]) {
                status.style.left = `${controlsBounds.left + controlsBounds.width / 2}px`;
                status.style.top = `${controlsBounds.top - 8}px`;
            }
        }

        function updateNavigationFilterProgress(item) {
            if (navigationFilterProgress?.navigationId !== navigationSequence) return;
            navigationFilterProgress.item = item;
            if (navigationFilterProgress.visible) downloadStatus.textContent = 'Filtering…';
            updateTimeline();
        }

        async function withLoadingStatus(task, navigationId) {
            const progress = { navigationId, item: null, visible: false };
            navigationFilterProgress = progress;
            let loadingShown = false;
            const loadingTimer = setTimeout(() => {
                if (navigationId !== navigationSequence) return;
                loadingShown = true;
                progress.visible = true;
                updateTimeline();
                downloadStatus.textContent = progress.item ? 'Filtering…' : 'Loading…';
                downloadStatus.hidden = false;
                positionDownloadStatus();
            }, 150);
            try {
                return await task();
            } finally {
                clearTimeout(loadingTimer);
                if (navigationFilterProgress === progress) {
                    navigationFilterProgress = null;
                    updateTimeline();
                }
                if (loadingShown && navigationId === navigationSequence) downloadStatus.hidden = true;
            }
        }

        async function previous(allowNewBuffer = true) {
            // At the start of the currently loaded page, the previous action
            // must be allowed to fetch and prepend the next (older) results
            // page.  `bufferPreviousArticle` handles that boundary via
            // `prependOlderItems`; returning here stranded ACS readers at
            // the first article of page one.
            if (advancingNext || (index === 0 && !canLoadOlderItems)) return false;
            const navigationId = ++navigationSequence;
            advancingNext = true;
            navigationButton = previousButton;
            updatePlayerControls();
            try {
                return await withLoadingStatus(async () => {
                    const sourceItem = items[index];
                    if (!await bufferPreviousArticle()) return false;
                    const previousIndex = items.indexOf(sourceItem) - 1;
                    if (!viewerDismissed && previousIndex >= 0) {
                        await prepareArticleForDisplay(items[previousIndex]);
                        if (navigationId !== navigationSequence || items[index] !== sourceItem ||
                            viewerDismissed) return false;
                        show(previousIndex, {
                            startBuffering: allowNewBuffer
                        });
                        return true;
                    }
                    return false;
                }, navigationId);
            } finally {
                if (navigationId !== navigationSequence) return;
                advancingNext = false;
                navigationButton = null;
                updatePlayerControls();
            }
        }
        async function next(allowNewBuffer = true) {
            if (advancingNext) return;
            const sourceItem = items[index];
            const autoplayRequest = allowNewBuffer && slideshowActive;
            const requestSequence = autoplaySequence;
            const navigationId = ++navigationSequence;
            advancingNext = true;
            navigationButton = nextButton;
            updatePlayerControls();
            try {
                return await withLoadingStatus(async () => {
                if (!bufferingFailed) {
                    if (allowNewBuffer) await bufferNextArticle();
                    else if (bufferingArticles) await bufferNextArticle();
                    else if (!items[index + 1]?.imagePreloaded) return false;
                }
                if (bufferingFailed && !await loadNextArticleAfterBufferFailure()) return false;
                const nextItem = items[index + 1];
                if (nextItem) await prepareArticleForDisplay(nextItem);
                if (navigationId !== navigationSequence || items[index] !== sourceItem || viewerDismissed ||
                    (autoplayRequest && (!slideshowActive || requestSequence !== autoplaySequence))) return false;
                if (nextItem && items[index + 1] === nextItem) {
                    if (autoplayRequest) {
                        autoplayLoadingSourceItem = sourceItem;
                        autoplayLoadingItem = nextItem;
                    }
                    await show(index + 1, { startBuffering: allowNewBuffer });
                    return true;
                }
                return false;
                }, navigationId);
            } finally {
                if (navigationId !== navigationSequence) return;
                advancingNext = false;
                navigationButton = null;
                updatePlayerControls();
            }
        }

        function currentArticleNumber() {
            return allItems.indexOf(items[index]) + 1;
        }

        function isBuffering() {
            return !bufferingFailed && Boolean(bufferingArticles);
        }

        function updateTimeline({ resetPlayhead = false } = {}) {
            const total = allItems.length;
            const current = currentArticleNumber();
            const denominator = Math.max(1, total - 1);
            const currentPercent = ((current - 1) / denominator) * 100;
            const filteringItem = navigationFilterProgress?.visible &&
                navigationFilterProgress.navigationId === navigationSequence
                ? navigationFilterProgress.item : null;
            const filteringIndex = filteringItem ? allItems.indexOf(filteringItem) : -1;
            const lastProcessedIndex = allItems.findLastIndex(item => item.filterProcessed);
            const bufferedPercent = Math.max(0, lastProcessedIndex / denominator) * 100;
            const playheadPercent = filteringIndex >= 0
                ? Math.min((filteringIndex / denominator) * 100, bufferedPercent)
                : currentPercent;
            progressFill.style.width = `${playheadPercent}%`;
            // Keep the buffered portion visible *ahead* of the playhead. It
            // previously started at the beginning of the track, where the
            // current-progress fill covered it almost completely after the
            // reader had advanced through most of the list.
            loadedFill.style.left = `${playheadPercent}%`;
            loadedFill.style.width = `${Math.max(0, bufferedPercent - playheadPercent)}%`;
            if (resetPlayhead || !timelineSeeking) playhead.style.left = `${playheadPercent}%`;
            progressTrack.setAttribute('aria-valuemax', String(Math.max(1, total)));
            progressTrack.setAttribute('aria-valuenow', String(Math.max(1, current)));
            progressTrack.setAttribute('aria-valuetext', `Article ${current} of ${total}`);
        }

        function updatePlayerControls() {
            const navigationLoading = advancingNext;
            const buffering = isBuffering();
            const atUnpublishedSlideshowEnd = items[index] === unpublishedSlideshowEndItem;
            bufferingStatus.hidden = navigationLoading || !bufferingHasStarted || !bufferingFailed;
            firstButton.disabled = navigationLoading ||
                (items[index] === allItems[0] && !canLoadOlderItems);
            previousButton.disabled = navigationLoading || (index === 0 && !canLoadOlderItems);
            nextButton.disabled = navigationLoading ||
                (index === items.length - 1 && !canLoadNewerItems);
            lastButton.disabled = navigationLoading || items[index] === allItems.at(-1);
            nextPageLink.hidden = navigationLoading || (!atUnpublishedSlideshowEnd &&
                (buffering || index !== items.length - 1 || canLoadNewerItems));
            nextPageNotice.hidden = nextPageLink.hidden || !atUnpublishedSlideshowEnd;
            if (!nextPageLink.hidden) bufferingStatus.hidden = true;
            if (!bufferingStatus.hidden) positionDownloadStatus();
            // Keep playback pausable while an automatic advance is loading.
            playButton.disabled = !slideshowActive && index === items.length - 1 && !canLoadNewerItems;
            [firstButton, previousButton, playButton, nextButton, lastButton].forEach(button => {
                // Automatic advances happen on every slide. Keep the arrow
                // appearance steady while their navigation work is pending.
                const slideshowArrow = slideshowActive && button !== playButton;
                const loadingTrigger = !slideshowArrow && button === navigationButton && advancingNext;
                const disabled = slideshowArrow
                    ? (button === previousButton
                        ? index === 0 && !canLoadOlderItems
                        : button === nextButton
                            ? index === items.length - 1 && !canLoadNewerItems
                            : button === firstButton
                                ? items[index] === allItems[0] && !canLoadOlderItems
                                : items[index] === allItems.at(-1))
                    : button.disabled;
                button.style.opacity = loadingTrigger ? '1' : (disabled ? '.42' : '1');
                button.style.background = loadingTrigger
                    ? 'rgba(255,255,255,.42)'
                    : (disabled ? 'rgba(180,180,180,.16)' : 'rgba(255,255,255,.16)');
                button.style.filter = loadingTrigger ? 'brightness(1.8)' : (disabled ? 'grayscale(1)' : 'none');
                button.style.transform = loadingTrigger ? 'scale(.92)' : 'scale(1)';
            });
            // An automatic advance clears the timer while the next image is
            // loading, but playback is still active and must remain pausable.
            if (slideshowActive) playButton.textContent = 'Ⅱ';
            else setTriangleSymbol(playButton, 'right', 1, 18);
            playButton.setAttribute(
                'aria-label',
                slideshowActive ? 'Pause slideshow' : 'Start slideshow'
            );
        }

        function stopAutoplay({ preserveCurrentArticle = false } = {}) {
            autoplaySequence += 1;
            // Cancel the visible navigation state now; the buffer work can
            // finish harmlessly in the background.
            if (advancingNext && navigationButton === nextButton) {
                navigationSequence += 1;
                advancingNext = false;
                navigationButton = null;
                downloadStatus.hidden = true;
            }
            if (typeof autoplayTimer === 'number') clearTimeout(autoplayTimer);
            autoplayTimer = null;
            slideshowActive = false;
            previousSlideshowItem = null;
            // A manual pause while an automatic transition is loading returns
            // to the article that was on screen. At the natural end of a
            // slideshow, however, the final article is that loading item.
            // Do not mistake reaching it for an interrupted transition, or
            // the reader immediately jumps back to the second-to-last item.
            if (!preserveCurrentArticle && autoplayLoadingItem === items[index]) {
                const sourceIndex = items.indexOf(autoplayLoadingSourceItem);
                autoplayLoadingSourceItem = null;
                autoplayLoadingItem = null;
                if (sourceIndex >= 0) show(sourceIndex, { startBuffering: false });
            } else if (preserveCurrentArticle) {
                autoplayLoadingSourceItem = null;
                autoplayLoadingItem = null;
            }
            setPaperTitleVisible(true);
            updatePlayerControls();
        }

        async function waitForCurrentImage() {
            const item = items[index];
            // Wait for the article image to be resolved and assigned before
            // checking the displayed image's load or final failure.
            await currentImageWork;
            if (items[index] !== item) return;
            if (imageError.hidden === false || !image.getAttribute('src') ||
                (image.complete && image.naturalWidth)) return;
            await new Promise(resolve => {
                const finish = () => {
                    image.removeEventListener('load', finish);
                    imageError.removeEventListener('graphical-reader-image-failed', finish);
                    resolve();
                };
                image.addEventListener('load', finish, { once: true });
                imageError.addEventListener('graphical-reader-image-failed', finish, { once: true });
                // Close the gap between the initial state check and listeners.
                if (image.complete && image.naturalWidth || !imageError.hidden) finish();
            });
        }

        function scheduleAutoplayAdvance() {
            const sequence = ++autoplaySequence;
            autoplayTimer = 'waiting-for-image';
            waitForCurrentImage().then(async () => {
                if (sequence !== autoplaySequence || !autoplayTimer) return;
                const currentItem = items[index];
                const unpublished = currentItem.hasVersionOfRecordDate === false;
                if (currentItem.isNature && await matchesKeywordFilter(currentItem)) {
                    if (sequence !== autoplaySequence || items[index] !== currentItem) return;
                    if (unpublished && previousSlideshowItem !== currentItem &&
                        previousSlideshowItem?.hasVersionOfRecordDate === false) {
                        unpublishedSlideshowEndItem = currentItem;
                        stopAutoplay({ preserveCurrentArticle: true });
                        return;
                    }
                    previousSlideshowItem = currentItem;
                }
                if (sequence !== autoplaySequence || items[index] !== currentItem) return;
                if (index >= items.length - 1 && !canLoadNewerItems) {
                    stopAutoplay({ preserveCurrentArticle: true });
                    return;
                }
                autoplayTimer = setTimeout(async () => {
                    if (sequence !== autoplaySequence) return;
                    autoplayTimer = null;
                    const advanced = await next();
                    if (sequence !== autoplaySequence || !slideshowActive) return;
                    if (!advanced) {
                        stopAutoplay({ preserveCurrentArticle: true });
                        return;
                    }
                    scheduleAutoplayAdvance();
                }, unpublished || !paperTitle.hidden ? autoplayDelay * 2 : autoplayDelay);
            });
            updatePlayerControls();
        }

        function startAutoplay(advanceImmediately) {
            if (index === items.length - 1 && !canLoadNewerItems) {
                slideshowActive = false;
                setPaperTitleVisible(true);
                updatePlayerControls();
                return;
            }
            slideshowActive = true;
            if (advanceImmediately) {
                unpublishedSlideshowEndItem = null;
                const sequence = ++autoplaySequence;
                autoplayTimer = 'waiting-for-image';
                void waitForCurrentImage().then(async () => {
                    if (sequence !== autoplaySequence || !slideshowActive) return;
                    if (items[index].hasVersionOfRecordDate === false) {
                        scheduleAutoplayAdvance();
                        return;
                    }
                    autoplayTimer = 'buffering-next';
                    const advanced = await next();
                    if (sequence !== autoplaySequence || !slideshowActive) return;
                    if (advanced) scheduleAutoplayAdvance();
                    else stopAutoplay({ preserveCurrentArticle: true });
                });
                updatePlayerControls();
                return;
            }
            setPaperTitleVisible(keepArticleInformationOnSlideshow);
            scheduleAutoplayAdvance();
        }

        function toggleAutoplay() {
            if (slideshowActive) {
                stopAutoplay();
                return;
            }
            if (playButton.disabled) return;
            startAutoplay(true);
        }

        function resetAutoplayCountdown() {
            if (!slideshowActive) return;
            autoplaySequence += 1;
            if (typeof autoplayTimer === 'number') clearTimeout(autoplayTimer);
            autoplayTimer = null;
            startAutoplay(false);
        }

        previousButton.addEventListener('click', event => {
            event.stopPropagation();
            previous(false);
            stopAutoplay();
        });
        async function goToFirstArticle() {
            if (advancingNext) return;
            if (items[index] === allItems[0]) {
                if (!canLoadOlderItems) return;
                stopAutoplay();
                const navigationId = ++navigationSequence;
                advancingNext = true;
                navigationButton = firstButton;
                updatePlayerControls();
                try {
                    const loaded = await withLoadingStatus(prependOlderItems, navigationId);
                    if (!loaded || navigationId !== navigationSequence || viewerDismissed) return;
                } finally {
                    if (navigationId === navigationSequence) {
                        advancingNext = false;
                        navigationButton = null;
                        updatePlayerControls();
                    }
                }
            }
            await seekToItem(allItems[0], { ignoreFiltering: true });
        }

        firstButton.addEventListener('click', event => {
            event.stopPropagation();
            void goToFirstArticle();
        });
        playButton.addEventListener('click', event => {
            event.stopPropagation();
            toggleAutoplay();
        });
        nextButton.addEventListener('click', event => {
            event.stopPropagation();
            void next(false).then(advanced => {
                if (advanced) resetAutoplayCountdown();
            });
        });
        async function goToLastArticle() {
            if (advancingNext || lastButton.disabled) return;
            await seekToItem(allItems.at(-1), { ignoreFiltering: true });
        }

        lastButton.addEventListener('click', event => {
            event.stopPropagation();
            void goToLastArticle();
        });

        function handleReaderShortcut(event) {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
                event.shiftKey || !settingsMenu.hidden) return;
            if (document.querySelector(`${natureConsentDialog}:modal`)) return;
            const target = event.target;
            if (target instanceof Element &&
                target.closest('button, input, select, textarea, a, [contenteditable]')) return;

            const button = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? previousButton
                : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? nextButton
                    : event.key === ' ' ? playButton : null;
            if (!button) return;
            event.preventDefault();
            if (event.key === ' ' && event.repeat) return;
            if (!button.disabled) button.click();
        }
        document.addEventListener('keydown', handleReaderShortcut);

        function timelinePercentFromClientX(clientX) {
            const bounds = progressTrack.getBoundingClientRect();
            if (!bounds.width) return 0;
            return Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100));
        }

        function itemForTimelinePercent(percent) {
            const targetTimelineIndex = Math.round((percent / 100) * Math.max(0, allItems.length - 1));
            const targetItem = allItems[targetTimelineIndex];
            if (items.includes(targetItem)) return targetItem;
            // Filtering can remove an article while its place remains on the
            // timeline. In that case, go to the closest available article.
            return items.reduce((closest, candidate) => {
                const closestDistance = Math.abs(allItems.indexOf(closest) - targetTimelineIndex);
                const candidateDistance = Math.abs(allItems.indexOf(candidate) - targetTimelineIndex);
                return candidateDistance < closestDistance ? candidate : closest;
            }, items[0]);
        }

        function previewTimelinePosition(clientX) {
            playhead.style.left = `${timelinePercentFromClientX(clientX)}%`;
        }

        function timelinePercentForItem(item) {
            const itemIndex = allItems.indexOf(item);
            return (itemIndex / Math.max(1, allItems.length - 1)) * 100;
        }

        async function seekToItem(targetItem, { ignoreFiltering = false } = {}) {
            if (advancingNext) return;
            if (!targetItem) return;
            if (ignoreFiltering && targetItem.filterPromise) await targetItem.filterPromise;
            if (viewerDismissed) return;
            if (ignoreFiltering && !items.includes(targetItem)) {
                const targetTimelineIndex = allItems.indexOf(targetItem);
                const insertAt = items.findIndex(item => allItems.indexOf(item) > targetTimelineIndex);
                if (insertAt < 0) items.push(targetItem);
                else items.splice(insertAt, 0, targetItem);
                delete targetItem.filterPromise;
                delete targetItem.filterProcessed;
            }
            const targetIndex = items.indexOf(targetItem);
            if (targetIndex < 0 || targetIndex === index) return;
            timelineSeeking = true;
            playhead.style.left = `${timelinePercentForItem(targetItem)}%`;
            stopAutoplay();
            // `show` starts the normal background buffer. This is important
            // after seeking backwards: articles following the new position
            // are fetched and prepared again as the reader advances.
            const navigationId = ++navigationSequence;
            advancingNext = true;
            navigationButton = null;
            updatePlayerControls();
            try {
                await withLoadingStatus(async () => {
                    await prepareArticleForDisplay(targetItem);
                    if (navigationId !== navigationSequence || viewerDismissed ||
                        items.indexOf(targetItem) < 0) return;
                    await show(items.indexOf(targetItem), { ignoreFilter: ignoreFiltering });
                }, navigationId);
            } finally {
                if (navigationId === navigationSequence) {
                    advancingNext = false;
                    updatePlayerControls();
                }
                timelineSeeking = false;
                updateTimeline();
            }
        }

        async function seekTimeline(clientX) {
            await seekToItem(itemForTimelinePercent(timelinePercentFromClientX(clientX)));
        }

        progressTrack.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            timelineSeeking = true;
            progressTrack.setPointerCapture(event.pointerId);
            previewTimelinePosition(event.clientX);
        });
        progressTrack.addEventListener('pointermove', event => {
            if (!timelineSeeking || !progressTrack.hasPointerCapture(event.pointerId)) return;
            previewTimelinePosition(event.clientX);
        });
        progressTrack.addEventListener('pointerup', event => {
            if (!timelineSeeking) return;
            event.preventDefault();
            event.stopPropagation();
            timelineSeeking = false;
            if (progressTrack.hasPointerCapture(event.pointerId)) {
                progressTrack.releasePointerCapture(event.pointerId);
            }
            void seekTimeline(event.clientX);
            updateTimeline();
        });
        progressTrack.addEventListener('pointercancel', event => {
            timelineSeeking = false;
            if (progressTrack.hasPointerCapture(event.pointerId)) {
                progressTrack.releasePointerCapture(event.pointerId);
            }
            updateTimeline();
        });
        progressTrack.addEventListener('selectstart', event => event.preventDefault());
        progressTrack.addEventListener('contextmenu', event => event.preventDefault());
        ['touchstart', 'touchend', 'touchcancel'].forEach(type => {
            progressTrack.addEventListener(type, event => event.stopPropagation(), { passive: true });
        });

        function setPaperTitleVisible(visible) {
            const articleType = items[index]?.articleType?.trim() || '';
            const showDuringSlideshow = shouldShowArticleDetailsDuringSlideshow(articleType);
            paperTitle.hidden = !visible && !showDuringSlideshow &&
                items[index]?.hasVersionOfRecordDate !== false;
            updateKeywordHits();
            requestAnimationFrame(fitImage);
        }

        window.addEventListener('graphical-reader-image-preloaded', updateTimeline);
        function articlePageUrl(item) {
            const url = new URL(item.href, location.href);
            url.hash = '';
            url.pathname = url.pathname.replace(
                /\/doi\/(?:abs|full|pdf)\//i,
                '/doi/'
            );
            return url.href;
        }

        function selectedArticleUrl(item) {
            const htmlUrl = articlePageUrl(item);
            if (articleClickFormat !== 'pdf') return htmlUrl;
            const url = new URL(htmlUrl);
            const hostname = url.hostname.toLowerCase();
            const isHost = domain => hostname === domain || hostname.endsWith(`.${domain}`);
            url.hash = '';
            if (isHost('onlinelibrary.wiley.com')) {
                url.pathname = url.pathname.replace(/\/doi(?:\/abs|\/full)?/i, '/doi/pdfdirect');
            } else if (isHost('science.org')) {
                url.pathname = url.pathname.replace(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?/i, '/doi/pdf/');
            } else if (isHost('pubs.acs.org')) {
                if (item.pdfUrl) return item.pdfUrl;
                const doi = item.doi || url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/)?(10\.\d{4,9}\/[^/]+)/i)?.[1];
                if (doi) return `https://pubs.acs.org/doi/pdf/${doi}`;
            } else if (isHost('cell.com')) {
                const chem = url.pathname.match(/^\/(?:chem|chempr)\/(?:fulltext|abstract|pdf)\/(S\d{4}-?\d{4}\(\d{2}\)\d{5}-?\d)(?:\.pdf)?\/?$/i);
                if (chem) return `https://www.sciencedirect.com/science/article/pii/${chem[1].replace(/[-()]/g, '')}/pdfft`;
                url.pathname = url.pathname.replace(/\/(?:fulltext|abstract)\/(S[\d-]+\([\d]{2}\)[\d-]+)/i, '/pdf/$1.pdf');
            } else if (isHost('pubs.rsc.org')) {
                if (item.pdfUrl) return item.pdfUrl;
                url.pathname = url.pathname.replace(/\/content\/article(?:landing|html|pdf)\//i, '/content/articlepdf/');
                const doi = item.doi || url.pathname.match(/\/doi\/(10\.1039\/[^/]+)/i)?.[1];
                const year = item.rscPublicationYear || item.publicationDate?.getFullYear();
                const articleId = doi?.match(/^10\.1039\/([a-z]\d{1,2}([a-z]{2})\d+[a-z])$/i);
                if (/\/(?:doi\/|[^/]+\/article\/)/i.test(url.pathname) && articleId && year) {
                    url.pathname = `/en/content/articlepdf/${year}/${articleId[2].toLowerCase()}/${articleId[1].toLowerCase()}`;
                }
            } else if (isHost('sciencedirect.com')) {
                url.pathname = url.pathname.replace(/(\/pii\/S?[\dX]+)/i, '$1/pdfft');
            } else if (isHost('nature.com')) {
                url.pathname = url.pathname.replace(/articles\/([\w.-]+).*?$/i, 'articles/$1.pdf');
            }
            return url.href;
        }

        function openArticleFallback(item) {
            const url = selectedArticleUrl(item);
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, { active: false, insert: true, setParent: true });
                return;
            }
            window.open(url, '_blank', 'noopener');
        }

        function shareCurrentArticle() {
            const item = items[index];
            if (!item.href) return;
            if (!navigator.share) {
                openArticleFallback(item);
                return;
            }
            if (slideshowActive) stopAutoplay({ preserveCurrentArticle: true });
            const articleUrl = selectedArticleUrl(item);
            void navigator.share({ title: item.title || document.title, url: articleUrl })
                .catch(error => {
                    if (error.name !== 'AbortError') console.warn('Could not share the article.', error);
                });
        }

        function handleCurrentArticleClick() {
            const item = items[index];
            if (!item?.href) return;
            if (articleClickBehavior === 'open') {
                openArticleFallback(item);
                return;
            }
            shareCurrentArticle();
        }

        function handleSwipe(startX, startY, endX, endY) {
            if (!settingsMenu.hidden) return;
            const distanceX = endX - startX;
            const distanceY = endY - startY;
            const horizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);
            const distance = horizontalSwipe ? distanceX : distanceY;
            if (Math.abs(distance) < 40) return;
            suppressNextClick = true;
            setTimeout(() => { suppressNextClick = false; }, 400);
            if (distance < 0) {
                void next().then(advanced => {
                    if (advanced) resetAutoplayCountdown();
                });
            } else {
                previous();
                stopAutoplay();
            }
        }

        viewer.addEventListener('touchstart', event => {
            const touch = event.changedTouches[0];
            if (!touch || timelineSeeking || progressTrack.contains(event.target) ||
                event.target.closest('button, input, label')) return;
            swipeStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
        }, { passive: true });
        viewer.addEventListener('touchend', event => {
            if (timelineSeeking || progressTrack.contains(event.target)) {
                swipeStart = null;
                return;
            }
            const touch = [...event.changedTouches].find(item => item.identifier === swipeStart?.id);
            if (!swipeStart || !touch) return;
            handleSwipe(swipeStart.x, swipeStart.y, touch.clientX, touch.clientY);
            swipeStart = null;
        }, { passive: true });
        viewer.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });
        viewer.addEventListener('touchmove', event => {
            // The settings panel is the sole scrollable region in the reader.
            if (!settingsMenu.hidden && settingsMenu.contains(event.target)) return;
            event.preventDefault();
        }, { passive: false });

        viewer.append(
            image,
            keywordHits,
            imageError,
            articleActionArea,
            journalNameLabel,
            downloadStatus,
            paperTitle,
            bottomColorGuard,
            bufferingStatus,
            progressTrack,
            playerControls,
            nextPageLink,
            nextPageNotice,
            settingsMenu,
            settingsButton,
            closeButton
        );
        document.body.appendChild(viewer);
        image.addEventListener('load', fitImage);
        window.addEventListener('resize', fitImage);
        window.addEventListener('resize', positionImageError);
        await show(index);
        if (viewerDismissed) {
            closeViewer();
            return;
        }
        const firstReadyItem = items[index];
        if (firstReadyItem) await prepareArticleForDisplay(firstReadyItem);
        if (viewerDismissed) {
            closeViewer();
            return;
        }
        viewer.style.visibility = 'visible';
        hideLoadingOverlay();
    }

    function startViewerWithItems(items) {

        // Keep the final article on the page in the reader regardless of any
        // active filtering. This is marked before session restoration so the
        // same item remains protected when `items` is later sliced.
        items.at(-1).alwaysShowInReader = true;

        const requiresPreparation =
            isCellNewArticlesPage() ||
            isAcsSearchPage() ||
            isRscLatestArticlesPage() ||
            isWileyTocPage() ||
            isScienceTocPage() ||
            isNatureSearchPage();
        if (!requiresPreparation) {
            initViewer(items, collectJournalName());
            return;
        }

        clearPreviousSessionData = async () => {
            await clearSavedReadingPosition();
            setLoadingMessage('Saved position cleared. Restarting…');
            location.reload();
        };
        let itemsToPrepare = items;
        let timelineItems = items;
        let loadNewerItems = null;
        let loadOlderItems = null;
        let savedDoi = '';
        let savedHref = '';

        const loadedArticleKeys = new Set();
        const uniqueItems = additionalItems => {
            // Page loaders keep running after initialization. Compare against
            // every page already loaded, including pages added since startup.
            itemsToPrepare.forEach(item => loadedArticleKeys.add(articleIdentityKey(item)));
            return collectUnseenArticles(additionalItems, loadedArticleKeys);
        };
        const makeAcsOlderLoader = startPage => {
            let pageNumber = startPage;
            const totalPages = acsSearchTotalPages();
            return async () => {
                if (pageNumber > totalPages) return [];
                try {
                    const page = await fetchPaginatedDocument(pageNumber++, 'ACS');
                    return uniqueItems(collectAcsSearchItems(page));
                } catch (error) {
                    console.warn('Could not retrieve the following ACS search page.', error);
                    return [];
                }
            };
        };
        const makeWileyOlderLoader = startPageUrl => {
            let pageUrl = startPageUrl;
            return async () => {
                if (!pageUrl) return [];
                const requestedUrl = pageUrl;
                try {
                    const page = await fetchDocument(requestedUrl, 'Wiley TOC');
                    pageUrl = nextWileyTocPageUrl(page, requestedUrl);
                    return uniqueItems(collectWileyTocItems(page));
                } catch (error) {
                    console.warn('Could not retrieve the following Wiley TOC page.', error);
                    return [];
                }
            };
        };
        const makeListingOlderLoader = (startPageUrl, source) => {
            let pageUrl = startPageUrl;
            return async () => {
                if (!pageUrl) return [];
                const requestedUrl = pageUrl;
                try {
                    const page = await fetchDocument(requestedUrl, source);
                    pageUrl = nextListingPageUrl(page, requestedUrl);
                    return uniqueItems(collectItems(page));
                } catch (error) {
                    console.warn(`Could not retrieve the following ${source} page.`, error);
                    return [];
                }
            };
        };

        if (isAcsSearchPage()) {
            const currentSearchPage = acsSearchPageNumber();
            loadOlderItems = makeAcsOlderLoader(currentSearchPage + 1);
        }
        if (isWileyTocPage()) {
            const nextPageUrl = nextWileyTocPageUrl(document);
            if (nextPageUrl) loadOlderItems = makeWileyOlderLoader(nextPageUrl);
        }
        if (isRscLatestArticlesPage()) {
            const nextPageUrl = nextListingPageUrl(document);
            if (nextPageUrl) {
                loadOlderItems = makeListingOlderLoader(nextPageUrl, 'RSC latest articles');
            }
        }
        if (isCellNewArticlesPage()) {
            const nextPageUrl = nextListingPageUrl(document);
            if (nextPageUrl) loadOlderItems = makeListingOlderLoader(nextPageUrl, 'Cell new articles');
        }

        const configureNaturePageLoaders = currentSearchPage => {
            let previousSearchPage = currentSearchPage - 1;
            let nextSearchPage = currentSearchPage + 1;
            loadNewerItems = async () => {
                if (previousSearchPage < 1) return [];
                const pageNumber = previousSearchPage--;
                try {
                    const page = await fetchPaginatedDocument(pageNumber, 'Nature search');
                    return uniqueItems(collectNatureItems(page));
                } catch (error) {
                    console.warn('Could not retrieve the preceding Nature search page.', error);
                    return [];
                }
            };
            loadOlderItems = async () => {
                const pageNumber = nextSearchPage++;
                try {
                    const page = await fetchPaginatedDocument(pageNumber, 'Nature search');
                    return uniqueItems(collectNatureItems(page));
                } catch (error) {
                    console.warn('Could not retrieve the following Nature search page.', error);
                    return [];
                }
            };
        };

        if (isNatureSearchPage()) {
            configureNaturePageLoaders(Number(new URL(location.href).searchParams.get('page') || 1));
        }

        let preparationFailed = false;
        const { lastArticleHrefKey } = sessionStorageKeys();
        const natureReloadKey = `${lastArticleHrefKey}:nature-reload`;
        const showPreparationError = (message, failedPage = 0) => {
            preparationFailed = true;
            const clientChallenge = /Returned page title:\s*Client Challenge\s*$/i.test(message);
            setLoadingMessage(clientChallenge
                ? 'Nature requires a browser check. Reload to try again.'
                : `${message}\nReload this page to retry, or select Cancel.`);
            if (loadingMessage) {
                loadingMessage.setAttribute('role', clientChallenge ? 'status' : 'alert');
                loadingMessage.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:80vw;text-align:center;';
                if (clientChallenge) {
                    const reloadButton = document.createElement('button');
                    reloadButton.type = 'button';
                    reloadButton.textContent = 'Reload';
                    reloadButton.style.cssText =
                        'padding:8px 18px;border:1px solid rgba(255,255,255,.8);border-radius:6px;' +
                        'background:transparent;color:#fff;font:500 16px/1 system-ui,-apple-system,sans-serif;' +
                        '-webkit-appearance:none;appearance:none;';
                    reloadButton.addEventListener('click', async () => {
                        reloadButton.disabled = true;
                        try {
                            if (failedPage > 0) {
                                await GM.setValue(natureReloadKey, {
                                    pageNumber: failedPage,
                                    savedHref,
                                    createdAt: Date.now()
                                });
                            }
                            location.reload();
                        } catch (error) {
                            setLoadingMessage(`Could not remember the retry page. ${error.message || error}`);
                            reloadButton.disabled = false;
                        }
                    });
                    loadingMessage.after(reloadButton);
                }
            }
        };
        initializing = true;
        showLoadingOverlay();
        (async () => {
            // Find the saved position for supported publishers.
            setLoadingMessage('Finding saved position…');
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (viewerDismissed) return;
            if (isResumePositionEnabled()) {
                try {
                    const savedPosition = await readSavedReadingPosition();
                    savedDoi = savedPosition.doi || '';
                    savedHref = savedPosition.href || '';
                    // Keep earlier results available for backward navigation.
                    // The viewer restores the saved item as its initial
                    // position and filters earlier results on demand.
                } catch (error) {
                    console.warn('Could not limit preparation to new articles.', error);
                    itemsToPrepare = items.slice(0, 10);
                }
            }
            setLoadingMessage('Preparing Graphical Reader…');
            const matchesSavedArticle = matchesSavedPosition(
                isNatureSearchPage() ? '' : savedDoi, savedHref
            );
            if (isAcsSearchPage() && (savedDoi || savedHref) &&
                !items.some(matchesSavedArticle)) {
                const currentPage = acsSearchPageNumber();
                setLoadingMessage(`Finding saved position — page ${currentPage}…`);
                const savedResult = await findSavedAcsArticle(items, savedDoi, savedHref);
                setLoadingMessage('Preparing Graphical Reader…');
                if (savedResult) {
                    itemsToPrepare = savedResult.items;
                    timelineItems = savedResult.items;
                    loadOlderItems = makeAcsOlderLoader(savedResult.pageNumber + 1);
                }
            }
            if (isWileyTocPage() && savedHref && !items.some(item => item.href === savedHref)) {
                const currentUrl = new URL(location.href);
                const currentPage = /\/earlyview\/?$/i.test(currentUrl.pathname)
                    ? Number(currentUrl.searchParams.get('startPage') || 0) + 1
                    : Number(currentUrl.searchParams.get('page') || 1);
                setLoadingMessage(`Finding saved position — page ${currentPage}…`);
                const savedResult = await findSavedWileyTocArticle(items, savedHref);
                setLoadingMessage('Preparing Graphical Reader…');
                if (savedResult) {
                    itemsToPrepare = savedResult.items;
                    timelineItems = savedResult.items;
                    loadOlderItems = savedResult.nextPageUrl
                        ? makeWileyOlderLoader(savedResult.nextPageUrl)
                        : null;
                }
            }
            // The first article is always shown. Filtering is deliberately a
            // background-buffering concern, so opening the reader never skips
            // the article the user started on.
            if (!itemsToPrepare.length) return;
            if (isNatureSearchPage() &&
                savedHref && !items.some(matchesSavedArticle)) {
                const currentPage = Number(new URL(location.href).searchParams.get('page') || 1);
                let resumePage = 0;
                try {
                    const retry = await GM.getValue(natureReloadKey, null);
                    await GM.deleteValue(natureReloadKey);
                    if (retry && retry.savedHref === savedHref &&
                        Number.isInteger(retry.pageNumber) && retry.pageNumber > currentPage &&
                        Date.now() - retry.createdAt >= 0 && Date.now() - retry.createdAt < 30 * 60 * 1000) {
                        resumePage = retry.pageNumber;
                    }
                } catch (error) {
                    console.warn('Could not read the Nature retry page.', error);
                }
                setLoadingMessage(`Finding saved position — page ${resumePage || currentPage}…`);
                const savedResult = await findSavedNatureSearchArticle(
                    items, savedHref, resumePage
                );
                setLoadingMessage('Preparing Graphical Reader…');
                if (savedResult) {
                    itemsToPrepare = savedResult.items;
                    timelineItems = savedResult.items;
                    // Continue buffering toward newer results from the restored page.
                    if (loadNewerItems) {
                        const newestPage = savedResult.newestPage || savedResult.pageNumber;
                        const oldestPage = savedResult.oldestPage || savedResult.pageNumber;
                        loadNewerItems = (() => {
                            let nextPage = newestPage - 1;
                            return async () => {
                                if (nextPage < 1) return [];
                                const pageNumber = nextPage--;
                                try {
                                    const page = await fetchPaginatedDocument(pageNumber, 'Nature search');
                                    return uniqueItems(collectNatureItems(page));
                                } catch (error) {
                                    console.warn('Could not retrieve the preceding Nature search page.', error);
                                    return [];
                                }
                            };
                        })();
                        loadOlderItems = (() => {
                            let nextPage = oldestPage + 1;
                            return async () => {
                                const pageNumber = nextPage++;
                                try {
                                    const page = await fetchPaginatedDocument(pageNumber, 'Nature search');
                                    return uniqueItems(collectNatureItems(page));
                                } catch (error) {
                                    console.warn('Could not retrieve the following Nature search page.', error);
                                    return [];
                                }
                            };
                        })();
                    }
                }
            }
            const natureJournals = new URL(location.href).searchParams.get('journal') || '';
            if (isNatureSearchPage() && natureJournals.trim() === 'ncomms' &&
                !itemsToPrepare.some(item => savedHref && item.href === savedHref)) {
                await GM.deleteValue(natureReloadKey);
                setLoadingMessage('Loading starting position — page 10…');
                try {
                    const currentPage = Number(new URL(location.href).searchParams.get('page') || 1);
                    let startingItems = items;
                    if (currentPage !== 10) {
                        const startingPage = await fetchPaginatedDocument(10, 'Nature search');
                        startingItems = collectNatureItems(startingPage);
                        if (!startingItems.length) {
                            throw new Error(`No articles recognized. Returned page title: ${startingPage.title || '(none)'}`);
                        }
                        const activePage = startingPage.querySelector('.c-pagination__link--active')
                            ?.closest('[data-page]')?.getAttribute('data-page');
                        if (activePage && activePage !== '10') {
                            throw new Error(`Requested page 10, but received page ${activePage}.`);
                        }
                    }
                    itemsToPrepare = startingItems;
                    timelineItems = startingItems;
                    startingItems[0].alwaysShowInReader = true;
                    configureNaturePageLoaders(10);
                } catch (error) {
                    console.warn('Could not retrieve Nature Communications page 10.', error);
                    showPreparationError(`Could not load Nature Communications page 10.\n${error.message || error}`, 10);
                    return;
                }
                setLoadingMessage('Preparing Graphical Reader…');
            }
            // Keep the preparation screen visible until the first image is ready.
            // All remaining images continue in the background after startup.
            const firstItem = itemsToPrepare.find(matchesSavedArticle) || itemsToPrepare[0];
            const firstHighResolutionImage = await resolveHighResolutionImage(firstItem);
            const firstSource = firstHighResolutionImage ||
                (firstItem?.highResolutionUnavailable ? firstItem.src : null);
            if (firstSource) {
                const loadFirstImage = source => new Promise(resolve => {
                    const preload = new Image();
                    preload.addEventListener('load', async () => {
                        try {
                            if (firstItem.isCell && preload.decode) await preload.decode();
                            resolve(true);
                        } catch (error) {
                            resolve(false);
                        }
                    }, { once: true });
                    preload.addEventListener('error', () => resolve(false), { once: true });
                    preload.src = source;
                });
                let loadedSource = firstSource;
                let loaded = await loadFirstImage(loadedSource);
                if (!loaded && firstItem.isCell) {
                    // Complete the viewer's usual retry behind the preparation screen.
                    const retryUrl = new URL(firstSource, firstItem.href);
                    retryUrl.searchParams.set('graphical-reader-retry', '1');
                    loadedSource = retryUrl.href;
                    loaded = await loadFirstImage(loadedSource);
                }
                firstItem.imagePreloaded = loaded;
                if (firstItem.isCell) {
                    if (loaded) {
                        firstItem.displayImageSource = loadedSource;
                        delete firstItem.imageLoadError;
                    } else {
                        firstItem.displayImageFailed = true;
                        firstItem.imageLoadError ||= 'This article image could not be loaded.';
                    }
                }
            }
            if (viewerDismissed) return;

            initViewer(
                itemsToPrepare, collectJournalName(), loadNewerItems, timelineItems, loadOlderItems
            );

        })().catch(error => {
            console.warn('Could not prepare the first graphical abstract.', error);
            if (isNatureSearchPage()) showPreparationError(error.message || String(error), error.naturePageNumber);
        }).finally(() => {
            initializing = false;
            if (!initialized && !preparationFailed) hideLoadingOverlay();
        });
    }

    function tryInitialize() {
        if (viewerDismissed) return;
        const items = collectItems();
        if (!items.length || initialized || initializing) return;

        startViewerWithItems(items);
    }

    // Wiley TOC pagination preserves the same route and adds `page=2` (or a
    // later `startPage` for Early View). Only launch from the first listing;
    // the reader loads later pages itself when the user reaches them.
    if (isLaterWileyTocPage()) return;

    tryInitialize();

    // Science and ACS can add their article cards after document-idle.
    // Keep watching until the listing is available to start the reader.
    if ((isScienceTocPage() || isAcsSearchPage()) && !initialized) {
        let scheduled = false;
        const listingObserver = new MutationObserver(() => {
            if (initialized || viewerDismissed) {
                listingObserver.disconnect();
                return;
            }
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                tryInitialize();
                if (initialized || viewerDismissed) listingObserver.disconnect();
            });
        });
        listingObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    hideFeedbackButtons();
})();
