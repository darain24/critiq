import { reviewCommentsSchema, type ReviewComment, type ReviewLLMClient } from './types.js';

export function parseReviewResponse(response: string): ReviewComment[] {
  const stripped = response
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return reviewCommentsSchema.parse(JSON.parse(stripped));
}

export async function reviewWithRepair(
  client: ReviewLLMClient,
  prompt: string,
): Promise<ReviewComment[]> {
  const first = await client.review(prompt);
  try {
    return parseReviewResponse(first);
  } catch (firstError) {
    const repairPrompt = `${prompt}

Your last response was invalid JSON:
${first}

Return only valid JSON matching the requested array schema. No markdown or explanation.`;
    const second = await client.review(repairPrompt);
    try {
      return parseReviewResponse(second);
    } catch (secondError) {
      throw new Error(
        `The LLM returned invalid review JSON twice. First error: ${errorMessage(firstError)}. Second error: ${errorMessage(secondError)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
