/** Roles to search on job APIs */
export const ROLES = [
  'UI/UX Designer',
  'MERN Stack Developer',
  'React Developer',
  'Frontend Developer',
  'Full Stack Developer',
  'Node.js Developer',
];

export const TARGET_LOCATIONS = [
  'Kerala',
  'Kochi',
  'Trivandrum',
  'Kozhikode',
  'Thrissur',
  'Kannur',
  'Kollam',
];

export const LOCATIONS = TARGET_LOCATIONS;

export const EXPERIENCE_LEVELS = ['Fresher', '0-1 year', '1-2 years'];
export const JOB_TYPES = ['Remote', 'Hybrid', 'Onsite'];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const LOCATION_ALIASES = [
  'kerala', 'kochi', 'cochin', 'ernakulam',
  'trivandrum', 'thiruvananthapuram',
  'kozhikode', 'calicut',
  'thrissur', 'trichur',
  'kannur', 'cannanore',
  'kollam', 'quilon',
  'infopark', 'technopark', 'cyberpark', 'smart city', 'technocity',
];

/** Non-JavaScript stacks — excluded */
const EXCLUDE_KEYWORDS = [
  'java developer', 'java ', 'spring boot', 'python developer', 'django', 'flask',
  'php developer', 'laravel', '.net developer', 'c# developer', 'angular developer',
  'vue developer', 'android developer', 'ios developer', 'swift developer', 'kotlin',
  'devops engineer', 'data scientist', 'machine learning', 'qa engineer', 'selenium',
  'salesforce', 'sap consultant', 'wordpress', 'shopify', 'flutter developer',
  'ruby on rails', 'golang', 'rust developer',
];

export function extractEmail(text) {
  if (!text) return null;
  const match = text.match(EMAIL_REGEX);
  return match?.[0] || null;
}

export function inferJobType(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('hybrid')) return 'Hybrid';
  if (lower.includes('onsite') || lower.includes('on-site') || lower.includes('on site')) return 'Onsite';
  if (lower.includes('remote') || lower.includes('work from home') || lower.includes('wfh')) return 'Remote';
  return 'Onsite';
}

export function inferExperience(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('fresher') || lower.includes('entry level') || lower.includes('0-1') || lower.includes('0 - 1')) {
    return 'Fresher';
  }
  if (lower.includes('1-2') || lower.includes('1 - 2') || lower.includes('junior')) {
    return '1-2 years';
  }
  if (lower.includes('0-1 year')) return '0-1 year';
  return 'Fresher';
}

export function matchesLocation(location = '', text = '') {
  const combined = `${location} ${text}`.toLowerCase();
  return LOCATION_ALIASES.some((alias) => combined.includes(alias));
}

/**
 * Match: UI/UX, MERN, React, Node.js, Full Stack, Frontend
 * Excludes Java, Python, PHP, mobile-native, etc.
 */
export function isMernRole(title = '', description = '', tags = '') {
  const text = `${title} ${description} ${tags}`.toLowerCase();

  if (EXCLUDE_KEYWORDS.some((k) => text.includes(k))) return false;

  if (text.includes('ui/ux') || text.includes('ui / ux') || text.includes('designer')) return true;

  if (text.includes('mern')) return true;

  if (text.includes('react')) return true;

  if (text.includes('node.js') || text.includes('nodejs') || /\bnode\b/.test(text)) return true;

  if (text.includes('full stack') || text.includes('fullstack') || text.includes('full-stack')) return true;

  if (text.includes('frontend') || text.includes('front end') || text.includes('front-end')) return true;

  if (text.includes('mongodb') && (text.includes('express') || text.includes('node'))) return true;

  if (text.includes('javascript') && (text.includes('developer') || text.includes('engineer'))) return true;

  return false;
}

export function getTargetLocationRegex() {
  return [
    'kerala', 'kochi', 'cochin', 'ernakulam',
    'trivandrum', 'thiruvananthapuram',
    'kozhikode', 'calicut',
    'thrissur', 'kannur', 'kollam',
    'infopark', 'technopark', 'cyberpark',
  ].join('|');
}

/** Regex for jobs list API — matches allowed role types */
export function getMernTitleRegex() {
  return [
    'ui/ux',
    'designer',
    'mern',
    'react',
    'node\\.?js',
    'nodejs',
    'full[\\s-]?stack',
    'front[\\s-]?end',
    'mongodb',
    'express',
    'javascript',
  ].join('|');
}

export function buildJoobleSearches() {
  const keralaLocations = [
    'Kochi, Kerala',
    'Trivandrum, Kerala',
    'Kozhikode, Kerala',
    'Thrissur, Kerala',
    'Kerala, India',
  ];

  const searches = [];
  for (const keywords of ROLES) {
    for (const location of keralaLocations) {
      searches.push({ keywords, location });
    }
  }
  return searches;
}

export function buildAdzunaLocations() {
  return [
    { where: 'kochi', label: 'Kochi, Kerala' },
    { where: 'trivandrum', label: 'Trivandrum, Kerala' },
    { where: 'kozhikode', label: 'Kozhikode, Kerala' },
    { where: 'thrissur', label: 'Thrissur, Kerala' },
    { where: 'kerala', label: 'Kerala' },
  ];
}