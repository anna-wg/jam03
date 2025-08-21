# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js emergency dispatch game called "Blind Dispatch" where players act as 911 dispatchers, making decisions based on audio calls. The application features:

- **Emergency Call Audio System**: CSV-based call scenarios with audio files
- **Fleet Management**: Vehicle tracking with districts, status (available/in-transit/on-call), and dispatch logic
- **Game Mechanics**: Score-based performance tracking with accuracy metrics
- **Multi-stage Interface**: Touch/swipe controls for vehicle selection and district dispatch

## Development Commands

```bash
# Development (uses next.config.dev.js)
npm run dev

# Production build (uses next.config.prod.js with GitHub Pages configuration)
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

## Key Architecture Components

### Build Configuration
The project uses different Next.js configs for dev/prod:
- **Development**: `next.config.dev.js` - standard Next.js config
- **Production**: `next.config.prod.js` - configured for GitHub Pages with basePath and static export
- The `repoName` in `lib/repoName.js` must match the GitHub repository name

### Audio System
- Emergency call audio files stored in `public/audio/emergency_calls/`
- Call metadata managed via `calls.csv` with columns: `audio_file_name`, `correct_dispatch`, `district_location`
- Audio playback uses Web Audio API with queue system for sequential audio

### Game State Management
- **State 0**: No input (listening to audio)
- **State 1**: Vehicle selection (tap quadrants)  
- **State 2**: District selection (swipe gestures)

### Vehicle Fleet System
- 6 vehicles total: 2 firetrucks, 2 police cars, 2 ambulances
- Each vehicle has: id, type, district (North/South/East/West), status
- Transit time calculation based on district distances (15s per district away)

### Data Management
- Uses Prisma ORM with SQLite database
- Generated Prisma client outputs to `lib/generated/prisma/`
- CSV parsing handled by PapaParse library

## File Structure Notes

- `/app/page.tsx`: Main game component with all game logic
- `/lib/utils.ts`: Asset path helpers for GitHub Pages deployment
- `/lib/repoName.js`: Repository name configuration (critical for deployment)
- `/public/audio/`: All game audio assets organized by type
- `/prisma/schema.prisma`: Database schema (minimal, mainly for setup)

## GitHub Pages Deployment

- Workflow file: `.github/workflows/ghp-release-test.yaml`
- Creates versioned branches and deploys to gh-pages
- Uses yarn commands in CI (though package.json uses npm)
- Builds to `./out` directory for static export

## Testing and Quality

- ESLint configuration via `eslint-config-next`
- TypeScript strict mode enabled
- No existing test framework detected

## Important Considerations

- Repository name in `lib/repoName.js` must be updated for new deployments
- Audio files require proper CORS handling for Web Audio API
- Touch/mouse event handling is complex due to dual input modes
- Game uses extensive setTimeout for timing-based mechanics