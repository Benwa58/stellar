// Extracts structured data from uploaded veterinary documents using real
// text extraction (pdf.js for PDFs, FileReader for text) and flexible
// pattern matching with confidence scoring.

const CONFIDENCE = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low', NONE: 'none' };

// Lazy-load pdf.js only when needed
let pdfjsLib = null;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/build/pdf');
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }
  return pdfjsLib;
}

// ──────────────────────────────────────────────
// 1. Text extraction — improved for pdf.js quirks
// ──────────────────────────────────────────────

async function extractTextFromPdf(file) {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by approximate Y position to reconstruct lines,
    // then join items within a line by X-proximity.
    const items = content.items.filter((it) => it.str.trim().length > 0);
    if (items.length === 0) continue;

    // Bucket by Y coordinate (rounded to nearest 2px to handle minor drift)
    const lines = {};
    for (const item of items) {
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lines[y]) lines[y] = [];
      lines[y].push({ x: item.transform[4], str: item.str, width: item.width || 0 });
    }

    // Sort Y descending (PDF coords go bottom-up), then X ascending within each line
    const sortedYs = Object.keys(lines).map(Number).sort((a, b) => b - a);
    const pageLines = [];
    for (const y of sortedYs) {
      const lineItems = lines[y].sort((a, b) => a.x - b.x);
      // Join items — insert space if gap between items is significant
      let lineStr = '';
      for (let j = 0; j < lineItems.length; j++) {
        if (j > 0) {
          const gap = lineItems[j].x - (lineItems[j - 1].x + lineItems[j - 1].width);
          lineStr += gap > 3 ? '  ' : (gap > 0.5 ? ' ' : '');
        }
        lineStr += lineItems[j].str;
      }
      pageLines.push(lineStr);
    }
    pages.push(pageLines.join('\n'));
  }

  return pages.join('\n\n');
}

async function extractTextFromPlainFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function extractText(file) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.pdf')) return await extractTextFromPdf(file);
    if (/\.(txt|csv|rtf|text|doc|docx)$/.test(name)) return await extractTextFromPlainFile(file);
    return '';
  } catch (err) {
    console.warn(`Could not extract text from ${file.name}:`, err);
    return '';
  }
}

// ──────────────────────────────────────────────
// 2. Text normalization
// ──────────────────────────────────────────────

// Collapse repeated whitespace on each line, normalize separators
function normalize(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, '  ').trim())
    .join('\n');
}

// ──────────────────────────────────────────────
// 3. Flexible label→value extraction helpers
// ──────────────────────────────────────────────

// Finds a value that appears after a label, tolerating colons, spaces,
// tabs, and even newlines. Returns null if not found.
// Accepts multiple label synonyms separated by |.
function valueAfterLabel(text, labelAlts, maxLen = 60) {
  // Try "Label : Value" or "Label  Value" on same line first
  for (const label of labelAlts.split('|')) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Same-line: Label<sep>Value
    const sameLine = new RegExp(
      escaped + '\\s*[:;=\\-–—]?\\s+([^\\n]{2,' + maxLen + '})',
      'i'
    );
    const m = text.match(sameLine);
    if (m) {
      const val = m[1].trim().replace(/\s{2,}/g, ' ');
      // Reject if it looks like another label (contains a colon mid-value)
      const clean = val.replace(/:.*$/, '').trim();
      if (clean.length >= 1) return clean;
    }
  }
  // Next-line: Label\nValue
  for (const label of labelAlts.split('|')) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextLine = new RegExp(
      escaped + '\\s*[:;=\\-–—]?\\s*\\n\\s*([^\\n]{2,' + maxLen + '})',
      'i'
    );
    const m = text.match(nextLine);
    if (m) {
      const val = m[1].trim().replace(/\s{2,}/g, ' ');
      if (val.length >= 1) return val;
    }
  }
  return null;
}

// Search for a value near a label with confidence:
//  - HIGH if found right after a specific label
//  - MEDIUM if found after a broader/generic label
//  - LOW if found via fallback regex anywhere
function searchWithConfidence(text, specificLabels, broadLabels, fallbackRegex) {
  const specific = valueAfterLabel(text, specificLabels);
  if (specific) return { value: specific, confidence: CONFIDENCE.HIGH };

  if (broadLabels) {
    const broad = valueAfterLabel(text, broadLabels);
    if (broad) return { value: broad, confidence: CONFIDENCE.MEDIUM };
  }

  if (fallbackRegex) {
    const m = text.match(fallbackRegex);
    if (m) {
      const val = (m[1] || m[0]).trim();
      if (val.length >= 1) return { value: val, confidence: CONFIDENCE.LOW };
    }
  }

  return null;
}

// ──────────────────────────────────────────────
// 4. Field extractors
// ──────────────────────────────────────────────

function extractPatientFields(text) {
  const fields = {};

  // Patient name
  const name = searchWithConfidence(
    text,
    'patient name|pet name|animal name|patient\'s name',
    'patient|pet|name of patient|name of pet|name of animal',
    null
  );
  if (name) fields.name = name;

  // Species
  const speciesMap = {
    canine: 'Canine', dog: 'Canine', puppy: 'Canine',
    feline: 'Feline', cat: 'Feline', kitten: 'Feline',
    equine: 'Equine', horse: 'Equine', foal: 'Equine', mare: 'Equine', gelding: 'Equine', stallion: 'Equine',
    avian: 'Avian', bird: 'Avian', parrot: 'Avian',
    rabbit: 'Exotic', ferret: 'Exotic', reptile: 'Exotic', turtle: 'Exotic', snake: 'Exotic', lizard: 'Exotic',
  };

  const speciesVal = valueAfterLabel(text, 'species|type of animal|animal type');
  if (speciesVal) {
    const key = Object.keys(speciesMap).find((k) =>
      speciesVal.toLowerCase().includes(k)
    );
    fields.species = {
      value: key ? speciesMap[key] : speciesVal,
      confidence: CONFIDENCE.HIGH,
    };
  } else {
    // Scan whole text for species keywords
    const lower = text.toLowerCase();
    for (const [keyword, mapped] of Object.entries(speciesMap)) {
      // Use word boundary to reduce false positives
      if (new RegExp('\\b' + keyword + '\\b').test(lower)) {
        fields.species = { value: mapped, confidence: CONFIDENCE.LOW };
        break;
      }
    }
  }

  // Breed
  const breed = searchWithConfidence(text, 'breed', null, null);
  if (breed && breed.value.length <= 60) fields.breed = breed;

  // Age / DOB
  const age = searchWithConfidence(
    text,
    'age|date of birth|dob|birth date|birthdate',
    'born|yr|years old|months old',
    /\b(\d{1,2}\s*(?:yr|year|month|mo|week|wk)s?\s*(?:old)?)\b/i
  );
  if (age && age.value.length <= 40) fields.age = age;

  // Sex
  const sexVal = valueAfterLabel(text, 'sex|gender');
  if (sexVal) {
    const sl = sexVal.toLowerCase();
    let mapped = sexVal;
    if (/spay/i.test(sl) || /\bf\/?s\b/i.test(sl) || /\bs\/?f\b/i.test(sl)) mapped = 'Female (Spayed)';
    else if (/female|bitch|queen/i.test(sl)) mapped = 'Female (Intact)';
    else if (/neuter|castrat/i.test(sl) || /\bm\/?n\b/i.test(sl) || /\bn\/?m\b/i.test(sl)) mapped = 'Male (Neutered)';
    else if (/male|dog|tom/i.test(sl) && !/fe/i.test(sl)) mapped = 'Male (Intact)';
    fields.sex = { value: mapped, confidence: CONFIDENCE.HIGH };
  }

  // Weight — be flexible with spacing between number and unit
  const weightLabeled = valueAfterLabel(text, 'weight|wt|body weight|bw');
  if (weightLabeled) {
    const wm = weightLabeled.match(/([\d]+(?:[.,][\d]+)?\s*(?:lbs?|kg|pounds?|kilograms?|oz))/i);
    if (wm) fields.weight = { value: wm[1], confidence: CONFIDENCE.HIGH };
    else fields.weight = { value: weightLabeled, confidence: CONFIDENCE.MEDIUM };
  } else {
    const wFallback = text.match(/([\d]{1,4}(?:\.\d+)?\s*(?:lbs?|kg))\b/i);
    if (wFallback) fields.weight = { value: wFallback[1], confidence: CONFIDENCE.LOW };
  }

  // Color
  const color = searchWithConfidence(text, 'color|colour|coat|markings', null, null);
  if (color && color.value.length <= 40) fields.color = color;

  // Microchip — allow spaces in number (pdf.js artifact)
  const chipLabeled = valueAfterLabel(text, 'microchip|micro chip|chip|chip #|chip number|ISO');
  if (chipLabeled) {
    const digits = chipLabeled.replace(/[\s-]/g, '');
    const dm = digits.match(/(\d{9,15})/);
    if (dm) fields.microchip = { value: dm[1], confidence: CONFIDENCE.HIGH };
    else fields.microchip = { value: chipLabeled, confidence: CONFIDENCE.MEDIUM };
  } else {
    const chipFallback = text.replace(/[\s]/g, '').match(/(\d{15})/);
    if (chipFallback) fields.microchip = { value: chipFallback[1], confidence: CONFIDENCE.LOW };
  }

  return fields;
}

function extractClientFields(text) {
  const fields = {};

  // Client / owner name
  const ownerVal = valueAfterLabel(
    text,
    "client name|owner name|client's name|owner's name|guardian name|pet parent"
  );
  if (ownerVal) {
    const parts = ownerVal.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      fields.firstName = { value: parts[0], confidence: CONFIDENCE.HIGH };
      fields.lastName = { value: parts.slice(1).join(' '), confidence: CONFIDENCE.HIGH };
    } else if (parts.length === 1) {
      fields.lastName = { value: parts[0], confidence: CONFIDENCE.MEDIUM };
    }
  } else {
    // Try broader labels
    const broad = valueAfterLabel(text, 'client|owner|guardian');
    if (broad) {
      const parts = broad.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) {
        fields.firstName = { value: parts[0], confidence: CONFIDENCE.MEDIUM };
        fields.lastName = { value: parts.slice(1).join(' '), confidence: CONFIDENCE.MEDIUM };
      }
    }
  }

  // Email — any email-shaped string
  const allEmails = [...text.matchAll(/[\w.+-]+@[\w.-]+\.\w{2,}/g)].map((m) => m[0]);
  if (allEmails.length > 0) {
    // Try to pick one near a client/owner/email label
    const nearClient = text.match(
      /(?:client|owner|email|e-mail|contact)[\s\S]{0,120}?([\w.+-]+@[\w.-]+\.\w{2,})/i
    );
    if (nearClient) {
      fields.email = { value: nearClient[1], confidence: CONFIDENCE.MEDIUM };
    } else {
      fields.email = { value: allEmails[0], confidence: CONFIDENCE.LOW };
    }
  }

  // Phone
  const phoneRegex = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
  const allPhones = [...text.matchAll(phoneRegex)].map((m) => m[0]);
  if (allPhones.length > 0) {
    const nearPhone = text.match(
      /(?:phone|tel|cell|mobile|contact|ph)[\s:]*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i
    );
    if (nearPhone) {
      fields.phone = { value: nearPhone[1], confidence: CONFIDENCE.HIGH };
    } else {
      fields.phone = { value: allPhones[0], confidence: CONFIDENCE.LOW };
    }
  }

  // Address
  const addr = searchWithConfidence(
    text,
    'address|street address|mailing address',
    'street|addr',
    /(\d+\s+[\w\s]{2,30}(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|pl|place)\b)/i
  );
  if (addr && addr.value.length <= 80) fields.address = addr;

  // City
  const city = searchWithConfidence(text, 'city|town', null, null);
  if (city && city.value.length <= 40) fields.city = city;

  // State
  const state = searchWithConfidence(text, 'state|province', null, null);
  if (state && state.value.length <= 30) fields.state = state;

  // ZIP / Postal
  const zipLabeled = valueAfterLabel(text, 'zip|zip code|postal|postal code');
  if (zipLabeled) {
    const zm = zipLabeled.match(/(\d{5}(?:-\d{4})?)/);
    if (zm) fields.zip = { value: zm[1], confidence: CONFIDENCE.HIGH };
  } else {
    const zipFallback = text.match(/\b(\d{5}(?:-\d{4})?)\b/);
    if (zipFallback) fields.zip = { value: zipFallback[1], confidence: CONFIDENCE.LOW };
  }

  return fields;
}

function extractReferringVetFields(text) {
  const fields = {};

  // Clinic / hospital name
  const clinic = searchWithConfidence(
    text,
    'clinic name|hospital name|practice name|facility name|referring clinic|referring hospital|referring practice',
    'clinic|hospital|practice|facility|referred from|referred by',
    null
  );
  if (clinic && clinic.value.length <= 80) fields.clinicName = clinic;

  // Vet name — look for labeled, then "Dr. X, DVM" pattern
  const vetLabeled = valueAfterLabel(
    text,
    'veterinarian|vet name|referring vet|referring veterinarian|referring doctor|doctor name|dvm|vmd|attending'
  );
  if (vetLabeled) {
    const val = vetLabeled.replace(/,?\s*(?:DVM|VMD|BVSc|BVMS|PhD|MS|DACVS|DACVIM|DACVR|DACVO|DACVD|DACVECC)\b.*/i, '').trim();
    fields.vetName = {
      value: /^dr/i.test(val) ? val : `Dr. ${val}`,
      confidence: CONFIDENCE.HIGH,
    };
  } else {
    // "Dr. FirstName LastName, DVM"
    const drDvm = text.match(/Dr\.?\s+([\w]+(?:\s[\w]+)+)\s*,?\s*(?:DVM|VMD|BVSc|BVMS)/i);
    if (drDvm) {
      fields.vetName = { value: `Dr. ${drDvm[1]}`, confidence: CONFIDENCE.MEDIUM };
    } else {
      // Any "Dr. FirstName LastName"
      const drAny = text.match(/Dr\.?\s+([\w]+\s[\w]+)/i);
      if (drAny) {
        fields.vetName = { value: `Dr. ${drAny[1]}`, confidence: CONFIDENCE.LOW };
      }
    }
  }

  // Vet phone — look near clinic/vet labels
  const vetPhoneLabeled = valueAfterLabel(
    text,
    'clinic phone|hospital phone|vet phone|office phone|referring.*phone'
  );
  if (vetPhoneLabeled) {
    const pm = vetPhoneLabeled.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
    if (pm) fields.phone = { value: pm[0], confidence: CONFIDENCE.MEDIUM };
  }

  // Vet email
  const vetEmail = text.match(
    /(?:clinic|hospital|vet|referring|practice)[\s\S]{0,200}?([\w.+-]+@[\w.-]+\.\w{2,})/i
  );
  if (vetEmail) {
    fields.email = { value: vetEmail[1], confidence: CONFIDENCE.LOW };
  }

  // Fax
  const faxVal = valueAfterLabel(text, 'fax|facsimile');
  if (faxVal) {
    const fm = faxVal.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
    if (fm) fields.fax = { value: fm[0], confidence: CONFIDENCE.MEDIUM };
  }

  return fields;
}

function extractReasonSnippets(text) {
  const snippets = [];

  const sectionPatterns = [
    /(?:reason\s*(?:for)?\s*referral|referral\s*reason)\s*[:;=\-–—]?\s*([\s\S]{10,500}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
    /(?:diagnosis|assessment|impression|dx)\s*[:;=\-–—]?\s*([\s\S]{10,300}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
    /(?:presenting\s*complaint|chief\s*complaint|cc|complaint)\s*[:;=\-–—]?\s*([\s\S]{10,300}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
    /(?:history\s*of\s*present\s*illness|hpi|clinical\s*(?:summary|history))\s*[:;=\-–—]?\s*([\s\S]{10,500}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
    /(?:recommendation|plan|requested?\s*service)\s*[:;=\-–—]?\s*([\s\S]{10,300}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
    /(?:summary|notes|comments)\s*[:;=\-–—]?\s*([\s\S]{10,500}?)(?:\n\s*\n|\n[A-Z]|\n\w+\s*:)/i,
  ];

  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const cleaned = m[1].trim().replace(/\s+/g, ' ');
      if (cleaned.length >= 10 && !snippets.includes(cleaned)) {
        snippets.push(cleaned);
      }
    }
  }

  // If nothing found, try grabbing sentences that contain medical keywords
  if (snippets.length === 0) {
    const medicalKeywords = /(?:referr|diagnos|consult|surgery|treatment|condition|symptom|present|lame|mass|tumor|lesion|fracture|disease)/i;
    const sentences = text.split(/[.!?]\s+/).filter((s) => medicalKeywords.test(s));
    for (const s of sentences.slice(0, 3)) {
      const cleaned = s.trim().replace(/\s+/g, ' ');
      if (cleaned.length >= 15 && cleaned.length <= 300) {
        snippets.push(cleaned);
      }
    }
  }

  return snippets;
}

// ──────────────────────────────────────────────
// 5. Per-file extraction
// ──────────────────────────────────────────────

function extractFromText(rawText) {
  if (!rawText || rawText.trim().length < 5) {
    return { patient: {}, client: {}, referringVet: {}, reasonSnippets: [] };
  }
  const text = normalize(rawText);

  // Log extracted text to console for debugging
  console.log('--- Extracted & normalized text ---');
  console.log(text.slice(0, 2000));
  console.log('--- End extracted text ---');

  return {
    patient: extractPatientFields(text),
    client: extractClientFields(text),
    referringVet: extractReferringVetFields(text),
    reasonSnippets: extractReasonSnippets(text),
  };
}

// ──────────────────────────────────────────────
// 6. Merge multiple extraction results
// ──────────────────────────────────────────────

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1, none: 0 };

function mergeExtractions(extractions) {
  const merged = { patient: {}, client: {}, referringVet: {}, reasonSnippets: [] };

  for (const ext of extractions) {
    for (const section of ['patient', 'client', 'referringVet']) {
      if (!ext[section]) continue;
      for (const [key, entry] of Object.entries(ext[section])) {
        const existing = merged[section][key];
        if (
          !existing ||
          CONFIDENCE_RANK[entry.confidence] > CONFIDENCE_RANK[existing.confidence]
        ) {
          merged[section][key] = { ...entry };
        }
      }
    }
    if (ext.reasonSnippets) {
      for (const snippet of ext.reasonSnippets) {
        if (!merged.reasonSnippets.includes(snippet)) {
          merged.reasonSnippets.push(snippet);
        }
      }
    }
  }

  return merged;
}

// ──────────────────────────────────────────────
// 7. Enhance reason for referral
// ──────────────────────────────────────────────

function enhanceReason(originalReason, snippets, merged) {
  // If we have no snippets and no extracted data, return the original as-is.
  if ((!snippets || snippets.length === 0) && !merged) return originalReason;

  const val = (section, key) => merged?.[section]?.[key]?.value || '';

  // Collect all unique pieces of information
  const rawParts = [];
  if (originalReason && originalReason.trim().length > 10) {
    rawParts.push(originalReason.trim());
  }
  for (const snippet of (snippets || [])) {
    const lower = snippet.toLowerCase();
    const alreadyCovered = rawParts.some(
      (p) => p.toLowerCase().includes(lower.slice(0, 30))
    );
    if (!alreadyCovered) {
      rawParts.push(snippet.trim());
    }
  }

  if (rawParts.length === 0 && !val('patient', 'name')) return originalReason;

  // ── Build a structured, natural-language paragraph ──

  const sentences = [];

  // Opening: identify the patient
  const patientName = val('patient', 'name');
  const species = val('patient', 'species');
  const breed = val('patient', 'breed');
  const age = val('patient', 'age');
  const sex = val('patient', 'sex');
  const weight = val('patient', 'weight');

  if (patientName) {
    const descriptors = [age, sex, weight].filter(Boolean);
    const breedSpecies = [breed, species].filter(Boolean).join(' ') || 'patient';
    let intro = `${patientName} is a`;
    if (descriptors.length > 0) {
      intro += ` ${descriptors.join(', ')}`;
    }
    intro += ` ${breedSpecies}`;

    // Referring vet context
    const vetName = val('referringVet', 'vetName');
    const clinicName = val('referringVet', 'clinicName');
    if (vetName && clinicName) {
      intro += ` being referred by ${vetName} at ${clinicName}`;
    } else if (vetName) {
      intro += ` being referred by ${vetName}`;
    } else if (clinicName) {
      intro += ` being referred from ${clinicName}`;
    }

    sentences.push(intro);
  }

  // Body: weave in the extracted snippets as the clinical narrative.
  // Clean each snippet into a proper sentence fragment.
  for (const part of rawParts) {
    let cleaned = part.replace(/^[-•*]\s*/, '').trim();
    // Don't duplicate patient intro info we already covered
    if (patientName && cleaned.toLowerCase().startsWith(patientName.toLowerCase())) {
      // Strip the patient name prefix if the snippet repeats it
      cleaned = cleaned.slice(patientName.length).replace(/^[\s,.:;-]+/, '').trim();
    }
    if (cleaned.length < 5) continue;

    // Capitalize first letter
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    // Ensure it ends cleanly
    cleaned = cleaned.replace(/[,;:\s]+$/, '');

    sentences.push(cleaned);
  }

  // Join into a flowing paragraph. Add periods between sentences, avoiding
  // double-periods if a sentence already ends with one.
  const paragraph = sentences
    .map((s) => (s.endsWith('.') || s.endsWith('?') || s.endsWith('!')) ? s : s + '.')
    .join(' ');

  return paragraph;
}

// ──────────────────────────────────────────────
// 8. Main entry point
// ──────────────────────────────────────────────

export async function parseDocuments(files, originalReason) {
  const extractions = [];

  for (const file of files) {
    const text = await extractText(file);
    const extracted = extractFromText(text);
    extractions.push(extracted);
  }

  const merged = mergeExtractions(extractions);
  const enhancedReason = enhanceReason(originalReason, merged.reasonSnippets, merged);

  return {
    ...merged,
    enhancedReason,
  };
}

export { CONFIDENCE };
