# FocusFlow AI

A privacy-first focus and fatigue coaching prototype for Innovise AI/ML Problem Statement 1.

## What works

- Opt-in webcam access with MediaPipe Face Landmarker running in the browser
- Numeric attention features and a transparent 0 to 100 score
- Vercel serverless coaching API at `/api/analyze`
- Local session history with one-click deletion
- Demo mode when camera access is unavailable
- Responsive lite neo-brutalist interface

## Privacy model

Raw frames remain in browser memory. The API receives only numeric features. The system is a productivity aid, not a medical or mental-health diagnostic tool.

## Local development

```bash
npm run check
vercel dev
```

## Links

- Live: https://focusflow-ai.vercel.app
- Repository: https://github.com/rishabh280305/focusflow-ai
