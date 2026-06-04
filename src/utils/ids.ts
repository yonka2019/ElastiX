import { v4 as uuidv4 } from 'uuid';

export const newId = () => uuidv4();

// Filename-safe slug of a user-supplied title: unicode letters/digits kept
// (titles may be Hebrew), runs of anything else become '-', trimmed and
// capped so download names stay readable. Empty title → empty slug.
export const titleSlug = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
