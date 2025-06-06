/* modules */
const express = require('express');
const bodyParser = require('body-parser');
const Sitemapper = require('sitemapper');
const { co2 } = require('@tgwf/co2');
const puppeteer = require('puppeteer');
const ts = require('./transfersize');

/* global vars */
const app = express();
var links = new Array();
var desktopEmissions = new Array();
var mobileEmissions = new Array();
var currentlyProcessing = false; //mutex

/* main func */
async function main(req, res) {
  app.use(express.static("public"));
  app.set('view engine', 'ejs');
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.disable('submitted')

  app.get("/", (req, res) => {
    res.render('pages/index', {
      desktopEmissions: desktopEmissions,
      mobileEmissions: mobileEmissions,
      linksList: links,
      showResults: false,
     
    });
  });

  app.post('/getxmllink', handlePost);

  app.listen(8080);
  console.log('Server is listening on port 8080');
}

async function handlePost(req, res) {
  if (!currentlyProcessing) {

    currentlyProcessing = true;
    // reset data
    let links = new Array();

    var xmllink = null;
    var sitemapper = new Sitemapper();
    sitemapper.timeout = 5000;
    xmllink = req.body.xmllink;
    links = await sitemapper.fetch(xmllink)
      .then(({ url, sites }) => links = sites)
      .catch(error => console.log(error));


    let params = {
      runDesktopNC: await req.body.dNC === "on",
      runMobileNC: await req.body.mNC === "on",
      runDesktopC: await req.body.dC === "on",
      runMobileC: await req.body.mC === "on",

      useMobileSort: await req.body.mobileSort === "on",
      useCacheSort: await req.body.cacheSort === "on",
    }
    let limit = parseInt(req.body.limit);
      if (isNaN(limit) || limit < 1 || limit > 10) {
        limit = null;
      }
    //server side validation, resets to mobile and desktop with no caching if invalid combo
    if (!(params.runMobileC || params.runMobileNC || params.runDesktopC || params.runDesktopNC)) {
      params.runDesktopNC = true;
      params.runMobileNC = true;
      params.useMobileSort = false;
      params.useCacheSort = false;
      limit = false;
    }
    if (params.useMobileSort && !(params.runMobileC || params.runMobileNC)) {
      params.useMobileSort = false;
    }
    if (params.useCacheSort && !(params.runMobileC || params.runDesktopC)) {
      params.useCacheSort = false;
    }


      if (limit) {
    links = links.slice(0, limit);
  }
    params.limit = limit;
    let transferData = await ts.processLinks(links, params);

    let emissionData = getCO2FromTransfers(await transferData, params);
    let p = processEmissionData(emissionData, params);


    app.set('submitted', true);
    res.render('pages/index', {
      emissionData: emissionData,
      desktopEmissionsNC: p.desktopEmissionsNC,
      mobileEmissionsNC: p.mobileEmissionsNC,
      desktopEmissionsC: p.desktopEmissionsC,
      mobileEmissionsC: p.mobileEmissionsC,
      params: params,
      linksList: p.links,
      showResults: true
    });
    currentlyProcessing = false;
  }
}


function getCO2FromTransfers(transferData, {
  runDesktopNC,
  runMobileNC,
  runDesktopC,
  runMobileC, }) {
  const oneByte = new co2({ model: '1byte' });
  let emissionData = new Array();

  for (let i = 0; i < transferData.length; i++) {
    emissionData.push({
      url: transferData[i].url,
      desktopNC: runDesktopNC ? oneByte.perByte(transferData[i].desktopNC) : 0,
      mobileNC: runMobileNC ? oneByte.perByte(transferData[i].mobileNC) : 0,
      desktopC: runDesktopC ? oneByte.perByte(transferData[i].desktopC) : 0,
      mobileC: runMobileC ? oneByte.perByte(transferData[i].mobileC) : 0,
    });
  }

  return emissionData;
}


function processEmissionData(emissionData,
  {
    runDesktopNC = true,
    runMobileNC = true,
    runDesktopC = false,
    runMobileC = false,

    useMobileSort = false,
    useCacheSort = false
  }) {

  let mobileSort = useMobileSort && (runMobileC || runMobileNC);
  let cacheSort = useCacheSort && (runDesktopC || runMobileC);
  let sortType = sortByDesktopNC;
  if (mobileSort) {
    sortType = cacheSort ? sortByMobileC : sortByMobileNC;
  }
  else {
    sortType = cacheSort ? sortByDesktopC : sortByDesktopNC;
  }
  emissionData.sort(sortType).reverse();
  let desktopEmissionsNC = new Array();
  let mobileEmissionsNC = new Array();
  let desktopEmissionsC = new Array();
  let mobileEmissionsC = new Array();
  let links = new Array();

  for (const e of emissionData) {
    desktopEmissionsNC.push(e.desktopNC);
    mobileEmissionsNC.push(e.mobileNC);
    desktopEmissionsC.push(e.desktopC);
    mobileEmissionsC.push(e.mobileC);
    links.push(e.url);
  }
  return {
    links: links,
    desktopEmissionsC: desktopEmissionsC,
    mobileEmissionsC: mobileEmissionsC,
    desktopEmissionsNC: desktopEmissionsNC,
    mobileEmissionsNC: mobileEmissionsNC,
  }
}

function sortByDesktopC(a, b) {
  if (a.desktopC === b.desktopC) {
    return 0;
  }
  else {
    return (a.desktopC < b.desktopC) ? -1 : 1;
  }
}

function sortByMobileC(a, b) {
  if (a.mobileC === b.mobileC) {
    return 0;
  }
  else {
    return (a.mobileC < b.mobileC) ? -1 : 1;
  }
}

function sortByDesktopNC(a, b) {
  if (a.desktopNC === b.desktopNC) {
    return 0;
  }
  else {
    return (a.desktopNC < b.desktopNC) ? -1 : 1;
  }
}

function sortByMobileNC(a, b) {
  if (a.mobileNC === b.mobileNC) {
    return 0;
  }
  else {
    return (a.mobileNC < b.mobileNC) ? -1 : 1;
  }
}

main();
