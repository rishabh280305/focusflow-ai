const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export default function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST numeric session features only" });
  }

  const body = request.body || {};
  const presence = clamp(Number(body.presence ?? 0));
  const gaze = clamp(Number(body.gazeStability ?? 0));
  const openness = clamp(Number(body.eyeOpenness ?? 0));
  const posture = clamp(Number(body.posture ?? 0));
  const elapsedSeconds = clamp(Number(body.elapsedSeconds ?? 0), 0, 14400);

  const score = Math.round(
    presence * 0.35 + gaze * 0.30 + openness * 0.25 + posture * 0.10
  );

  let state = "focused";
  let recommendation = "Your signals look steady. Keep the current pace.";
  if (score < 45) {
    state = "reset";
    recommendation = "Attention signals are low. Try a 2-minute screen-free reset.";
  } else if (score < 70) {
    state = "mixed";
    recommendation = "Focus is drifting. Re-center your task and relax your shoulders.";
  } else if (elapsedSeconds > 2700) {
    state = "break";
    recommendation = "Strong session. A short break now may protect the next focus block.";
  }

  response.status(200).json({
    score,
    state,
    recommendation,
    received: ["presence", "gazeStability", "eyeOpenness", "posture", "elapsedSeconds"],
    rawVideoStored: false
  });
}
