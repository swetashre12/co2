const puppeteer = require('puppeteer');
var browser;
var browserNoCache;

module.exports = {
  processLinks: async function
    (urls,
      {
        runDesktopNC = true,
        runMobileNC = false,
        runDesktopC = false,
        runMobileC = false,
      } = {}) {
    if (runMobileNC || runDesktopNC) browserNoCache = await puppeteer.launch({ headless: 1 });
    if (runMobileC || runDesktopC) browser = await puppeteer.launch({ headless: 1 });
    let desktopCSize, mobileCSize, desktopNCSize, mobileNCSize = 0;
    let transferData = new Array();
    for (let url of urls) {
      console.log("\n" + url);

      if (runDesktopNC) desktopNCSize = await getSize(url, { mobile: false, cache: false });
      if (runMobileNC) mobileNCSize = await getSize(url, { mobile: true, cache: false });
      if (runDesktopC) desktopCSize = await getSize(url, { mobile: false, cache: true });
      if (runMobileC) mobileCSize = await getSize(url, { mobile: true, cache: true });
      transferData.push({
        url: url,
        desktopC: desktopCSize,
        mobileC: mobileCSize,
        desktopNC: desktopNCSize,
        mobileNC: mobileNCSize
      });
    }

    return transferData;
    browser.close();
    browserNoCache.close();
  },
}

async function getSize(url, { mobile = false, cache = false } = {}) {
  try {
    let sum = await processTransfers(url, { mobile, cache });
    let viewport = mobile ? "mobile: " : "desktop: ";
    let cacheStr = cache ? "cache " : "no cache ";
    console.log(cacheStr + viewport + (sum / 1024).toFixed(3) + " kB/" + ((sum / 1024) / 1024).toFixed(3) + " mB");
    return sum;
  }
  catch (error) {
    console.error("Error: ", error.message);
    return 0;
  }
}

async function processTransfers(url, { mobile = false, cache = false } = {}) {
  let page = (cache) ? await browser.newPage() : await browserNoCache.newPage();
  const resources = {};

  if (mobile) {
    await page.setViewport({ width: 480, height: 800 });
  }
  else {
    await page.setViewport({ width: 1920, height: 1080 });
  }

  await page.setCacheEnabled(cache)
  let totalSize = 0;

  if (cache) {
    await page.goto(url/* , { waitUntil: "networkidle0" } */);
  }

  const devToolsResponses = new Map();
  const devToolsResponsesExtra = new Map();

  const devTools = await page.target().createCDPSession();
  await devTools.send("Network.enable");

  devTools.on("Network.responseReceived ", event => {
    devToolsResponses.set(event.requestId, event.response);
  });
  devTools.on("Network.loadingFinished", event => {
    const response = devToolsResponses.get(event.requestId);
    totalSize += event.encodedDataLength;
  });

  //this will time out on live video streams!!
  //detect and or exclude needed
  await page.goto(url, { waitUntil: "networkidle0" });

  page.close();
  return totalSize//await perfEntries;
}

/* old sum function
async function sumTransferSizes(page) {
  const transfersList = JSON.parse(
    await page.evaluate(() => JSON.stringify(performance.getEntries()))
  );

  let transferSizeSum = 0;
  for (i = 0; i < await transfersList.length; i++) {
    if (transfersList[i].transferSize)
      transferSizeSum += await transfersList[i].transferSize;
  }
  return transferSizeSum;
} */