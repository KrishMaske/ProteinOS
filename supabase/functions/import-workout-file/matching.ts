export type CatalogExercise = {
  id: string;
  name: string;
  category?: string | null;
  body_part?: string | null;
  target?: string | null;
  equipment?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  instructions?: string | null;
  instruction_steps?: string[] | null;
  image_source?: string | null;
  gif_source?: string | null;
};

export type ExerciseMatch = {
  exercise: CatalogExercise;
  confidence: number;
};

export type RankedExerciseCandidate = {
  exercise: CatalogExercise;
  score: number;
  matchReason: string;
};

const tokenAliases: Record<string, string> = {
  bb: 'barbell',
  db: 'dumbbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  pulldowns: 'pulldown',
  pullups: 'pullup',
  chinups: 'chinup',
  flyes: 'fly',
  flies: 'fly',
};

type NormalizedText = {
  value: string;
  tokens: string[];
  tokenSet: Set<string>;
};

type PreparedCatalogExercise = {
  exercise: CatalogExercise;
  normalizedName: NormalizedText;
  normalizedSearchText: NormalizedText;
};

type PreparedCatalog = {
  entries: PreparedCatalogExercise[];
  exactByName: Map<string, CatalogExercise[]>;
};

type CandidateBound = {
  entry: PreparedCatalogExercise;
  distinguishingOverlap: number;
  exact: boolean;
  upperScore: number;
};

type ScoredCandidate = {
  entry: PreparedCatalogExercise;
  score: number;
};

const preparedCatalogs = new WeakMap<CatalogExercise[], PreparedCatalog>();
const normalizedMetadataByExercise = new WeakMap<
  CatalogExercise,
  Array<{ raw: string; tokens: string[] }>
>();

function singularize(token: string) {
  if (token.endsWith('sses') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}

export function normalizeExerciseName(value: string) {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (tokenAliases[token] ?? token).split(' '))
    .map(singularize)
    .filter((token) => token !== 'exercise');
  return base.join(' ');
}

function normalizedText(value: string): NormalizedText {
  const tokens = value.split(' ').filter(Boolean);
  return { value, tokens, tokenSet: new Set(tokens) };
}

function prepareNormalizedText(value: string) {
  return normalizedText(normalizeExerciseName(value));
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  // Shared prefixes/suffixes do not affect edit distance. Gym movement names
  // tend to share long ones (for example "dumbbell bench press ..."), so
  // trimming them avoids most of the dynamic-programming cells in practice.
  let prefixLength = 0;
  const sharedLength = Math.min(left.length, right.length);
  while (prefixLength < sharedLength && left.charCodeAt(prefixLength) === right.charCodeAt(prefixLength)) {
    prefixLength += 1;
  }
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > prefixLength
    && rightEnd > prefixLength
    && left.charCodeAt(leftEnd - 1) === right.charCodeAt(rightEnd - 1)
  ) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  left = left.slice(prefixLength, leftEnd);
  right = right.slice(prefixLength, rightEnd);
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  // Keeping the shorter string on the inner loop reduces scratch memory. A
  // single row also avoids copying or swapping an entire row per character.
  if (right.length > left.length) [left, right] = [right, left];
  const row = new Uint32Array(right.length);
  for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) row[rightIndex] = rightIndex + 1;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = leftIndex;
    let leftDistance = leftIndex + 1;
    const leftCode = left.charCodeAt(leftIndex);
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const above = row[rightIndex];
      const distance = leftCode === right.charCodeAt(rightIndex)
        ? diagonal
        : Math.min(diagonal, above, leftDistance) + 1;
      row[rightIndex] = distance;
      diagonal = above;
      leftDistance = distance;
    }
  }
  return row[right.length - 1];
}

function sharedTokenCount(left: NormalizedText, right: NormalizedText) {
  const [smaller, larger] = left.tokenSet.size <= right.tokenSet.size
    ? [left.tokenSet, right.tokenSet]
    : [right.tokenSet, left.tokenSet];
  let shared = 0;
  for (const token of smaller) {
    if (larger.has(token)) shared += 1;
  }
  return shared;
}

function tokenMetrics(source: NormalizedText, candidate: NormalizedText) {
  const shared = sharedTokenCount(source, candidate);
  const total = source.tokenSet.size + candidate.tokenSet.size;
  const sourceContained = source.tokenSet.size > 0 && shared === source.tokenSet.size;
  const candidateContained = candidate.tokenSet.size > 0 && shared === candidate.tokenSet.size;
  let floor = 0;
  if (sourceContained) {
    floor = Math.max(floor, 0.86 - (0.035 * (candidate.tokenSet.size - source.tokenSet.size)));
  }
  if (candidateContained) {
    floor = Math.max(floor, 0.9 - (0.035 * (source.tokenSet.size - candidate.tokenSet.size)));
  }
  return { dice: total ? (2 * shared) / total : 0, floor };
}

function similarity(source: NormalizedText, candidate: NormalizedText) {
  if (source.value === candidate.value) return 1;
  const { dice, floor } = tokenMetrics(source, candidate);
  const maxLength = Math.max(source.value.length, candidate.value.length, 1);
  const editUpperBound = 1 - Math.abs(source.value.length - candidate.value.length) / maxLength;
  const prefix = source.value.startsWith(candidate.value) || candidate.value.startsWith(source.value) ? 1 : 0;
  const weightedUpperBound = (0.52 * editUpperBound) + (0.38 * dice) + (0.1 * prefix);
  if (floor >= weightedUpperBound) return Math.max(0, Math.min(1, floor));
  const edit = 1 - levenshtein(source.value, candidate.value)
    / maxLength;
  const weighted = (0.52 * edit) + (0.38 * dice) + (0.1 * prefix);
  return Math.max(0, Math.min(1, Math.max(weighted, floor)));
}

/**
 * A mathematically safe upper bound for `similarity`. Edit distance can never
 * be less than the strings' length difference, so candidates below the current
 * kth score can be skipped without changing the exhaustive top-k result.
 */
function similarityUpperBound(source: NormalizedText, candidate: NormalizedText) {
  if (source.value === candidate.value) return 1;
  const { dice, floor } = tokenMetrics(source, candidate);
  const maxLength = Math.max(source.value.length, candidate.value.length, 1);
  const editUpperBound = 1 - Math.abs(source.value.length - candidate.value.length) / maxLength;
  const prefix = source.value.startsWith(candidate.value) || candidate.value.startsWith(source.value) ? 1 : 0;
  const weighted = (0.52 * editUpperBound) + (0.38 * dice) + (0.1 * prefix);
  return Math.max(0, Math.min(1, Math.max(weighted, floor)));
}

function distinguishingOverlap(details: NormalizedText, title: NormalizedText, candidate: NormalizedText) {
  if (!details.tokenSet.size) return 0;
  let detailTokenCount = 0;
  let matchingTokenCount = 0;
  for (const token of details.tokenSet) {
    if (title.tokenSet.has(token)) continue;
    detailTokenCount += 1;
    if (candidate.tokenSet.has(token)) matchingTokenCount += 1;
  }
  return detailTokenCount ? matchingTokenCount / detailTokenCount : 0;
}

function combinedScore(titleScore: number, detailScore: number, overlap: number) {
  return Math.min(
    0.999,
    Math.max(titleScore, (0.78 * titleScore) + (0.22 * detailScore)) + (0.12 * overlap),
  );
}

function candidateOrder(
  left: { entry: PreparedCatalogExercise; score: number },
  right: { entry: PreparedCatalogExercise; score: number },
) {
  return right.score - left.score
    || left.entry.exercise.name.localeCompare(right.entry.exercise.name)
    || left.entry.exercise.id.localeCompare(right.entry.exercise.id);
}

function boundOrder(left: CandidateBound, right: CandidateBound) {
  return right.upperScore - left.upperScore
    || left.entry.exercise.name.localeCompare(right.entry.exercise.name)
    || left.entry.exercise.id.localeCompare(right.entry.exercise.id);
}

function exerciseSearchMetadataText(exercise: CatalogExercise) {
  return [
    exercise.category,
    exercise.body_part,
    exercise.target,
    exercise.equipment,
    exercise.muscle_group,
    ...(exercise.secondary_muscles ?? []),
  ].filter((value): value is string => Boolean(value)).join(' ');
}

function prepareCatalog(catalog: CatalogExercise[]): PreparedCatalog {
  const cached = preparedCatalogs.get(catalog);
  if (cached) return cached;

  const exactByName = new Map<string, CatalogExercise[]>();
  const entries = catalog.map((exercise) => {
    const normalizedName = prepareNormalizedText(exercise.name);
    // Normalization is token-local, so reuse the already-normalized name and
    // normalize only metadata instead of processing every catalog title twice.
    const normalizedMetadataText = normalizeExerciseName(exerciseSearchMetadataText(exercise));
    const normalizedSearchText = normalizedText(
      [normalizedName.value, normalizedMetadataText].filter(Boolean).join(' '),
    );
    const exact = exactByName.get(normalizedName.value);
    if (exact) exact.push(exercise);
    else exactByName.set(normalizedName.value, [exercise]);
    return { exercise, normalizedName, normalizedSearchText };
  });
  const prepared = { entries, exactByName };
  preparedCatalogs.set(catalog, prepared);
  return prepared;
}

function normalizedMetadata(exercise: CatalogExercise) {
  const cached = normalizedMetadataByExercise.get(exercise);
  if (cached) return cached;
  const metadata = [exercise.equipment, exercise.target, exercise.body_part, exercise.muscle_group]
    .filter((value): value is string => Boolean(value))
    .map((raw) => ({ raw, tokens: normalizeExerciseName(raw).split(' ').filter(Boolean) }));
  normalizedMetadataByExercise.set(exercise, metadata);
  return metadata;
}

function candidateReason(
  normalizedTitle: NormalizedText,
  normalizedDetails: NormalizedText,
  entry: PreparedCatalogExercise,
) {
  if (entry.normalizedName.value === normalizedTitle.value) return 'Exact normalized title match.';

  const matchedMetadata = normalizedMetadata(entry.exercise)
    .filter(({ tokens }) => tokens.some((token) => normalizedDetails.tokenSet.has(token)))
    .map(({ raw }) => raw);
  if (matchedMetadata.length) return `Title plus ${matchedMetadata.slice(0, 2).join(' / ')} details overlap.`;
  return 'Closest catalog title and movement-detail overlap.';
}

/**
 * Produces the same deterministic, bounded allowlist as exhaustive scoring.
 * A conservative upper bound visits likely candidates first and stops only
 * when no remaining entry can displace the exact-scored top-k. The model may
 * choose only from these server-built IDs.
 */
export function rankExerciseCandidates(
  sourceTitle: string,
  sourceDetails: string | null,
  catalog: CatalogExercise[],
  limit = 8,
): RankedExerciseCandidate[] {
  const normalizedTitle = prepareNormalizedText(sourceTitle);
  const normalizedDetails = prepareNormalizedText(sourceDetails ?? '');
  if (!normalizedTitle.value || limit <= 0 || !catalog.length) return [];

  const normalizedCombined = normalizedText(
    [normalizedTitle.value, normalizedDetails.value].filter(Boolean).join(' '),
  );
  const resultLimit = Math.min(limit, 12, catalog.length);
  const bounds: CandidateBound[] = [];
  for (const entry of prepareCatalog(catalog).entries) {
    const exact = normalizedTitle.value === entry.normalizedName.value;
    const overlap = distinguishingOverlap(normalizedDetails, normalizedTitle, entry.normalizedSearchText);
    let upperScore = 1;
    if (!exact) {
      const titleUpperBound = similarityUpperBound(normalizedTitle, entry.normalizedName);
      const detailUpperBound = normalizedDetails.value
        ? similarityUpperBound(normalizedCombined, entry.normalizedSearchText)
        : 0;
      upperScore = combinedScore(titleUpperBound, detailUpperBound, overlap);
    }
    bounds.push({ entry, distinguishingOverlap: overlap, exact, upperScore });
  }
  bounds.sort(boundOrder);

  const ranked: ScoredCandidate[] = [];
  for (const bound of bounds) {
    if (ranked.length >= resultLimit && bound.upperScore < ranked[resultLimit - 1].score) break;
    const titleScore = similarity(normalizedTitle, bound.entry.normalizedName);
    const detailScore = normalizedDetails.value
      ? similarity(normalizedCombined, bound.entry.normalizedSearchText)
      : 0;
    const score = bound.exact
      ? 1
      : combinedScore(titleScore, detailScore, bound.distinguishingOverlap);
    ranked.push({ entry: bound.entry, score });
    ranked.sort(candidateOrder);
    if (ranked.length > resultLimit) ranked.length = resultLimit;
  }

  return ranked.map(({ entry, score }) => ({
    exercise: entry.exercise,
    score: Number(score.toFixed(3)),
    matchReason: candidateReason(normalizedTitle, normalizedDetails, entry),
  }));
}

export function exactNormalizedCatalogMatch(sourceTitle: string, catalog: CatalogExercise[]) {
  const normalizedSource = normalizeExerciseName(sourceTitle);
  if (!normalizedSource) return null;
  const exact = prepareCatalog(catalog).exactByName.get(normalizedSource) ?? [];
  return exact.length === 1 ? exact[0] : null;
}

export function matchExercise(sourceName: string, catalog: CatalogExercise[]): ExerciseMatch | null {
  const normalizedSource = normalizeExerciseName(sourceName);
  if (!normalizedSource) return null;

  const ranked = rankExerciseCandidates(sourceName, null, catalog, catalog.length)
    .map((candidate) => ({
      exercise: candidate.exercise,
      normalized: normalizeExerciseName(candidate.exercise.name),
      score: candidate.score,
    }));
  const best = ranked[0];
  if (!best) return null;

  const materiallyDifferentRunnerUp = ranked.find((candidate) => candidate.normalized !== best.normalized);
  const gap = best.score - (materiallyDifferentRunnerUp?.score ?? 0);
  const exact = best.normalized === normalizedSource;
  if (!exact && (best.score < 0.76 || (best.score < 0.92 && gap < 0.035))) return null;

  return {
    exercise: best.exercise,
    confidence: Number(best.score.toFixed(2)),
  };
}
