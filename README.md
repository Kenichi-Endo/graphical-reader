# Graphical Reader
Tired of scrolling through journal pages or text-heavy RSS feeds to find new papers worth reading? Graphical Reader lets you scan recent publications focused on graphics in a slideshow or by swiping.

![Graphical Reader on iOS Safari showing a Nature Portfolio article, keyword highlights, and slideshow controls](docs/images/iOS%20Safari%20230px.png)

*Graphical Reader on a Nature search results page in iOS Safari. Illustration from [Endo et al., Nature Synthesis (2025)](https://doi.org/10.1038/s44160-024-00719-x), shown resized in the screenshot under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

## Contents
- [Features](#features)
- [Supported pages](#supported-pages)
- [Supported environments](#supported-environments)
- [Setup](#setup)
- [Use](#use)
- [Notes](#notes)
- [Customization](#customization)

## Features
- View only graphical abstracts or article images
- Optionally display titles and journal names.
- Browse by slideshow, touch, or keyboard.
- Resume from a saved reading position.
- Filter by article type or keyword and highlight keyword matches.
- Open HTML or PDF versions of articles, or share links to them.
- Review new publications across a configured sequence of journal listings.

## Supported pages
- ACS search (multiple journals)
- Nature search (multiple journals)
- Cell Press new-articles pages
- RSC latest-articles pages
- Wiley and Advanced journals' tables of contents
- Science and Science Advances current issue

## Supported environments
- Safari on macOS, iOS, and iPadOS with [Userscripts](https://github.com/quoid/userscripts). Tested on iOS 27.2.1 with Safari 27.2 and Userscripts v1.8.6 (113).
- Chrome, Edge, and other Chromium desktop browsers with [Tampermonkey](https://www.tampermonkey.net/).
- Firefox for Android with [Tampermonkey](https://www.tampermonkey.net/faq.php?q=Q406).

## Setup
Use your existing synced copy of `Graphical Reader.user.js` or [download the script](./Graphical%20Reader.user.js?raw=true), then follow the instructions for your browser.

### Safari on macOS
1. Install [Userscripts for Safari](https://github.com/quoid/userscripts).
2. In Userscripts, select the folder that already contains your synced copy of `Graphical Reader.user.js`. If you downloaded the script, put it in your chosen scripts folder and select that folder.
3. In **Safari → Settings → Extensions**, enable Userscripts and allow access on all sites.

### Safari on iOS and iPadOS
1. Install **Userscripts** from the App Store and open it once.
2. In Userscripts, select the iCloud Drive folder containing your synced copy of `Graphical Reader.user.js`. If you downloaded the script, place it in your chosen scripts folder, keep the `.user.js` extension, and select that folder.
3. In **Settings → Apps → Safari → Extensions → Userscripts**, enable the extension and allow access on all sites.

### Chrome, Edge, and other Chromium desktop browsers
1. Install [Tampermonkey](https://www.tampermonkey.net/) and follow its instructions to enable userscripts.
2. In `chrome://extensions` or `edge://extensions`, open **Tampermonkey → Details** and enable **Allow access to file URLs**.
3. In Tampermonkey, choose **Create a new script** and replace all starter text with this block:
   ```j
   // ==UserScript==
   // @name         Graphical Reader
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
   // @require      file:///(your folder path)/Graphical%20Reader.user.js
   // ==/UserScript==
   ```
4. Replace `(your folder path)` in the `@require` line with the folder containing your synced or downloaded copy of `Graphical Reader.user.js`.
5. Save the script.

### Firefox for Android
1. Install [Firefox for Android](https://play.google.com/store/apps/details?id=org.mozilla.firefox).
2. Open **Extensions** or **Add-ons** and install [Tampermonkey](https://www.tampermonkey.net/faq.php?q=Q406). Update Firefox if Tampermonkey is not listed.
3. Grant Tampermonkey permission to run on websites.
4. In Tampermonkey, choose **Create a new script**. Replace all starter text with the complete contents of [Graphical Reader.user.js](./Graphical%20Reader.user.js), then save and enable it.

## Use
### Reading workflow
1. Open the [ACS Publications search page](https://pubs.acs.org/search-results?q=&hd=advancedAny&restypeid=3&fl_JournalHistID=128+OR+16+OR+40+OR+426+OR+124+OR+264+OR+136+OR+454&searchType=advanced&sort=Date+-+Newest+First) or the first page in your custom sequence (see below).
2. If Graphical Reader does not show up on iOS Safari, check the Userscripts menu. If it shows a spinning indicator, force-quit Safari and reopen it.
3. Tap the play button to start the slideshow.
   *Article filtering can take longer on some publishers’ sites, including RSC and ACS, which can slow the slideshow. If you prefer faster transitions, you can wait for the articles to finish buffering before starting the slideshow.*
4. Tap the center of the reader to open or share an article. Save the link to your browser’s Reading List or bookmarks.
5. At the end of the listing, select **Next page** to continue to the next journal or publisher.

### Manual navigation
- Swipe left/right/up/down, press the arrow keys, or use navigation buttons.
- Press Space to start or pause the slideshow.
- Use the outer buttons to jump to the first or last article of loaded pages, or click or drag the timeline to choose a position. At the first article, the first button jumps to the first article of the previous page.
- Select **×** in the upper-left corner to return to the publisher page.

## Customization
Open the gear menu in the upper-right corner.
- Set the slideshow interval and choose whether to show article information during the slideshow.
- Under **Tap action**, choose **Share sheet** or **Open page**, then select **HTML** or **PDF**.
- Select **Keywords** to filter articles.
- Exclude or include certain article types.
To customize the journal sequence or keyword filters, follow the comments near the top of [Graphical Reader.user.js](./Graphical%20Reader.user.js) in your local copy or in the Tampermonkey editor.

## Notes
Nature search results are sorted by the publication date of the accepted manuscript. The graphical abstract becomes available when the Version of Record is published. In *Nature Communications*, the Version of Record can appear on the same day as the accepted manuscript or up to three months later.
