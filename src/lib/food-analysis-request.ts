export function buildFoodAnalysisRequest(path: string, userNote?: string) {
  const normalizedNote = userNote?.trim();

  return normalizedNote
    ? { storagePath: path, userNote: normalizedNote }
    : { storagePath: path };
}
