import crypto from 'crypto';
import * as cheerio from 'cheerio';
import axios from 'axios';
import https from 'https';
import {
  extractEmail,
  inferExperience,
  inferJobType,
  matchesLocation,
} from '../utils/filters.js';

// ── ID / Hash Helpers ─────────────────────────────────────────────────────────

function makeExternalId(source, id) {
  return `${source}:${id}`;
}

function hashFallback(title, company, source) {
  return crypto.createHash('md5').update(`${source}|${title}|${company}`).digest('hex');
}

function safeParseDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

// ── Experience Classification ─────────────────────────────────────────────────
// Returns: 'Fresher' | '0-2 Years' | '2+ Years' | 'Unknown'

function classifyExperience(rawExp = '', title = '', description = '') {
  const text = `${rawExp} ${title} ${description}`.toLowerCase();

  if (/fresher|0\s*year|no experience|entry.?level|fresh graduate|0\s*-\s*1|0\s*to\s*1/.test(text))
    return 'Fresher';

  if (/[012]\s*-\s*2\s*year|[012]\s*to\s*2\s*year|upto\s*2|up to\s*2|less than\s*2/.test(text))
    return '0-2 Years';

  if (/[2-9]\+?\s*year|\d{2,}\s*year|senior|lead|principal|staff|director|head of|vp of/.test(text))
    return '2+ Years';

  const match = rawExp.match(/(\d+)/);
  if (match) {
    const yrs = parseInt(match[1], 10);
    if (yrs === 0) return 'Fresher';
    if (yrs <= 2) return '0-2 Years';
    return '2+ Years';
  }

  return 'Unknown';
}

// ── Role Category Classification ──────────────────────────────────────────────
// Returns one of the ROLE_CATEGORIES keys, or null if not a target role

function classifyRole(title = '', description = '') {
  const t = `${title} ${description}`.toLowerCase();

  // Product Designer — most specific design role, check first
  if (/product design|product designer|ux research|design thinking|design strategy|design systems|design ops|designops|growth design|design lead|head of design|design director/.test(t))
    return 'Product Designer';

  // Solution Designer
  if (/solution design|solution architect.*design|design consultant|service design/.test(t))
    return 'Solution Designer';

  // Creative Designer
  if (/creative design|creative director|brand design|graphic design|visual design|motion design|digital design|art director/.test(t))
    return 'Creative Designer';

  // UI/UX Designer — broad design roles with tools
  if (/ui\/ux|ux\/ui|ui.ux|user interface|user experience|figma|adobe xd|sketch|wireframe|prototype|interaction design|interface design|experience design|web designer|ui designer|ux designer/.test(t))
    return 'UI/UX Designer';

  // Backend Developer — check before MERN/Frontend to avoid overlap
  if (
    /backend|back.end|back end|server.side|api developer|node.*developer|express.*developer|mongodb.*developer|database developer/.test(t) &&
    !/frontend|front.end|react/.test(t)
  ) return 'Backend Developer';

  // MERN Stack Developer — fullstack with MERN ecosystem
  if (/mern|full.?stack|fullstack|mongodb.*react|react.*node|mean stack/.test(t))
    return 'MERN Stack Developer';

  // Frontend Developer — react, next, typescript, UI dev
  if (/frontend|front.end|front end|react|reactjs|next\.?js|vue|angular|typescript.*developer|javascript.*developer|ui developer|web developer/.test(t))
    return 'Frontend Developer';

  // Backend Developer — secondary catch for node/express
  if (/node\.?js|express|mongodb|backend|server/.test(t))
    return 'Backend Developer';

  return null; // unrelated role — will be filtered out
}

// ── Normalize Job ─────────────────────────────────────────────────────────────

function normalizeJob(raw) {
  const description = raw.description || '';
  const location = raw.location || 'Kerala';
  const title = raw.title?.trim() || 'Untitled';

  const roleCategory = raw.roleCategory || classifyRole(title, description);
  if (!roleCategory) return null; // skip unrelated roles

  const experienceBucket = raw.experienceBucket ||
    classifyExperience(raw.experience || '', title, description);

  return {
    title,
    company: raw.company?.trim() || 'Unknown',
    location,
    roleCategory,        // 'Product Designer' | 'UI/UX Designer' | 'Creative Designer' | 'Solution Designer' | 'Frontend Developer' | 'Backend Developer' | 'MERN Stack Developer'
    experienceBucket,    // 'Fresher' | '0-2 Years' | '2+ Years' | 'Unknown'
    experience: raw.experience || '',
    jobType: raw.jobType || inferJobType(`${description} ${title} ${location}`),
    source: raw.source,
    postedDate: safeParseDate(raw.postedDate),
    applyLink: raw.applyLink || null,
    description: description.slice(0, 2000),
    recruiterEmail: raw.recruiterEmail || extractEmail(description),
    externalId: raw.externalId,
    roleTag: raw.roleTag || roleCategory,
  };
}

// ── Location Keywords ─────────────────────────────────────────────────────────
const HYDERABAD_LOCATIONS = [
  'hyderabad', 'secunderabad', 'telangana',
  'hitec city', 'hitex', 'madhapur', 'gachibowli',
  'financial district', 'kondapur', 'jubilee hills',
  'banjara hills', 'raidurg', 'nanakramguda',
];

const CHENNAI_TAMILNADU_LOCATIONS = [
  'chennai', 'tamil nadu', 'tamilnadu',
  'tidel park', 'taramani', 'omr', 'perungudi',
  'siruseri', 'sholinganallur', 'guindy',
  'coimbatore', 'madurai', 'trichy', 'tiruchirappalli',
  'salem', 'erode', 'tirunelveli', 'hosur',
];
const KERALA_LOCATIONS = [
  'kerala', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram',
  'kozhikode', 'calicut', 'thrissur', 'kannur', 'kollam', 'ernakulam',
  'infopark', 'technopark', 'cyberpark', 'smart city', 'technocity',
  'palakkad', 'malappuram', 'alappuzha', 'kottayam', 'kasaragod',
  'pathanamthitta', 'wayanad', 'idukki',
];

const BANGALORE_LOCATIONS = [
  'bangalore', 'bengaluru', 'banglore', 'whitefield', 'koramangala',
  'indiranagar', 'hsr layout', 'electronic city', 'marathahalli',
  'bellandur', 'sarjapur', 'jp nagar', 'jayanagar', 'btm layout',
  'mg road', 'ulsoor', 'hebbal', 'yeshwanthpur', 'rajajinagar',
];

function isTargetLocation(location = '', description = '') {
  const combined = `${location} ${description}`.toLowerCase();

  return (
    KERALA_LOCATIONS.some((kw) => combined.includes(kw)) ||
    BANGALORE_LOCATIONS.some((kw) => combined.includes(kw)) ||
    HYDERABAD_LOCATIONS.some((kw) => combined.includes(kw)) ||
    CHENNAI_TAMILNADU_LOCATIONS.some((kw) => combined.includes(kw))
  );
}
function isHyderabadJob(location = '') {
  return HYDERABAD_LOCATIONS.some(kw => location.toLowerCase().includes(kw));
}

function isChennaiTamilNaduJob(location = '') {
  return CHENNAI_TAMILNADU_LOCATIONS.some(kw => location.toLowerCase().includes(kw));
}
function isKeralaJob(location = '') {
  return KERALA_LOCATIONS.some(kw => location.toLowerCase().includes(kw));
}

function isBangaloreJob(location = '') {
  return BANGALORE_LOCATIONS.some(kw => location.toLowerCase().includes(kw));
}

// ── Broad keyword check (pre-filter before classifyRole) ──────────────────────

const ALL_ROLE_KEYWORDS = [
  // Design
  'ui', 'ux', 'figma', 'adobe xd', 'sketch', 'wireframe', 'prototype',
  'user interface', 'user experience', 'product design', 'product designer',
  'creative design', 'graphic design', 'visual design', 'motion design',
  'interaction design', 'design system', 'design lead',
  'design director', 'solution design', 'service design',
  'web designer', 'digital designer', 'art director', 'framer',
  'storybook', 'component library',
  // Frontend / MERN
  'react', 'reactjs', 'react native',
  'next.js', 'nextjs',
  'frontend', 'front-end', 'front end',
  'mern', 'full stack', 'fullstack', 'full-stack',
  'javascript', 'typescript',
  'tailwind', 'redux', 'zustand',
  // Backend (Node ecosystem)
  'node', 'nodejs', 'node.js',
  'express', 'expressjs',
  'mongodb', 'mongoose',
  'rest api', 'backend developer',
  // General
  'web developer', 'sde', 'ui developer',
];

function isTargetRole(title = '', description = '', tags = '') {
  const combined = `${title} ${description} ${tags}`.toLowerCase();
  return ALL_ROLE_KEYWORDS.some((kw) => combined.includes(kw));
}

// ── Search Configs ────────────────────────────────────────────────────────────

const KERALA_SEARCHES = [
  // Design
  { keywords: 'UI UX Designer', location: 'Kerala', q: 'ui-ux-designer', l: 'kerala' },
  { keywords: 'Product Designer', location: 'Kerala', q: 'product-designer', l: 'kerala' },
  { keywords: 'Figma Designer', location: 'Kerala', q: 'figma-designer', l: 'kerala' },
  { keywords: 'Creative Designer', location: 'Kerala', q: 'creative-designer', l: 'kerala' },
  { keywords: 'Web Designer', location: 'Kochi', q: 'web-designer', l: 'kochi' },
  { keywords: 'UX Researcher', location: 'Kerala', q: 'ux-researcher', l: 'kerala' },
  { keywords: 'Design Lead', location: 'Kerala', q: 'design-lead', l: 'kerala' },
  // Frontend
  { keywords: 'Frontend Developer', location: 'Kerala', q: 'frontend-developer', l: 'kerala' },
  { keywords: 'React Developer', location: 'Kerala', q: 'react-developer', l: 'kerala' },
  { keywords: 'React Developer', location: 'Kochi', q: 'react-developer', l: 'kochi' },
  { keywords: 'Next.js Developer', location: 'Kerala', q: 'nextjs-developer', l: 'kerala' },
  { keywords: 'UI Developer', location: 'Kochi', q: 'ui-developer', l: 'kochi' },
  { keywords: 'TypeScript Developer', location: 'Kochi', q: 'typescript-developer', l: 'kochi' },
  { keywords: 'React Native Developer', location: 'Kerala', q: 'react-native-developer', l: 'kerala' },
  // Backend (Node ecosystem)
  { keywords: 'Node.js Developer', location: 'Kerala', q: 'nodejs-developer', l: 'kerala' },
  { keywords: 'Node.js Developer', location: 'Kochi', q: 'nodejs-developer', l: 'kochi' },
  { keywords: 'Backend Developer', location: 'Kerala', q: 'backend-developer-node', l: 'kerala' },
  // MERN / Fullstack
  { keywords: 'MERN Stack Developer', location: 'Kerala', q: 'mern-stack-developer', l: 'kerala' },
  { keywords: 'Full Stack Developer', location: 'Kerala', q: 'full-stack-developer', l: 'kerala' },
  { keywords: 'JavaScript Developer', location: 'Kerala', q: 'javascript-developer', l: 'kerala' },
];

const BANGALORE_SEARCHES = [
  // Design
  { keywords: 'UI UX Designer', location: 'Bangalore', q: 'ui-ux-designer', l: 'bangalore' },
  { keywords: 'Product Designer', location: 'Bangalore', q: 'product-designer', l: 'bangalore' },
  { keywords: 'Figma Designer', location: 'Bangalore', q: 'figma-designer', l: 'bangalore' },
  { keywords: 'Creative Designer', location: 'Bangalore', q: 'creative-designer', l: 'bangalore' },
  { keywords: 'Design Systems Designer', location: 'Bangalore', q: 'design-systems-designer', l: 'bangalore' },
  { keywords: 'UX Researcher', location: 'Bangalore', q: 'ux-researcher', l: 'bangalore' },
  { keywords: 'Creative Director', location: 'Bangalore', q: 'creative-director', l: 'bangalore' },
  { keywords: 'Web Designer', location: 'Bangalore', q: 'web-designer', l: 'bangalore' },
  // Frontend
  { keywords: 'Frontend Developer', location: 'Bangalore', q: 'frontend-developer', l: 'bangalore' },
  { keywords: 'React Developer', location: 'Bangalore', q: 'react-developer', l: 'bengaluru' },
  { keywords: 'Next.js Developer', location: 'Bangalore', q: 'nextjs-developer', l: 'bangalore' },
  { keywords: 'TypeScript Developer', location: 'Bangalore', q: 'typescript-developer', l: 'bangalore' },
  { keywords: 'Frontend Engineer', location: 'Bangalore', q: 'software-engineer-frontend', l: 'bangalore' },
  { keywords: 'React Native Developer', location: 'Bangalore', q: 'react-native-developer', l: 'bengaluru' },
  // Backend (Node ecosystem)
  { keywords: 'Node.js Developer', location: 'Bangalore', q: 'nodejs-developer', l: 'bangalore' },
  { keywords: 'Backend Developer', location: 'Bangalore', q: 'backend-developer-node', l: 'bangalore' },
  // MERN / Fullstack
  { keywords: 'MERN Stack Developer', location: 'Bangalore', q: 'mern-stack-developer', l: 'bangalore' },
  { keywords: 'Full Stack Developer', location: 'Bangalore', q: 'full-stack-developer', l: 'bengaluru' },
];

const HYDERABAD_SEARCHES = [
  { keywords: 'Frontend Developer', location: 'Hyderabad', q: 'frontend-developer', l: 'hyderabad' },
  { keywords: 'React Developer', location: 'Hyderabad', q: 'react-developer', l: 'hyderabad' },
  { keywords: 'Node.js Developer', location: 'Hyderabad', q: 'nodejs-developer', l: 'hyderabad' },
  { keywords: 'MERN Stack Developer', location: 'Hyderabad', q: 'mern-stack-developer', l: 'hyderabad' },
  { keywords: 'Full Stack Developer', location: 'Hyderabad', q: 'full-stack-developer', l: 'hyderabad' },
  { keywords: 'UI UX Designer', location: 'Hyderabad', q: 'ui-ux-designer', l: 'hyderabad' },
  { keywords: 'Product Designer', location: 'Hyderabad', q: 'product-designer', l: 'hyderabad' },
];

const CHENNAI_TAMILNADU_SEARCHES = [
  { keywords: 'Frontend Developer', location: 'Chennai', q: 'frontend-developer', l: 'chennai' },
  { keywords: 'React Developer', location: 'Chennai', q: 'react-developer', l: 'chennai' },
  { keywords: 'Node.js Developer', location: 'Chennai', q: 'nodejs-developer', l: 'chennai' },
  { keywords: 'MERN Stack Developer', location: 'Chennai', q: 'mern-stack-developer', l: 'chennai' },
  { keywords: 'Full Stack Developer', location: 'Chennai', q: 'full-stack-developer', l: 'chennai' },
  { keywords: 'UI UX Designer', location: 'Chennai', q: 'ui-ux-designer', l: 'chennai' },
  { keywords: 'Product Designer', location: 'Chennai', q: 'product-designer', l: 'chennai' },
  { keywords: 'React Developer', location: 'Tamil Nadu', q: 'react-developer', l: 'tamil-nadu' },
  { keywords: 'Frontend Developer', location: 'Coimbatore', q: 'frontend-developer', l: 'coimbatore' },
];
const ALL_SEARCHES = [
  ...KERALA_SEARCHES,
  ...BANGALORE_SEARCHES,
  ...HYDERABAD_SEARCHES,
  ...CHENNAI_TAMILNADU_SEARCHES,
];
// ── HTTP Helpers ──────────────────────────────────────────────────────────────

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
axios.defaults.httpsAgent = httpsAgent;

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Push only if normalizeJob succeeds (returns non-null)
function pushJob(jobs, raw) {
  const job = normalizeJob(raw);
  if (job) jobs.push(job);
}

// ── Kerala IT Parks ───────────────────────────────────────────────────────────

async function fetchInfopark() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://infopark.in/companies/job-search', {
      headers: defaultHeaders, timeout: 10000,
    });
    const $ = cheerio.load(data);
    $('tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const dateText = $(cells[0]).text().trim();
      const title = $(cells[1]).text().trim();
      const company = $(cells[2]).text().trim();
      const link = $(row).find('a').attr('href');
      if (!isTargetRole(title)) return;
      const postedDate = dateText.includes('-')
        ? new Date(dateText.split('-').reverse().join('-'))
        : new Date();
      pushJob(jobs, {
        title, company,
        location: 'Kochi (Infopark)',
        source: 'Infopark',
        postedDate,
        applyLink: link ? (link.startsWith('http') ? link : `https://infopark.in${link}`) : null,
        description: '',
        externalId: makeExternalId('infopark', hashFallback(title, company, 'infopark')),
      });
    });
  } catch (err) { console.error('Infopark fetch error:', err.message); }
  return jobs;
}

async function fetchTechnopark() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://technopark.org/job-search', {
      headers: defaultHeaders, timeout: 10000,
    });
    const $ = cheerio.load(data);
    $('.job-card').each((_, el) => {
      const title = $(el).find('.job-title').text().trim();
      const company = $(el).find('.company').text().trim();
      const link = $(el).find('a.apply-btn').attr('href');
      if (!isTargetRole(title)) return;
      pushJob(jobs, {
        title, company,
        location: 'Trivandrum (Technopark)',
        source: 'Technopark',
        applyLink: link,
        description: '',
        externalId: makeExternalId('technopark', hashFallback(title, company, 'technopark')),
      });
    });
  } catch (err) { console.error('Technopark fetch error:', err.message); }
  return jobs;
}

async function fetchCyberpark() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://www.cyberparkkerala.org/jobs', {
      headers: defaultHeaders, httpsAgent, timeout: 10000,
    });
    const $ = cheerio.load(data);
    $('.job-item, .job-listing, article').each((_, el) => {
      const title = $(el).find('h3, h2, .title').text().trim();
      const company = $(el).find('.company, .employer').text().trim();
      const link = $(el).find('a').attr('href');
      if (!title || !isTargetRole(title)) return;
      pushJob(jobs, {
        title, company: company || 'Unknown',
        location: 'Kozhikode (Cyberpark)',
        source: 'Cyberpark',
        applyLink: link,
        description: '',
        externalId: makeExternalId('cyberpark', hashFallback(title, company, 'cyberpark')),
      });
    });
  } catch (err) { console.error('Cyberpark fetch error:', err.message); }
  return jobs;
}

async function fetchPrathidhwani() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://jobs.prathidhwani.org/', {
      headers: defaultHeaders, timeout: 10000,
    });
    const $ = cheerio.load(data);
    $('.job-listing, .job-item, article').each((_, el) => {
      const title = $(el).find('.job-title, h2, h3').text().trim();
      const company = $(el).find('.company, .employer').text().trim();
      const link = $(el).find('a').attr('href');
      if (!title || !isTargetRole(title)) return;
      pushJob(jobs, {
        title, company: company || 'Unknown',
        location: 'Kerala',
        source: 'Prathidhwani',
        applyLink: link,
        description: '',
        externalId: makeExternalId('prathidhwani', hashFallback(title, company, 'prathidhwani')),
      });
    });
  } catch (err) { console.error('Prathidhwani fetch error:', err.message); }
  return jobs;
}

// ── Company Career Pages (Kerala + Bangalore) ─────────────────────────────────
async function fetchCompanyDirectory(url, source, defaultLocation) {
  const companies = [];

  try {
    const { data } = await axios.get(url, {
      headers: defaultHeaders,
      httpsAgent,
      timeout: 15000,
    });

    const $ = cheerio.load(data);

    $('a').each((_, el) => {
      const name = $(el).text().trim().replace(/\s+/g, ' ');
      const href = $(el).attr('href');

      if (!name || name.length < 2 || !href) return;

      const absoluteUrl = href.startsWith('http')
        ? href
        : new URL(href, url).href;

      companies.push({
        name,
        url: absoluteUrl,
        location: defaultLocation,
        source,
      });
    });
  } catch (err) {
    console.error(`${source} company directory fetch error:`, err.message);
  }

  return companies;
}

async function discoverKeralaCompanies() {
  const [infopark, technopark, cyberpark] = await Promise.all([
    fetchCompanyDirectory(
      'https://infopark.in/companies',
      'InfoparkDirectory',
      'Kochi, Kerala'
    ),
    fetchCompanyDirectory(
      'https://technopark.org/companies-in-technopark',
      'TechnoparkDirectory',
      'Trivandrum, Kerala'
    ),
    fetchCompanyDirectory(
      'https://www.cyberparkkerala.org/',
      'CyberparkDirectory',
      'Kozhikode, Kerala'
    ),
  ]);

  const all = [...infopark, ...technopark, ...cyberpark];
  const seen = new Set();

  return all.filter((company) => {
    const key = `${company.name}-${company.url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);

    return !company.url.includes('facebook')
      && !company.url.includes('twitter')
      && !company.url.includes('linkedin')
      && !company.url.includes('instagram')
      && !company.url.includes('mailto:')
      && !company.url.includes('tel:');
  });
}

function buildCareerUrls(companyUrl) {
  let base;

  try {
    base = new URL(companyUrl).origin;
  } catch {
    return [];
  }

  return [
    companyUrl,
    `${base}/careers`,
    `${base}/career`,
    `${base}/jobs`,
    `${base}/current-openings`,
    `${base}/openings`,
    `${base}/work-with-us`,
    `${base}/join-us`,
  ];
}
async function fetchCompanyCareers() {
  const jobs = [];

  const keralaCompanies = [
    { name: 'Fingent', url: 'https://www.fingent.com/careers/', location: 'Kochi, Kerala' },
    { name: 'IBS Software', url: 'https://www.ibsplc.com/careers', location: 'Trivandrum, Kerala' },
    { name: 'UST Global', url: 'https://www.ust.com/en/careers', location: 'Kochi, Kerala' },
    { name: 'Qburst', url: 'https://www.qburst.com/company/careers/', location: 'Trivandrum, Kerala' },
    { name: 'Experion Technologies', url: 'https://www.experionglobal.com/careers/', location: 'Trivandrum, Kerala' },
  ];
  const hyderabadCompanies = [
  { name: 'Lloyds Technology Centre', url: 'https://lloydstechnologycentre.com/', location: 'Hyderabad, Telangana' },
  { name: 'Google Hyderabad', url: 'https://www.google.com/about/careers/applications/locations/hyderabad', location: 'Hyderabad, Telangana' },
  { name: 'Hitachi Hyderabad', url: 'https://careers.hitachi.com/search/jobs/in/hyderabad', location: 'Hyderabad, Telangana' },
];

const chennaiTamilNaduCompanies = [
  { name: 'TIDEL Park', url: 'https://www.tidelpark.com/en/careers', location: 'Chennai, Tamil Nadu' },
  { name: 'Hitachi Chennai', url: 'https://careers.hitachi.com/search/jobs/in/chennai', location: 'Chennai, Tamil Nadu' },
  { name: 'NatWest Chennai', url: 'https://jobs.natwestgroup.com/pages/chennai', location: 'Chennai, Tamil Nadu' },
];

  const discoveredKeralaCompanies = (await discoverKeralaCompanies()).slice(0, 20);

const allCompanies = [
  ...keralaCompanies,
  ...hyderabadCompanies,
  ...chennaiTamilNaduCompanies,
  ...discoveredKeralaCompanies,
];

  for (const comp of allCompanies) {
    try {
      const possibleUrls = buildCareerUrls(comp.url);

      let data = null;
      let finalCareerUrl = comp.url;

      for (const url of possibleUrls) {
        try {
          const response = await axios.get(url, {
            headers: defaultHeaders,
            httpsAgent,
            timeout: 10000,
          });

          data = response.data;
          finalCareerUrl = url;
          break;
        } catch {
          // try next career url
        }
      }

      if (!data) continue;

      const $ = cheerio.load(data);

      const listingSelectors = [
        '.job-listing',
        '.job-card',
        '.careers-listing',
        '.opening',
        '.position',
        '[class*="job"]',
        '[class*="career"]',
        'li.role',
      ];

      let foundListings = false;

      for (const sel of listingSelectors) {
        const items = $(sel);

        if (items.length > 0) {
          items.each((_, el) => {
            const title = $(el)
              .find('h2, h3, h4, .title, .role, .position')
              .first()
              .text()
              .trim();

            const desc = $(el).text();

            if (!title || !isTargetRole(title, desc)) return;

            const link = $(el).find('a').first().attr('href');
            const expTxt = $(el)
              .find('[class*="exp"], [class*="experience"], [class*="year"]')
              .text()
              .trim();

            pushJob(jobs, {
              title,
              company: comp.name,
              location: comp.location,
              source: 'CompanyCareers',
              applyLink: link
                ? link.startsWith('http')
                  ? link
                  : `${new URL(finalCareerUrl).origin}${link}`
                : finalCareerUrl,
              description: desc.slice(0, 500),
              experience: expTxt,
              externalId: makeExternalId(
                'company',
                `${comp.name}-${hashFallback(title, comp.name, 'company')}`
              ),
            });

            foundListings = true;
          });

          if (foundListings) break;
        }
      }

      if (!foundListings) {
        const bodyLower = $('body').text().toLowerCase();
        const roleMatches = new Set();

        if (/mern|full.?stack|fullstack/.test(bodyLower)) {
          roleMatches.add('MERN Stack Developer');
        }

        if (/frontend|front.end|react|next\.?js/.test(bodyLower)) {
          roleMatches.add('Frontend Developer');
        }

        if (/node\.?js|express|backend/.test(bodyLower)) {
          roleMatches.add('Backend Developer');
        }

        if (/ui.?ux|figma|adobe xd|wireframe|prototype/.test(bodyLower)) {
          roleMatches.add('UI/UX Designer');
        }

        for (const role of roleMatches) {
          jobs.push({
            title: role,
            company: comp.name,
            location: comp.location,
            roleCategory: role,
            experienceBucket: 'Unknown',
            experience: '',
            jobType: 'Full-time',
            source: 'CompanyCareers',
            postedDate: new Date(),
            applyLink: finalCareerUrl,
            description: `Possible ${role} opening at ${comp.name}. Check careers page for details.`,
            recruiterEmail: null,
            externalId: makeExternalId('company', `${comp.name}-${role}`),
            roleTag: role,
          });
        }
      }
    } catch (err) {
      console.error(`Company ${comp.name} fetch error:`, err.message);
    }
  }


  return jobs;
}
// ── LinkedIn ──────────────────────────────────────────────────────────────────

async function fetchLinkedIn() {
  const jobs = [];
  for (const { keywords, location } of ALL_SEARCHES) {
    try {
      const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_TPR=r2592000&position=1&pageNum=0`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.job-search-card, .base-card').each((_, el) => {
        const title = $(el).find('.job-search-card__title, .base-search-card__title').text().trim();
        const company = $(el).find('.job-search-card__company-name, .base-search-card__subtitle').text().trim();
        const loc = $(el).find('.job-search-card__location').text().trim();
        const link = $(el).find('a').attr('href');
        const postedAt = $(el).find('time').attr('datetime');
        if (!title || !isTargetRole(title)) return;
        if (!isTargetLocation(loc)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || location,
          source: 'LinkedIn', postedDate: postedAt,
          applyLink: link || null, description: '',
          externalId: makeExternalId('linkedin', hashFallback(title, company, 'linkedin')),
          roleTag: keywords,
        });
      });
    } catch (err) { console.error('LinkedIn fetch error:', err.message); }
  }
  return jobs;
}

// ── Indeed ────────────────────────────────────────────────────────────────────

async function fetchIndeed() {
  const jobs = [];
  for (const { keywords: q, location: l } of ALL_SEARCHES) {
    try {
      const url = `https://in.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&fromage=30`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.job_seen_beacon, .tapItem').each((_, el) => {
        const title = $(el).find('[data-testid="jobTitle"] span, .jobTitle span').text().trim();
        const company = $(el).find('[data-testid="company-name"], .companyName').text().trim();
        const loc = $(el).find('[data-testid="text-location"], .companyLocation').text().trim();
        const link = $(el).find('a[id^="job_"], a.jcs-JobTitle').attr('href');
        const expTxt = $(el).find('.salary-snippet, .metadata').text().trim();
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Indeed', experience: expTxt,
          applyLink: link ? (link.startsWith('http') ? link : `https://in.indeed.com${link}`) : null,
          description: '',
          externalId: makeExternalId('indeed', hashFallback(title, company, 'indeed')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Indeed fetch error:', err.message); }
  }
  return jobs;
}

// ── Naukri ────────────────────────────────────────────────────────────────────

async function fetchNaukri() {
  const jobs = [];
  for (const { q, l } of ALL_SEARCHES) {
    try {
      const url = `https://www.naukri.com/${q}-jobs-in-${l}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.jobTuple, article.jobTupleHeader, .cust-job-tuple').each((_, el) => {
        const title = $(el).find('.title, a.title, .jobTitle').text().trim();
        const company = $(el).find('.companyInfo .subTitle, .comp-name').text().trim();
        const loc = $(el).find('.locWdth, .loc, .location').text().trim();
        const link = $(el).find('a.title, a.jobTitle').attr('href');
        const experience = $(el).find('.experience, .exp').text().trim();
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Naukri', experience,
          applyLink: link || null, description: '',
          externalId: makeExternalId('naukri', hashFallback(title, company, 'naukri')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Naukri fetch error:', err.message); }
  }
  return jobs;
}

// ── Glassdoor ─────────────────────────────────────────────────────────────────

async function fetchGlassdoor() {
  const jobs = [];
  for (const { keywords: q, location: l } of ALL_SEARCHES) {
    try {
      const url = `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}&locKeyword=${encodeURIComponent(l)}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('[data-test="jobListing"], .react-job-listing').each((_, el) => {
        const title = $(el).find('[data-test="job-title"], .job-title').text().trim();
        const company = $(el).find('[data-test="employer-name"], .employer-name').text().trim();
        const loc = $(el).find('[data-test="emp-location"], .location').text().trim();
        const link = $(el).find('a').attr('href');
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Glassdoor',
          applyLink: link ? `https://www.glassdoor.co.in${link}` : null,
          description: '',
          externalId: makeExternalId('glassdoor', hashFallback(title, company, 'glassdoor')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Glassdoor fetch error:', err.message); }
  }
  return jobs;
}

// ── Shine ─────────────────────────────────────────────────────────────────────

async function fetchShine() {
  const jobs = [];
  for (const { q, l } of ALL_SEARCHES) {
    try {
      const url = `https://www.shine.com/job-search/${q}-jobs-in-${l}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.job-listing-item, .jobCard, article.job').each((_, el) => {
        const title = $(el).find('h2 a, h3 a, .job-title').text().trim();
        const company = $(el).find('.company-name, .employer').text().trim();
        const loc = $(el).find('.location, .job-location').text().trim();
        const link = $(el).find('a').attr('href');
        const experience = $(el).find('.exp, .experience').text().trim();
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Shine', experience,
          applyLink: link ? (link.startsWith('http') ? link : `https://www.shine.com${link}`) : null,
          description: '',
          externalId: makeExternalId('shine', hashFallback(title, company, 'shine')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Shine fetch error:', err.message); }
  }
  return jobs;
}

// ── TimesJobs ─────────────────────────────────────────────────────────────────

async function fetchTimesJobs() {
  const jobs = [];
  for (const { keywords: q, location: l } of ALL_SEARCHES) {
    try {
      const url = `https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=${encodeURIComponent(q)}&txtLocation=${encodeURIComponent(l)}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.job-bx, li.clearfix').each((_, el) => {
        const title = $(el).find('h2 a, .job-title a').text().trim();
        const company = $(el).find('.joblist-comp-name').text().trim();
        const loc = $(el).find('.srp-skills, span.srp-skills').text().trim();
        const link = $(el).find('h2 a').attr('href');
        const experience = $(el).find('.exp, .experience').text().trim();
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'TimesJobs', experience,
          applyLink: link || null, description: '',
          externalId: makeExternalId('timesjobs', hashFallback(title, company, 'timesjobs')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('TimesJobs fetch error:', err.message); }
  }
  return jobs;
}

// ── Internshala ───────────────────────────────────────────────────────────────

async function fetchInternshala() {
  const jobs = [];
  const searches = [
    { q: 'web-development', l: 'kerala' },
    { q: 'ui-ux-design', l: 'kerala' },
    { q: 'react', l: 'kerala' },
    { q: 'figma', l: 'kerala' },
    { q: 'web-development', l: 'bangalore' },
    { q: 'ui-ux-design', l: 'bangalore' },
    { q: 'product-design', l: 'bangalore' },
    { q: 'react', l: 'bangalore' },
    { q: 'node-js', l: 'bangalore' },
  ];
  for (const { q, l } of searches) {
    try {
      const url = `https://internshala.com/internships/${q}-internship-in-${l}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.internship_meta, .individual_internship').each((_, el) => {
        const title = $(el).find('.profile, h3').text().trim();
        const company = $(el).find('.company_name, h4').text().trim();
        const loc = $(el).find('.location_link, .locations').text().trim();
        const link = $(el).find('a.view_detail_button, a').attr('href');
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Internshala',
          applyLink: link ? (link.startsWith('http') ? link : `https://internshala.com${link}`) : null,
          description: '',
          externalId: makeExternalId('internshala', hashFallback(title, company, 'internshala')),
          roleTag: q,
          jobType: 'Internship',
          experienceBucket: 'Fresher', // Internshala is always fresher-level
        });
      });
    } catch (err) { console.error('Internshala fetch error:', err.message); }
  }
  return jobs;
}

// ── Wellfound (AngelList Startups) ────────────────────────────────────────────

async function fetchWellfound() {
  const jobs = [];
  const searches = [
    { q: 'react-developer', l: 'kerala' },
    { q: 'ui-ux-designer', l: 'kerala' },
    { q: 'product-designer', l: 'bangalore' },
    { q: 'mern-stack', l: 'bangalore' },
    { q: 'frontend-engineer', l: 'bangalore' },
    { q: 'full-stack-engineer', l: 'bangalore' },
    { q: 'node-js-developer', l: 'bangalore' },
  ];
  for (const { q, l } of searches) {
    try {
      const url = `https://wellfound.com/jobs?role=${q}&location=${l}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('[data-test="StartupResult"], .job-listing').each((_, el) => {
        const title = $(el).find('h2, .role, .job-title').text().trim();
        const company = $(el).find('.company, .startup-link').text().trim();
        const loc = $(el).find('.location, .job-location').text().trim();
        const link = $(el).find('a').attr('href');
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Wellfound',
          applyLink: link ? (link.startsWith('http') ? link : `https://wellfound.com${link}`) : null,
          description: '',
          externalId: makeExternalId('wellfound', hashFallback(title, company, 'wellfound')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Wellfound fetch error:', err.message); }
  }
  return jobs;
}

// ── Instahyre ─────────────────────────────────────────────────────────────────

async function fetchInstahyre() {
  const jobs = [];
  const searches = [
    { q: 'frontend-developer', l: 'bangalore' },
    { q: 'ui-ux-designer', l: 'bangalore' },
    { q: 'product-designer', l: 'bangalore' },
    { q: 'react-developer', l: 'bangalore' },
    { q: 'full-stack-developer', l: 'bangalore' },
    { q: 'node-js-developer', l: 'bangalore' },
  ];
  for (const { q, l } of searches) {
    try {
      const url = `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(q)}&location=${l}`;
      const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
      const $ = cheerio.load(data);
      $('.opportunity-list-item, .job-card, .job-item').each((_, el) => {
        const title = $(el).find('h2, h3, .role-title').text().trim();
        const company = $(el).find('.company-name, .employer').text().trim();
        const loc = $(el).find('.location').text().trim();
        const link = $(el).find('a').attr('href');
        const experience = $(el).find('.experience, .exp').text().trim();
        if (!title || !isTargetRole(title)) return;
        pushJob(jobs, {
          title, company: company || 'Unknown',
          location: loc || l, source: 'Instahyre', experience,
          applyLink: link ? (link.startsWith('http') ? link : `https://www.instahyre.com${link}`) : null,
          description: '',
          externalId: makeExternalId('instahyre', hashFallback(title, company, 'instahyre')),
          roleTag: q,
        });
      });
    } catch (err) { console.error('Instahyre fetch error:', err.message); }
  }
  return jobs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function fetchAllJobs() {
const fetchers = [
  { name: 'Infopark', fn: fetchInfopark },
  { name: 'Technopark', fn: fetchTechnopark },
  { name: 'Cyberpark', fn: fetchCyberpark },
  { name: 'Prathidhwani', fn: fetchPrathidhwani },
  { name: 'CompanyCareers', fn: fetchCompanyCareers },
  { name: 'LinkedIn', fn: fetchLinkedIn },
  { name: 'Naukri', fn: fetchNaukri },
  { name: 'Indeed', fn: fetchIndeed },
  { name: 'Glassdoor', fn: fetchGlassdoor },
  { name: 'Shine', fn: fetchShine },
  { name: 'TimesJobs', fn: fetchTimesJobs },
  { name: 'Internshala', fn: fetchInternshala },
  { name: 'Wellfound', fn: fetchWellfound },
  { name: 'Instahyre', fn: fetchInstahyre },
];
  const batches = await Promise.all(fetchers.map((f) => f.fn()));
  const sources = [];
  const seen = new Set();
  const unique = [];

  batches.forEach((batch, i) => {
    if (batch.length > 0) sources.push(fetchers[i].name);
    for (const job of batch) {
      if (!job) continue;
      if (!job.externalId) job.externalId = hashFallback(job.title, job.company, job.source);
      if (seen.has(job.externalId)) continue;
      seen.add(job.externalId);
      unique.push(job);
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const keralaJobs = unique.filter(j => isKeralaJob(j.location));
  const bangaloreJobs = unique.filter(j => isBangaloreJob(j.location));
const hyderabadJobs = unique.filter(j => isHyderabadJob(j.location));
const chennaiTamilNaduJobs = unique.filter(j => isChennaiTamilNaduJob(j.location));

  const byRole = {};
  const byExp = { Fresher: 0, '0-2 Years': 0, '2+ Years': 0, Unknown: 0 };

  for (const job of unique) {
    byRole[job.roleCategory] = (byRole[job.roleCategory] || 0) + 1;
    byExp[job.experienceBucket] = (byExp[job.experienceBucket] || 0) + 1;
  }
console.log(
  `📍 Kerala: ${keralaJobs.length} | Bangalore: ${bangaloreJobs.length} | Hyderabad: ${hyderabadJobs.length} | Chennai/TN: ${chennaiTamilNaduJobs.length}`
);
  console.log(`\n✅ Total: ${unique.length} jobs fetched`);
  console.log(`📍 Kerala: ${keralaJobs.length}  |  Bangalore: ${bangaloreJobs.length}`);
  console.log(`👤 Experience — Fresher: ${byExp.Fresher} | 0-2 Yrs: ${byExp['0-2 Years']} | 2+ Yrs: ${byExp['2+ Years']} | Unknown: ${byExp.Unknown}`);
  console.log(`🎨 By Role:`);
  for (const [role, count] of Object.entries(byRole)) {
    console.log(`   ${role}: ${count}`);
  }
  console.log(`🔗 Sources: ${sources.join(', ') || 'none'}\n`);

  return {
    jobs: unique,
    sources,
    stats: {
  total: unique.length,
  kerala: keralaJobs.length,
  bangalore: bangaloreJobs.length,
  hyderabad: hyderabadJobs.length,
  chennaiTamilNadu: chennaiTamilNaduJobs.length,
  byRole,
  byExperience: byExp,
},
  };
}